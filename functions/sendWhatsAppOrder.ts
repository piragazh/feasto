import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import twilio from 'npm:twilio@4.10.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Support both direct call with order_id and automation payload (event + data)
        const body = await req.json();
        const order_id = body.order_id || body.event?.entity_id;
        const restaurant_phone = body.restaurant_phone; // optional override

        if (!order_id || !restaurant_phone) {
            return Response.json({ error: 'Missing order_id or restaurant_phone' }, { status: 400 });
        }

        // Fetch order details
        const orders = await base44.entities.Order.filter({ id: order_id });
        if (!orders || orders.length === 0) {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }

        const order = orders[0];

        // Format order details for WhatsApp message
        const itemsList = order.items
            .map(item => `• ${item.quantity}x ${item.name} - £${(item.price * item.quantity).toFixed(2)}`)
            .join('\n');

        const messageBody = `🍽️ *New Order #${order.order_number || order.id}*\n\nCustomer: ${order.guest_name || 'Guest'}\nPhone: ${order.phone || 'N/A'}\nAddress: ${order.delivery_address || 'Collection'}\n\n*Items:*\n${itemsList}\n\n*Subtotal:* £${order.subtotal.toFixed(2)}\n*Delivery:* £${order.delivery_fee.toFixed(2)}\n*Total:* £${order.total.toFixed(2)}\n\nDelivery Type: ${order.order_type}\nPayment: ${order.payment_method}`;

        // Initialize Twilio client
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !twilioPhoneNumber) {
            return Response.json({ error: 'Twilio credentials not configured' }, { status: 500 });
        }

        const client = twilio(accountSid, authToken);

        // Send WhatsApp message with interactive buttons
        const message = await client.messages.create({
            from: `whatsapp:${twilioPhoneNumber}`,
            to: `whatsapp:${restaurant_phone}`,
            body: messageBody,
            contentSid: undefined,
            mediaUrl: undefined
        });

        // Store WhatsApp message tracking
        await base44.asServiceRole.entities.Message.create({
            order_id: order_id,
            restaurant_id: order.restaurant_id,
            sender_type: 'restaurant',
            message: `WhatsApp order sent - SID: ${message.sid}`,
            is_read: false
        });

        return Response.json({ 
            success: true, 
            message_sid: message.sid,
            message: 'Order sent to restaurant WhatsApp'
        });
    } catch (error) {
        console.error('WhatsApp send error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});