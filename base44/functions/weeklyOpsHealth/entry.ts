import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Get data from last 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // Fetch orders
        const orders = await base44.entities.Order.list();
        const recentOrders = orders.filter(o => new Date(o.created_date) >= sevenDaysAgo);

        // Fetch failure logs
        const failureLogs = await base44.entities.FailureLog.list().catch(() => []);
        const recentFailures = failureLogs.filter(f => new Date(f.created_date || 0) >= sevenDaysAgo);

        // Fetch reconciliation issues
        const reconIssues = await base44.entities.ReconciliationIssue.list().catch(() => []);
        const recentReconIssues = reconIssues.filter(r => new Date(r.created_date || 0) >= sevenDaysAgo);

        // Calculate Money Safety
        const refunds = recentOrders.filter(o => o.status === 'refunded' || o.status === 'refund_rejected_by_restaurant');
        const failedRefunds = recentOrders.filter(o => o.status === 'refund_rejected_by_restaurant');
        const orphanedPayments = recentReconIssues.filter(r => r.issue_type === 'orphaned_payment').length;

        const totalAmount = recentOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const refundAmount = refunds.reduce((sum, o) => sum + (o.total || 0), 0);
        const refundPercent = recentOrders.length > 0 ? Math.round((refunds.length / recentOrders.length) * 100) : 0;

        // Calculate Order Health
        const successfulOrders = recentOrders.filter(o => o.status === 'delivered' || o.status === 'collected').length;
        const rejectedOrders = recentOrders.filter(o => o.status === 'cancelled').length;
        const successRate = recentOrders.length > 0 ? Math.round((successfulOrders / recentOrders.length) * 100) : 100;
        const rejectionRate = recentOrders.length > 0 ? Math.round((rejectedOrders / recentOrders.length) * 100) : 0;
        const avgOrderValue = recentOrders.length > 0 ? (totalAmount / recentOrders.length).toFixed(2) : '0.00';

        // Failures analysis
        const criticalFailures = recentFailures.filter(f => f.severity === 'critical').length;
        const failureTypes = {};
        recentFailures.forEach(f => {
            const type = f.error_type || 'Unknown';
            failureTypes[type] = (failureTypes[type] || 0) + 1;
        });
        const topFailures = Object.entries(failureTypes)
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Reconciliation
        const openIssues = recentReconIssues.filter(r => r.status !== 'resolved').length;
        const criticalReconIssues = recentReconIssues.filter(r => r.severity === 'critical').length;
        const avgResolutionHours = recentReconIssues.length > 0
            ? recentReconIssues.reduce((sum, r) => {
                if (r.resolved_at && r.created_date) {
                    const diff = new Date(r.resolved_at) - new Date(r.created_date);
                    return sum + (diff / (1000 * 60 * 60));
                }
                return sum;
            }, 0) / recentReconIssues.length
            : 0;

        const oldestIssue = recentReconIssues.length > 0
            ? Math.min(...recentReconIssues.map(r => (Date.now() - new Date(r.created_date)) / (1000 * 60 * 60)))
            : 0;

        // Trends (compare with previous 7 days)
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        const prevPeriodOrders = orders.filter(o => {
            const d = new Date(o.created_date);
            return d >= fourteenDaysAgo && d < sevenDaysAgo;
        });
        const prevPeriodFailures = failureLogs.filter(f => {
            const d = new Date(f.created_date || 0);
            return d >= fourteenDaysAgo && d < sevenDaysAgo;
        });
        const prevRefunds = prevPeriodOrders.filter(o => o.status === 'refunded' || o.status === 'refund_rejected_by_restaurant');

        const ordersTrend = prevPeriodOrders.length > 0
            ? Math.round(((recentOrders.length - prevPeriodOrders.length) / prevPeriodOrders.length) * 100)
            : 0;
        const refundsTrend = prevRefunds.length > 0
            ? Math.round(((refunds.length - prevRefunds.length) / prevRefunds.length) * 100)
            : 0;
        const failuresTrend = prevPeriodFailures.length > 0
            ? Math.round(((recentFailures.length - prevPeriodFailures.length) / prevPeriodFailures.length) * 100)
            : 0;

        return Response.json({
            timestamp: new Date().toISOString(),
            moneySafety: {
                refundPercent,
                refundCount: refunds.length,
                refundFailures: failedRefunds.length,
                orphanedPayments,
                totalAmount: Math.round(totalAmount),
                totalPayments: recentOrders.length
            },
            orderHealth: {
                successRate,
                rejectionRate,
                avgOrderValue,
                totalOrders: recentOrders.length
            },
            failures: {
                totalFailures: recentFailures.length,
                criticalFailures,
                topFailures
            },
            reconciliation: {
                openIssues,
                criticalIssues: criticalReconIssues,
                avgResolutionHours: Math.round(avgResolutionHours * 10) / 10,
                oldestIssueAgeHours: Math.round(oldestIssue)
            },
            trends: {
                orders: ordersTrend,
                refunds: refundsTrend,
                failures: failuresTrend
            }
        });
    } catch (error) {
        console.error('weeklyOpsHealth error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});