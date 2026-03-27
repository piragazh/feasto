import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    if (req.method !== 'GET') {
        return Response.json({ error: 'GET only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        // Current week data
        const orders = await base44.asServiceRole.entities.Order.filter({});
        const payments = await base44.asServiceRole.entities.PaymentTransaction.filter({});
        const failures = await base44.asServiceRole.entities.FailureLog.filter({});
        const issues = await base44.asServiceRole.entities.ReconciliationIssue.filter({});

        // Filter to last 7 days
        const currentWeekOrders = orders.filter(o => new Date(o.created_date) >= sevenDaysAgo);
        const currentWeekPayments = payments.filter(p => new Date(p.created_date || p.stripe_verified_at) >= sevenDaysAgo);
        const currentWeekFailures = failures.filter(f => new Date(f.logged_at) >= sevenDaysAgo);
        const currentWeekIssues = issues.filter(i => new Date(i.detected_at) >= sevenDaysAgo);

        // Previous week data
        const prevWeekOrders = orders.filter(o => {
            const d = new Date(o.created_date);
            return d >= fourteenDaysAgo && d < sevenDaysAgo;
        });
        const prevWeekPayments = payments.filter(p => {
            const d = new Date(p.created_date || p.stripe_verified_at);
            return d >= fourteenDaysAgo && d < sevenDaysAgo;
        });
        const prevWeekFailures = failures.filter(f => {
            const d = new Date(f.logged_at);
            return d >= fourteenDaysAgo && d < sevenDaysAgo;
        });

        // ============ MONEY SAFETY ============
        const totalPayments = currentWeekPayments.length;
        const refundedPayments = currentWeekPayments.filter(p => ['refunded', 'refund_initiated'].includes(p.status));
        const refundCount = refundedPayments.length;
        const refundPercent = totalPayments > 0 ? (refundCount / totalPayments * 100).toFixed(1) : 0;
        const refundFailures = currentWeekPayments.filter(p => p.status === 'refund_failed').length;
        const orphanedPayments = currentWeekPayments.filter(p => p.status === 'authorized' && !p.order_id).length;
        const totalAmount = currentWeekPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

        // ============ ORDER HEALTH ============
        const totalOrders = currentWeekOrders.length;
        const successOrders = currentWeekOrders.filter(o => o.status === 'delivered' || o.status === 'collected').length;
        const rejectedOrders = currentWeekOrders.filter(o => o.status === 'cancelled').length;
        const successRate = totalOrders > 0 ? (successOrders / totalOrders * 100).toFixed(1) : 0;
        const rejectionRate = totalOrders > 0 ? (rejectedOrders / totalOrders * 100).toFixed(1) : 0;
        const avgOrderValue = totalOrders > 0 ? (currentWeekOrders.reduce((sum, o) => sum + (o.total || 0), 0) / totalOrders).toFixed(2) : 0;

        // ============ FAILURES ============
        const totalFailures = currentWeekFailures.length;
        const criticalFailures = currentWeekFailures.filter(f => f.severity === 'critical').length;
        const failureTypes = {};
        currentWeekFailures.forEach(f => {
            failureTypes[f.failure_type] = (failureTypes[f.failure_type] || 0) + 1;
        });
        const topFailures = Object.entries(failureTypes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([type, count]) => ({ type, count }));

        // ============ RECONCILIATION ============
        const openIssues = currentWeekIssues.filter(i => ['open', 'reviewed'].includes(i.status)).length;
        const criticalIssues = currentWeekIssues.filter(i => i.severity === 'critical' && ['open', 'reviewed'].includes(i.status)).length;
        
        // Oldest issue
        const oldestIssue = currentWeekIssues
            .filter(i => ['open', 'reviewed'].includes(i.status))
            .sort((a, b) => new Date(a.detected_at) - new Date(b.detected_at))[0];
        const oldestIssueAge = oldestIssue 
            ? Math.floor((now - new Date(oldestIssue.detected_at)) / (1000 * 60 * 60))
            : 0;

        // Avg resolution time
        const resolvedIssues = currentWeekIssues.filter(i => i.status === 'resolved' && i.resolved_at);
        const avgResolutionTime = resolvedIssues.length > 0
            ? resolvedIssues.reduce((sum, i) => {
                const hours = (new Date(i.resolved_at) - new Date(i.detected_at)) / (1000 * 60 * 60);
                return sum + hours;
            }, 0) / resolvedIssues.length
            : 0;

        // ============ TRENDS ============
        const orderTrend = ((currentWeekOrders.length - prevWeekOrders.length) / (prevWeekOrders.length || 1) * 100).toFixed(1);
        const refundTrend = ((refundCount - prevWeekPayments.filter(p => ['refunded', 'refund_initiated'].includes(p.status)).length) / (prevWeekPayments.length || 1) * 100).toFixed(1);
        const failureTrend = ((totalFailures - prevWeekFailures.length) / (prevWeekFailures.length || 1) * 100).toFixed(1);

        return Response.json({
            success: true,
            timestamp: new Date().toISOString(),
            period: { start: sevenDaysAgo.toISOString(), end: now.toISOString() },
            moneySafety: {
                totalPayments,
                totalAmount: parseFloat(totalAmount.toFixed(2)),
                refundCount,
                refundPercent: parseFloat(refundPercent),
                refundFailures,
                orphanedPayments,
            },
            orderHealth: {
                totalOrders,
                successRate: parseFloat(successRate),
                rejectionRate: parseFloat(rejectionRate),
                avgOrderValue: parseFloat(avgOrderValue),
            },
            failures: {
                totalFailures,
                criticalFailures,
                topFailures,
            },
            reconciliation: {
                openIssues,
                criticalIssues,
                avgResolutionHours: parseFloat(avgResolutionTime.toFixed(1)),
                oldestIssueAgeHours: oldestIssueAge,
            },
            trends: {
                orders: parseFloat(orderTrend),
                refunds: parseFloat(refundTrend),
                failures: parseFloat(failureTrend),
            },
        });
    } catch (error) {
        console.error('[OPS_HEALTH] Error:', error);
        return Response.json({ error: 'Failed to compute health metrics' }, { status: 500 });
    }
});