import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { restaurantId } = await req.json();

        // Get restaurant to fetch integrations
        const restaurant = await base44.entities.Restaurant.filter({ id: restaurantId });
        
        if (!restaurant || restaurant.length === 0) {
            return Response.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const integrations = restaurant[0].third_party_integrations || {};

        return Response.json({
            data: integrations
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});