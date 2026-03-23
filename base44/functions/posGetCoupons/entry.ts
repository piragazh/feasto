import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

        // Get restaurant-specific and platform-wide coupons
        const coupons = await base44.asServiceRole.entities.Coupon.list();
        const activeCoupons = coupons.filter(c => 
            c.is_active && 
            (!c.restaurant_id || c.restaurant_id === restaurant_id)
        );

        return Response.json({ coupons: activeCoupons });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});