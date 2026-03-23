import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import twilio from 'npm:twilio@4.10.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Support both direct call with order_id and automation payload (event + data)
        const body = await req.json();
        const order_id = body.order_id || body.event?.entity_id;
        const restaurant_phone = body.restaurant_phone; // optional override

        if (!order_id) {
            return Response.json({ error: 'Missing order_id' }, { status: 400 });
        }

        // Fetch order details
        const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
        if (!orders?.length) {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }

        const order = orders[0];

        // Validate order has required fields
        if (!order.total || !order.items?.length) {
            return Response.json({ error: 'Order missing required fields' }, { status: 400 });
        }

        // Format order details for WhatsApp message
        const itemsList = order.items
            .map(item => `• ${item.quantity}x ${item.name} - £${(item.price * item.quantity).toFixed(2)}`)
            .join('\n');

        const orderLabel = order.order_number || order.id.slice(-6);
        const customerName = order.guest_name || order.created_by || 'Customer';
        const messageBody = `🍽️ *New Order #${orderLabel}*\n\nCustomer: ${customerName}\nPhone: ${order.phone || 'N/A'}\nAddress: ${order.delivery_address || 'Collection'}\n\n*Items:*\n${itemsList}\n\n*Subtotal:* £${(order.subtotal || 0).toFixed(2)}\n*Delivery:* £${(order.delivery_fee || 0).toFixed(2)}\n*Total:* £${order.total.toFixed(2)}\n\nType: ${order.order_type}\nPayment: ${order.payment_method}`;

        // Get restaurant details
        let restaurant_data = null;
        if (order.restaurant_id) {
            const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: order.restaurant_id });
            restaurant_data = restaurants.length > 0 ? restaurants[0] : null;
        }

        // Check if WhatsApp alerts are enabled for this restaurant
        if (!restaurant_data?.whatsapp_alerts_enabled) {
            return Response.json({ success: false, message: 'WhatsApp alerts not enabled for this restaurant' });
        }

        // Get phone number for WhatsApp
        let toPhone = restaurant_phone || restaurant_data?.alert_phone;
        if (!toPhone) {
            return Response.json({ success: false, message: 'No WhatsApp phone configured for this restaurant' });
        }

        // Normalize phone number (ensure it starts with country code)
        if (toPhone.startsWith('07')) {
            toPhone = '+44' + toPhone.slice(1);
        } else if (!toPhone.startsWith('+')) {
            toPhone = '+' + toPhone;
        }

        // Initialize Twilio client
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !twilioPhoneNumber) {
            await base44.asServiceRole.entities.SmsLog.create({
                restaurant_id: order.restaurant_id,
                restaurant_name: restaurant_data?.name || null,
                to: toPhone,
                message: messageBody,
                order_id: order_id,
                status: 'simulated',
                type: 'restaurant_alert',
            });
            return Response.json({ success: true, message: 'Twilio not configured', simulated: true });
        }

        const client = twilio(accountSid, authToken);

        // Send WhatsApp message with text instructions for reply
        const message = await client.messages.create({
            from: `whatsapp:${twilioPhoneNumber}`,
            to: `whatsapp:${toPhone}`,
            body: messageBody + '\n\n✅ Reply "ACCEPT" to confirm\n❌ Reply "REJECT" to decline'
        });

        // Log the WhatsApp message
        await base44.asServiceRole.entities.SmsLog.create({
            restaurant_id: order.restaurant_id,
            restaurant_name: restaurant_data?.name || null,
            to: toPhone,
            message: messageBody,
            order_id: order_id,
            status: 'sent',
            message_sid: message.sid,
            type: 'restaurant_alert',
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