import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const LIVE_STATUSES = ['new', 'confirmed', 'preparing', 'out_for_delivery', 'ready_for_collection'];
const ALLOWED_STATUSES = ['confirmed', 'preparing', 'out_for_delivery', 'ready_for_collection', 'delivered', 'collected', 'cancelled'];

Deno.serve(async (req) => {
    try {
        // Validate API Key
        const androidApiKey = req.headers.get('X-API-Key');
        const expectedApiKey = Deno.env.get("ANDROID_APP_API_KEY");

        if (!androidApiKey || androidApiKey !== expectedApiKey) {
            return Response.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 });
        }

        const body = await req.json();
        const { action, restaurantId, orderId, status } = body;

        // ── ACTION: Get live orders ──────────────────────────────────────
        if (action === 'getOrders' || !action) {
            if (!restaurantId) {
                return Response.json({ error: 'restaurantId is required' }, { status: 400 });
            }

            const base44 = createClientFromRequest(req);
            const orders = await base44.asServiceRole.entities.Order.filter({ restaurant_id: restaurantId });
            const liveOrders = orders.filter(o => LIVE_STATUSES.includes(o.status));

            return Response.json({ orders: liveOrders, count: liveOrders.length });
        }

        // ── ACTION: Update order status ──────────────────────────────────
        if (action === 'updateStatus') {
            if (!orderId) return Response.json({ error: 'orderId is required' }, { status: 400 });
            if (!status)  return Response.json({ error: 'status is required' }, { status: 400 });

            if (!ALLOWED_STATUSES.includes(status)) {
                return Response.json({
                    error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}`
                }, { status: 400 });
            }

            const base44 = createClientFromRequest(req);
            const updated = await base44.asServiceRole.entities.Order.update(orderId, {
                status,
                status_history: undefined // will be appended server-side if needed
            });

            return Response.json({ success: true, order: updated });
        }

        return Response.json({ error: 'Unknown action. Use: getOrders or updateStatus' }, { status: 400 });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});