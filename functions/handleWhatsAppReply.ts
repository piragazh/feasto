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
        const incomingMessage = params.get('Body')?.toLowerCase() || '';
        const fromPhone = params.get('From') || '';
        const messageSid = params.get('MessageSid') || '';

        // Parse the action from the message
        let action = null;
        if (incomingMessage.includes('accept') || incomingMessage.includes('yes') || incomingMessage === '1') {
            action = 'confirmed';
        } else if (incomingMessage.includes('reject') || incomingMessage.includes('no') || incomingMessage === '2') {
            action = 'cancelled';
        }

        if (!action) {
            return new Response('OK', { status: 200 });
        }

        // Find the order by WhatsApp message reference
        const base44 = createClientFromRequest(req);
        const messages = await base44.asServiceRole.entities.Message.filter({
            message: { $regex: messageSid }
        });

        if (messages && messages.length > 0) {
            const orderMsg = messages[0];
            const order = (await base44.asServiceRole.entities.Order.filter({ id: orderMsg.order_id }))[0];

            if (order && order.status === 'pending') {
                // Update order status based on action
                await base44.asServiceRole.entities.Order.update(order.id, {
                    status: action,
                    rejection_reason: action === 'cancelled' ? 'Rejected via WhatsApp' : null,
                    status_history: [
                        ...(order.status_history || []),
                        {
                            status: action,
                            timestamp: new Date().toISOString(),
                            note: `Order ${action} via WhatsApp by restaurant`
                        }
                    ]
                });

                // Store the reply message
                await base44.asServiceRole.entities.Message.create({
                    order_id: orderMsg.order_id,
                    restaurant_id: order.restaurant_id,
                    sender_type: 'restaurant',
                    message: `Restaurant replied: ${action.toUpperCase()} via WhatsApp`,
                    is_read: false
                });

                // Send confirmation back to restaurant
                const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
                const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

                if (accountSid && twilioPhoneNumber) {
                    const client = twilio(accountSid, Deno.env.get('TWILIO_AUTH_TOKEN'));
                    await client.messages.create({
                        from: `whatsapp:${twilioPhoneNumber}`,
                        to: fromPhone,
                        body: `✅ Order #${order.order_number || order.id} has been ${action === 'confirmed' ? 'accepted' : 'rejected'}.`
                    });
                }
            }
        }

        return new Response('OK', { status: 200 });
    } catch (error) {
        console.error('WhatsApp webhook error:', error);
        // Always return 200 to acknowledge to Twilio
        return new Response('OK', { status: 200 });
    }
});