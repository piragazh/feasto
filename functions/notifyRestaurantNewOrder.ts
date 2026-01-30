import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { orderId, restaurantId, restaurantName } = await req.json();

        if (!orderId || !restaurantName) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // SECURITY: Verify order exists and was created recently (within last 5 minutes)
        const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
        if (orders.length === 0) {
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

        // Get restaurant alert phone from restaurant settings
        let alertPhone = null;
        if (restaurantId) {
            try {
                const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId });
                if (restaurants.length > 0 && restaurants[0].alert_phone) {
                    alertPhone = restaurants[0].alert_phone;
                }
            } catch (error) {
                console.error('Failed to fetch restaurant phone:', error);
            }
        }

        if (!alertPhone) {
            console.log(`Restaurant alert would be sent for order ${orderId} at ${restaurantName} (phone not configured)`);
            return Response.json({ 
                success: true, 
                message: 'Restaurant alert phone not configured',
                simulated: true 
            });
        }

        // Order already fetched above for validation

        // Check if Twilio is configured
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !twilioPhone) {
            console.log(`Restaurant alert would be sent to ${alertPhone}`);
            return Response.json({ 
                success: true, 
                message: 'Twilio not configured',
                simulated: true 
            });
        }

        // Build order summary
        const orderLabel = order.order_type === 'collection' && order.order_number 
            ? order.order_number 
            : `#${orderId.slice(-6)}`;
        
        const itemsList = order.items.slice(0, 3).map(item => 
            `${item.quantity}x ${item.name}`
        ).join('\n');
        
        const moreItems = order.items.length > 3 ? `\n+${order.items.length - 3} more items` : '';

        const message = `🔔 NEW ORDER - ${orderLabel}\n\n${restaurantName}\n\n${itemsList}${moreItems}\n\nTotal: £${order.total.toFixed(2)}\nType: ${order.order_type}\nPayment: ${order.payment_method}\n\nCheck dashboard to accept!`;

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
            return Response.json({ 
                error: 'Failed to send SMS', 
                details: error 
            }, { status: 500 });
        }

        const result = await response.json();
        return Response.json({ 
            success: true, 
            messageSid: result.sid,
            simulated: false
        });

    } catch (error) {
        console.error('Restaurant notification error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});