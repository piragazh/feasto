/**
 * sendNotificationFromTemplate — Send templated order status notification
 * ========================================================================
 * Called by updateOrderStatus to send SMS/WhatsApp using restaurant's custom templates.
 * Substitutes variables and respects per-status enabled flags.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const { restaurantId, orderId, newStatus, orderData, guestEmail, guestPhone } = await req.json();

        if (!restaurantId || !orderId || !newStatus || !orderData) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
        }

        // Fetch notification settings and templates for restaurant
        const [restaurant, templates] = await Promise.all([
            (await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId }))?.[0],
            base44.asServiceRole.entities.NotificationTemplate.filter({ restaurant_id: restaurantId, status: newStatus })
        ]);

        if (!restaurant) {
            return new Response(JSON.stringify({ error: 'Restaurant not found' }), { status: 404 });
        }

        const smsSettings = restaurant.sms_notification_settings || {};
        const whatsappSettings = restaurant.whatsapp_notification_settings || {};

        // Check if this status should trigger notifications
        const smsEnabled = smsSettings.enabled && smsSettings[newStatus];
        const whatsappEnabled = whatsappSettings.enabled && whatsappSettings[newStatus];

        if (!smsEnabled && !whatsappEnabled) {
            return new Response(JSON.stringify({ success: true, skipped: true, reason: 'Status not enabled for notifications' }), { status: 200 });
        }

        // Build variable map for template substitution
        const variables = {
            order_number: orderData.order_number || orderId,
            restaurant_name: restaurant.name,
            eta: orderData.estimated_delivery || 'Soon',
            delivery_address: orderData.delivery_address || '',
            customer_name: orderData.guest_name || 'Customer',
            items_count: (orderData.items || []).length
        };

        // Substitute variables
        const substituteVariables = (template) => {
            let text = template;
            for (const [key, value] of Object.entries(variables)) {
                text = text.replace(new RegExp(`{${key}}`, 'g'), String(value));
            }
            return text;
        };

        const notifications = [];

        // SMS notification
        if (smsEnabled && guestPhone) {
            const smsTemplate = templates.find(t => t.channel === 'sms');
            if (smsTemplate) {
                const message = substituteVariables(smsTemplate.template_text);
                notifications.push({
                    channel: 'sms',
                    phone: guestPhone,
                    message,
                    status: 'pending'
                });
            }
        }

        // WhatsApp notification
        if (whatsappEnabled && guestPhone) {
            const waTemplate = templates.find(t => t.channel === 'whatsapp');
            if (waTemplate) {
                const message = substituteVariables(waTemplate.template_text);
                notifications.push({
                    channel: 'whatsapp',
                    phone: guestPhone,
                    message,
                    status: 'pending'
                });
            }
        }

        // Send notifications (async)
        for (const notif of notifications) {
            if (notif.channel === 'sms') {
                base44.functions.invoke('sendSMS', {
                    phone: notif.phone,
                    message: notif.message
                }).catch(e => console.warn('[SMS] Failed:', e.message));
            } else if (notif.channel === 'whatsapp') {
                base44.functions.invoke('sendWhatsAppOrder', {
                    phone: notif.phone,
                    message: notif.message,
                    orderId
                }).catch(e => console.warn('[WA] Failed:', e.message));
            }
        }

        return new Response(JSON.stringify({ success: true, sent: notifications.length }), { status: 200 });

    } catch (error) {
        console.error('[TEMPLATE_NOTIFY] Error:', error.message);
        return new Response(JSON.stringify({ error: error.message, success: false }), { status: 500 });
    }
});