import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * unsubscribeFromPromotions
 * GET  ?token=...&channel=email|sms|whatsapp  — one-click unsubscribe from a marketing message.
 * POST { email|phone, channel }               — admin only: generate a token.
 *
 * Writes to the Suppression list, keyed by a hash of the normalised address, so it works for
 * guests who have no account. Links never expire (PECR: opt-out must keep working).
 * If a User with that email exists, its legacy promotional_*_opted_out flag is also set.
 */

const encoder = new TextEncoder();

function getSecret() {
  const s = Deno.env.get('SCHEDULED_DIGEST_SECRET');
  if (!s) throw new Error('SCHEDULED_DIGEST_SECRET not configured');
  return s;
}

async function hmac(data) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(getSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function generateToken(identifier, channel) {
  const data = `${identifier}:${channel}:${Date.now()}`;
  return btoa(`${data}:${await hmac(data)}`);
}

// Token format: base64(identifier:channel:timestamp:hmac). Identifier is an email or E.164 phone,
// neither of which contains ':'. No expiry check: an unsubscribe link must keep working.
async function validateToken(token) {
  try {
    const decoded = atob(token);
    const c1 = decoded.indexOf(':');
    const c2 = decoded.indexOf(':', c1 + 1);
    const c3 = decoded.indexOf(':', c2 + 1);
    if (c1 === -1 || c2 === -1 || c3 === -1) return null;
    const identifier = decoded.slice(0, c1);
    const channel = decoded.slice(c1 + 1, c2);
    const timestamp = decoded.slice(c2 + 1, c3);
    const provided = decoded.slice(c3 + 1);
    const expected = await hmac(`${identifier}:${channel}:${timestamp}`);
    if (!safeEqual(provided, expected)) return null;
    return { identifier, channel };
  } catch {
    return null;
  }
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

function hint(key, type) {
  if (type === 'email') {
    const [local, domain] = key.split('@');
    return `${local.slice(0, 1)}***@${domain}`;
  }
  return `${key.slice(0, 5)}*****${key.slice(-4)}`;
}

async function suppress(base44, { key, type, channels, reason, sourceRef }) {
  const key_hash = await sha256Hex(key);
  for (const channel of channels) {
    const existing = await base44.asServiceRole.entities.Suppression.filter({ key_hash, channel });
    if (existing.length > 0) continue;
    await base44.asServiceRole.entities.Suppression.create({
      key_hash, key_type: type, key_hint: hint(key, type), channel, scope: 'global', reason, source_ref: sourceRef || null,
    });
  }
}

function page(title, body, status = 200) {
  return new Response(
    `<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;"><h1>${title}</h1><p>${body}</p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html' } }
  );
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const token = url.searchParams.get('token');
      const channel = url.searchParams.get('channel');
      if (!token || !channel) return page('Invalid Request', 'Missing token or channel parameter.', 400);

      const data = await validateToken(token);
      if (!data) return page('Invalid Link', 'This unsubscribe link is not valid.', 400);
      if (data.channel !== channel) return page('Invalid Request', 'Channel mismatch.', 400);

      const base44 = createClientFromRequest(req);
      const email = normaliseEmail(data.identifier);
      const phone = email ? null : normalisePhone(data.identifier);
      if (!email && !phone) return page('Invalid Link', 'This unsubscribe link is not valid.', 400);

      // Legacy tokens used channel 'sms' to mean SMS and WhatsApp.
      const channels = channel === 'email' ? ['email'] : ['sms', 'whatsapp'];
      await suppress(base44, {
        key: email || phone, type: email ? 'email' : 'phone', channels, reason: 'unsubscribe_link', sourceRef: 'token',
      });

      // Record the withdrawal in the CRM consent ledger for every restaurant profile with this address.
      try {
        const profiles = email
          ? await base44.asServiceRole.entities.CustomerProfile.filter({ emails: email })
          : await base44.asServiceRole.entities.CustomerProfile.filter({ phone_e164: phone });
        const at = new Date().toISOString();
        for (const p of profiles) {
          for (const ch of channels) {
            await base44.asServiceRole.entities.ConsentRecord.create({
              contact_id: p.contact_id || null, profile_id: p.id, restaurant_id: p.restaurant_id, scope: p.restaurant_id,
              channel: ch, action: 'withdraw', method: 'unsubscribe_link', source_ref: 'token', at,
            });
          }
          const consent = { ...(p.consent || {}) };
          channels.forEach(ch => { consent[ch] = false; });
          await base44.asServiceRole.entities.CustomerProfile.update(p.id, { consent, consent_updated_at: at });
        }
      } catch (e) {
        console.warn('[UNSUBSCRIBE] consent ledger update failed (suppression still recorded):', e?.message);
      }

      // Keep the legacy User flag in sync for account holders.
      if (email) {
        const users = await base44.asServiceRole.entities.User.filter({ email });
        if (users?.length > 0) {
          const field = channel === 'email' ? 'promotional_emails_opted_out' : 'promotional_sms_opted_out';
          await base44.asServiceRole.entities.User.update(users[0].id, { [field]: true });
        }
      }

      const label = channel === 'email' ? 'promotional emails' : 'promotional SMS and WhatsApp messages';
      return page('<span style="color:#27ae60">&#10003; Unsubscribed</span>', `You will no longer receive ${label}.`);
    }

    if (req.method === 'POST') {
      const base44 = createClientFromRequest(req);
      const user = await base44.auth.me().catch(() => null);
      if (user?.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

      const { email, phone, channel } = await req.json();
      const identifier = normaliseEmail(email) || normalisePhone(phone);
      if (!identifier || !channel) return Response.json({ error: 'Missing email/phone or channel' }, { status: 400 });
      return Response.json({ token: await generateToken(identifier, channel) });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('[UNSUBSCRIBE] Error:', error.message);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
});
