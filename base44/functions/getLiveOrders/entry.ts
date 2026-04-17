import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        // Validate API Key
        const androidApiKey = req.headers.get('X-API-Key');
        const expectedApiKey = Deno.env.get("ANDROID_APP_API_KEY");

        if (!androidApiKey || androidApiKey !== expectedApiKey) {
            return Response.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 });
        }

        const body = await req.json();
        const { restaurantId } = body;

        if (!restaurantId) {
            return Response.json({ error: 'restaurantId is required' }, { status: 400 });
        }

        const base44 = createClientFromRequest(req);

        // Fetch live/active orders for the restaurant
        const orders = await base44.asServiceRole.entities.Order.filter({
            restaurant_id: restaurantId
        });

        // Filter to only "live" statuses
        const liveStatuses = ['new', 'confirmed', 'preparing', 'out_for_delivery', 'ready_for_collection'];
        const liveOrders = orders.filter(o => liveStatuses.includes(o.status));

        return Response.json({ orders: liveOrders, count: liveOrders.length });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});