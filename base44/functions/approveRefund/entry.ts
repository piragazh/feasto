/**
 * Approve a customer refund — server-side only, replaces direct entity write from frontend.
 *
 * Policy:
 *   - Only admin OR an active manager for the order's restaurant may approve.
 *   - Calls validateRefundAmount internally to verify caps and item totals.
 *   - Every approval is written to the audit log with before/after values.
 *   - High-value refunds (above LARGE_REFUND_THRESHOLD) are additionally flagged in the log.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

const LARGE_REFUND_THRESHOLD = 30; // £ — flag in audit as high severity

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { order_id } = await req.json();

        if (!order_id) {
            return Response.json({ error: 'order_id required' }, { status: 400 });
        }

        // ── Fetch order ───────────────────────────────────────────────────────────
        let orders;
        try {
            orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
        } catch {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }
        if (!orders?.length) {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }
        const order = orders[0];

        // ── Tenant check ──────────────────────────────────────────────────────────
        const isAdmin = user.role === 'admin';

        if (!isAdmin) {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true,
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(order.restaurant_id));
            if (!hasAccess) {
                console.error(`[SECURITY] ${user.email} attempted to approve refund for order ${order_id} (restaurant ${order.restaurant_id})`);
                return Response.json({ error: 'Access denied to this order' }, { status: 403 });
            }
        }

        // ── Status check ──────────────────────────────────────────────────────────
        const refundableStatuses = ['refund_requested', 'refund_under_platform_review'];
        if (!refundableStatuses.includes(order.status)) {
            return Response.json({
                error: `Order status "${order.status}" is not eligible for refund approval`,
            }, { status: 400 });
        }

        const requestedAmount = order.refund_requested_amount || 0;

        // ── Server-side amount validation ─────────────────────────────────────────
        if (requestedAmount <= 0) {
            return Response.json({ error: 'Refund amount is invalid (zero or negative)' }, { status: 400 });
        }

        if (requestedAmount > order.total) {
            return Response.json({
                error: `Refund amount £${requestedAmount.toFixed(2)} exceeds order total £${order.total.toFixed(2)}`,
            }, { status: 400 });
        }

        // Partial: verify item total matches
        if (order.refund_request_type === 'partial' && order.refund_requested_items?.length > 0) {
            const itemsTotal = order.refund_requested_items.reduce((sum, item) => {
                return sum + ((item.price || 0) * (item.quantity || 1));
            }, 0);
            if (Math.abs(itemsTotal - requestedAmount) > 0.02) {
                return Response.json({
                    error: `Partial refund items total £${itemsTotal.toFixed(2)} does not match requested £${requestedAmount.toFixed(2)}`,
                }, { status: 400 });
            }
            for (const ri of order.refund_requested_items) {
                const match = (order.items || []).find(i => i.menu_item_id === ri.menu_item_id);
                if (!match) {
                    return Response.json({
                        error: `Item "${ri.name || ri.menu_item_id}" was not in the original order`,
                    }, { status: 400 });
                }
                if ((ri.quantity || 1) > (match.quantity || 1)) {
                    return Response.json({
                        error: `Refund quantity (${ri.quantity}) exceeds ordered quantity (${match.quantity}) for "${match.name}"`,
                    }, { status: 400 });
                }
                const expectedPrice = match.price * (ri.quantity || 1);
                const claimedPrice = (ri.price || 0) * (ri.quantity || 1);
                if (Math.abs(claimedPrice - expectedPrice) > 0.02) {
                    return Response.json({
                        error: `Refund price for "${match.name}" does not match the original order price`,
                    }, { status: 400 });
                }
            }
        }

        const approvedAmount = Math.min(requestedAmount, order.total);

        // ── Stripe refund (card orders only) ──────────────────────────────────────
        let stripeRefundId = null;
        if (order.payment_method === 'card' && order.payment_intent_id) {
            const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
            try {
                const refund = await stripe.refunds.create(
                    {
                        payment_intent: order.payment_intent_id,
                        amount: Math.round(approvedAmount * 100), // pence
                        reason: 'requested_by_customer',
                        metadata: {
                            order_id,
                            approved_by: user.email,
                            refund_type: order.refund_request_type || 'full',
                        },
                    },
                    {
                        // Idempotency key prevents double-refund on concurrent approvals
                        idempotencyKey: `refund_${order_id}_${Math.round(approvedAmount * 100)}`,
                    }
                );
                stripeRefundId = refund.id;
                console.log(`[REFUND] Stripe refund issued: ${stripeRefundId} amount=£${approvedAmount.toFixed(2)} order=${order_id}`);
            } catch (stripeErr) {
                if (stripeErr.code === 'charge_already_refunded') {
                    // Idempotent: already refunded — fetch the existing refund for audit trail
                    console.warn(`[REFUND] charge_already_refunded for order ${order_id} — retrieving existing refund`);
                    try {
                        const charges = await stripe.charges.list({ payment_intent: order.payment_intent_id, limit: 1 });
                        stripeRefundId = charges.data?.[0]?.refunds?.data?.[0]?.id || 'already_refunded';
                        console.log(`[REFUND] Retrieved existing refund ID: ${stripeRefundId}`);
                    } catch (chargesErr) {
                        console.warn(`[REFUND] Failed to retrieve existing refund: ${chargesErr.message} — setting to placeholder`);
                        stripeRefundId = 'already_refunded';
                    }
                } else {
                    console.error(`[REFUND] Stripe refund FAILED for order ${order_id}:`, stripeErr.message);
                    try {
                        await base44.asServiceRole.entities.FailureLog.create({
                            failure_type: 'refund_initiate',
                            severity: 'critical',
                            payment_intent_id: order.payment_intent_id,
                            order_id,
                            restaurant_id: order.restaurant_id,
                            user_email: user.email,
                            error_message: `approveRefund Stripe call failed: ${stripeErr.message}`,
                            context: { approved_amount: approvedAmount, actor: user.email },
                            logged_at: new Date().toISOString(),
                            alert_triggered: true,
                            alert_condition: 'critical_payment_issue',
                        });
                    } catch (_) {}
                    return Response.json({
                        error: `Refund failed: ${stripeErr.message}. The refund has not been issued. Please retry or process manually via the Stripe dashboard.`,
                        stripe_error: stripeErr.code,
                    }, { status: 502 });
                }
            }

            // Update PaymentTransaction record (non-fatal if missing)
            try {
                const pts = await base44.asServiceRole.entities.PaymentTransaction.filter({
                    payment_intent_id: order.payment_intent_id,
                });
                if (pts?.[0]?.id) {
                    await base44.asServiceRole.entities.PaymentTransaction.update(pts[0].id, {
                        status: 'refunded',
                        refund_id: stripeRefundId,
                        refund_amount: approvedAmount,
                        refund_attempted_at: new Date().toISOString(),
                        refund_confirmed_at: new Date().toISOString(),
                    });
                }
            } catch (ptErr) {
                console.warn('[REFUND] PT update failed (non-fatal, refund already issued):', ptErr.message);
            }
        } else if (order.payment_method === 'card' && !order.payment_intent_id) {
            console.warn(`[REFUND] Card order ${order_id} has no payment_intent_id — skipping Stripe refund. Manual action required.`);
        }
        // Cash/non-card orders: no Stripe refund needed, proceed to Order update

        // ── Apply approval ────────────────────────────────────────────────────────
        await base44.asServiceRole.entities.Order.update(order_id, {
            status: 'refunded',
            refund_amount: approvedAmount,
            refund_paid_by: 'restaurant',
            refund_approved_date: new Date().toISOString(),
        });

        // ── Audit log ─────────────────────────────────────────────────────────────
        const isLarge = approvedAmount >= LARGE_REFUND_THRESHOLD;
        const auditDetails = {
            order_id,
            restaurant_id: order.restaurant_id,
            restaurant_name: order.restaurant_name,
            customer: order.created_by || order.guest_email,
            previous_status: order.status,
            new_status: 'refunded',
            refund_type: order.refund_request_type,
            requested_amount: requestedAmount,
            approved_amount: approvedAmount,
            refund_paid_by: 'restaurant',
            customer_reason: order.refund_request_reason,
            actor_role: isAdmin ? 'admin' : 'manager',
            large_refund_flagged: isLarge,
        };

        console.log(`[AUDIT] REFUND_APPROVED: actor=${user.email} order=${order_id} amount=£${approvedAmount.toFixed(2)} large=${isLarge}`);

        try {
            await base44.asServiceRole.entities.DashboardActivity.create({
                user_email: user.email,
                action: 'REFUND_APPROVED',
                resource_type: 'Order',
                resource_id: order_id,
                details: JSON.stringify(auditDetails),
                severity: isLarge ? 'high' : 'info',
            });
        } catch (dbErr) {
            console.warn('[AUDIT] Could not persist refund approval audit log:', dbErr.message);
        }

        return Response.json({
            success: true,
            approved_amount: approvedAmount,
            order_id,
        });

    } catch (error) {
        console.error('[REFUND] approveRefund error:', error);
        return Response.json({ error: 'Refund approval failed. Please try again.' }, { status: 500 });
    }
});