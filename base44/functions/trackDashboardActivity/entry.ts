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
        
        // Check if activity record exists
        const existing = await base44.entities.DashboardActivity.filter({
            restaurant_id
        });
        
        if (existing && existing.length > 0) {
            // Update existing activity timestamp
            await base44.entities.DashboardActivity.update(existing[0].id, {
                last_active: new Date().toISOString(),
                user_email: user.email
            });
        } else {
            // Create new activity record
            await base44.entities.DashboardActivity.create({
                restaurant_id,
                last_active: new Date().toISOString(),
                user_email: user.email
            });
        }
        
        return Response.json({ success: true });
    } catch (error) {
        console.error('Track dashboard activity failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});