import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { restaurantId, platform, api_key, enabled } = await req.json();

        // Get current integrations
        const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
        if (!restaurants || restaurants.length === 0) {
            return Response.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const currentIntegrations = restaurants[0].third_party_integrations || {};

        // Update specific platform
        currentIntegrations[platform] = {
            api_key: api_key,
            enabled: enabled,
            last_sync: new Date().toISOString()
        };

        // Save to restaurant
        await base44.entities.Restaurant.update(restaurantId, {
            third_party_integrations: currentIntegrations
        });

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});