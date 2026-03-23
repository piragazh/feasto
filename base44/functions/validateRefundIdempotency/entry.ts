/**
 * Prevent double refunds with idempotency check
 * CRITICAL: Ensures refund can only be requested once per order
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        const { orderId } = await req.json();

        if (!orderId) {
            return new Response(
                JSON.stringify({ error: 'Order ID required' }),
                { status: 400 }
            );
        }

        // Fetch order
        const orders = await base44.asServiceRole.entities.Order.filter({
            id: orderId
        });

        if (!orders || orders.length === 0) {
            return new Response(
                JSON.stringify({ error: 'Order not found' }),
                { status: 404 }
            );
        }

        const order = orders[0];

        // Verify user owns order (if authenticated)
        if (order.created_by !== user.email) {
            return new Response(
                JSON.stringify({ error: 'Order does not belong to user' }),
                { status: 403 }
            );
        }

        // CRITICAL: Check if refund already requested
        if (order.refund_requested_date) {
            return new Response(
                JSON.stringify({ 
                    canRefund: false,
                    error: 'A refund has already been requested for this order',
                    refundStatus: order.status,
                    requestedDate: order.refund_requested_date
                }),
                { status: 400 }
            );
        }

        // Check if refund already approved or rejected
        if (order.status === 'refunded') {
            return new Response(
                JSON.stringify({ 
                    canRefund: false,
                    error: 'This order has already been refunded'
                }),
                { status: 400 }
            );
        }

        if (order.status === 'refund_rejected_by_restaurant') {
            return new Response(
                JSON.stringify({ 
                    canRefund: false,
                    error: 'Your refund request was rejected by the restaurant',
                    rejectionReason: order.refund_rejection_reason
                }),
                { status: 400 }
            );
        }

        // Check order is eligible (not too old)
        const orderAge = Date.now() - new Date(order.created_date).getTime();
        const maxRefundDays = 30; // 30 days to request refund
        if (orderAge > maxRefundDays * 24 * 60 * 60 * 1000) {
            return new Response(
                JSON.stringify({ 
                    canRefund: false,
                    error: `Refunds can only be requested within ${maxRefundDays} days of order`
                }),
                { status: 400 }
            );
        }

        return new Response(
            JSON.stringify({ 
                canRefund: true,
                orderTotal: order.total,
                orderStatus: order.status,
                createdDate: order.created_date
            }),
            { status: 200 }
        );

    } catch (error) {
        console.error('Refund idempotency check error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500 }
        );
    }
});