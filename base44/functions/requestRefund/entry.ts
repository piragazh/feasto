/**
 * Secure refund request — verifies caller owns the order before updating status.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

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

        const { orderId, refundType, refundedItems, refundAmount, reason, issueDescription } = await req.json();

        if (!orderId || refundAmount == null) {
            return Response.json({ error: 'orderId and refundAmount required' }, { status: 400 });
        }

        // Fetch order with service role to ensure we get the real created_by
        let orders;
        try {
            orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
        } catch {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }

        if (!orders?.length) {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }

        const order = orders[0];

        // CRITICAL: Verify the caller owns this order
        if (order.created_by !== user.email) {
            console.error(`[SECURITY] IDOR attempt: ${user.email} tried to refund order ${orderId} owned by ${order.created_by}`);
            return Response.json({ error: 'Access denied' }, { status: 403 });
        }

        // Only delivered orders can be refunded
        if (order.status !== 'delivered') {
            return Response.json({ error: 'Only delivered orders can have a refund requested' }, { status: 400 });
        }

        // Cap refund amount at order total
        const safeAmount = Math.min(refundAmount, order.total);
        if (safeAmount <= 0) {
            return Response.json({ error: 'Invalid refund amount' }, { status: 400 });
        }

        await base44.asServiceRole.entities.Order.update(orderId, {
            status: 'refund_requested',
            refund_request_type: refundType,
            refund_requested_items: refundedItems || [],
            refund_requested_amount: safeAmount,
            refund_request_reason: reason,
            refund_request_description: issueDescription,
            refund_request_date: new Date().toISOString()
        });

        return Response.json({ success: true });

    } catch (error) {
        console.error('Refund request error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});