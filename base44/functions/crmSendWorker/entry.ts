import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * crmSendWorker — the one place a marketing message leaves MealDrop.
 *
 * Drains queued MessageJobs (from campaigns and, later, automations). For every real job it
 * re-checks, at the moment of sending: campaign still sending, consent still given, not on the
 * Suppression list, within the weekly cap, outside quiet hours, within the monthly SMS budget.
 * Then it renders the message, sends it through the channel router, and records the outcome.
 * Unique coupon codes are created only after the provider accepts the message.
 *
 * SAFE NO MATTER WHO CALLS IT: { mode: 'drain', campaign_id?, job_id? } only processes jobs that
 * already exist in the database, and only crmApi (with its tenant checks) creates them. Run by the
 * "CRM Send Worker" workflow every 5 minutes and kicked directly when a campaign starts.
 *
 * Channel router
 *   sms   auto (httpSMS, Twilio on a definite httpSMS failure) | httpsms | twilio
 *         httpSMS sends are logged to SmsLog (type promotional, request_id = job key) so the existing
 *         httpSMS webhook reports delivery and does the Twilio fallback on a later failure.
 *   email Base44 Core.SendEmail with a working unsubscribe link (no expiry).
 */

const DAY = 86400000;
const enc = new TextEncoder();
// Stay well inside the platform's request limit (runs over ~2 min were cut off with a 503).
const BUDGET_MS = 60000;
// Twilio reports delivery here (crmTwilioStatus verifies Twilio's signature).
const FUNCTIONS_BASE = Deno.env.get('FUNCTIONS_BASE_URL') || 'https://mealdrop.base44.app/functions';
const GAP_MS = { httpsms: 1500, twilio: 300, email: 300 };
const APP_URL = Deno.env.get('BASE44_APP_URL') || 'https://mealdrop.co.uk';
const SENT = ['sent', 'delivered', 'converted', 'uncertain'];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function withRetry(fn) {
    for (let a = 0; ; a++) {
        try { return await fn(); } catch (e) {
            if (a < 5 && /rate limit|429/i.test(String(e?.message || e))) { await sleep(800 * 2 ** a); continue; }
            throw e;
        }
    }
}
async function sha256Hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function londonMinutes(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const h = Number(parts.find(p => p.type === 'hour')?.value || 0);
    const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
    return h * 60 + m;
}
function inQuietHours(settings) {
    const toMin = (t) => { const [h, m] = String(t || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    const start = toMin(settings.quiet_hours_start || '21:00');
    const end = toMin(settings.quiet_hours_end || '09:00');
    const now = londonMinutes();
    return start > end ? (now >= start || now < end) : (now >= start && now < end);
}
function smsSegments(text) {
    const unicode = /[^\x00-\x7F£€]/.test(text);
    return text.length <= (unicode ? 70 : 160) ? 1 : Math.ceil(text.length / (unicode ? 67 : 153));
}

async function unsubscribeUrl(identifier) {
    const secret = Deno.env.get('SCHEDULED_DIGEST_SECRET');
    if (!secret) throw new Error('SCHEDULED_DIGEST_SECRET not configured');
    const data = `${identifier}:email:${Date.now()}`;
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
    const token = btoa(`${data}:${btoa(String.fromCharCode(...new Uint8Array(sig)))}`);
    return `${APP_URL}/unsubscribe?token=${encodeURIComponent(token)}&channel=email`;
}

// ── Rendering ────────────────────────────────────────────────────────────
function fillTokens(text, t) {
    return String(text || '')
        .replace(/\{first_name\}/g, t.first_name || 'there')
        .replace(/\{restaurant\}/g, t.restaurant)
        .replace(/\{coupon_code\}/g, t.coupon_code || '')
        .replace(/\{favourite_item\}/g, t.favourite_item || 'your favourites')
        .replace(/\{order_link\}/g, t.order_link)
        .replace(/\{days_since_last_order\}/g, t.days_since != null ? String(t.days_since) : '');
}

function couponLine(c, code) {
    if (!code) return '';
    if (c.coupon_mode === 'unique' && c.coupon_config) {
        const v = c.coupon_config.discount_type === 'fixed' ? `£${c.coupon_config.discount_value} off` : `${c.coupon_config.discount_value}% off`;
        return `${v} with code ${code} (valid ${c.coupon_config.validity_days} days)`;
    }
    return `Use code ${code}`;
}

function renderSms(c, settings, t) {
    let body = fillTokens(c.body, t).trim();
    if (t.coupon_code && !String(c.body).includes('{coupon_code}')) body += `\n${couponLine(c, t.coupon_code)}`;
    const sender = settings.sender_name || t.restaurant;
    if (!body.toLowerCase().startsWith(sender.toLowerCase())) body = `${sender}: ${body}`;
    return `${body}\nReply STOP to opt out`;
}

function renderEmail(c, settings, t, unsubUrl) {
    const sender = settings.sender_name || t.restaurant;
    const body = esc(fillTokens(c.body, t)).replace(/\n/g, '<br>');
    const coupon = t.coupon_code ? `
      <div style="margin:24px 0;padding:18px;border:2px dashed #f97316;border-radius:10px;text-align:center;background:#fff7ed">
        <div style="font-size:13px;color:#9a3412;margin-bottom:6px">${esc(couponLine(c, t.coupon_code).replace(` with code ${t.coupon_code}`, '').replace(`Use code ${t.coupon_code}`, 'Your code'))}</div>
        <div style="font-size:26px;font-weight:700;letter-spacing:3px;color:#c2410c">${esc(t.coupon_code)}</div>
      </div>` : '';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:600px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden">
  <div style="background:#f97316;padding:22px 28px;color:#ffffff"><div style="font-size:20px;font-weight:700">${esc(sender)}</div></div>
  <div style="padding:28px">
    ${c.heading ? `<h1 style="margin:0 0 14px;font-size:22px;color:#111827">${esc(fillTokens(c.heading, t))}</h1>` : ''}
    <div style="font-size:15px;line-height:1.65;color:#374151">${body}</div>
    ${coupon}
    <div style="text-align:center;margin:26px 0 6px">
      <a href="${esc(t.order_link)}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:8px;font-weight:700">${esc(c.button_text || 'Order now')}</a>
    </div>
  </div>
  <div style="padding:16px 28px;background:#f9fafb;color:#9ca3af;font-size:11px;line-height:1.6;text-align:center">
    You're receiving this because you ordered from ${esc(sender)}.<br>
    <a href="${esc(unsubUrl)}" style="color:#6b7280">Unsubscribe from ${esc(sender)} offers</a>
  </div>
</div></body></html>`;
}

// ── Providers ────────────────────────────────────────────────────────────
async function sendHttpsms(to, message, requestId) {
    const apiKey = Deno.env.get('HTTPSMS_API_KEY');
    const from = Deno.env.get('HTTPSMS_FROM');
    if (!apiKey || !from) return { ok: false, definite: true, error: 'httpSMS not configured' };
    try {
        const r = await fetch('https://api.httpsms.com/v1/messages/send', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ content: message, from, to, request_id: requestId }),
        });
        if (r.status === 429 || r.status >= 500) return { ok: false, definite: false, error: `httpSMS HTTP ${r.status}` };
        if (!r.ok) return { ok: false, definite: true, error: `httpSMS HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}` };
        const data = await r.json();
        if (data?.status === 'success' && data?.data?.id) return { ok: true, id: data.data.id };
        return { ok: false, definite: false, error: 'httpSMS unexpected response' };
    } catch (e) {
        return { ok: false, definite: false, error: `httpSMS network error: ${e.message}` };
    }
}

async function sendTwilio(to, message) {
    const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const token = Deno.env.get('TWILIO_AUTH_TOKEN');
    const from = Deno.env.get('TWILIO_PHONE_NUMBER');
    if (!sid || !token || !from) return { ok: false, error: 'Twilio not configured' };
    try {
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: 'POST',
            headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ To: to, From: from, Body: message, StatusCallback: `${FUNCTIONS_BASE}/crmTwilioStatus` }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data.code || data.error_code) return { ok: false, error: `Twilio ${data.code || r.status}: ${data.message || ''}`.slice(0, 300), code: String(data.code || '') };
        return { ok: true, id: data.sid };
    } catch (e) {
        return { ok: false, error: `Twilio network error: ${e.message}` };
    }
}

async function logSms(db, job, provider, status, message, extra = {}) {
    try {
        await db.SmsLog.create({
            restaurant_id: job.restaurant_id, to: job.to, message, status, type: 'promotional', provider,
            request_id: job.idempotency_key, idempotency_key: job.idempotency_key, fallback_status: 'none', ...extra,
        });
    } catch (e) { console.warn('[crmSendWorker] SmsLog write failed:', e?.message); }
}

async function routeSms(db, job, message, mode) {
    if (mode !== 'twilio') {
        const h = await sendHttpsms(job.to, message, job.idempotency_key);
        if (h.ok) {
            await logSms(db, job, 'httpsms', 'pending', message, { provider_message_id: h.id });
            return { status: 'sent', provider: 'httpsms', id: h.id };
        }
        if (!h.definite) {
            // May have been accepted: never fall back, or the customer could get it twice.
            await logSms(db, job, 'httpsms', 'uncertain', message, { failure_reason: h.error });
            return { status: 'uncertain', provider: 'httpsms', error: h.error };
        }
        if (mode === 'httpsms') return { status: 'failed', provider: 'httpsms', error: h.error };
    }
    const t = await sendTwilio(job.to, message);
    await logSms(db, job, 'twilio', t.ok ? 'sent' : 'failed', message, { provider_message_id: t.id || null, message_sid: t.id || null, error_details: t.error || null, is_fallback: mode !== 'twilio' });
    return t.ok ? { status: 'sent', provider: 'twilio', id: t.id } : { status: 'failed', provider: 'twilio', error: t.error, code: t.code };
}

// ── WhatsApp (Meta Cloud API, the restaurant's own number) ──────────────────────
// Marketing outside a 24-hour chat window must be an approved MARKETING template. The template should
// carry a "Stop offers" quick-reply button (payload STOP_OFFERS), handled by whatsappWebhook.
const GRAPH = `https://graph.facebook.com/${Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v23.0'}`;
async function sendWhatsAppTemplate(db, channel, templateId, to, tokens) {
    if (!channel) return { status: 'failed', error: 'No connected WhatsApp number for this restaurant' };
    const tpl = templateId ? (await withRetry(() => db.WaTemplate.filter({ id: templateId })))[0] : null;
    if (!tpl) return { status: 'failed', error: 'No WhatsApp template chosen' };
    if (tpl.category !== 'MARKETING') return { status: 'failed', error: 'Template is not a MARKETING template' };
    if (!(tpl.submissions || []).some(s => s.waba_id === channel.waba_id && s.status === 'APPROVED')) {
        return { status: 'failed', error: 'Template not approved by Meta for this number' };
    }
    const values = {
        first_name: tokens.first_name || 'there', name: tokens.first_name || 'there', restaurant: tokens.restaurant,
        restaurant_name: tokens.restaurant, coupon_code: tokens.coupon_code || '-', favourite_item: tokens.favourite_item || 'your favourites',
        order_link: tokens.order_link, days_since_last_order: tokens.days_since != null ? String(tokens.days_since) : '-',
    };
    const params = (tpl.param_order || []).map(n => ({ type: 'text', text: String(values[n] ?? '-') || '-' }));
    const res = await fetch(`${GRAPH}/${channel.phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${channel.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to).replace(/\D/g, ''), type: 'template',
            template: { name: tpl.name, language: { code: tpl.language || 'en_GB' }, components: params.length ? [{ type: 'body', parameters: params }] : [] },
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: 'failed', error: `WhatsApp: ${data?.error?.message || `HTTP ${res.status}`}`.slice(0, 300) };
    const body = String(tpl.body || '').replace(/\{(\w+)\}/g, (_, k) => values[k] ?? `{${k}}`);
    return { status: 'sent', provider: 'whatsapp_cloud', id: data?.messages?.[0]?.id || null, body };
}

async function syncEnrolment(db, jobId, patch) {
    try {
        const e = (await withRetry(() => db.AutomationEnrolment.filter({ message_job_id: jobId })))[0];
        if (e) await withRetry(() => db.AutomationEnrolment.update(e.id, patch));
    } catch (err) { console.warn('[crmSendWorker] enrolment sync failed:', err?.message); }
}

// ── Worker ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    const started = Date.now();
    try {
        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole.entities;
        const body = await req.json().catch(() => ({}));

        // A job left 'sending' by a crashed run may or may not have gone out: never resend it.
        const stale = await withRetry(() => db.MessageJob.filter({ status: 'sending', updated_date: { $lt: new Date(Date.now() - 10 * 60000).toISOString() } }, 'created_date', 200));
        for (const j of stale) await withRetry(() => db.MessageJob.update(j.id, { status: 'uncertain', error: 'Worker stopped mid-send; not retried to avoid a duplicate' }));

        // Promote scheduled campaigns whose time has come
        const due = await withRetry(() => db.Campaign.filter({ status: 'scheduled', schedule_at: { $lte: new Date().toISOString() } }));
        for (const c of due) await withRetry(() => db.Campaign.update(c.id, { status: 'sending', sent_at: new Date().toISOString() }));

        const query = { status: 'queued' };
        if (body.job_id) query.id = body.job_id;
        else if (body.campaign_id) query.campaign_id = body.campaign_id;
        const jobs = await withRetry(() => db.MessageJob.filter(query, 'created_date', 400));

        const cache = { campaigns: new Map(), restaurants: new Map(), settings: new Map(), budgetUsed: new Map(), weekly: new Map(), suppressed: null };
        const getCampaign = async (id) => {
            if (!cache.campaigns.has(id)) cache.campaigns.set(id, (await withRetry(() => db.Campaign.filter({ id })))[0] || null);
            return cache.campaigns.get(id);
        };
        const getRestaurant = async (id) => {
            if (!cache.restaurants.has(id)) cache.restaurants.set(id, (await withRetry(() => db.Restaurant.filter({ id })))[0] || { id, name: 'Our restaurant' });
            return cache.restaurants.get(id);
        };
        const getSettings = async (rid) => {
            if (!cache.settings.has(rid)) {
                const r = await getRestaurant(rid);
                const row = (await withRetry(() => db.CRMSettings.filter({ restaurant_id: rid })))[0] || {};
                cache.settings.set(rid, {
                    sender_name: r.name, default_sms_provider: 'auto', quiet_hours_start: '21:00', quiet_hours_end: '09:00',
                    max_marketing_per_week: 2, monthly_budget_pence: 5000, sms_cost_pence: { httpsms: 0, twilio: 4 }, ...row,
                });
            }
            return cache.settings.get(rid);
        };
        const getBudgetUsed = async (rid) => {
            if (!cache.budgetUsed.has(rid)) {
                const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
                const rows = await withRetry(() => db.MessageJob.filter({ restaurant_id: rid, channel: 'sms', sent_at: { $gte: monthStart.toISOString() } }, '-created_date', 5000));
                cache.budgetUsed.set(rid, rows.reduce((s, j) => s + (Number(j.cost_pence) || 0), 0));
            }
            return cache.budgetUsed.get(rid);
        };
        const weeklyCount = async (profileId) => {
            if (!cache.weekly.has(profileId)) {
                const since = new Date(Date.now() - 7 * DAY).toISOString();
                const rows = await withRetry(() => db.MessageJob.filter({ profile_id: profileId, sent_at: { $gte: since } }));
                cache.weekly.set(profileId, rows.filter(j => !j.is_test && SENT.includes(j.status)).length);
            }
            return cache.weekly.get(profileId);
        };
        const isSuppressed = async (keys, channel) => {
            if (!keys.length) return false;
            const rows = await withRetry(() => db.Suppression.filter({ key_hash: { $in: keys }, channel: { $in: [channel, 'all'] } }));
            return rows.length > 0;
        };

        const automationCache = new Map();
        const getAutomation = async (id) => {
            if (!automationCache.has(id)) automationCache.set(id, (await withRetry(() => db.Automation.filter({ id })))[0] || null);
            return automationCache.get(id);
        };
        const waChannelCache = new Map();
        const getWaChannel = async (rid) => {
            if (!waChannelCache.has(rid)) waChannelCache.set(rid, (await withRetry(() => db.WhatsAppChannel.filter({ restaurant_id: rid, status: 'connected' })))[0] || null);
            return waChannelCache.get(rid);
        };
        const AUTOMATION_LABEL = {
            welcome: 'Welcome', second_order: 'Second order', win_back: 'Win-back', lapsed: 'Lapsed',
            birthday: 'Birthday', vip_milestone: 'VIP thank-you', review_request: 'Review request',
        };

        const results = { processed: 0, sent: 0, failed: 0, skipped: 0, deferred: 0, uncertain: 0 };
        const touchedCampaigns = new Set();
        const lastSendAt = {};

        for (const job of jobs) {
            if (Date.now() - started > BUDGET_MS) break;
            const campaign = job.campaign_id ? await getCampaign(job.campaign_id) : null;
            if (job.campaign_id && !campaign) { await withRetry(() => db.MessageJob.update(job.id, { status: 'skipped', skip_reason: 'cancelled' })); continue; }
            if (!job.is_test && campaign && campaign.status !== 'sending') { results.deferred++; continue; }
            const automation = job.automation_id ? await getAutomation(job.automation_id) : null;
            if (job.automation_id && (!automation || !automation.is_enabled)) {
                await withRetry(() => db.MessageJob.update(job.id, { status: 'skipped', skip_reason: 'cancelled' }));
                await syncEnrolment(db, job.id, { status: 'skipped', skip_reason: 'automation_turned_off' });
                continue;
            }
            const settings = await getSettings(job.restaurant_id);
            if (!job.is_test && inQuietHours(settings)) { results.deferred++; continue; }

            // Claim the job atomically so two workers can never send it twice.
            const claim = await withRetry(() => db.MessageJob.updateMany({ id: job.id, status: 'queued' }, { $set: { status: 'sending', attempts: (job.attempts || 0) + 1 } }));
            if (!claim || !(claim.updated > 0)) continue;
            results.processed++;
            if (campaign) touchedCampaigns.add(campaign.id);

            const finish = (patch) => withRetry(() => db.MessageJob.update(job.id, patch));
            const restaurant = await getRestaurant(job.restaurant_id);
            let profile = null;

            if (!job.is_test) {
                profile = (await withRetry(() => db.CustomerProfile.filter({ id: job.profile_id })))[0];
                const email = profile?.emails?.[0] || null;
                const to = job.channel === 'email' ? email : profile?.phone_e164;
                let reason = null;
                if (!profile || profile.is_anonymised) reason = 'no_contact';
                else if (profile.marketing_eligible === false) reason = 'marketplace';
                else if (!to) reason = 'no_contact';
                else if (!profile.consent?.[job.channel]) reason = 'no_consent';
                else {
                    const keys = [];
                    if (profile.phone_e164) keys.push(await sha256Hex(profile.phone_e164));
                    if (email) keys.push(await sha256Hex(email));
                    if (await isSuppressed(keys, job.channel)) reason = 'suppressed';
                    else if ((await weeklyCount(profile.id)) >= (settings.max_marketing_per_week || 2)) reason = 'frequency_cap';
                }
                if (reason) {
                    await finish({ status: 'skipped', skip_reason: reason });
                    if (job.automation_id) await syncEnrolment(db, job.id, { status: 'skipped', skip_reason: reason });
                    results.skipped++; continue;
                }
                job.to = to;
            }

            // What to send: the campaign, or this automation's content for the chosen channel
            const c = campaign || (automation ? {
                name: AUTOMATION_LABEL[automation.type] || 'Automation',
                ...(automation.content?.[job.channel] || {}),
                wa_template_id: automation.content?.whatsapp?.template_id || null,
                coupon_mode: automation.coupon_mode || 'none',
                coupon_config: automation.coupon_config || null,
                sms_provider: automation.sms_provider || null,
            } : { body: '', channel: job.channel });

            // Render
            const coupon = c.coupon_mode === 'unique'
                ? `CRM-${crypto.randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`
                : (c.coupon_mode === 'shared' ? c.coupon_code : null);
            const tokens = {
                first_name: profile ? String(profile.display_name || '').trim().split(/\s+/)[0] : 'Sam',
                restaurant: settings.sender_name || restaurant.name,
                coupon_code: coupon,
                favourite_item: profile?.favourite_items?.[0]?.name || null,
                order_link: `${APP_URL}/Restaurant?id=${job.restaurant_id}`,
                days_since: profile?.last_order_at ? Math.floor((Date.now() - new Date(profile.last_order_at).getTime()) / DAY) : null,
            };
            // Budget (real SMS only)
            const provider = job.channel === 'sms' ? (c.sms_provider || settings.default_sms_provider || 'auto') : job.channel;
            let smsText = null, costPence = 0;
            if (job.channel === 'sms') {
                smsText = renderSms(c, settings, tokens);
                const rate = provider === 'twilio' ? settings.sms_cost_pence?.twilio : settings.sms_cost_pence?.httpsms;
                costPence = smsSegments(smsText) * (Number(rate) || 0);
                if (!job.is_test && settings.monthly_budget_pence > 0 && (await getBudgetUsed(job.restaurant_id)) + costPence > settings.monthly_budget_pence) {
                    await finish({ status: 'skipped', skip_reason: 'budget' });
                    if (campaign) { await withRetry(() => db.Campaign.update(campaign.id, { status: 'paused' })); campaign.status = 'paused'; }
                    results.skipped++;
                    continue;
                }
            }

            // Pace per provider (one Android phone for httpSMS)
            const lane = job.channel === 'sms' ? (provider === 'twilio' ? 'twilio' : 'httpsms') : 'email';
            const wait = (lastSendAt[lane] || 0) + GAP_MS[lane] - Date.now();
            if (wait > 0) await sleep(wait);
            lastSendAt[lane] = Date.now();

            let outcome;
            try {
                if (job.channel === 'sms') {
                    outcome = await routeSms(db, job, smsText, provider);
                    outcome.body = smsText;
                } else if (job.channel === 'email') {
                    const unsub = await unsubscribeUrl(job.to);
                    const html = renderEmail(c, settings, tokens, unsub);
                    await base44.asServiceRole.integrations.Core.SendEmail({
                        to: job.to, subject: fillTokens(c.subject || `News from ${tokens.restaurant}`, tokens),
                        body: html, from_name: settings.email_from_name || tokens.restaurant,
                    });
                    outcome = { status: 'sent', provider: 'base44_email', body: fillTokens(c.body, tokens) };
                } else if (job.channel === 'whatsapp') {
                    outcome = await sendWhatsAppTemplate(db, await getWaChannel(job.restaurant_id), c.wa_template_id, job.to, tokens);
                } else {
                    outcome = { status: 'failed', error: `Unknown channel ${job.channel}` };
                }
            } catch (e) {
                outcome = { status: 'failed', error: String(e?.message || e).slice(0, 300) };
            }

            // Twilio says the customer replied STOP to our number: record it.
            if (outcome.code === '21610' && profile?.phone_e164) {
                const key_hash = await sha256Hex(profile.phone_e164);
                if (!(await withRetry(() => db.Suppression.filter({ key_hash, channel: 'sms' }))).length) {
                    await withRetry(() => db.Suppression.create({ key_hash, key_type: 'phone', key_hint: `${profile.phone_e164.slice(0, 5)}*****${profile.phone_e164.slice(-4)}`, channel: 'sms', scope: 'global', reason: 'carrier_opt_out', restaurant_id: job.restaurant_id, source_ref: 'twilio_21610' }));
                }
            }

            const accepted = outcome.status === 'sent' || outcome.status === 'uncertain';
            let couponCode = null;
            if (accepted && coupon) {
                couponCode = coupon;
                if (c.coupon_mode === 'unique' && !job.is_test) {
                    const cfg = c.coupon_config || {};
                    try {
                        await withRetry(() => db.Coupon.create({
                            code: coupon,
                            description: `${c.name || 'CRM offer'} — ${profile?.display_name || 'customer'}`,
                            discount_type: cfg.discount_type === 'fixed' ? 'fixed' : 'percentage',
                            discount_value: Number(cfg.discount_value) || 10,
                            restaurant_id: job.restaurant_id,
                            is_active: true,
                            valid_from: new Date().toISOString().slice(0, 10),
                            valid_until: new Date(Date.now() + (Number(cfg.validity_days) || 14) * DAY).toISOString().slice(0, 10),
                            usage_limit: 1, usage_count: 0, per_customer_limit: 1,
                            minimum_order: Number(cfg.minimum_order) || 0, stackable: false,
                        }));
                    } catch (e) {
                        console.error(`[crmSendWorker] sent but coupon ${coupon} not created:`, e?.message);
                    }
                }
            }

            await finish({
                status: outcome.status,
                provider: outcome.provider || null,
                provider_message_id: outcome.id || null,
                error: outcome.error || null,
                rendered_body: (outcome.body || '').slice(0, 2000),
                coupon_code: couponCode,
                cost_pence: accepted ? costPence : 0,
                sent_at: accepted ? new Date().toISOString() : null,
                to: job.to,
            });
            if (job.automation_id) {
                await syncEnrolment(db, job.id, accepted ? { status: 'messaged' } : { status: 'skipped', skip_reason: `send_failed: ${String(outcome.error || '').slice(0, 120)}` });
            }
            if (accepted && !job.is_test) {
                cache.budgetUsed.set(job.restaurant_id, (cache.budgetUsed.get(job.restaurant_id) || 0) + costPence);
                if (profile) cache.weekly.set(profile.id, (cache.weekly.get(profile.id) || 0) + 1);
            }
            results[outcome.status === 'sent' ? 'sent' : outcome.status === 'uncertain' ? 'uncertain' : 'failed']++;
        }

        // Close finished campaigns and refresh their cached stats
        for (const id of touchedCampaigns) {
            const c = await getCampaign(id);
            const all = [];
            for (let skip = 0; ; skip += 500) {
                const page = await withRetry(() => db.MessageJob.filter({ campaign_id: id }, 'created_date', 500, skip));
                all.push(...page);
                if (page.length < 500) break;
            }
            const real = all.filter(j => !j.is_test);
            const left = real.filter(j => ['queued', 'sending'].includes(j.status)).length;
            const count = (s) => real.filter(j => j.status === s).length;
            const skipped = {};
            real.filter(j => j.status === 'skipped').forEach(j => { skipped[j.skip_reason || 'other'] = (skipped[j.skip_reason || 'other'] || 0) + 1; });
            const stats = {
                audience: real.length, queued: left, skipped_total: count('skipped'), skipped, holdout: count('holdout'),
                sent: real.filter(j => SENT.includes(j.status)).length, delivered: count('delivered'), failed: count('failed'),
                uncertain: count('uncertain'), converted: count('converted'),
                revenue: Math.round(real.filter(j => j.status === 'converted').reduce((s, j) => s + (Number(j.converted_total) || 0), 0) * 100) / 100,
                cost_pence: real.reduce((s, j) => s + (Number(j.cost_pence) || 0), 0),
            };
            const patch = { stats };
            if (!left && c && c.status === 'sending') { patch.status = 'sent'; patch.completed_at = new Date().toISOString(); }
            await withRetry(() => db.Campaign.update(id, patch));
        }

        console.log('[crmSendWorker]', JSON.stringify(results));
        return Response.json({ success: true, ...results, remaining: jobs.length - results.processed - results.deferred });
    } catch (error) {
        console.error('[crmSendWorker] Error:', error?.message);
        // 200 so a transient problem never gets the workflow switched off; the next run retries.
        return Response.json({ success: false, error: error?.message });
    }
});
