import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { order_id, updates } = await req.json();

        if (!order_id || !updates) {
            return Response.json({ error: 'order_id and updates required' }, { status: 400 });
        }

        // CRITICAL TENANT CHECK: fetch the order first and verify ownership
        const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
        if (!orders || orders.length === 0) {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }
        const existingOrder = orders[0];

        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(existingOrder.restaurant_id));
            if (!hasAccess) {
                console.error(`[SECURITY] ${user.email} attempted to update order ${order_id} belonging to restaurant ${existingOrder.restaurant_id}`);
                return Response.json({ error: 'Access denied to this order' }, { status: 403 });
            }
        }

        // Strip immutable fields — never allow spoofing of owner or restaurant
        const {
            restaurant_id: _rid,
            created_by: _cb,
            payment_intent_id: _pi,
            idempotency_key: _ik,
            // Financial fields must not be modified directly via posUpdateOrder
            total: _total,
            subtotal: _subtotal,
            platform_commission_amount: _comm,
            restaurant_earnings: _earn,
            ...safeUpdates
        } = updates;

        // Cancellation must go through posVoidOrder (has audit + reason requirement)
        if (safeUpdates.status === 'cancelled') {
            return Response.json({
                error: 'Use posVoidOrder to cancel orders. A reason code is required.',
            }, { status: 400 });
        }

        const order = await base44.asServiceRole.entities.Order.update(order_id, safeUpdates);

        // Lightweight audit for status transitions
        if (safeUpdates.status && safeUpdates.status !== existingOrder.status) {
            console.log(`[AUDIT] ORDER_STATUS_CHANGED: actor=${user.email} order=${order_id} from=${existingOrder.status} to=${safeUpdates.status}`);
        }

        return Response.json({ order });
    } catch (error) {
        return Response.json({ error: 'Order update failed. Please try again.' }, { status: 500 });
    }
});