import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const orderData = await req.json();

        // Validate required fields
        if (!orderData.restaurant_id || !orderData.items || !orderData.total) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Create order with service role
        const order = await base44.asServiceRole.entities.Order.create({
            ...orderData,
            status: 'confirmed',
            payment_method: orderData.payment_method || 'cash',
            order_type: orderData.order_type || 'dine_in'
        });

        return Response.json({ order });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});