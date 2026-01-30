import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // SECURITY: Require authentication
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized - authentication required' }, { status: 401 });
        }
        
        const { to, message } = await req.json();

        if (!to || !message) {
            return Response.json({ error: 'Missing required fields: to, message' }, { status: 400 });
        }

        // Clean and format phone number to UK format with country code
        let cleanPhone = to.replace(/[\s\-\(\)]/g, ''); // Remove spaces, dashes, parentheses
        
        // Convert to +44 format
        if (cleanPhone.startsWith('00')) {
            cleanPhone = '+' + cleanPhone.slice(2);
        } else if (cleanPhone.startsWith('0')) {
            cleanPhone = '+44' + cleanPhone.slice(1);
        } else if (cleanPhone.startsWith('44')) {
            cleanPhone = '+' + cleanPhone;
        } else if (cleanPhone.startsWith('7')) {
            cleanPhone = '+44' + cleanPhone;
        } else if (!cleanPhone.startsWith('+')) {
            cleanPhone = '+44' + cleanPhone;
        }
        
        // Validate it's a UK mobile number
        if (!cleanPhone.match(/^\+447\d{9}$/)) {
            return Response.json({ 
                error: 'Invalid UK mobile number. Must be a UK mobile starting with 07',
                received: to,
                formatted: cleanPhone
            }, { status: 400 });
        }

        const formattedPhone = cleanPhone;

        // Check if Twilio credentials are configured
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !twilioPhone) {
            // Twilio not configured - simulate SMS
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
            console.error('Twilio API error:', error);
            console.error('Phone number attempted:', formattedPhone);
            console.error('Message:', message);
            return Response.json({ 
                error: 'Failed to send SMS', 
                details: error 
            }, { status: 500 });
        }

        const result = await response.json();
        console.log(`✅ SMS sent successfully to ${formattedPhone}, SID: ${result.sid}`);
        return Response.json({ 
            success: true, 
            messageSid: result.sid,
            simulated: false
        });

    } catch (error) {
        console.error('SMS function error:', error);
        return Response.json({ 
            error: error.message || 'Failed to send SMS' 
        }, { status: 500 });
    }
});