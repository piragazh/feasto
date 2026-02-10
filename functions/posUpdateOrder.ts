import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { order_id, updates } = await req.json();

        if (!order_id || !updates) {
            return Response.json({ error: 'order_id and updates required' }, { status: 400 });
        }

        const order = await base44.asServiceRole.entities.Order.update(order_id, updates);

        return Response.json({ order });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});