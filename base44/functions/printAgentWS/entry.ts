import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * printAgentWS — WebSocket endpoint for Android Print Agents
 *
 * Protocol:
 *   Client → Server:
 *     { type: "register", restaurant_id, agent_id }
 *     { type: "ping" }
 *     { type: "job_complete", job_id, restaurant_id }
 *     { type: "job_failed",   job_id, restaurant_id, error_message }
 *
 *   Server → Client:
 *     { type: "registered", agent_id, restaurant_id, server_time }
 *     { type: "pong", server_time }
 *     { type: "new_job", job }
 *     { type: "job_ack", job_id, status }
 *     { type: "error", message }
 */

const RETRY_DELAYS_SECONDS = [30, 120, 300];
const MAX_RETRIES = RETRY_DELAYS_SECONDS.length;
const WS_OPEN = 1; // WebSocket.OPEN numeric constant — Deno doesn't expose the static property

// agentId → { socket, restaurantId, agentId, connectedAt, serviceRole }
// Each agent carries its OWN serviceRole scoped to its connection's auth token.
const agents = new Map();

// Per-agent in-flight tracking: agentId → Set<jobId>
// Prevents double-dispatch for a specific agent only.
const agentInFlight = new Map();

// Single poll timer — runs while any agent is connected
let pollTimer = null;

// Stuck-job recovery runs less frequently to avoid excessive DB reads
// Per-restaurant last-check timestamps to prevent one restaurant blocking others
const lastStuckCheckByRestaurant = new Map();
const STUCK_CHECK_INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes

function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollForJobs, 2000);
}

