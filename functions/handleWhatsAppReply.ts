import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import twilio from 'npm:twilio@4.10.0';

Deno.serve(async (req) => {
    try {
        // Verify Twilio webhook signature
        const url = `https://${req.headers.get('host')}${new URL(req.url).pathname}`;
        const body = await req.text();
        const signature = req.headers.get('X-Twilio-Signature') || '';

        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        if (!authToken) {
            return Response.json({ error: 'Twilio not configured' }, { status: 500 });
        }

        // Verify Twilio signature
        const isValidRequest = twilio.validateRequest(authToken, signature, url, body);
        if (!isValidRequest) {
            return Response.json({ error: 'Invalid Twilio signature' }, { status: 403 });
        }

        const params = new URLSearchParams(body);
        let incomingMessage = params.get('Body')?.trim().toLowerCase() || '';
        const buttonPayload = params.get('ButtonPayload')?.trim().toLowerCase() || ''; // For interactive buttons
        const fromPhone = params.get('From') || ''; // e.g. "whatsapp:+447..."

        // Use button payload if available (from interactive message), otherwise use text body
        if (buttonPayload) {
            incomingMessage = buttonPayload;
        }

        // Parse the action from the message
        let action = null;
        if (incomingMessage === 'accept' || incomingMessage.startsWith('accept') || incomingMessage === 'yes' || incomingMessage === '1') {
            action = 'confirmed';
        } else if (incomingMessage === 'reject' || incomingMessage.startsWith('reject') || incomingMessage === 'no' || incomingMessage === '2') {
            action = 'cancelled';
        }

        if (!action) {
            // Unrecognised reply - send help message
            const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
            const authToken2 = Deno.env.get('TWILIO_AUTH_TOKEN');
            const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
            if (accountSid && authToken2 && twilioPhoneNumber) {
                const client2 = twilio(accountSid, authToken2);
                await client2.messages.create({
                    from: `whatsapp:${twilioPhoneNumber}`,
                    to: fromPhone,
                    body: `Reply *ACCEPT* to confirm an order or *REJECT* to decline it.`
                });
            }
            return new Response('OK', { status: 200 });
        }

        // Normalize the sender's phone number to find the matching restaurant
        const base44 = createClientFromRequest(req);

        // Strip "whatsapp:" prefix and normalize
        let senderPhone = fromPhone.replace('whatsapp:', '');
        // Convert +447... to 07... for matching against alert_phone
        const senderPhoneUK = senderPhone.startsWith('+44') ? '0' + senderPhone.slice(3) : senderPhone;

        // Find the restaurant whose alert_phone matches sender
        const allRestaurants = await base44.asServiceRole.entities.Restaurant.list();
        const restaurant = allRestaurants.find(r =>
            r.alert_phone &&
            (r.alert_phone === senderPhoneUK || r.alert_phone === senderPhone || r.alert_phone.replace(/\s/g, '') === senderPhoneUK.replace(/\s/g, ''))
        );

        if (!restaurant) {
            console.log('No restaurant found for phone:', senderPhone);
            return new Response('OK', { status: 200 });
        }

        // Find the most recent pending order for this restaurant
        const pendingOrders = await base44.asServiceRole.entities.Order.filter({
            restaurant_id: restaurant.id,
            status: 'pending'
        });

        if (!pendingOrders || pendingOrders.length === 0) {
            // No pending orders
            const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
            const authToken2 = Deno.env.get('TWILIO_AUTH_TOKEN');
            const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
            if (accountSid && authToken2 && twilioPhoneNumber) {
                const client2 = twilio(accountSid, authToken2);
                await client2.messages.create({
                    from: `whatsapp:${twilioPhoneNumber}`,
                    to: fromPhone,
                    body: `No pending orders found to ${action === 'confirmed' ? 'accept' : 'reject'}.`
                });
            }
            return new Response('OK', { status: 200 });
        }

        // Sort by created_date descending - take the most recent pending order
        pendingOrders.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        const order = pendingOrders[0];

        // Update the order status
        await base44.asServiceRole.entities.Order.update(order.id, {
            status: action,
            rejection_reason: action === 'cancelled' ? 'Rejected via WhatsApp' : undefined,
            status_history: [
                ...(order.status_history || []),
                {
                    status: action,
                    timestamp: new Date().toISOString(),
                    note: `Order ${action} via WhatsApp by restaurant`
                }
            ]
        });

        // Store the reply for the message log
        await base44.asServiceRole.entities.Message.create({
            order_id: order.id,
            restaurant_id: order.restaurant_id,
            sender_type: 'restaurant',
            message: `Restaurant ${action === 'confirmed' ? 'ACCEPTED' : 'REJECTED'} order via WhatsApp`,
            is_read: false
        });

        // Send confirmation back to the restaurant
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken3 = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (accountSid && authToken3 && twilioPhoneNumber) {
            const client = twilio(accountSid, authToken3);
            const orderLabel = order.order_number || order.id.slice(-6);
            const emoji = action === 'confirmed' ? '✅' : '❌';
            await client.messages.create({
                from: `whatsapp:${twilioPhoneNumber}`,
                to: fromPhone,
                body: `${emoji} Order #${orderLabel} has been ${action === 'confirmed' ? 'ACCEPTED' : 'REJECTED'} successfully.`
            });
        }

        return new Response('OK', { status: 200 });
    } catch (error) {
        console.error('WhatsApp webhook error:', error);
        // Always return 200 to acknowledge to Twilio
        return new Response('OK', { status: 200 });
    }
});