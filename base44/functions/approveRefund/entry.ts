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
            const orderItemNames = (order.items || []).map(i => i.name?.toLowerCase());
            for (const ri of order.refund_requested_items) {
                if (!orderItemNames.includes(ri.name?.toLowerCase())) {
                    return Response.json({
                        error: `Item "${ri.name}" was not in the original order`,
                    }, { status: 400 });
                }
            }
        }

        const approvedAmount = Math.min(requestedAmount, order.total);

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