import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get all restaurants
        const restaurants = await base44.asServiceRole.entities.Restaurant.list();
        const now = new Date();
        const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        const alerts = [];
        
        for (const restaurant of restaurants) {
            // Check if restaurant should be accepting orders now
            const deliveryHours = restaurant.delivery_hours?.[currentDay];
            if (!deliveryHours || deliveryHours.closed) continue;
            
            // Check if within delivery hours
            const isWithinHours = currentTime >= deliveryHours.open && currentTime <= deliveryHours.close;
            if (!isWithinHours) continue;
            
            // Check last dashboard activity (we'll track this via a LastActivity entity)
            const activities = await base44.asServiceRole.entities.DashboardActivity.filter({
                restaurant_id: restaurant.id
            }, '-updated_date', 1);
            
            const lastActivity = activities?.[0];
            const lastActivityTime = lastActivity ? new Date(lastActivity.updated_date) : null;
            const minutesSinceActivity = lastActivityTime 
                ? (now.getTime() - lastActivityTime.getTime()) / (1000 * 60)
                : 999;
            
            // If no activity in last 30 minutes during trading hours, send alert
            if (minutesSinceActivity > 30 && restaurant.alert_phone) {
                try {
                    await base44.asServiceRole.functions.invoke('sendSMS', {
                        to: restaurant.alert_phone,
                        message: `⚠️ ${restaurant.name}: Your restaurant dashboard appears to be closed. Please open it to accept orders. Trading hours are active until ${deliveryHours.close}.`
                    });
                    
                    alerts.push({
                        restaurant: restaurant.name,
                        phone: restaurant.alert_phone,
                        lastActivity: lastActivityTime,
                        minutesSinceActivity: Math.round(minutesSinceActivity)
                    });
                } catch (smsError) {
                    console.error(`Failed to send SMS to ${restaurant.name}:`, smsError);
                }
            }
        }
        
        return Response.json({
            success: true,
            checked: restaurants.length,
            alertsSent: alerts.length,
            alerts,
            timestamp: now.toISOString()
        });
    } catch (error) {
        console.error('Dashboard activity check failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});