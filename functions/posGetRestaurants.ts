import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // Only allow authenticated users
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { restaurant_id } = await req.json();

        if (restaurant_id) {
            // Get specific restaurant
            const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurant_id });
            return Response.json({ restaurant: restaurants[0] || null });
        } else {
            // Get all restaurants
            const restaurants = await base44.asServiceRole.entities.Restaurant.list();
            return Response.json({ restaurants });
        }
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});