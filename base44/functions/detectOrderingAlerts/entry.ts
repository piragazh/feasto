/**
 * detectOrderingAlerts — Automated alert condition detection
 * ============================================================
 *
 * Runs periodically to identify silent failures and critical conditions:
 *   1. Payment success + order failed → auto-refund likely failed
 *   2. Repeated failures from same restaurant within X minutes
 *   3. High failure rate (Y+ failures in Z minutes)
 *   4. Critical: payment intent succeeded but no PT record created
 *
 * Returns list of alerts for dashboard display and operator escalation.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // ADMIN ONLY
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        const alerts = [];

        // ── ALERT 1: Payment success + order failed (critical) ────────────────
        // Look for PaymentTransaction records with status='order_failed' + 'refund_failed'
        // These indicate a successful charge with no order and failed refund
        const orphanedPayments = await base44.asServiceRole.entities.PaymentTransaction.filter({
            status: 'order_failed',
            updated_date: { $gte: oneHourAgo.toISOString() }
        });

        for (const pt of (orphanedPayments || [])) {
            if (pt.status === 'order_failed' && !pt.order_id) {
                alerts.push({
                    severity: 'critical',
                    condition: 'payment_success_order_failed',
                    type: 'ORPHANED_CHARGE',
                    title: 'CRITICAL: Customer Charged Without Order',
                    description: `Payment ${pt.payment_intent_id} succeeded but order creation failed. Refund status: ${pt.stripe_refund_id ? 'initiated' : 'pending'}`,
                    restaurant_id: pt.restaurant_id,
                    payment_intent_id: pt.payment_intent_id,
                    user_email: pt.user_email || pt.guest_email,
                    phone: pt.phone,
                    timestamp: pt.created_date,
                    action: 'Manual refund required — contact Stripe support',
                    affected_customer: pt.guest_email || pt.user_email,
                });
            }
        }

        // ── ALERT 2: PT with status='manual_review' (critical) ────────────────
        const manualReviewPT = await base44.asServiceRole.entities.PaymentTransaction.filter({
            status: 'manual_review',
            updated_date: { $gte: fiveMinutesAgo.toISOString() }
        });

        for (const pt of (manualReviewPT || [])) {
            alerts.push({
                severity: 'critical',
                condition: 'critical_payment_issue',
                type: 'REFUND_FAILED',
                title: 'CRITICAL: Refund Failed — Manual Review Required',
                description: `Payment ${pt.payment_intent_id} (£${pt.amount.toFixed(2)}) charged but order creation failed AND refund attempt failed. Customer needs immediate contact.`,
                restaurant_id: pt.restaurant_id,
                payment_intent_id: pt.payment_intent_id,
                user_email: pt.user_email || pt.guest_email,
                phone: pt.phone,
                timestamp: pt.created_date,
                action: 'Contact customer immediately — refund status unclear',
                affected_customer: pt.guest_email || pt.user_email,
            });
        }

        // ── ALERT 3: Repeated failures from same restaurant in 5 mins ────────
        const recentFailures = await base44.asServiceRole.entities.FailureLog.filter({
            logged_at: { $gte: fiveMinutesAgo.toISOString() },
            severity: { $in: ['warning', 'critical'] }
        });

        const restaurantFailures = {};
        for (const log of (recentFailures || [])) {
            if (log.restaurant_id) {
                restaurantFailures[log.restaurant_id] = (restaurantFailures[log.restaurant_id] || 0) + 1;
            }
        }

        for (const [restId, count] of Object.entries(restaurantFailures)) {
            if (count >= 5) {
                const restaurant = (await base44.asServiceRole.entities.Restaurant.filter({ id: restId }))?.[0];
                alerts.push({
                    severity: 'warning',
                    condition: 'repeated_failures',
                    type: 'HIGH_FAILURE_RATE',
                    title: `${count} Order Failures in 5 Minutes — ${restaurant?.name || restId}`,
                    description: `${count} orders failed for ${restaurant?.name || restId} in the last 5 minutes. Check restaurant status, payment processing, or system issues.`,
                    restaurant_id: restId,
                    restaurant_name: restaurant?.name,
                    failure_count: count,
                    timestamp: now.toISOString(),
                    action: 'Check restaurant status, kitchen system, and Stripe connection',
                });
            }
        }

        // ── ALERT 4: High global failure rate (3+ critical in 1 hour) ────────
        const criticalFailures = await base44.asServiceRole.entities.FailureLog.filter({
            severity: 'critical',
            logged_at: { $gte: oneHourAgo.toISOString() }
        });

        if ((criticalFailures || []).length >= 3) {
            alerts.push({
                severity: 'critical',
                condition: 'high_failure_rate',
                type: 'SYSTEM_HEALTH',
                title: `${criticalFailures.length} Critical Failures in 1 Hour`,
                description: `System detected ${criticalFailures.length} critical failures (payment/order issues) in the last hour. Review payment processor health and database status.`,
                failure_count: criticalFailures.length,
                timestamp: now.toISOString(),
                action: 'Check Stripe status, payment webhooks, and database connectivity',
            });
        }

        // ── ALERT 5: Order creation failures spiking ────────────────────────
        const orderFailures = await base44.asServiceRole.entities.FailureLog.filter({
            failure_type: 'order_create',
            logged_at: { $gte: fiveMinutesAgo.toISOString() }
        });

        if ((orderFailures || []).length >= 10) {
            const failureTypeBreakdown = {};
            for (const log of (orderFailures || [])) {
                failureTypeBreakdown[log.failure_type] = (failureTypeBreakdown[log.failure_type] || 0) + 1;
            }

            alerts.push({
                severity: 'warning',
                condition: 'repeated_failures',
                type: 'ORDER_CREATION_SPIKE',
                title: `${orderFailures.length} Order Creation Failures in 5 Minutes`,
                description: `${orderFailures.length} orders failed to create in the last 5 minutes. Possible database, validation, or integration issue.`,
                failure_count: orderFailures.length,
                breakdown: failureTypeBreakdown,
                timestamp: now.toISOString(),
                action: 'Check database connectivity, validation rules, and third-party APIs',
            });
        }

        // ── ALERT 6: Coupon validation failures spiking ──────────────────────
        const couponFailures = await base44.asServiceRole.entities.FailureLog.filter({
            failure_type: { $in: ['coupon_validation', 'coupon_per_customer_limit', 'coupon_stacking'] },
            logged_at: { $gte: fiveMinutesAgo.toISOString() }
        });

        if ((couponFailures || []).length >= 15) {
            alerts.push({
                severity: 'info',
                condition: 'repeated_failures',
                type: 'COUPON_ISSUE',
                title: `${couponFailures.length} Coupon Validation Failures in 5 Minutes`,
                description: `${couponFailures.length} users encountered coupon issues. May indicate invalid coupon configuration or abuse attempts.`,
                failure_count: couponFailures.length,
                timestamp: now.toISOString(),
                action: 'Review active coupons for validity and check for fraud patterns',
            });
        }

        console.log(`[ALERTS] Detected ${alerts.length} alert condition(s) at ${now.toISOString()}`);

        return Response.json({
            success: true,
            alert_count: alerts.length,
            alerts,
            checked_at: now.toISOString(),
            time_windows: {
                recent_5min: fiveMinutesAgo.toISOString(),
                recent_1hour: oneHourAgo.toISOString(),
            }
        });

    } catch (error) {
        console.error('[ALERTS] detectOrderingAlerts error:', error.message);
        return Response.json({ error: error.message, success: false }, { status: 500 });
    }
});