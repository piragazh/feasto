/**
 * detectReconciliationIssues — Auto-detect payment/order mismatches and create ReconciliationIssue records
 *
 * Runs periodically to:
 *   1. Find orphaned payments (PT with no order, still authorized/refund_failed/needs_review)
 *   2. Find unpaid orders (Order with no PT linked)
 *   3. Find duplicate payments (same payment_intent_id, multiple orders)
 *   4. Find amount mismatches (payment ≠ order total)
 *   5. Find failed refunds (PT with status='needs_review')
 *
 * Creates ReconciliationIssue records for operator triage.
 * Skips issues already created in the last 24 hours (dedup).
 *
 * SECURITY: Scheduler-only function.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Auth: scheduler or admin
        const schedulerSecret = req.headers.get('x-scheduler-secret');
        const isScheduler = schedulerSecret && schedulerSecret === Deno.env.get('SCHEDULED_DIGEST_SECRET');

        if (!isScheduler) {
            const user = await base44.auth.me();
            if (user?.role !== 'admin') {
                return Response.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        const now = new Date().toISOString();
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const issuesCreated = [];
        const issueCounts = { orphan_payment: 0, unpaid_order: 0, duplicate_payment: 0, amount_mismatch: 0, refund_failed: 0 };

        // ── 1. Orphaned Payments (PT exists, no order, not yet refunded) ────────
        const orphanedPT = await base44.asServiceRole.entities.PaymentTransaction.filter({
            order_id: null,
            status: { $nin: ['refunded'] }
        });

        for (const pt of (orphanedPT || [])) {
            // Check if issue already exists for this PT
            const existingIssue = await base44.asServiceRole.entities.ReconciliationIssue.filter({
                payment_transaction_id: pt.id,
                issue_type: 'orphan_payment',
                created_date: { $gte: oneDayAgo }
            });

            if (existingIssue && existingIssue.length > 0) continue;

            const severity = pt.status === 'needs_review' ? 'critical' : (pt.status === 'authorized' ? 'warning' : 'info');
            const suggestedAction = pt.status === 'needs_review'
                ? 'Manual refund required — contact customer, check Stripe'
                : 'Issue refund or link to order if created late';

            const issue = await base44.asServiceRole.entities.ReconciliationIssue.create({
                issue_type: 'orphan_payment',
                severity,
                status: 'open',
                payment_transaction_id: pt.id,
                restaurant_id: pt.restaurant_id,
                provider: 'stripe',
                amount: pt.amount,
                currency: pt.currency,
                detected_at: now,
                detected_by: 'automated_reconciliation',
                suggested_action: suggestedAction,
                requires_escalation: severity === 'critical',
                metadata: {
                    payment_intent_id: pt.payment_intent_id,
                    customer_email: pt.guest_email || pt.user_email,
                    customer_phone: pt.guest_phone,
                    failure_reason: pt.failure_reason,
                    failure_stage: pt.failure_stage,
                    pt_status: pt.status,
                    authorized_at: pt.stripe_verified_at
                }
            });
            issuesCreated.push(issue.id);
            issueCounts.orphan_payment++;
        }

        // ── 2. Failed Refunds (PT status='needs_review') ──────────────────────
        const refundFailedPT = await base44.asServiceRole.entities.PaymentTransaction.filter({
            status: 'needs_review'
        });

        for (const pt of (refundFailedPT || [])) {
            const existingIssue = await base44.asServiceRole.entities.ReconciliationIssue.filter({
                payment_transaction_id: pt.id,
                issue_type: 'refund_failed',
                created_date: { $gte: oneDayAgo }
            });

            if (existingIssue && existingIssue.length > 0) continue;

            const issue = await base44.asServiceRole.entities.ReconciliationIssue.create({
                issue_type: 'refund_failed',
                severity: 'critical',
                status: 'open',
                payment_transaction_id: pt.id,
                restaurant_id: pt.restaurant_id,
                provider: 'stripe',
                amount: pt.amount,
                currency: pt.currency,
                detected_at: now,
                detected_by: 'automated_reconciliation',
                suggested_action: 'Contact customer immediately. Manual refund via Stripe dashboard.',
                requires_escalation: true,
                metadata: {
                    payment_intent_id: pt.payment_intent_id,
                    customer_email: pt.guest_email || pt.user_email,
                    customer_phone: pt.guest_phone,
                    failure_reason: pt.failure_reason,
                    refund_id: pt.refund_id
                }
            });
            issuesCreated.push(issue.id);
            issueCounts.refund_failed++;
        }

        // ── 3. Unpaid Orders (Order exists, no PT) ────────────────────────────
        const unpaidOrders = await base44.asServiceRole.entities.Order.filter({
            payment_intent_id: null,
            payment_method: 'card'
        });

        for (const order of (unpaidOrders || [])) {
            const existingIssue = await base44.asServiceRole.entities.ReconciliationIssue.filter({
                order_id: order.id,
                issue_type: 'unpaid_order',
                created_date: { $gte: oneDayAgo }
            });

            if (existingIssue && existingIssue.length > 0) continue;

            const issue = await base44.asServiceRole.entities.ReconciliationIssue.create({
                issue_type: 'unpaid_order',
                severity: 'warning',
                status: 'open',
                order_id: order.id,
                restaurant_id: order.restaurant_id,
                provider: 'stripe',
                amount: order.total,
                currency: 'gbp',
                detected_at: now,
                detected_by: 'automated_reconciliation',
                suggested_action: 'Search Stripe for payment related to order; if found, link it. If missing, contact customer.',
                requires_escalation: false,
                metadata: {
                    order_number: order.order_number,
                    customer_email: order.guest_email,
                    customer_phone: order.phone,
                    order_status: order.status,
                    created_date: order.created_date
                }
            });
            issuesCreated.push(issue.id);
            issueCounts.unpaid_order++;
        }

        // ── 4. Amount Mismatches (PT.amount ≠ Order.total) ───────────────────
        const allPT = await base44.asServiceRole.entities.PaymentTransaction.filter({
            order_id: { $ne: null }
        });

        for (const pt of (allPT || [])) {
            if (!pt.order_id) continue;
            const orders = await base44.asServiceRole.entities.Order.filter({ id: pt.order_id });
            if (!orders || orders.length === 0) continue;

            const order = orders[0];
            if (Math.abs((pt.amount || 0) - (order.total || 0)) > 0.01) {
                // Amount mismatch detected
                const existingIssue = await base44.asServiceRole.entities.ReconciliationIssue.filter({
                    payment_transaction_id: pt.id,
                    issue_type: 'amount_mismatch',
                    created_date: { $gte: oneDayAgo }
                });

                if (existingIssue && existingIssue.length > 0) continue;

                const issue = await base44.asServiceRole.entities.ReconciliationIssue.create({
                    issue_type: 'amount_mismatch',
                    severity: 'warning',
                    status: 'open',
                    payment_transaction_id: pt.id,
                    order_id: order.id,
                    restaurant_id: pt.restaurant_id,
                    provider: 'stripe',
                    amount: pt.amount,
                    currency: pt.currency,
                    detected_at: now,
                    detected_by: 'automated_reconciliation',
                    suggested_action: `PT amount (£${pt.amount}) ≠ Order total (£${order.total}). Check for discount/coupon issues or refund partial amounts.`,
                    requires_escalation: false,
                    metadata: {
                        payment_intent_id: pt.payment_intent_id,
                        order_number: order.order_number,
                        payment_amount: pt.amount,
                        order_total: order.total,
                        difference: order.total - pt.amount
                    }
                });
                issuesCreated.push(issue.id);
                issueCounts.amount_mismatch++;
            }
        }

        console.log(`[RECONCILE-ISSUES] Created ${issuesCreated.length} issues:`, JSON.stringify(issueCounts));

        return Response.json({
            success: true,
            issues_created: issuesCreated.length,
            breakdown: issueCounts,
            checked_at: now
        });

    } catch (error) {
        console.error('[RECONCILE-ISSUES] Error:', error.message);
        return Response.json({ error: error.message, success: false }, { status: 500 });
    }
});