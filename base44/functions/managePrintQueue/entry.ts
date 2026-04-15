import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Exponential backoff delays (seconds): 30s, 2min, 5min → then give up
const RETRY_DELAYS_SECONDS = [30, 120, 300];
const MAX_RETRIES = RETRY_DELAYS_SECONDS.length;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { action, restaurant_id, job_id, agent_id, error_message } = body;

        // ── ENQUEUE: Called by the dashboard/auto-print when a new job needs printing
        if (action === 'enqueue') {
            const user = await base44.auth.me();
            if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            if (!body.restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });

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
            if (!restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });
            if (!agent_id) return Response.json({ error: 'agent_id required' }, { status: 400 });

            const now = new Date();

            // Reset stuck 'processing' jobs older than 2 minutes back to 'pending'
            const stuckCutoff = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
            const stuckJobs = await base44.asServiceRole.entities.PrintJob.filter({
                restaurant_id,
                status: 'processing',
            });
            for (const j of stuckJobs) {
                if ((j.updated_date || j.created_date) < stuckCutoff) {
                    await base44.asServiceRole.entities.PrintJob.update(j.id, { status: 'pending', agent_id: null });
                }
            }

            // Fetch pending jobs that are ready to be picked up (not waiting for retry backoff)
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

            // Mark as processing so no other agent picks it up
            const updatedJob = await base44.asServiceRole.entities.PrintJob.update(pendingJob.id, {
                status: 'processing',
                agent_id,
            });

            return Response.json({ job: { ...pendingJob, status: 'processing', agent_id, ...updatedJob } });
        }

        // ── COMPLETE: Local agent reports success
        if (action === 'complete') {
            if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });
            if (!agent_id) return Response.json({ error: 'agent_id required' }, { status: 400 });

            const jobs = await base44.asServiceRole.entities.PrintJob.filter({ restaurant_id: body.restaurant_id || undefined });
            const allJobs = await base44.asServiceRole.entities.PrintJob.list();
            const job = allJobs.find(j => j.id === job_id);
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
            if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });
            if (!agent_id) return Response.json({ error: 'agent_id required' }, { status: 400 });

            const allJobs = await base44.asServiceRole.entities.PrintJob.list();
            const job = allJobs.find(j => j.id === job_id);
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

            const allJobs = await base44.asServiceRole.entities.PrintJob.list();
            const job = allJobs.find(j => j.id === job_id);
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

            const allJobs = await base44.asServiceRole.entities.PrintJob.list();
            const job = allJobs.find(j => j.id === job_id);
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

        // ── LIST: Dashboard fetches recent jobs for display
        if (action === 'list') {
            const user = await base44.auth.me();
            if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            if (!restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });

            const jobs = await base44.asServiceRole.entities.PrintJob.filter({ restaurant_id });
            jobs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
            return Response.json({ jobs: jobs.slice(0, 20) });
        }

        // ── CLEANUP: Remove old done/failed jobs (called by dashboard)
        if (action === 'cleanup') {
            const user = await base44.auth.me();
            if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            if (!restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });

            const jobs = await base44.asServiceRole.entities.PrintJob.filter({ restaurant_id });
            const old = jobs.filter(j =>
                (j.status === 'done' || j.status === 'failed') &&
                new Date(j.created_date) < new Date(Date.now() - 24 * 60 * 60 * 1000)
            );
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