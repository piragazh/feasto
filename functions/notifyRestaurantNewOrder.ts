import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { orderId, restaurantId, restaurantName } = await req.json();

        if (!orderId || !restaurantName) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
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

        const message = `🍕 NEW ORDER ALERT!\n\n${restaurantName} has received a new order #${orderId.slice(-6)}.\n\nPlease check your dashboard to accept/reject.`;

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