/**
 * POS Order Void / Cancellation — server-side enforcement
 *
 * Policy:
 *   - Only managers or admins may void a POS order.
 *   - A structured reason code is required.
 *   - Cash orders: void is always permitted by a manager.
 *   - Card orders already charged (payment_method === 'card'): void is permitted by manager,
 *     but a refund_requested_amount is set automatically and flagged for admin review.
 *   - Every void is written to the audit log with before/after status.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const VALID_REASON_CODES = [
    'customer_changed_mind',
    'item_unavailable',
    'duplicate_order',
    'payment_issue',
    'operator_error',
    'restaurant_closed',
    'manager_discretion',
    'other',
];

const VOIDABLE_STATUSES = ['pending', 'confirmed', 'preparing'];

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

        const { order_id, reason_code, reason_note } = await req.json();

        if (!order_id) {
            return Response.json({ error: 'order_id required' }, { status: 400 });
        }

        if (!reason_code || !VALID_REASON_CODES.includes(reason_code)) {
            return Response.json({
                error: 'A valid reason_code is required',
                valid_codes: VALID_REASON_CODES,
            }, { status: 400 });
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
                console.error(`[SECURITY] ${user.email} attempted void on order ${order_id} (restaurant ${order.restaurant_id})`);
                return Response.json({ error: 'Access denied to this order' }, { status: 403 });
            }
        }

        // ── Status guard ──────────────────────────────────────────────────────────
        if (!VOIDABLE_STATUSES.includes(order.status)) {
            return Response.json({
                error: `Cannot void an order with status "${order.status}". Only ${VOIDABLE_STATUSES.join(', ')} orders can be voided.`,
            }, { status: 400 });
        }

        // ── Build update ──────────────────────────────────────────────────────────
        const previousStatus = order.status;

        const updatePayload = {
            status: 'cancelled',
            rejection_reason: `[VOID] ${reason_code}${reason_note ? `: ${reason_note}` : ''}`,
            status_history: [
                ...(order.status_history || []),
                {
                    status: 'cancelled',
                    timestamp: new Date().toISOString(),
                    note: `Voided by ${user.email} — reason: ${reason_code}${reason_note ? ` (${reason_note})` : ''}`,
                },
            ],
        };

        // If card order, flag for potential refund review
        const cardPaid = order.payment_method === 'card' && order.total > 0;
        if (cardPaid) {
            updatePayload.refund_request_type = 'full';
            updatePayload.refund_requested_amount = order.total;
            updatePayload.refund_request_reason = reason_code;
            updatePayload.refund_request_description = `Auto-flagged: order voided at POS by ${user.email}. ${reason_note || ''}`;
            updatePayload.refund_request_date = new Date().toISOString();
        }

        await base44.asServiceRole.entities.Order.update(order_id, updatePayload);

        // ── Audit log ─────────────────────────────────────────────────────────────
        const auditDetails = {
            order_id,
            restaurant_id: order.restaurant_id,
            previous_status: previousStatus,
            new_status: 'cancelled',
            reason_code,
            reason_note: reason_note || null,
            payment_method: order.payment_method,
            order_total: order.total,
            card_paid: cardPaid,
            flagged_for_refund_review: cardPaid,
            actor_role: isAdmin ? 'admin' : 'manager',
        };

        console.log(`[AUDIT] POS_ORDER_VOIDED: actor=${user.email} order=${order_id} restaurant=${order.restaurant_id} prev_status=${previousStatus} reason=${reason_code} card_paid=${cardPaid}`);

        try {
            await base44.asServiceRole.entities.DashboardActivity.create({
                user_email: user.email,
                action: 'POS_ORDER_VOIDED',
                resource_type: 'Order',
                resource_id: order_id,
                details: JSON.stringify(auditDetails),
                severity: cardPaid ? 'high' : 'warning',
            });
        } catch (dbErr) {
            console.warn('[AUDIT] Could not persist void audit log:', dbErr.message);
        }

        return Response.json({
            success: true,
            order_id,
            new_status: 'cancelled',
            card_paid_flagged_for_review: cardPaid,
        });

    } catch (error) {
        console.error('[POS-VOID] posVoidOrder error:', error);
        return Response.json({ error: 'Order void failed. Please try again.' }, { status: 500 });
    }
});