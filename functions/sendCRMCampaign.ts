import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { channel, recipients, subject, htmlBody, textBody } = await req.json();

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER');

    const results = { sent: 0, failed: 0, errors: [] };

    if (channel === 'email') {
        // Use base44 email integration for each recipient
        const validEmails = recipients.filter(r => r.email && r.email.includes('@'));
        for (const r of validEmails) {
            try {
                await base44.integrations.Core.SendEmail({
                    to: r.email,
                    subject,
                    body: htmlBody || textBody,
                });
                results.sent++;
            } catch (e) {
                results.failed++;
                results.errors.push({ contact: r.email, error: e.message });
            }
        }
    } else if (channel === 'sms' || channel === 'whatsapp') {
        if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
            return Response.json({ error: 'Twilio credentials not configured' }, { status: 400 });
        }

        const validRecipients = recipients.filter(r => r.phone && r.phone.trim().length >= 7);

        for (const r of validRecipients) {
            let to = r.phone.trim();
            // Normalise UK numbers
            if (to.startsWith('07')) to = '+44' + to.slice(1);
            else if (to.startsWith('7') && to.length === 10) to = '+44' + to;
            else if (!to.startsWith('+')) to = '+' + to;

            if (channel === 'whatsapp') to = 'whatsapp:' + to;

            const fromNumber = channel === 'whatsapp'
                ? 'whatsapp:' + TWILIO_FROM
                : TWILIO_FROM;

            try {
                const formData = new URLSearchParams();
                formData.append('To', to);
                formData.append('From', fromNumber);
                formData.append('Body', textBody);

                const resp = await fetch(
                    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: formData.toString(),
                    }
                );
                const data = await resp.json();
                if (data.error_code) {
                    results.failed++;
                    results.errors.push({ contact: r.phone, error: data.message });
                } else {
                    results.sent++;
                }
            } catch (e) {
                results.failed++;
                results.errors.push({ contact: r.phone, error: e.message });
            }
        }
    } else {
        return Response.json({ error: 'Invalid channel' }, { status: 400 });
    }

    return Response.json(results);
});