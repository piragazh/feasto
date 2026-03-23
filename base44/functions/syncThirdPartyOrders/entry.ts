import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { restaurantId } = await req.json();

        // Get restaurant and integrations
        const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
        if (!restaurants || restaurants.length === 0) {
            return Response.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const integrations = restaurants[0].third_party_integrations || {};
        let totalOrders = 0;

        // For each enabled integration, fetch orders
        for (const [platform, config] of Object.entries(integrations)) {
            if (!config.enabled || !config.api_key) continue;

            try {
                const orders = await fetchOrdersFromPlatform(platform, config.api_key, restaurantId);
                totalOrders += orders.length;

                // Save orders to database
                for (const order of orders) {
                    await base44.entities.Order.create(order);
                }
            } catch (e) {
                console.error(`Error syncing ${platform}:`, e.message);
            }
        }

        return Response.json({ 
            success: true,
            data: { totalOrders }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});

async function fetchOrdersFromPlatform(platform, apiKey, restaurantId) {
    // Mock implementation - replace with actual API calls
    const orders = [];

    if (platform === 'uber_eats') {
        // Implement Uber Eats API integration
        // GET https://api.uber.com/v2/eats/orders
        orders.push({
            restaurant_id: restaurantId,
            restaurant_name: 'Third Party',
            items: [],
            subtotal: 0,
            delivery_fee: 0,
            total: 0,
            status: 'pending',
            order_type: 'delivery',
            payment_method: 'card',
            third_party_platform: 'uber_eats',
            third_party_order_id: `UE-${Date.now()}`
        });
    } else if (platform === 'deliveroo') {
        // Implement Deliveroo API integration
        orders.push({
            restaurant_id: restaurantId,
            restaurant_name: 'Third Party',
            items: [],
            subtotal: 0,
            delivery_fee: 0,
            total: 0,
            status: 'pending',
            order_type: 'delivery',
            payment_method: 'card',
            third_party_platform: 'deliveroo',
            third_party_order_id: `DR-${Date.now()}`
        });
    } else if (platform === 'just_eat') {
        // Implement Just Eat API integration
        orders.push({
            restaurant_id: restaurantId,
            restaurant_name: 'Third Party',
            items: [],
            subtotal: 0,
            delivery_fee: 0,
            total: 0,
            status: 'pending',
            order_type: 'delivery',
            payment_method: 'card',
            third_party_platform: 'just_eat',
            third_party_order_id: `JE-${Date.now()}`
        });
    }

    return orders;
}