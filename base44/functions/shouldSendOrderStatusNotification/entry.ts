import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Returns which notification channels (SMS and/or WhatsApp) should fire
 * for a given order status change, based on the restaurant's settings.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { restaurantId, status } = await req.json();

        if (!restaurantId || !status) {
            return Response.json({ error: 'Missing restaurantId or status' }, { status: 400 });
        }

        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId });
        if (!restaurants?.length) {
            return Response.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        const restaurant = restaurants[0];

        const smsSettings = restaurant.sms_notification_settings || {
            enabled: true, confirmed: true, preparing: false,
            out_for_delivery: false, delivered: false, ready_for_collection: true
        };

        const waSettings = restaurant.whatsapp_notification_settings || {
            enabled: false, confirmed: true, preparing: false,
            out_for_delivery: true, delivered: true, ready_for_collection: true
        };

        const isCancellation = status === 'cancelled';

        const shouldSendSms = smsSettings.enabled && (isCancellation ? true : !!(smsSettings[status]));
        const shouldSendWhatsApp = waSettings.enabled && (isCancellation ? true : !!(waSettings[status]));

        return Response.json({
            shouldSendSms,
            shouldSendWhatsApp,
            smsSettings,
            waSettings
        });

    } catch (error) {
        console.error('shouldSendOrderStatusNotification error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});