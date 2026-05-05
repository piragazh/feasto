import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Exponential backoff delays (seconds): 30s, 2min, 5min → then give up
const RETRY_DELAYS_SECONDS = [30, 120, 300];
const MAX_RETRIES = RETRY_DELAYS_SECONDS.length;

// Helper: authenticate Android agent via API key (used by agent-facing actions)
function authenticateApiKey(req, body) {
    const apiKey = req.headers.get('x-api-key') || body.api_key;
    const validApiKey = Deno.env.get('ANDROID_APP_API_KEY');
    if (!validApiKey) return { error: 'Server not configured (missing ANDROID_APP_API_KEY)' };
    if (!apiKey || apiKey !== validApiKey) return { error: 'Invalid API key' };
    return { ok: true };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { action, restaurant_id, job_id, agent_id, error_message } = body;

        // ── ENQUEUE: Called by the dashboard/auto-print when a new job needs printing
        if (action === 'enqueue') {
            if (!body.restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });

            // Accept either user session OR API key for enqueue
            const apiKeyAuth = authenticateApiKey(req, body);
            if (apiKeyAuth.error) {
                // No valid API key — try user session
                const user = await base44.auth.me().catch(() => null);
                if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
                if (user.role !== 'admin') {
                    const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                        user_email: user.email,
                        is_active: true,
                    });
                    const authorized = managers.some(m => (m.restaurant_ids || []).includes(body.restaurant_id));
                    if (!authorized) return Response.json({ error: 'Forbidden' }, { status: 403 });
                }
            }

            const job = await base44.asServiceRole.entities.PrintJob.create({
                restaurant_id: body.restaurant_id,
                action: body.print_action || 'print_receipt',
                printer_ip: body.printer_ip,
                printer_port: body.printer_port || '9100',
                command_set: body.command_set || 'esc_pos',
                printer_width: body.printer_width || '80mm',
                template: body.template || 'standard',
                order_data: body.order_data || null,
                restaurant_data: body.restaurant_data || null,
                config: body.config || {},
                status: 'pending',
                retry_count: 0,
                next_retry_at: null,
            });
            return Response.json({ success: true, job_id: job.id });
        }

        // ── POLL: Called by the local agent every few seconds to pick up pending jobs
        if (action === 'poll') {
            const auth = authenticateApiKey(req, body);
            if (auth.error) return Response.json({ error: auth.error }, { status: 401 });
            if (!restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });
            if (!agent_id) return Response.json({ error: 'agent_id required' }, { status: 400 });

            const now = new Date();
            const stuckCutoff = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

            // Reset stuck 'processing' jobs older than 2 minutes back to 'pending' (no time bound — catch all)
            const stuckJobs = await base44.asServiceRole.entities.PrintJob.filter({
                restaurant_id,
                status: 'processing',
            });
            for (const j of stuckJobs) {
                const jobDate = j.updated_date || j.created_date;
                if (jobDate && jobDate < stuckCutoff) {
                    await base44.asServiceRole.entities.PrintJob.update(j.id, { status: 'pending', agent_id: null });
                }
            }

            // Fetch ALL pending jobs — no time bound so old stuck jobs are also picked up
            const pendingJobs = await base44.asServiceRole.entities.PrintJob.filter({
                restaurant_id,
                status: 'pending',
            });

            // Filter out jobs that are waiting for retry backoff
            const nowIso = now.toISOString();
            const readyJobs = pendingJobs.filter(j => !j.next_retry_at || j.next_retry_at <= nowIso);

            // Sort by created_date ascending (oldest first)
            readyJobs.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

            const pendingJob = readyJobs[0];
            if (!pendingJob) return Response.json({ job: null });

            // Record heartbeat — store last_seen per agent in a lightweight way
            // We return the server time so the Android app can use it too
            const serverNow = new Date().toISOString();

            // Re-fetch the job to guard against race where two agents polled simultaneously.
            // Filter by id only (some SDKs don't support multi-field AND on filter), verify restaurant_id in JS.
            const latestJobArr = await base44.asServiceRole.entities.PrintJob.filter({ id: pendingJob.id });
            const latestJob = latestJobArr.find(j => j.restaurant_id === restaurant_id);
            if (!latestJob || latestJob.status !== 'pending') {
                return Response.json({ job: null }); // already claimed by another agent
            }

            // Mark as processing so no other agent picks it up
            const updatedJob = await base44.asServiceRole.entities.PrintJob.update(pendingJob.id, {
                status: 'processing',
                agent_id,
            });

            return Response.json({ job: { ...pendingJob, status: 'processing', agent_id, ...updatedJob }, server_time: serverNow });
        }

        // ── COMPLETE: Local agent reports success
        if (action === 'complete') {
            const auth = authenticateApiKey(req, body);
            if (auth.error) return Response.json({ error: auth.error }, { status: 401 });
            if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });
            if (!agent_id) return Response.json({ error: 'agent_id required' }, { status: 400 });
            if (!restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });

            const jobsForRestaurant = await base44.asServiceRole.entities.PrintJob.filter({ restaurant_id, id: job_id });
            const job = jobsForRestaurant[0];
            if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
            if (job.agent_id !== agent_id) return Response.json({ error: 'Not your job' }, { status: 403 });

            await base44.asServiceRole.entities.PrintJob.update(job_id, {
                status: 'done',
                completed_at: new Date().toISOString(),
                next_retry_at: null,
            });
            return Response.json({ success: true });
        }

        // ── FAIL: Local agent reports failure — apply exponential backoff retry
        if (action === 'fail') {
            const auth = authenticateApiKey(req, body);
            if (auth.error) return Response.json({ error: auth.error }, { status: 401 });
            if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });
            if (!agent_id) return Response.json({ error: 'agent_id required' }, { status: 400 });
            if (!restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });

            const failJobs = await base44.asServiceRole.entities.PrintJob.filter({ restaurant_id, id: job_id });
            const job = failJobs[0];
            if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
            if (job.agent_id !== agent_id) return Response.json({ error: 'Not your job' }, { status: 403 });

            const retryCount = (job.retry_count || 0) + 1;

            if (retryCount > MAX_RETRIES) {
                // Give up — mark as permanently failed
                await base44.asServiceRole.entities.PrintJob.update(job_id, {
                    status: 'failed',
                    error_message: `Failed after ${MAX_RETRIES} retries. Last error: ${error_message || 'Unknown error'}`,
                    completed_at: new Date().toISOString(),
                    retry_count: retryCount,
                    next_retry_at: null,
                });
                return Response.json({ success: true, retried: false, retry_count: retryCount });
            }

            // Schedule retry with backoff
            const delaySecs = RETRY_DELAYS_SECONDS[retryCount - 1] || 300;
            const nextRetryAt = new Date(Date.now() + delaySecs * 1000).toISOString();

            await base44.asServiceRole.entities.PrintJob.update(job_id, {
                status: 'pending',  // Back to pending so agent can pick it up again
                agent_id: null,
                error_message: `Attempt ${retryCount} failed: ${error_message || 'Unknown error'}. Retrying in ${delaySecs}s.`,
                retry_count: retryCount,
                next_retry_at: nextRetryAt,
            });

            return Response.json({ success: true, retried: true, retry_count: retryCount, next_retry_at: nextRetryAt });
        }

        // ── MANUAL_RETRY: Dashboard user manually retries a failed job
        if (action === 'manual_retry') {
            const user = await base44.auth.me();
            if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });
            if (!restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });

            const retryJobs = await base44.asServiceRole.entities.PrintJob.filter({ restaurant_id, id: job_id });
            const job = retryJobs[0];
            if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
            if (job.status !== 'failed') return Response.json({ error: 'Only failed jobs can be manually retried' }, { status: 400 });

            await base44.asServiceRole.entities.PrintJob.update(job_id, {
                status: 'pending',
                agent_id: null,
                retry_count: 0,
                next_retry_at: null,
                error_message: `Manually retried by ${user.email} at ${new Date().toLocaleString()}`,
            });
            return Response.json({ success: true });
        }

        // ── CANCEL: Dashboard user cancels a pending or processing job
        if (action === 'cancel') {
            const user = await base44.auth.me();
            if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });
            if (!restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });

            const cancelJobs = await base44.asServiceRole.entities.PrintJob.filter({ restaurant_id, id: job_id });
            const job = cancelJobs[0];
            if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
            if (!['pending', 'processing'].includes(job.status)) return Response.json({ error: 'Only pending or processing jobs can be cancelled' }, { status: 400 });

            await base44.asServiceRole.entities.PrintJob.update(job_id, {
                status: 'failed',
                agent_id: null,
                error_message: `Cancelled by ${user.email} at ${new Date().toLocaleString()}`,
                completed_at: new Date().toISOString(),
            });
            return Response.json({ success: true });
        }

        // ── HEARTBEAT: Android agent pings to report it is alive — persisted to DB
        if (action === 'heartbeat') {
            const auth = authenticateApiKey(req, body);
            if (auth.error) return Response.json({ error: auth.error }, { status: 401 });
            if (!restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });
            if (!agent_id) return Response.json({ error: 'agent_id required' }, { status: 400 });

            const now = new Date().toISOString();
            // Upsert: find existing heartbeat record for this agent and update it,
            // or create a new one if it doesn't exist yet.
            const existing = await base44.asServiceRole.entities.AgentHeartbeat.filter({
                restaurant_id,
                agent_id,
            });
            if (existing.length > 0) {
                await base44.asServiceRole.entities.AgentHeartbeat.update(existing[0].id, {
                    last_seen: now,
                    connection_mode: body.connection_mode || 'polling',
                    printer_address: body.printer_address || existing[0].printer_address,
                });
            } else {
                await base44.asServiceRole.entities.AgentHeartbeat.create({
                    restaurant_id,
                    agent_id,
                    last_seen: now,
                    agent_type: body.agent_type || 'android',
                    connection_mode: body.connection_mode || 'polling',
                    printer_address: body.printer_address || '',
                });
            }
            return Response.json({ success: true, server_time: now, agent_id });
        }

        // ── LIST_AGENTS: Dashboard fetches all known agents and their last-seen timestamps
        if (action === 'list_agents') {
            const user = await base44.auth.me();
            if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            if (!restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });

            const agents = await base44.asServiceRole.entities.AgentHeartbeat.filter({ restaurant_id });
            return Response.json({ agents });
        }

        // ── LIST: Dashboard fetches jobs — pending/processing always shown, done/failed last 24h
        if (action === 'list') {
            const user = await base44.auth.me();
            if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            if (!restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });

            // Single query for all jobs in last 24h (includes pending/processing/done/failed)
            // plus a separate safety net for any older pending/processing jobs
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const [recentJobs, activeJobs] = await Promise.all([
                base44.asServiceRole.entities.PrintJob.filter({ restaurant_id, created_date: { $gte: since } }),
                base44.asServiceRole.entities.PrintJob.filter({ restaurant_id, status: { $in: ['pending', 'processing'] } }),
            ]);
            // Merge and deduplicate — activeJobs catches old stuck jobs outside 24h window
            const allJobs = [...recentJobs, ...activeJobs];
            const unique = Object.values(Object.fromEntries(allJobs.map(j => [j.id, j])));
            unique.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
            return Response.json({ jobs: unique.slice(0, 50) });
        }

        // ── CLEANUP: Remove old done/failed jobs (called by dashboard)
        if (action === 'cleanup') {
            const user = await base44.auth.me();
            if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            if (!restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });

            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const [doneOld, failedOld] = await Promise.all([
                base44.asServiceRole.entities.PrintJob.filter({ restaurant_id, status: 'done', created_date: { $lt: cutoff } }),
                base44.asServiceRole.entities.PrintJob.filter({ restaurant_id, status: 'failed', created_date: { $lt: cutoff } }),
            ]);
            const old = [...doneOld, ...failedOld];
            for (const j of old) {
                await base44.asServiceRole.entities.PrintJob.delete(j.id);
            }
            return Response.json({ success: true, deleted: old.length });
        }

        return Response.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});