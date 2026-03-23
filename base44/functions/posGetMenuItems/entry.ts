import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { restaurant_id } = await req.json();

        if (!restaurant_id) {
            return Response.json({ error: 'restaurant_id required' }, { status: 400 });
        }

        // TENANT CHECK: verify caller has access to this restaurant
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(restaurant_id));
            if (!hasAccess) {
                return Response.json({ error: 'Access denied to this restaurant' }, { status: 403 });
            }
        }

        const menuItems = await base44.asServiceRole.entities.MenuItem.filter({ 
            restaurant_id,
            is_available: true 
        });

        return Response.json({ menuItems });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});