function stopPolling() {
    if (agents.size === 0 && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

function getAgentInFlight(agentId) {
    if (!agentInFlight.has(agentId)) agentInFlight.set(agentId, new Set());
    return agentInFlight.get(agentId);
}

function isJobInFlightAnywhere(jobId) {
    for (const set of agentInFlight.values()) {
        if (set.has(jobId)) return true;
    }
    return false;
}

async function pollForJobs() {
    if (agents.size === 0) return;

    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // ── Unique restaurant IDs with connected agents ───────────────────────
    const restaurantIds = [...new Set([...agents.values()].map(a => a.restaurantId))];

    for (const restaurantId of restaurantIds) {
        // Get all online agents for this restaurant
        const restaurantAgents = [...agents.values()].filter(
            a => a.restaurantId === restaurantId && a.socket.readyState === WS_OPEN
        );
        if (restaurantAgents.length === 0) continue;

        // Use the first agent's serviceRole for DB operations for this restaurant.
        // Each agent's serviceRole is scoped to its own connection — this is safe because
        // all agents for the same restaurant have equivalent access rights.
        const serviceRole = restaurantAgents[0].serviceRole;

        try {
            // ── Stuck-job recovery (rate-limited per restaurant to every 2 min) ──
            const lastStuckCheck = lastStuckCheckByRestaurant.get(restaurantId) || 0;
            if (now - lastStuckCheck > STUCK_CHECK_INTERVAL_MS) {
                lastStuckCheckByRestaurant.set(restaurantId, now);
                const stuckCutoff = new Date(now - 2 * 60 * 1000).toISOString();
                // Time-bound the scan to avoid loading all-time history at scale
                const stuckSince = new Date(now - 30 * 60 * 1000).toISOString();
                const stuckJobs = await serviceRole.entities.PrintJob.filter({
                    restaurant_id: restaurantId,
                    status: 'processing',
                    created_date: { $gte: stuckSince },
                });
                for (const j of stuckJobs) {
                    const updatedAt = j.updated_date || j.created_date;
                    if (updatedAt < stuckCutoff && !isJobInFlightAnywhere(j.id)) {
                        await serviceRole.entities.PrintJob.update(j.id, {
                            status: 'pending',
                            agent_id: null,
                        });
                    }
                }
            }

            // ── Fetch pending jobs ready to dispatch ─────────────────────────
            // Time-bound to last 30 minutes to avoid loading all-time history
            const pendingSince = new Date(now - 30 * 60 * 1000).toISOString();
            const pendingJobs = await serviceRole.entities.PrintJob.filter({
                restaurant_id: restaurantId,
                status: 'pending',
                created_date: { $gte: pendingSince },
            });
            const readyJobs = pendingJobs
                .filter(j => !j.next_retry_at || j.next_retry_at <= nowIso)
                .filter(j => !isJobInFlightAnywhere(j.id))
                .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

            if (readyJobs.length === 0) continue;

            // ── Round-robin distribution across agents ────────────────────────
            for (let i = 0; i < readyJobs.length; i++) {
                const job = readyJobs[i];
                const agent = restaurantAgents[i % restaurantAgents.length];
                const inFlight = getAgentInFlight(agent.agentId);

                // Mark in-flight BEFORE async DB write to prevent double-dispatch
                inFlight.add(job.id);

                try {
                    const updatedJob = await serviceRole.entities.PrintJob.update(job.id, {
                        status: 'processing',
                        agent_id: agent.agentId,
                    });

                    if (agent.socket.readyState === WS_OPEN) {
                        agent.socket.send(JSON.stringify({
                            type: 'new_job',
                            job: { ...job, ...updatedJob, status: 'processing', agent_id: agent.agentId },
                        }));
                        console.log(`[WS] Pushed job ${job.id} to agent ${agent.agentId}`);
                    } else {
                        // Agent disconnected between check and send — release job
                        await serviceRole.entities.PrintJob.update(job.id, {
                            status: 'pending',
                            agent_id: null,
                        });
                        inFlight.delete(job.id);
                    }
                } catch (err) {
                    inFlight.delete(job.id);
                    console.error(`[WS] Failed to dispatch job ${job.id}:`, err.message);
                }
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

    // Authenticate via API key in query param or header
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

    // Create a service role client scoped to THIS connection's auth token.
    // Stored on the agent entry so DB ops always use the correct auth context.
    const base44 = createClientFromRequest(req);
    const connectionServiceRole = base44.asServiceRole;

    let registeredAgentId = null;

    socket.onopen = () => {
        console.log('[WS] New Android agent connected');
        startPolling();
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
            const now = new Date().toISOString();
            socket.send(JSON.stringify({ type: 'pong', server_time: now }));
            // Persist heartbeat to DB so dashboard can see WS agents
            if (registeredAgentId) {
                const agent = agents.get(registeredAgentId);
                if (agent) {
                    try {
                        const existing = await connectionServiceRole.entities.AgentHeartbeat.filter({
                            restaurant_id: agent.restaurantId,
                            agent_id: registeredAgentId,
                        });
                        const dbAgent = existing[0];
                        if (dbAgent) {
                            await connectionServiceRole.entities.AgentHeartbeat.update(dbAgent.id, { last_seen: now, connection_mode: 'websocket' });
                        } else {
                            await connectionServiceRole.entities.AgentHeartbeat.create({
                                restaurant_id: agent.restaurantId,
                                agent_id: registeredAgentId,
                                last_seen: now,
                                agent_type: 'android',
                                connection_mode: 'websocket',
                            });
                        }
                    } catch (e) {
                        console.warn('[WS] Failed to persist ping heartbeat:', e.message);
                    }
                }
            }
            return;
        }

        // ── REGISTER ──────────────────────────────────────────────────────
        if (type === 'register') {
            const { restaurant_id, agent_id, printer_address } = msg;
            if (!restaurant_id || !agent_id) {
                socket.send(JSON.stringify({ type: 'error', message: 'register requires restaurant_id and agent_id' }));
                return;
            }

            // Clean up any previous registration for this socket (reconnect case)
            if (registeredAgentId && agents.has(registeredAgentId)) {
                agents.delete(registeredAgentId);
                agentInFlight.delete(registeredAgentId);
            }

            registeredAgentId = agent_id;
            agents.set(agent_id, {
                socket,
                restaurantId: restaurant_id,
                agentId: agent_id,
                connectedAt: new Date().toISOString(),
                serviceRole: connectionServiceRole,
            });
            agentInFlight.set(agent_id, new Set());

            // Persist registration to DB so dashboard shows this WS agent as online
            const now = new Date().toISOString();
            try {
                const existing = await connectionServiceRole.entities.AgentHeartbeat.filter({ restaurant_id, agent_id });
                const dbAgent = existing[0];
                if (dbAgent) {
                    await connectionServiceRole.entities.AgentHeartbeat.update(dbAgent.id, {
                        last_seen: now,
                        connection_mode: 'websocket',
                        printer_address: printer_address || dbAgent.printer_address || '',
                    });
                } else {
                    await connectionServiceRole.entities.AgentHeartbeat.create({
                        restaurant_id,
                        agent_id,
                        last_seen: now,
                        agent_type: 'android',
                        connection_mode: 'websocket',
                        printer_address: printer_address || '',
                    });
                }
            } catch (e) {
                console.warn('[WS] Failed to persist register heartbeat:', e.message);
            }

            console.log(`[WS] Agent registered: ${agent_id} for restaurant ${restaurant_id}`);
            socket.send(JSON.stringify({
                type: 'registered',
                agent_id,
                restaurant_id,
                server_time: now,
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
                // Verify this agent owns the job before marking done
                const jobs = await connectionServiceRole.entities.PrintJob.filter({ restaurant_id, id: job_id });
                const job = jobs[0];
                if (!job) {
                    socket.send(JSON.stringify({ type: 'job_ack', job_id, status: 'not_found' }));
                    getAgentInFlight(registeredAgentId).delete(job_id);
                    return;
                }
                if (job.agent_id && job.agent_id !== registeredAgentId) {
                    socket.send(JSON.stringify({ type: 'error', message: `Job ${job_id} is owned by agent ${job.agent_id}, not ${registeredAgentId}` }));
                    return;
                }
                await connectionServiceRole.entities.PrintJob.update(job_id, {
                    status: 'done',
                    completed_at: new Date().toISOString(),
                    next_retry_at: null,
                });
                getAgentInFlight(registeredAgentId).delete(job_id);
                socket.send(JSON.stringify({ type: 'job_ack', job_id, status: 'done' }));
                console.log(`[WS] Job ${job_id} done by ${registeredAgentId}`);
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
                const jobs = await connectionServiceRole.entities.PrintJob.filter({ restaurant_id, id: job_id });
                const job = jobs[0];

                // Always clear in-flight regardless of job state
                getAgentInFlight(registeredAgentId).delete(job_id);

                if (!job) {
                    socket.send(JSON.stringify({ type: 'job_ack', job_id, status: 'not_found' }));
                    return;
                }

                const retryCount = (job.retry_count || 0) + 1;

                if (retryCount > MAX_RETRIES) {
                    await connectionServiceRole.entities.PrintJob.update(job_id, {
                        status: 'failed',
                        error_message: `Failed after ${MAX_RETRIES} retries. Last: ${error_message || 'Unknown'}`,
                        completed_at: new Date().toISOString(),
                        retry_count: retryCount,
                        next_retry_at: null,
                    });
                    socket.send(JSON.stringify({ type: 'job_ack', job_id, status: 'failed', retried: false }));
                } else {
                    const delaySecs = RETRY_DELAYS_SECONDS[retryCount - 1] || 300;
                    const nextRetryAt = new Date(Date.now() + delaySecs * 1000).toISOString();
                    await connectionServiceRole.entities.PrintJob.update(job_id, {
                        status: 'pending',
                        agent_id: null,
                        error_message: `Attempt ${retryCount} failed: ${error_message || 'Unknown'}. Retry in ${delaySecs}s.`,
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
            agentInFlight.delete(registeredAgentId);
            console.log(`[WS] Agent disconnected: ${registeredAgentId}`);
        }
        stopPolling();
    };

    socket.onerror = (err) => {
        console.error('[WS] Socket error:', err.message || err);
        if (registeredAgentId) {
            // Only clean up THIS agent's in-flight jobs — not all agents
            agentInFlight.delete(registeredAgentId);
            agents.delete(registeredAgentId);
        }
    };

    return response;
});