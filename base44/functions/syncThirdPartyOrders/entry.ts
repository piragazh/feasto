import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { restaurantId } = await req.json();

        if (!restaurantId) {
            return Response.json({ error: 'restaurantId required' }, { status: 400 });
        }

        // Access control: admin or restaurant manager only
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(restaurantId));
            if (!hasAccess) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId });
        if (!restaurants || restaurants.length === 0) {
            return Response.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const integrations = restaurants[0].third_party_integrations || {};
        let totalCreated = 0;
        let totalSkipped = 0;
        const errors = [];

        for (const [platform, config] of Object.entries(integrations)) {
            if (!config.enabled || !config.api_key) continue;

            try {
                const orders = await fetchOrdersFromPlatform(platform, config, restaurantId);

                for (const order of orders) {
                    if (!order.third_party_order_id) {
                        console.warn(`[syncThirdPartyOrders] Skipping order with no third_party_order_id on ${platform}`);
                        totalSkipped++;
                        continue;
                    }

                    // DEDUP: skip if order already exists
                    const existing = await base44.asServiceRole.entities.Order.filter({
                        third_party_order_id: order.third_party_order_id
                    });

                    if (existing && existing.length > 0) {
                        console.log(`[DEDUP] ${platform} order ${order.third_party_order_id} already exists, skipping`);
                        totalSkipped++;
                        continue;
                    }

                    // Validate order has items before creating
                    if (!order.items || order.items.length === 0 || order.total <= 0) {
                        console.warn(`[syncThirdPartyOrders] Skipping invalid order from ${platform}: no items or zero total`);
                        totalSkipped++;
                        continue;
                    }

                    await base44.asServiceRole.entities.Order.create(order);
                    totalCreated++;
                }
            } catch (e) {
                console.error(`Error syncing ${platform}:`, e.message);
                errors.push({ platform, error: e.message });
            }
        }

        return Response.json({
            success: true,
            data: { totalCreated, totalSkipped, errors }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});

/**
 * Fetch orders from a third-party platform.
 * Replace each block with a real API call when credentials are available.
 * Returns [] (empty) rather than mock ghost orders to avoid polluting production data.
 */
async function fetchOrdersFromPlatform(platform, config, restaurantId) {
    // Real integrations are handled via webhooks (uberEatsWebhook etc.)
    // This polling fallback returns empty until a real API call is implemented.
    console.log(`[syncThirdPartyOrders] Polling ${platform} — no real API implemented, skipping`);
    return [];
}