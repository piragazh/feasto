import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Backend function to check if SMS should be sent for an order status update
 * Returns whether SMS notification is enabled for a specific order status
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { restaurantId, status } = await req.json();

        if (!restaurantId || !status) {
            return Response.json({ 
                error: 'Missing restaurantId or status' 
            }, { status: 400 });
        }

        // Fetch restaurant with SMS settings
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId });
        
        if (!restaurants || restaurants.length === 0) {
            return Response.json({ 
                error: 'Restaurant not found' 
            }, { status: 404 });
        }

        const restaurant = restaurants[0];
        const smsSettings = restaurant.sms_notification_settings || {
            enabled: true,
            confirmed: true,
            preparing: false,
            out_for_delivery: false,
            delivered: false,
            ready_for_collection: true
        };

        // Map order statuses to settings keys
        const statusMap = {
            'confirmed': 'confirmed',
            'preparing': 'preparing',
            'out_for_delivery': 'out_for_delivery',
            'delivered': 'delivered',
            'ready_for_collection': 'ready_for_collection',
            'cancelled': 'cancelled'  // rejections always send if SMS is enabled
        };

        // 'cancelled' always sends if master SMS toggle is on (no separate toggle needed)
        const settingKey = statusMap[status];
        const isCancellation = status === 'cancelled';
        const shouldSend = smsSettings.enabled && (isCancellation ? true : (settingKey ? smsSettings[settingKey] : false));

        return Response.json({ 
            shouldSend,
            smsSettings
        });

    } catch (error) {
        console.error('shouldSendOrderStatusSms error:', error);
        return Response.json({ 
            error: error.message || 'Failed to check SMS settings' 
        }, { status: 500 });
    }
});