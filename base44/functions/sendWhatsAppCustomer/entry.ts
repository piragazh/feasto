import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Sends a WhatsApp message to a customer for order status updates.
 * Uses Twilio's WhatsApp API (same credentials as SMS).
 * The Twilio number must be WhatsApp-enabled in Twilio console.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Auth: either logged-in user OR recent guest order
        let isAuthorized = false;
        try {
            const user = await base44.auth.me();
            if (user) isAuthorized = true;
        } catch (_) {
            // guest path — validate by orderId + phone match
        }

        const { to, message, orderId, restaurantId, restaurantName } = await req.json();

        if (!isAuthorized && orderId && to) {
            try {
                const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
                if (orders.length > 0) {
                    const order = orders[0];
                    const orderAge = Date.now() - new Date(order.created_date).getTime();
                    const normalize = (p) => (p || '').replace(/\D/g, '');
                    if (orderAge < 10 * 60 * 1000 && normalize(to) === normalize(order.phone)) {
                        isAuthorized = true;
                    }
                }
            } catch (_) {}
        }

        if (!isAuthorized) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!to || !message) {
            return Response.json({ error: 'Missing required fields: to, message' }, { status: 400 });
        }

        // Format UK phone number to E.164
        let cleanPhone = to.replace(/[\s\-\(\)]/g, '');
        if (cleanPhone.startsWith('00')) cleanPhone = '+' + cleanPhone.slice(2);
        else if (cleanPhone.startsWith('0')) cleanPhone = '+44' + cleanPhone.slice(1);
        else if (cleanPhone.startsWith('44') && !cleanPhone.startsWith('+')) cleanPhone = '+' + cleanPhone;
        else if (cleanPhone.startsWith('7')) cleanPhone = '+44' + cleanPhone;
        else if (!cleanPhone.startsWith('+')) cleanPhone = '+44' + cleanPhone;

        if (!cleanPhone.match(/^\+447\d{9}$/)) {
            return Response.json({ error: 'Invalid UK mobile number', received: to }, { status: 400 });
        }

        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !twilioPhone) {
            // Simulate — log without sending
            await base44.asServiceRole.entities.SmsLog.create({
                restaurant_id: restaurantId || null,
                restaurant_name: restaurantName || null,
                to: cleanPhone,
                message,
                order_id: orderId || null,
                status: 'simulated',
                type: 'customer_notification',
                error_details: 'WhatsApp via Twilio (simulated - no credentials)'
            });
            return Response.json({ success: true, simulated: true, message: 'WhatsApp simulation (Twilio not configured)' });
        }

        // Twilio WhatsApp: prefix both From and To with "whatsapp:"
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const auth = btoa(`${accountSid}:${authToken}`);

        const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: `whatsapp:${cleanPhone}`,
                From: `whatsapp:${twilioPhone}`,
                Body: message
            })
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('Twilio WhatsApp error:', result);
            await base44.asServiceRole.entities.SmsLog.create({
                restaurant_id: restaurantId || null,
                restaurant_name: restaurantName || null,
                to: cleanPhone,
                message,
                order_id: orderId || null,
                status: 'failed',
                error_details: JSON.stringify(result),
                type: 'customer_notification'
            });
            return Response.json({ error: 'Failed to send WhatsApp message', details: result }, { status: 500 });
        }

        const maskedPhone = cleanPhone.replace(/\d(?=\d{3})/g, '*');
        console.log(`✅ WhatsApp sent to ${maskedPhone}, SID: ${result.sid}`);

        await base44.asServiceRole.entities.SmsLog.create({
            restaurant_id: restaurantId || null,
            restaurant_name: restaurantName || null,
            to: cleanPhone,
            message,
            order_id: orderId || null,
            status: 'sent',
            message_sid: result.sid,
            type: 'customer_notification',
            error_details: 'Sent via WhatsApp'
        });

        return Response.json({ success: true, messageSid: result.sid });

    } catch (error) {
        console.error('sendWhatsAppCustomer error:', error);
        return Response.json({ error: error.message || 'Failed to send WhatsApp message' }, { status: 500 });
    }
});