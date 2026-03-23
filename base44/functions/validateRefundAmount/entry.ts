/**
 * Server-side refund amount validation.
 * Called before approving a refund to ensure:
 *   - Refund amount does not exceed the original order total
 *   - Partial refund items sum matches the requested amount
 *   - Order is in a refundable status
 *   - Only admin or the restaurant manager may approve
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { orderId, refundAmount, refundType, refundItems } = await req.json();

        if (!orderId || refundAmount == null) {
            return Response.json({ error: 'orderId and refundAmount required' }, { status: 400 });
        }

        const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
        if (!orders?.length) return Response.json({ error: 'Order not found' }, { status: 404 });

        const order = orders[0];

        // Only allow refund on orders in refundable states
        const refundableStatuses = ['refund_requested', 'refund_under_platform_review'];
        if (!refundableStatuses.includes(order.status)) {
            return Response.json({
                valid: false,
                error: `Order status "${order.status}" is not eligible for refund`
            }, { status: 400 });
        }

        // Tenant check: admin or restaurant manager
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(order.restaurant_id));
            if (!hasAccess) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        const orderTotal = order.total || 0;

        // Refund amount must be positive and not exceed order total
        if (refundAmount <= 0) {
            return Response.json({ valid: false, error: 'Refund amount must be greater than zero' }, { status: 400 });
        }

        if (refundAmount > orderTotal) {
            return Response.json({
                valid: false,
                error: `Refund amount £${refundAmount.toFixed(2)} exceeds order total £${orderTotal.toFixed(2)}`
            }, { status: 400 });
        }

        // For partial refunds: validate that item prices sum to the requested amount
        if (refundType === 'partial' && refundItems?.length > 0) {
            const itemsTotal = refundItems.reduce((sum, item) => {
                const price = item.price || 0;
                const qty = item.quantity || 1;
                return sum + price * qty;
            }, 0);

            const tolerance = 0.02; // 2p rounding tolerance
            if (Math.abs(itemsTotal - refundAmount) > tolerance) {
                return Response.json({
                    valid: false,
                    error: `Partial refund items total £${itemsTotal.toFixed(2)} does not match requested refund amount £${refundAmount.toFixed(2)}`
                }, { status: 400 });
            }

            // Verify each refunded item actually exists in the original order
            const orderItemNames = (order.items || []).map(i => i.name?.toLowerCase());
            for (const ri of refundItems) {
                if (!orderItemNames.includes(ri.name?.toLowerCase())) {
                    return Response.json({
                        valid: false,
                        error: `Item "${ri.name}" was not in the original order`
                    }, { status: 400 });
                }
            }
        }

        return Response.json({
            valid: true,
            approvedAmount: Math.min(refundAmount, orderTotal),
            orderTotal
        });

    } catch (error) {
        console.error('Refund validation error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});