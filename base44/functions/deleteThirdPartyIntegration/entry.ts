import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { restaurantId, platform } = await req.json();
        if (!restaurantId || typeof platform !== 'string') {
            return Response.json({ error: 'restaurantId and platform required' }, { status: 400 });
        }

        // Only admins or active managers of this restaurant may remove its integrations
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true,
            });
            const allowed = (managers || []).some((m) => m.restaurant_ids?.includes(restaurantId));
            if (!allowed) {
                console.error(`[SECURITY] ${user.email} tried to remove ${platform} from restaurant ${restaurantId}`);
                return Response.json({ error: 'Access denied to this restaurant' }, { status: 403 });
            }
        }

        // Get current integrations
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId });
        if (!restaurants || restaurants.length === 0) {
            return Response.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const currentIntegrations = restaurants[0].third_party_integrations || {};
        delete currentIntegrations[platform];

        // Save to restaurant
        await base44.asServiceRole.entities.Restaurant.update(restaurantId, {
            third_party_integrations: currentIntegrations
        });

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});