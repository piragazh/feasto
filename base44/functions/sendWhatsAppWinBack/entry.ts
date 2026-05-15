import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import twilio from 'npm:twilio@4.10.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Auth guard — this function must not be publicly callable
        const user = await base44.auth.me().catch(() => null);
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { phone, message, couponCode, restaurantId, restaurantName } = await req.json();

        if (!phone || !message) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Normalize phone number
        let toPhone = phone;
        if (toPhone.startsWith('07')) {
            toPhone = '+44' + toPhone.slice(1);
        } else if (!toPhone.startsWith('+')) {
            toPhone = '+' + toPhone;
        }

        // Get Twilio credentials
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !twilioPhoneNumber) {
            console.log(`WhatsApp win-back message would be sent to ${toPhone}`);
            return Response.json({
                success: true,
                simulated: true,
                message: 'Twilio not configured'
            });
        }

        // Initialize Twilio
        const client = twilio(accountSid, authToken);

        // Send WhatsApp message
        const result = await client.messages.create({
            from: `whatsapp:${twilioPhoneNumber}`,
            to: `whatsapp:${toPhone}`,
            body: message
        });

        // Log the message
        await base44.asServiceRole.entities.SmsLog.create({
            restaurant_id: restaurantId,
            restaurant_name: restaurantName,
            to: toPhone,
            message: message,
            status: 'sent',
            message_sid: result.sid,
            type: 'win_back_campaign'
        });

        return Response.json({
            success: true,
            message_sid: result.sid,
            coupon_code: couponCode
        });
    } catch (error) {
        console.error('WhatsApp win-back send error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});