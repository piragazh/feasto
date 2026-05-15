import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const encoder = new TextEncoder();
const SECRET_KEY = Deno.env.get('SCHEDULED_DIGEST_SECRET') || 'fallback-secret';

async function generateUnsubscribeToken(identifier, channel) {
  const timestamp = Date.now();
  const data = `${identifier}:${channel}:${timestamp}`;
  const keyData = encoder.encode(SECRET_KEY);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const hmac = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return btoa(`${data}:${hmac}`);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Parse body FIRST before any auth calls
  const { channel, recipients, subject, htmlBody, textBody, restaurant_id } = await req.json();

  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!restaurant_id) {
    return Response.json({ error: 'restaurant_id required' }, { status: 400 });
  }

  // TENANT CHECK: only admin or assigned manager may send CRM campaigns
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
  const APP_URL = Deno.env.get('BASE44_APP_URL') || 'https://app.mealdrop.co.uk';

  const results = { sent: 0, failed: 0, skipped: 0, errors: [] };

  if (channel === 'email') {
    const validEmails = recipients.filter(r => r.email && r.email.includes('@'));
    
    for (const r of validEmails) {
      try {
        // Check if user opted out of promotional emails
        const users = await base44.asServiceRole.entities.User.filter({ email: r.email });
        if (users?.length > 0 && users[0].promotional_emails_opted_out) {
          results.skipped++;
          continue;
        }

        // Generate a real HMAC-signed unsubscribe token and inject it into the email body
        let bodyToSend = htmlBody || textBody;
        if (htmlBody && r.email) {
          const token = await generateUnsubscribeToken(r.email, 'email');
          const unsubUrl = `${APP_URL}/unsubscribe?token=${encodeURIComponent(token)}&channel=email`;
          // Replace the sentinel placeholder injected by buildHtmlEmail
          bodyToSend = htmlBody.replace('UNSUBSCRIBE_URL_PLACEHOLDER', unsubUrl);
          // Fallback: also catch any leftover href="#" on unsubscribe anchor
          if (bodyToSend === htmlBody) {
            bodyToSend = htmlBody.replace(/href="#"([^>]*>[^<]*[Uu]nsubscribe)/, `href="${unsubUrl}"$1`);
          }
        }

        await base44.integrations.Core.SendEmail({
          to: r.email,
          subject,
          body: bodyToSend,
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
      try {
        // Opt-out check: User entity has email not phone — match by email if available
        if (r.email) {
          const users = await base44.asServiceRole.entities.User.filter({ email: r.email });
          if (users?.length > 0 && users[0].promotional_sms_opted_out) {
            results.skipped++;
            continue;
          }
        }

        let to = r.phone.trim();
        if (to.startsWith('07')) to = '+44' + to.slice(1);
        else if (to.startsWith('7') && to.length === 10) to = '+44' + to;
        else if (!to.startsWith('+')) to = '+' + to;

        if (channel === 'whatsapp') to = 'whatsapp:' + to;

        const fromNumber = channel === 'whatsapp'
          ? 'whatsapp:' + TWILIO_FROM
          : TWILIO_FROM;

        // Append coupon code if provided (frontend says it will be appended — honour that promise)
        const couponSuffix = r.coupon_code ? `\n\nUse code: ${r.coupon_code}` : '';
        // Append "Reply STOP to unsubscribe" for SMS/WhatsApp (no clickable link needed)
        const messageWithUnsubscribe = `${textBody}${couponSuffix}\n\nReply STOP to unsubscribe`;

        const formData = new URLSearchParams();
        formData.append('To', to);
        formData.append('From', fromNumber);
        formData.append('Body', messageWithUnsubscribe);

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
            message: messageWithUnsubscribe,
            status: 'failed',
            error_details: `${data.error_code}: ${data.message}`,
            type: 'promotional'
          });
        } else {
          results.sent++;
          await base44.asServiceRole.entities.SmsLog.create({
            restaurant_id,
            to: r.phone,
            message: messageWithUnsubscribe,
            status: 'sent',
            message_sid: data.sid,
            type: 'promotional'
          });
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