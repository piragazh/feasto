import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// DEPRECATED: Use sendCRMCampaignWithOptOut instead — this version has no opt-out/GDPR protection.
// Kept only for backward compatibility. Do NOT add new callers.

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { channel, recipients, subject, htmlBody, textBody, restaurant_id } = await req.json();

    if (!restaurant_id) {
        return Response.json({ error: 'restaurant_id required' }, { status: 400 });
    }

    // TENANT CHECK: only admin or assigned manager may send CRM campaigns for this restaurant
    if (user.role !== 'admin') {
        const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
            user_email: user.email,
            is_active: true
        });
        const hasAccess = managers.some(m => m.restaurant_ids?.includes(restaurant_id));
        if (!hasAccess) {
            console.error(`[SECURITY] ${user.email} attempted CRM campaign for restaurant ${restaurant_id}`);
            return Response.json({ error: 'Access denied to this restaurant' }, { status: 403 });
        }
    }

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER');

    const results = { sent: 0, failed: 0, errors: [] };

    if (channel === 'email') {
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
                    await base44.asServiceRole.entities.SmsLog.create({
                        restaurant_id,
                        to: r.phone,
                        message: textBody,
                        status: 'failed',
                        error_details: `${data.error_code}: ${data.message}`,
                        type: 'other'
                    });
                } else {
                    results.sent++;
                    await base44.asServiceRole.entities.SmsLog.create({
                        restaurant_id,
                        to: r.phone,
                        message: textBody,
                        status: 'sent',
                        message_sid: data.sid,
                        type: 'other'
                    });
                }
            } catch (e) {
                results.failed++;
                results.errors.push({ contact: r.phone, error: e.message });
                await base44.asServiceRole.entities.SmsLog.create({
                    restaurant_id,
                    to: r.phone,
                    message: textBody,
                    status: 'failed',
                    error_details: e.message,
                    type: 'other'
                });
            }
        }
    } else {
        return Response.json({ error: 'Invalid channel' }, { status: 400 });
    }

    return Response.json(results);
});