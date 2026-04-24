import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * printAgentWS — WebSocket endpoint for Android Print Agents
 *
 * Replaces HTTP polling with real-time push notifications.
 * The Android app connects once and receives new print jobs instantly.
 *
 * Protocol:
 *   Client → Server:
 *     { type: "register", restaurant_id, agent_id }   — register this agent
 *     { type: "ping" }                                 — keepalive
 *     { type: "job_complete", job_id, restaurant_id }  — mark job done
 *     { type: "job_failed", job_id, restaurant_id, error_message } — mark job failed
 *
 *   Server → Client:
 *     { type: "registered", agent_id }                 — registration confirmed
 *     { type: "pong" }                                 — keepalive reply
 *     { type: "new_job", job }                         — a new print job is ready
 *     { type: "error", message }                       — error message
 */

// agentId → { socket, restaurantId, agentId, connectedAt }
const agents = new Map();

// Poll DB every 2 seconds for restaurants that have connected agents
let pollTimer = null;

function startPolling(base44ServiceRole) {
    if (pollTimer) return; // Already running
    pollTimer = setInterval(() => pollForJobs(base44ServiceRole), 2000);
}

function stopPolling() {
    if (agents.size === 0 && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

async function pollForJobs(serviceRole) {
    if (agents.size === 0) return;

    // Get unique restaurant IDs from connected agents
    const restaurantIds = [...new Set([...agents.values()].map(a => a.restaurantId))];

    for (const restaurantId of restaurantIds) {
        try {
            const now = new Date();
            const nowIso = now.toISOString();

            // Reset stuck processing jobs (>2 min old) back to pending
            const stuckCutoff = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
            const stuckJobs = await serviceRole.entities.PrintJob.filter({ restaurant_id: restaurantId, status: 'processing' });
            for (const j of stuckJobs) {
                if ((j.updated_date || j.created_date) < stuckCutoff) {
                    await serviceRole.entities.PrintJob.update(j.id, { status: 'pending', agent_id: null });
                }
            }

            // Fetch pending jobs ready to be picked up
            const pendingJobs = await serviceRole.entities.PrintJob.filter({ restaurant_id: restaurantId, status: 'pending' });
            const readyJobs = pendingJobs
                .filter(j => !j.next_retry_at || j.next_retry_at <= nowIso)
                .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

            if (readyJobs.length === 0) continue;

            // Find a connected agent for this restaurant
            const agentEntry = [...agents.values()].find(a => a.restaurantId === restaurantId);
            if (!agentEntry) continue;

            const job = readyJobs[0];

            // Claim the job atomically
            const updatedJob = await serviceRole.entities.PrintJob.update(job.id, {
                status: 'processing',
                agent_id: agentEntry.agentId,
            });

            // Push to the agent's WebSocket
            const sock = agentEntry.socket;
            if (sock.readyState === WebSocket.OPEN) {
                sock.send(JSON.stringify({
                    type: 'new_job',
                    job: { ...job, ...updatedJob, status: 'processing', agent_id: agentEntry.agentId },
                }));
                console.log(`[WS] Pushed job ${job.id} to agent ${agentEntry.agentId}`);
            } else {
                // Agent disconnected, release the job
                await serviceRole.entities.PrintJob.update(job.id, { status: 'pending', agent_id: null });
            }
        } catch (err) {
            console.error(`[WS] Poll error for restaurant ${restaurantId}:`, err.message);
        }
    }
}

Deno.serve(async (req) => {
    // Must be a WebSocket upgrade
    if (req.headers.get('upgrade') !== 'websocket') {
        return new Response('WebSocket upgrade required', { status: 426 });
    }

    // Authenticate via API key in query param (WebSocket clients can't set custom headers easily)
    const url = new URL(req.url);
    const apiKey = url.searchParams.get('api_key') || req.headers.get('x-api-key');
    const validApiKey = Deno.env.get('ANDROID_APP_API_KEY');

    if (!validApiKey) {
        return new Response('Server not configured (missing ANDROID_APP_API_KEY)', { status: 500 });
    }
    if (!apiKey || apiKey !== validApiKey) {
        return new Response('Unauthorized', { status: 401 });
    }

    // Upgrade the connection
    const { socket, response } = Deno.upgradeWebSocket(req);

    // Create a service-role client (not request-bound since WS is long-lived)
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;

    let registeredAgentId = null;

    socket.onopen = () => {
        console.log('[WS] New Android agent connected');
        startPolling(serviceRole);
    };

    socket.onmessage = async (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch {
            socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
            return;
        }

        const { type } = msg;

        // ── PING ──────────────────────────────────────────────────────────
        if (type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong', server_time: new Date().toISOString() }));
            return;
        }

        // ── REGISTER ──────────────────────────────────────────────────────
        if (type === 'register') {
            const { restaurant_id, agent_id } = msg;
            if (!restaurant_id || !agent_id) {
                socket.send(JSON.stringify({ type: 'error', message: 'register requires restaurant_id and agent_id' }));
                return;
            }

            registeredAgentId = agent_id;
            agents.set(agent_id, {
                socket,
                restaurantId: restaurant_id,
                agentId: agent_id,
                connectedAt: new Date().toISOString(),
            });

            console.log(`[WS] Agent registered: ${agent_id} for restaurant ${restaurant_id}`);
            socket.send(JSON.stringify({
                type: 'registered',
                agent_id,
                restaurant_id,
                server_time: new Date().toISOString(),
            }));
            return;
        }

        // ── JOB COMPLETE ──────────────────────────────────────────────────
        if (type === 'job_complete') {
            const { job_id, restaurant_id } = msg;
            if (!job_id || !restaurant_id || !registeredAgentId) {
                socket.send(JSON.stringify({ type: 'error', message: 'job_complete requires job_id, restaurant_id and prior registration' }));
                return;
            }
            try {
                await serviceRole.entities.PrintJob.update(job_id, {
                    status: 'done',
                    completed_at: new Date().toISOString(),
                    next_retry_at: null,
                });
                socket.send(JSON.stringify({ type: 'job_ack', job_id, status: 'done' }));
                console.log(`[WS] Job ${job_id} marked done by ${registeredAgentId}`);
            } catch (err) {
                socket.send(JSON.stringify({ type: 'error', message: `Failed to complete job: ${err.message}` }));
            }
            return;
        }

        // ── JOB FAILED ────────────────────────────────────────────────────
        if (type === 'job_failed') {
            const { job_id, restaurant_id, error_message } = msg;
            if (!job_id || !restaurant_id || !registeredAgentId) {
                socket.send(JSON.stringify({ type: 'error', message: 'job_failed requires job_id, restaurant_id and prior registration' }));
                return;
            }
            try {
                const RETRY_DELAYS_SECONDS = [30, 120, 300];
                const MAX_RETRIES = RETRY_DELAYS_SECONDS.length;

                const jobs = await serviceRole.entities.PrintJob.filter({ restaurant_id });
                const job = jobs.find(j => j.id === job_id);

                if (!job) {
                    socket.send(JSON.stringify({ type: 'error', message: 'Job not found' }));
                    return;
                }

                const retryCount = (job.retry_count || 0) + 1;

                if (retryCount > MAX_RETRIES) {
                    await serviceRole.entities.PrintJob.update(job_id, {
                        status: 'failed',
                        error_message: `Failed after ${MAX_RETRIES} retries. Last: ${error_message || 'Unknown error'}`,
                        completed_at: new Date().toISOString(),
                        retry_count: retryCount,
                        next_retry_at: null,
                    });
                    socket.send(JSON.stringify({ type: 'job_ack', job_id, status: 'failed', retried: false }));
                } else {
                    const delaySecs = RETRY_DELAYS_SECONDS[retryCount - 1] || 300;
                    const nextRetryAt = new Date(Date.now() + delaySecs * 1000).toISOString();
                    await serviceRole.entities.PrintJob.update(job_id, {
                        status: 'pending',
                        agent_id: null,
                        error_message: `Attempt ${retryCount} failed: ${error_message || 'Unknown'}. Retrying in ${delaySecs}s.`,
                        retry_count: retryCount,
                        next_retry_at: nextRetryAt,
                    });
                    socket.send(JSON.stringify({ type: 'job_ack', job_id, status: 'pending', retried: true, next_retry_at: nextRetryAt }));
                }
                console.log(`[WS] Job ${job_id} failed, reported by ${registeredAgentId}`);
            } catch (err) {
                socket.send(JSON.stringify({ type: 'error', message: `Failed to update job: ${err.message}` }));
            }
            return;
        }

        socket.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${type}` }));
    };

    socket.onclose = () => {
        if (registeredAgentId) {
            agents.delete(registeredAgentId);
            console.log(`[WS] Agent disconnected: ${registeredAgentId}`);
        }
        stopPolling();
    };

    socket.onerror = (err) => {
        console.error('[WS] Socket error:', err);
    };

    return response;
});