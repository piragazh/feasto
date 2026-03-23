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

        // Strip any attempt to change restaurant_id or created_by
        const { restaurant_id: _rid, created_by: _cb, ...safeUpdates } = updates;

        const order = await base44.asServiceRole.entities.Order.update(order_id, safeUpdates);

        return Response.json({ order });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});