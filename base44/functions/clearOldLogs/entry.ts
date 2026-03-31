import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // Admin-only
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403 });
        }

        // Delete all FailureLog records
        const failureLogs = await base44.asServiceRole.entities.FailureLog.list();
        let failureDeletedCount = 0;
        if (failureLogs?.length) {
            for (const log of failureLogs) {
                try {
                    await base44.asServiceRole.entities.FailureLog.delete(log.id);
                    failureDeletedCount++;
                } catch (e) {
                    console.warn(`Failed to delete FailureLog ${log.id}:`, e?.message);
                }
            }
        }

        // Delete all ReconciliationIssue records
        const reconciliationIssues = await base44.asServiceRole.entities.ReconciliationIssue.list();
        let reconciliationDeletedCount = 0;
        if (reconciliationIssues?.length) {
            for (const issue of reconciliationIssues) {
                try {
                    await base44.asServiceRole.entities.ReconciliationIssue.delete(issue.id);
                    reconciliationDeletedCount++;
                } catch (e) {
                    console.warn(`Failed to delete ReconciliationIssue ${issue.id}:`, e?.message);
                }
            }
        }

        console.log(`✅ Cleared logs: ${failureDeletedCount} FailureLogs, ${reconciliationDeletedCount} ReconciliationIssues`);

        return new Response(JSON.stringify({
            success: true,
            failureLogsDeleted: failureDeletedCount,
            reconciliationIssuesDeleted: reconciliationDeletedCount,
        }), { status: 200 });
    } catch (error) {
        console.error('Clear logs error:', error);
        return new Response(JSON.stringify({ error: error.message || 'Clear failed' }), { status: 500 });
    }
});