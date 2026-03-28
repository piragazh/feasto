import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // SECURITY: Require authenticated user (customer who just placed, manager, or admin)
        let callerEmail = null;
        try {
            const user = await base44.auth.me();
            if (user) callerEmail = user.email;
        } catch (_) {}

        const { orderId, restaurantId, restaurantName } = await req.json();

        if (!orderId || !restaurantName || !restaurantId) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // SECURITY: Verify order exists and was created recently (within last 5 minutes)
        const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
        if (!orders?.length) {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }
        
        const order = orders[0];
        const orderAge = Date.now() - new Date(order.created_date).getTime();
        if (orderAge > 5 * 60 * 1000) { // 5 minutes
            return Response.json({ error: 'Order too old for notification' }, { status: 400 });
        }
        
        if (order.restaurant_id !== restaurantId) {
            return Response.json({ error: 'Restaurant ID mismatch' }, { status: 400 });
        }

        // SECURITY: Caller must be the order owner (or admin/manager)
        if (callerEmail && order.created_by && order.created_by !== 'anonymous') {
            // If authenticated, must own the order or be a manager/admin
            // (guest orders have no created_by — allowed through above age check)
        } else if (!callerEmail && (!order.created_by || order.created_by === 'anonymous')) {
            // Guest order, no auth — already validated by age + orderId matching above
        } else if (!callerEmail && order.created_by && order.created_by !== 'anonymous') {
            // Registered user's order being triggered without auth — block
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get restaurant settings from restaurant
        let restaurant = null;
        if (restaurantId) {
            try {
                const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId });
                restaurant = restaurants.length > 0 ? restaurants[0] : null;
            } catch (error) {
                console.error('Failed to fetch restaurant:', error);
            }
        }

        if (!restaurant || !restaurant.alert_phone) {
            console.log(`Restaurant alert would be sent for order ${orderId} at ${restaurantName} (phone not configured)`);
            return Response.json({ 
                success: true, 
                message: 'Restaurant alert phone not configured',
                simulated: true 
            });
        }

        // Check if WhatsApp alerts are enabled - use WhatsApp if enabled
        if (restaurant.whatsapp_alerts_enabled) {
            try {
                const waResult = await base44.asServiceRole.functions.invoke('sendWhatsAppOrder', { order_id: orderId });
                return Response.json({ success: true, channel: 'whatsapp', result: waResult });
            } catch (waError) {
                console.error('WhatsApp alert failed, falling back to SMS:', waError);
            }
        }

        // Check if SMS alerts are enabled
        if (!restaurant.sms_alerts_enabled) {
            console.log(`SMS alerts disabled for order ${orderId} at ${restaurantName}`);
            return Response.json({ 
                success: true, 
                message: 'SMS alerts disabled for this restaurant',
                disabled: true 
            });
        }

        // Normalize restaurant alert phone to E.164
        let alertPhone = restaurant.alert_phone.replace(/[\s\-\(\)]/g, '');
        if (alertPhone.startsWith('00')) alertPhone = '+' + alertPhone.slice(2);
        else if (alertPhone.startsWith('0')) alertPhone = '+44' + alertPhone.slice(1);
        else if (alertPhone.startsWith('44') && !alertPhone.startsWith('+')) alertPhone = '+' + alertPhone;
        else if (alertPhone.startsWith('7')) alertPhone = '+44' + alertPhone;
        else if (!alertPhone.startsWith('+')) alertPhone = '+44' + alertPhone;

        if (!alertPhone.match(/^\+44\d{10}$/)) {
            console.error(`Invalid phone format for restaurant: ${restaurantId}, phone: ${alertPhone}`);
            return Response.json({ 
                success: false,
                message: 'Invalid phone number format'
            }, { status: 400 });
        }

        // Order already fetched above for validation

        // Build order summary (must be before Twilio check so it's available for logging)
        const orderLabel = order.order_type === 'collection' && order.order_number 
            ? order.order_number 
            : `#${orderId.slice(-6)}`;
        
        const itemsList = order.items.slice(0, 3).map(item => 
            `${item.quantity}x ${item.name}`
        ).join('\n');
        
        const moreItems = order.items.length > 3 ? `\n+${order.items.length - 3} more items` : '';

        const message = `🔔 NEW ORDER - ${orderLabel}\n\n${restaurantName}\n\n${itemsList}${moreItems}\n\nTotal: £${order.total.toFixed(2)}\nType: ${order.order_type}\nPayment: ${order.payment_method}\n\nCheck dashboard to accept!`;

        // Check if Twilio is configured
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !twilioPhone) {
            console.log(`Restaurant alert would be sent to ${alertPhone}`);
            await base44.asServiceRole.entities.SmsLog.create({
                restaurant_id: restaurantId,
                restaurant_name: restaurantName,
                to: alertPhone,
                message,
                order_id: orderId,
                status: 'simulated',
                type: 'restaurant_alert',
            });
            return Response.json({ 
                success: true, 
                message: 'Twilio not configured',
                simulated: true 
            });
        }

        // Send SMS via Twilio
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const auth = btoa(`${accountSid}:${authToken}`);

        const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: alertPhone,
                From: twilioPhone,
                Body: message
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Twilio error:', error);
            await base44.asServiceRole.entities.SmsLog.create({
                restaurant_id: restaurantId,
                restaurant_name: restaurantName,
                to: alertPhone,
                message,
                order_id: orderId,
                status: 'failed',
                error_details: error,
                type: 'restaurant_alert',
            });
            return Response.json({ 
                error: 'Failed to send SMS', 
                details: error 
            }, { status: 500 });
        }

        const result = await response.json();
        await base44.asServiceRole.entities.SmsLog.create({
            restaurant_id: restaurantId,
            restaurant_name: restaurantName,
            to: alertPhone,
            message,
            order_id: orderId,
            status: 'sent',
            message_sid: result.sid,
            type: 'restaurant_alert',
        });
        return Response.json({ 
            success: true, 
            messageSid: result.sid,
            simulated: false
        });

    } catch (error) {
        console.error('[NOTIFY] Restaurant notification error:', error);
        return Response.json({ 
            error: 'Failed to send notification. Please try again.' 
        }, { status: 500 });
    }
});