import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * sendCRMCampaignWithOptOut — the only marketing sender.
 * Body: { channel: 'email'|'sms'|'whatsapp', recipients: [{ email, phone, name, coupon_code }],
 *         subject, htmlBody, textBody, restaurant_id }
 * Returns: { sent, failed, skipped, skip_reasons: {suppressed, no_contact, duplicate}, errors, sent_keys }
 *
 * Every recipient is checked against the Suppression list (hash of normalised email / E.164 phone)
 * and the legacy User opt-out flags immediately before sending. Guests are covered.
 * A Twilio "unsubscribed recipient" error (21610) is written back to the Suppression list.
 */

const encoder = new TextEncoder();

function getSecret() {
  const s = Deno.env.get('SCHEDULED_DIGEST_SECRET');
  if (!s) throw new Error('SCHEDULED_DIGEST_SECRET not configured');
  return s;
}

async function generateUnsubscribeToken(identifier, channel) {
  const data = `${identifier}:${channel}:${Date.now()}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(getSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const mac = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return btoa(`${data}:${mac}`);
}

function normaliseEmail(raw) {
  const e = String(raw || '').trim().toLowerCase();
  if (!e.includes('@') || e.endsWith('@no-reply.base44.com')) return null;
  return e;
}

function normalisePhone(raw) {
  let p = String(raw || '').replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (!p.startsWith('+')) {
    if (p.startsWith('07') && p.length === 11) p = '+44' + p.slice(1);
    else if (p.startsWith('7') && p.length === 10) p = '+44' + p;
    else if (p.startsWith('44') && p.length === 12) p = '+' + p;
    else return null;
  }
  return /^\+\d{8,15}$/.test(p) ? p : null;
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function isSuppressed(base44, { email, phone, channel }) {
  const hashes = [];
  if (email) hashes.push(await sha256Hex(email));
  if (phone) hashes.push(await sha256Hex(phone));
  if (hashes.length === 0) return false;
  const rows = await base44.asServiceRole.entities.Suppression.filter({
    key_hash: { $in: hashes },
    channel: { $in: [channel, 'all'] },
  });
  if (rows.length > 0) return true;

  // Legacy account-level flags
  if (email) {
    const users = await base44.asServiceRole.entities.User.filter({ email });
    const u = users?.[0];
    if (u && channel === 'email' && u.promotional_emails_opted_out) return true;
    if (u && channel !== 'email' && u.promotional_sms_opted_out) return true;
  }
  return false;
}

async function addSuppression(base44, { phone, channel, reason, restaurant_id, source_ref }) {
  const key_hash = await sha256Hex(phone);
  const existing = await base44.asServiceRole.entities.Suppression.filter({ key_hash, channel });
  if (existing.length) return;
  await base44.asServiceRole.entities.Suppression.create({
    key_hash, key_type: 'phone', key_hint: `${phone.slice(0, 5)}*****${phone.slice(-4)}`,
    channel, scope: 'global', reason, restaurant_id, source_ref,
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Parse body FIRST before any auth calls
  const { channel, recipients = [], subject, htmlBody, textBody, restaurant_id } = await req.json();

  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!restaurant_id) return Response.json({ error: 'restaurant_id required' }, { status: 400 });
  if (!['email', 'sms', 'whatsapp'].includes(channel)) return Response.json({ error: 'Invalid channel' }, { status: 400 });

  // TENANT CHECK: only admin or assigned manager may send CRM campaigns
  if (user.role !== 'admin') {
    const managers = await base44.asServiceRole.entities.RestaurantManager.filter({ user_email: user.email, is_active: true });
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

  if (channel !== 'email' && (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM)) {
    return Response.json({ error: 'Twilio credentials not configured' }, { status: 400 });
  }

  const results = {
    sent: 0, failed: 0, skipped: 0,
    skip_reasons: { suppressed: 0, no_contact: 0, duplicate: 0 },
    errors: [], sent_keys: [],
  };
  const seen = new Set();
  const skip = (reason) => { results.skipped++; results.skip_reasons[reason]++; };

  for (const r of recipients) {
    const email = normaliseEmail(r.email);
    const phone = normalisePhone(r.phone);
    const key = channel === 'email' ? email : phone;

    if (!key) { skip('no_contact'); continue; }
    if (seen.has(key)) { skip('duplicate'); continue; }
    seen.add(key);

    try {
      if (await isSuppressed(base44, { email, phone, channel })) { skip('suppressed'); continue; }

      if (channel === 'email') {
        let body = htmlBody || textBody;
        if (htmlBody) {
          const token = await generateUnsubscribeToken(email, 'email');
          const unsubUrl = `${APP_URL}/unsubscribe?token=${encodeURIComponent(token)}&channel=email`;
          body = htmlBody.replaceAll('UNSUBSCRIBE_URL_PLACEHOLDER', unsubUrl);
          if (body === htmlBody) {
            body = htmlBody.replace(/href="#"([^>]*>[^<]*[Uu]nsubscribe)/, `href="${unsubUrl}"$1`);
          }
        }
        await base44.integrations.Core.SendEmail({ to: email, subject, body });
        results.sent++;
        results.sent_keys.push(email);
        continue;
      }

      // SMS / WhatsApp via Twilio
      const to = channel === 'whatsapp' ? `whatsapp:${phone}` : phone;
      const from = channel === 'whatsapp' ? `whatsapp:${TWILIO_FROM}` : TWILIO_FROM;
      const couponSuffix = r.coupon_code ? `\n\nUse code: ${r.coupon_code}` : '';
      const message = `${textBody}${couponSuffix}\n\nReply STOP to opt out`;

      const form = new URLSearchParams({ To: to, From: from, Body: message });
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      const data = await resp.json();

      if (data.error_code || data.code) {
        const code = data.error_code || data.code;
        results.failed++;
        results.errors.push({ contact: phone, error: data.message });
        // 21610: recipient has replied STOP to our Twilio number — record it.
        if (String(code) === '21610') {
          await addSuppression(base44, { phone, channel, reason: 'carrier_opt_out', restaurant_id, source_ref: 'twilio_21610' });
        }
        await base44.asServiceRole.entities.SmsLog.create({
          restaurant_id, to: phone, message, status: 'failed',
          error_details: `${code}: ${data.message}`, type: 'promotional',
        });
      } else {
        results.sent++;
        results.sent_keys.push(phone);
        await base44.asServiceRole.entities.SmsLog.create({
          restaurant_id, to: phone, message, status: 'sent', message_sid: data.sid, type: 'promotional',
        });
      }
    } catch (e) {
      results.failed++;
      results.errors.push({ contact: key, error: e.message });
    }
  }

  return Response.json(results);
});
