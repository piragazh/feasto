import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { to, message } = await req.json();

        if (!to || !message) {
            return Response.json({ error: 'Missing required fields: to, message' }, { status: 400 });
        }

        // Validate UK phone number format
        const cleanPhone = to.replace(/\s/g, '');
        if (!cleanPhone.match(/^(\+44|0)7\d{9}$/)) {
            return Response.json({ error: 'Invalid UK phone number format' }, { status: 400 });
        }

        // Convert to international format
        let formattedPhone = cleanPhone;
        if (cleanPhone.startsWith('0')) {
            formattedPhone = '+44' + cleanPhone.slice(1);
        }

        // Check if Twilio credentials are configured
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !twilioPhone) {
            console.log(`SMS would be sent to ${formattedPhone}: ${message}`);
            return Response.json({ 
                success: true, 
                message: 'SMS simulation (Twilio not configured)',
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
                To: formattedPhone,
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
        console.error('SMS error:', error);
        return Response.json({ 
            error: error.message || 'Failed to send SMS' 
        }, { status: 500 });
    }
});