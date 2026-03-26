/**
 * Platform-level refund override — admin-only.
 *
 * Called when a restaurant rejects a customer refund and the platform decides to approve it.
 * The platform absorbs the cost (refund_paid_by = 'platform').
 *
 * Replaces the previous pattern of doing base44.asServiceRole.entities.Order.update directly
 * from the frontend, which could be abused by a compromised admin session without any server-side
 * audit trail or role verification.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

        // Admin-only — no exceptions
        if (user.role !== 'admin') {
            console.error(`[SECURITY] Non-admin ${user.email} (role=${user.role}) attempted platform refund override`);
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { order_id, reason } = await req.json();

        if (!order_id) {
            return Response.json({ error: 'order_id required' }, { status: 400 });
        }

        if (!reason || !reason.trim()) {
            return Response.json({ error: 'A reason is required for platform override' }, { status: 400 });
        }

        // Fetch order
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

        // Only allowed on restaurant-rejected refunds
        if (order.status !== 'refund_rejected_by_restaurant') {
            return Response.json({
                error: `Order status "${order.status}" is not eligible for platform override. Expected: refund_rejected_by_restaurant`,
            }, { status: 400 });
        }

        const refundAmount = order.refund_requested_amount || 0;
        if (refundAmount <= 0) {
            return Response.json({ error: 'Invalid refund amount on order' }, { status: 400 });
        }

        await base44.asServiceRole.entities.Order.update(order_id, {
            status: 'refunded',
            refund_paid_by: 'platform',
            refund_amount: refundAmount,
            platform_override_reason: reason.trim(),
            platform_override_date: new Date().toISOString(),
            platform_override_by: user.email,
        });

        // Audit — high severity because this has financial impact on platform
        const auditDetails = {
            order_id,
            restaurant_id: order.restaurant_id,
            restaurant_name: order.restaurant_name,
            customer: order.created_by || order.guest_email,
            refund_amount: refundAmount,
            previous_status: order.status,
            new_status: 'refunded',
            refund_paid_by: 'platform',
            restaurant_rejection_reason: order.refund_rejection_reason,
            platform_override_reason: reason.trim(),
        };

        console.log(`[AUDIT] PLATFORM_REFUND_OVERRIDE: actor=${user.email} order=${order_id} amount=£${refundAmount.toFixed(2)} reason="${reason.trim()}"`);

        try {
            await base44.asServiceRole.entities.DashboardActivity.create({
                user_email: user.email,
                action: 'PLATFORM_REFUND_OVERRIDE',
                resource_type: 'Order',
                resource_id: order_id,
                details: JSON.stringify(auditDetails),
                severity: 'high',
            });
        } catch (dbErr) {
            console.error('[AUDIT] Could not persist platform override audit log:', dbErr.message);
        }

        return Response.json({ success: true, order_id, refund_amount: refundAmount });

    } catch (error) {
        console.error('[REFUND] platformRefundOverride error:', error);
        return Response.json({ error: 'Platform override failed. Please try again.' }, { status: 500 });
    }
});