import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * crmTwilioStatus — Twilio delivery callback for CRM marketing SMS.
 *
 * crmSendWorker sends every Twilio message with StatusCallback = <functions>/crmTwilioStatus.
 * Twilio POSTs MessageSid + MessageStatus here; we verify X-Twilio-Signature with the account's
 * auth token, then mark the matching MessageJob delivered or failed. Unsigned or forged calls are
 * rejected. Always answers quickly; Twilio retries on errors.
 */

const FUNCTIONS_BASE = Deno.env.get('FUNCTIONS_BASE_URL') || 'https://mealdrop.base44.app/functions';
const CALLBACK_URL = `${FUNCTIONS_BASE}/crmTwilioStatus`;

async function twilioSignature(authToken, url, params) {
    const data = url + Object.keys(params).sort().map(k => k + params[k]).join('');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function safeEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
}

async function sha256Hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
    try {
        if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
        const token = Deno.env.get('TWILIO_AUTH_TOKEN');
        if (!token) return new Response('Not configured', { status: 500 });

        const raw = await req.text();
        const params = Object.fromEntries(new URLSearchParams(raw));
        const expected = await twilioSignature(token, CALLBACK_URL, params);
        if (!safeEqual(req.headers.get('x-twilio-signature') || '', expected)) {
            console.warn('[crmTwilioStatus] rejected: bad signature');
            return new Response('Forbidden', { status: 403 });
        }

        const sid = params.MessageSid;
        const status = String(params.MessageStatus || '').toLowerCase();
        if (!sid || !status) return new Response('', { status: 204 });

        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole.entities;
        const job = (await db.MessageJob.filter({ provider_message_id: sid }))[0];
        if (!job) return new Response('', { status: 204 });

        if (status === 'delivered' && ['sent', 'uncertain'].includes(job.status)) {
            await db.MessageJob.update(job.id, { status: 'delivered', delivered_at: new Date().toISOString() });
        } else if (status === 'delivered' && job.status === 'converted' && !job.delivered_at) {
            await db.MessageJob.update(job.id, { delivered_at: new Date().toISOString() });
        } else if (['undelivered', 'failed'].includes(status) && ['sent', 'uncertain'].includes(job.status)) {
            await db.MessageJob.update(job.id, { status: 'failed', error: `Twilio ${status}${params.ErrorCode ? ` (${params.ErrorCode})` : ''}`, cost_pence: 0 });
            // 21610: the customer replied STOP to our Twilio number
            if (String(params.ErrorCode) === '21610' && job.to?.startsWith('+')) {
                const key_hash = await sha256Hex(job.to);
                if (!(await db.Suppression.filter({ key_hash, channel: 'sms' })).length) {
                    await db.Suppression.create({ key_hash, key_type: 'phone', key_hint: `${job.to.slice(0, 5)}*****${job.to.slice(-4)}`, channel: 'sms', scope: 'global', reason: 'carrier_opt_out', restaurant_id: job.restaurant_id, source_ref: sid });
                }
            }
        }
        return new Response('', { status: 204 });
    } catch (error) {
        console.error('[crmTwilioStatus] Error:', error?.message);
        return new Response('', { status: 500 });
    }
});
