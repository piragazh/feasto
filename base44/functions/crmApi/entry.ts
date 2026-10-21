import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * crmApi — the restaurant CRM's only door to customer and marketing data.
 *
 * Every CRM entity is admin-only at the database level; restaurant owners and managers reach their
 * own restaurant's data through this function, which checks RestaurantManager membership on every
 * call. The browser never chooses who receives a message: audiences are built here from segments.
 *
 * POST { action, restaurant_id, ... }
 *   dashboard | customers_list | customer_get | customer_update
 *   segments_list | segment_preview | segment_save | segment_delete
 *   campaigns_list | campaign_get | campaign_save | campaign_send | campaign_cancel | campaign_pause | campaign_resume
 *   campaign_test | campaign_delete | settings_get | settings_save | coupons_list
 */

const DAY = 86400000;
const enc = new TextEncoder();
const CHANNELS = ['sms', 'email', 'whatsapp'];
const SENT_STATUSES = ['sent', 'delivered', 'converted', 'uncertain'];

const DEFAULT_SETTINGS = {
    default_sms_provider: 'auto',
    quiet_hours_start: '21:00',
    quiet_hours_end: '09:00',
    max_marketing_per_week: 2,
    monthly_budget_pence: 5000,
    sms_cost_pence: { httpsms: 0, twilio: 4 },
    attribution_days: 7,
};

// Default automations every restaurant gets (all off until switched on).
const AUTOMATION_DEFAULTS = {
    welcome: {
        channel_order: ['email', 'sms'], cooldown_days: 0, holdout_pct: 10, coupon_mode: 'none',
        content: {
            sms: { body: 'Thanks for your first order, {first_name}! Hope you loved it. Order direct next time: {order_link}' },
            email: { subject: 'Thanks for ordering, {first_name}!', heading: 'Welcome to {restaurant}', body: 'Thanks for your first order with us, {first_name}. We hope you enjoyed it!\n\nOrdering direct from us is always the best way to get your favourites.', button_text: 'Order again' },
        },
    },
    second_order: {
        channel_order: ['whatsapp', 'sms', 'email'], cooldown_days: 0, holdout_pct: 10, coupon_mode: 'unique',
        coupon_config: { discount_type: 'fixed', discount_value: 3, validity_days: 14, minimum_order: 10 },
        settings: { delay_days: 14 },
        content: {
            sms: { body: 'Hi {first_name}, fancy {favourite_item} again? £3 off your next order with code {coupon_code}' },
            email: { subject: '£3 off your next order, {first_name}', heading: 'Ready for round two?', body: 'Fancy {favourite_item} again? Here is £3 off your next order.', button_text: 'Order now' },
        },
    },
    win_back: {
        channel_order: ['whatsapp', 'sms', 'email'], cooldown_days: 90, holdout_pct: 10, coupon_mode: 'unique',
        coupon_config: { discount_type: 'percentage', discount_value: 15, validity_days: 14, minimum_order: 0 },
        content: {
            sms: { body: 'We miss you, {first_name}! 15% off your next order this fortnight with code {coupon_code}' },
            email: { subject: 'We miss you, {first_name}', heading: "It's been a while!", body: "It's been {days_since_last_order} days since your last order. Here's 15% off to welcome you back.", button_text: 'Order now' },
        },
    },
    lapsed: {
        channel_order: ['email', 'sms'], cooldown_days: 180, holdout_pct: 10, coupon_mode: 'unique',
        coupon_config: { discount_type: 'percentage', discount_value: 20, validity_days: 21, minimum_order: 0 },
        content: {
            sms: { body: 'Long time no see, {first_name}! 20% off with code {coupon_code} - valid 3 weeks' },
            email: { subject: '20% off - come back and see us', heading: 'Long time no see!', body: "We'd love to cook for you again. Here's 20% off your next order.", button_text: 'Order now' },
        },
    },
    birthday: {
        channel_order: ['whatsapp', 'sms', 'email'], cooldown_days: 300, holdout_pct: 0, coupon_mode: 'unique',
        coupon_config: { discount_type: 'percentage', discount_value: 20, validity_days: 10, minimum_order: 0 },
        settings: { days_before: 3 },
        content: {
            sms: { body: 'Happy birthday soon, {first_name}! Treat yourself: 20% off with code {coupon_code}' },
            email: { subject: 'A birthday treat for you, {first_name}', heading: 'Happy birthday!', body: 'Your birthday is coming up - celebrate with 20% off your order.', button_text: 'Claim my treat' },
        },
    },
    vip_milestone: {
        channel_order: ['whatsapp', 'email', 'sms'], cooldown_days: 0, holdout_pct: 0, coupon_mode: 'none',
        settings: { milestones: [10, 25, 50] },
        content: {
            sms: { body: 'Thank you, {first_name}! You are one of our best customers. We really appreciate you.' },
            email: { subject: 'Thank you, {first_name}', heading: 'You are one of our best customers', body: 'We just wanted to say thank you for ordering with us so often. It means a lot to a local business.', button_text: 'Order again' },
        },
    },
    review_request: {
        channel_order: ['sms', 'email'], cooldown_days: 30, holdout_pct: 0, coupon_mode: 'none',
        content: {
            sms: { body: 'Thanks for ordering, {first_name}! How was it? Tell us here: {order_link}' },
            email: { subject: 'How was your order, {first_name}?', heading: 'How did we do?', body: 'Thanks for ordering from {restaurant}. We would love to hear what you thought.', button_text: 'Leave a review' },
        },
    },
};
const AUTOMATION_ORDER = ['welcome', 'second_order', 'win_back', 'lapsed', 'birthday', 'vip_milestone', 'review_request'];

async function approvedWaTemplates(db, restaurantId) {
    const ch = (await db.WhatsAppChannel.filter({ restaurant_id: restaurantId, status: 'connected' }))[0] || null;
    if (!ch) return { channel: null, templates: [] };
    const all = await db.WaTemplate.filter({ category: 'MARKETING' }).catch(() => []);
    return {
        channel: { display_phone_number: ch.display_phone_number, verified_name: ch.verified_name },
        templates: all.filter(t => (t.submissions || []).some(s => s.waba_id === ch.waba_id && s.status === 'APPROVED'))
            .map(t => ({ id: t.id, name: t.name, body: t.body, param_order: t.param_order || [], has_stop_button: (t.buttons || []).some(b => /stop/i.test(`${b.text || ''} ${b.payload || ''}`)) })),
    };
}

const SYSTEM_SEGMENTS = [
    { key: 'sys:all', name: 'All customers', description: 'Everyone who has ordered' },
    { key: 'sys:marketable', name: 'All marketable', description: 'Customers who agreed to offers on at least one channel' },
    { key: 'sys:new', name: 'New this month', description: 'First and only order in the last 30 days' },
    { key: 'sys:active', name: 'Active regulars', description: 'Ordering at their usual rhythm' },
    { key: 'sys:vip', name: 'VIP', description: '10+ orders or £300+ in the last 6 months' },
    { key: 'sys:at_risk', name: 'At risk', description: 'Overdue compared with how often they usually order' },
    { key: 'sys:lapsed', name: 'Lapsed 90+ days', description: 'No order for 90 days or more' },
    { key: 'sys:once', name: 'Ordered once only', description: 'Exactly one completed order' },
    { key: 'sys:big_spenders', name: 'Big spenders', description: 'Top 10% by total spend' },
    { key: 'sys:birthday', name: 'Birthday this month', description: 'Customers whose birthday is this month' },
];

// ── Helpers ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function withRetry(fn) {
    for (let a = 0; ; a++) {
        try { return await fn(); } catch (e) {
            if (a < 5 && /rate limit|429/i.test(String(e?.message || e))) { await sleep(800 * 2 ** a); continue; }
            throw e;
        }
    }
}
async function listAll(entity, query = {}, sort = '-created_date', cap = 10000) {
    const out = [];
    for (let skip = 0; skip < cap; skip += 500) {
        const page = await withRetry(() => entity.filter(query, sort, 500, skip));
        out.push(...page);
        if (page.length < 500) break;
    }
    return out;
}
async function sha256Hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function normaliseEmail(raw) {
    const e = String(raw || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.endsWith('@no-reply.base44.com')) return null;
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
const daysSince = (d) => d ? (Date.now() - new Date(d).getTime()) / DAY : null;
const firstName = (p) => String(p.display_name || '').trim().split(/\s+/)[0] || '';
const mask = (s, type) => !s ? '' : type === 'email'
    ? s.replace(/^(.).*(@.*)$/, '$1***$2')
    : `${s.slice(0, 5)}*****${s.slice(-3)}`;

function smsSegments(text) {
    const unicode = /[^\x00-\x7F£€]/.test(text);
    const single = unicode ? 70 : 160, multi = unicode ? 67 : 153;
    return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

// ── Segment rules ────────────────────────────────────────────────────────
const FIELD = {
    stage: p => p.lifecycle_stage,
    is_vip: p => !!p.is_vip,
    order_count: p => p.order_count || 0,
    total_spend: p => p.total_spend || 0,
    avg_order_value: p => p.avg_order_value || 0,
    days_since_last_order: p => daysSince(p.last_order_at),
    days_since_first_order: p => daysSince(p.first_order_at),
    favourite_item: p => (p.favourite_items || []).map(i => i.name),
    order_source: p => Object.entries(p.order_sources || {}).filter(([, n]) => n > 0).map(([k]) => k),
    order_type: p => Object.entries(p.order_types || {}).filter(([, n]) => n > 0).map(([k]) => k),
    tag: p => p.tags || [],
    birthday_month: p => p.birthday ? Number(String(p.birthday).slice(0, 2)) : null,
    has_phone: p => !!p.phone_e164,
    has_email: p => !!(p.emails || []).length,
    consent_sms: p => !!p.consent?.sms,
    consent_email: p => !!p.consent?.email,
    consent_whatsapp: p => !!p.consent?.whatsapp,
    rfm_r: p => p.rfm?.r || 0, rfm_f: p => p.rfm?.f || 0, rfm_m: p => p.rfm?.m || 0,
};

function testCondition(p, c) {
    const getter = FIELD[c.field];
    if (!getter) return false;
    const v = getter(p);
    const val = c.value;
    const num = Number(val);
    switch (c.op) {
        case 'eq': return Array.isArray(v) ? v.includes(val) : String(v) === String(val);
        case 'neq': return Array.isArray(v) ? !v.includes(val) : String(v) !== String(val);
        case 'gt': return v !== null && Number(v) > num;
        case 'gte': return v !== null && Number(v) >= num;
        case 'lt': return v !== null && Number(v) < num;
        case 'lte': return v !== null && Number(v) <= num;
        case 'in': return Array.isArray(val) && (Array.isArray(v) ? v.some(x => val.includes(x)) : val.includes(v));
        case 'contains': {
            const needle = String(val || '').toLowerCase();
            return Array.isArray(v) ? v.some(x => String(x).toLowerCase().includes(needle)) : String(v || '').toLowerCase().includes(needle);
        }
        case 'is_true': return v === true;
        case 'is_false': return v === false;
        default: return false;
    }
}

function matchRules(p, rules) {
    const conds = rules?.conditions || [];
    if (!conds.length) return true;
    return rules.match === 'any' ? conds.some(c => testCondition(p, c)) : conds.every(c => testCondition(p, c));
}

function systemFilter(key, profiles) {
    const month = new Date().getUTCMonth() + 1;
    switch (key) {
        case 'sys:all': return profiles.filter(p => p.order_count > 0);
        case 'sys:marketable': return profiles.filter(p => p.marketing_eligible !== false && CHANNELS.some(c => p.consent?.[c]));
        case 'sys:new': return profiles.filter(p => p.lifecycle_stage === 'new');
        case 'sys:active': return profiles.filter(p => p.lifecycle_stage === 'active');
        case 'sys:vip': return profiles.filter(p => p.is_vip);
        case 'sys:at_risk': return profiles.filter(p => p.lifecycle_stage === 'at_risk');
        case 'sys:lapsed': return profiles.filter(p => p.lifecycle_stage === 'lapsed');
        case 'sys:once': return profiles.filter(p => p.order_count === 1);
        case 'sys:big_spenders': {
            const spenders = profiles.filter(p => p.total_spend > 0).sort((a, b) => b.total_spend - a.total_spend);
            return spenders.slice(0, Math.max(1, Math.ceil(spenders.length * 0.1)));
        }
        case 'sys:birthday': return profiles.filter(p => FIELD.birthday_month(p) === month);
        default: return [];
    }
}

// ── Data loaders ─────────────────────────────────────────────────────────
async function loadProfiles(db, restaurantId) {
    const all = await listAll(db.CustomerProfile, { restaurant_id: restaurantId });
    return all.filter(p => !p.merged_into);
}

async function loadSettings(db, restaurantId, restaurantName) {
    const row = (await db.CRMSettings.filter({ restaurant_id: restaurantId }))[0];
    return { ...DEFAULT_SETTINGS, sender_name: restaurantName, ...(row || {}), _id: row?.id || null };
}

async function suppressionSet(db) {
    const rows = await listAll(db.Suppression, {}, '-created_date');
    return new Set(rows.map(r => `${r.key_hash}|${r.channel}`));
}

async function recentSends(db, restaurantId) {
    const since = new Date(Date.now() - 7 * DAY).toISOString();
    const jobs = await listAll(db.MessageJob, { restaurant_id: restaurantId, sent_at: { $gte: since } });
    const counts = new Map();
    jobs.filter(j => !j.is_test && SENT_STATUSES.includes(j.status)).forEach(j => counts.set(j.profile_id, (counts.get(j.profile_id) || 0) + 1));
    return counts;
}

async function resolveAudience(db, restaurantId, segmentKey, profiles) {
    if (String(segmentKey).startsWith('sys:')) {
        const def = SYSTEM_SEGMENTS.find(s => s.key === segmentKey);
        return { name: def?.name || segmentKey, members: systemFilter(segmentKey, profiles) };
    }
    const seg = (await db.Segment.filter({ id: segmentKey, restaurant_id: restaurantId }))[0];
    if (!seg) throw new Error('Segment not found');
    return { name: seg.name, members: profiles.filter(p => p.order_count > 0 && matchRules(p, seg.rules)) };
}

/** Why this customer cannot get a marketing message on this channel right now, or null if they can. */
async function blockReason(p, channel, ctx) {
    if (p.marketing_eligible === false) return 'marketplace';
    const email = (p.emails || [])[0] || null;
    const to = channel === 'email' ? email : p.phone_e164;
    if (!to) return 'no_contact';
    if (!p.consent?.[channel]) return 'no_consent';
    const keys = [];
    if (p.phone_e164) keys.push(await sha256Hex(p.phone_e164));
    if (email) keys.push(await sha256Hex(email));
    if (keys.some(k => ctx.suppressed.has(`${k}|${channel}`) || ctx.suppressed.has(`${k}|all`))) return 'suppressed';
    if ((ctx.sentThisWeek.get(p.id) || 0) >= ctx.settings.max_marketing_per_week) return 'frequency_cap';
    return null;
}

async function audienceBreakdown(db, restaurantId, members, settings) {
    const ctx = { suppressed: await suppressionSet(db), sentThisWeek: await recentSends(db, restaurantId), settings };
    const out = {};
    for (const ch of ['sms', 'email', 'whatsapp']) {
        const reasons = {};
        let reachable = 0;
        for (const p of members) {
            const r = await blockReason(p, ch, ctx);
            if (r) reasons[r] = (reasons[r] || 0) + 1; else reachable++;
        }
        out[ch] = { reachable, blocked: reasons };
    }
    return out;
}

function profileSummary(p) {
    return {
        id: p.id,
        name: p.display_name || 'Customer',
        phone: p.phone_e164 || '',
        email: (p.emails || [])[0] || '',
        stage: p.lifecycle_stage,
        is_vip: !!p.is_vip,
        order_count: p.order_count || 0,
        total_spend: p.total_spend || 0,
        avg_order_value: p.avg_order_value || 0,
        last_order_at: p.last_order_at,
        first_order_at: p.first_order_at,
        consent: p.consent || {},
        tags: p.tags || [],
        marketing_eligible: p.marketing_eligible !== false,
        possible_shared_number: !!p.possible_shared_number,
        favourite_item: p.favourite_items?.[0]?.name || null,
    };
}

// ── Access ───────────────────────────────────────────────────────────────
async function authorise(base44, restaurantId) {
    const user = await base44.auth.me().catch(() => null);
    if (!user) return { error: 'Unauthorized', status: 401 };
    if (!restaurantId) return { error: 'restaurant_id required', status: 400 };
    if (user.role === 'admin') return { user, isAdmin: true };
    const managers = await base44.asServiceRole.entities.RestaurantManager.filter({ user_email: user.email, is_active: true });
    if (!managers.some(m => (m.restaurant_ids || []).includes(restaurantId))) {
        console.error(`[SECURITY] crmApi: ${user.email} denied for restaurant ${restaurantId}`);
        return { error: 'Access denied to this restaurant', status: 403 };
    }
    return { user, isAdmin: false };
}

// ── Campaign report ──────────────────────────────────────────────────────
function buildReport(campaign, jobs) {
    const real = jobs.filter(j => !j.is_test);
    const by = (s) => real.filter(j => j.status === s).length;
    const skipped = {};
    real.filter(j => j.status === 'skipped').forEach(j => { skipped[j.skip_reason || 'other'] = (skipped[j.skip_reason || 'other'] || 0) + 1; });
    const sent = real.filter(j => SENT_STATUSES.includes(j.status)).length;
    const converted = real.filter(j => j.status === 'converted');
    const revenue = converted.reduce((s, j) => s + (Number(j.converted_total) || 0), 0);
    const cost = real.reduce((s, j) => s + (Number(j.cost_pence) || 0), 0);
    return {
        audience: real.length,
        queued: by('queued') + by('sending'),
        skipped_total: by('skipped'),
        skipped,
        holdout: by('holdout'),
        sent,
        delivered: by('delivered') + converted.filter(j => j.delivered_at).length,
        failed: by('failed'),
        uncertain: by('uncertain'),
        converted: converted.length,
        revenue: Math.round(revenue * 100) / 100,
        cost_pence: cost,
        tests: jobs.filter(j => j.is_test).length,
    };
}

// ── Entry ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { action, restaurant_id: restaurantId } = body;

        const auth = await authorise(base44, restaurantId);
        if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
        const { user } = auth;
        const db = base44.asServiceRole.entities;

        const restaurant = (await db.Restaurant.filter({ id: restaurantId }))[0];
        if (!restaurant) return Response.json({ error: 'Restaurant not found' }, { status: 404 });

        switch (action) {
            // ── Overview ──
            case 'dashboard': {
                const profiles = await loadProfiles(db, restaurantId);
                const customers = profiles.filter(p => p.order_count > 0);
                const stages = {};
                customers.forEach(p => { stages[p.lifecycle_stage] = (stages[p.lifecycle_stage] || 0) + 1; });
                const consent = {};
                CHANNELS.forEach(ch => { consent[ch] = customers.filter(p => p.consent?.[ch] && p.marketing_eligible !== false).length; });
                const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
                const jobs = await listAll(db.MessageJob, { restaurant_id: restaurantId, sent_at: { $gte: monthStart.toISOString() } });
                const real = jobs.filter(j => !j.is_test);
                const conv = real.filter(j => j.status === 'converted');
                return Response.json({
                    customers: customers.length,
                    stages,
                    vip: customers.filter(p => p.is_vip).length,
                    marketable_any: customers.filter(p => p.marketing_eligible !== false && CHANNELS.some(c => p.consent?.[c])).length,
                    consent,
                    total_spend: Math.round(customers.reduce((s, p) => s + (p.total_spend || 0), 0) * 100) / 100,
                    repeat_rate: customers.length ? Math.round(customers.filter(p => p.order_count > 1).length / customers.length * 100) : 0,
                    month: {
                        sent: real.filter(j => SENT_STATUSES.includes(j.status)).length,
                        converted: conv.length,
                        revenue: Math.round(conv.reduce((s, j) => s + (Number(j.converted_total) || 0), 0) * 100) / 100,
                        cost_pence: real.reduce((s, j) => s + (Number(j.cost_pence) || 0), 0),
                    },
                    suggestions: [
                        stages.at_risk ? { segment_key: 'sys:at_risk', text: `${stages.at_risk} regulars are overdue — win them back` } : null,
                        stages.new ? { segment_key: 'sys:new', text: `${stages.new} new customers this month — invite a second order` } : null,
                        stages.lapsed ? { segment_key: 'sys:lapsed', text: `${stages.lapsed} customers haven't ordered in 90+ days` } : null,
                    ].filter(Boolean),
                });
            }

            // ── Customers ──
            case 'customers_list': {
                const { search = '', stage, vip, segment_key, consent_channel, sort = 'last_order', page = 1, page_size = 50 } = body;
                let profiles = (await loadProfiles(db, restaurantId)).filter(p => p.order_count > 0 || (p.order_ids || []).length);
                if (segment_key) profiles = (await resolveAudience(db, restaurantId, segment_key, profiles)).members;
                if (stage) profiles = profiles.filter(p => p.lifecycle_stage === stage);
                if (vip) profiles = profiles.filter(p => p.is_vip);
                if (consent_channel) profiles = profiles.filter(p => p.consent?.[consent_channel]);
                const q = String(search).trim().toLowerCase();
                if (q) {
                    const qPhone = normalisePhone(q);
                    profiles = profiles.filter(p => String(p.display_name || '').toLowerCase().includes(q)
                        || (p.emails || []).some(e => e.includes(q))
                        || (qPhone && p.phone_e164 === qPhone)
                        || String(p.phone_e164 || '').replace('+44', '0').includes(q.replace(/\s/g, ''))
                        || (p.addresses || []).some(a => String(a.address).toLowerCase().includes(q)));
                }
                const sorters = {
                    last_order: (a, b) => String(b.last_order_at || '').localeCompare(String(a.last_order_at || '')),
                    spend: (a, b) => (b.total_spend || 0) - (a.total_spend || 0),
                    orders: (a, b) => (b.order_count || 0) - (a.order_count || 0),
                    name: (a, b) => String(a.display_name || '').localeCompare(String(b.display_name || '')),
                };
                profiles.sort(sorters[sort] || sorters.last_order);
                const total = profiles.length;
                const start = (Math.max(1, page) - 1) * page_size;
                return Response.json({ total, page, page_size, customers: profiles.slice(start, start + page_size).map(profileSummary) });
            }

            case 'customer_get': {
                const p = (await db.CustomerProfile.filter({ id: body.profile_id, restaurant_id: restaurantId }))[0];
                if (!p) return Response.json({ error: 'Customer not found' }, { status: 404 });
                const ids = (p.order_ids || []).slice(-100);
                const orders = ids.length ? await withRetry(() => db.Order.filter({ id: ids })) : [];
                const [consentRecords, jobs] = await Promise.all([
                    db.ConsentRecord.filter({ profile_id: p.id }, '-created_date', 50),
                    db.MessageJob.filter({ profile_id: p.id }, '-created_date', 30),
                ]);
                return Response.json({
                    profile: {
                        ...profileSummary(p),
                        emails: p.emails || [], addresses: p.addresses || [], notes: p.notes || '',
                        birthday: p.birthday || '', favourite_items: p.favourite_items || [],
                        order_sources: p.order_sources || {}, order_types: p.order_types || {},
                        avg_days_between_orders: p.avg_days_between_orders, rfm: p.rfm,
                    },
                    orders: orders.sort((a, b) => String(b.created_date).localeCompare(String(a.created_date))).map(o => ({
                        id: o.id, created_date: o.created_date, status: o.status, total: o.total,
                        order_type: o.order_type, order_source: o.order_source, order_number: o.order_number,
                        items: (o.items || []).map(i => ({ name: i.name, quantity: i.quantity })),
                        coupon_codes: o.coupon_codes || [],
                    })),
                    consent_history: consentRecords.map(r => ({ channel: r.channel, action: r.action, method: r.method, at: r.at || r.created_date, captured_by: r.captured_by })),
                    messages: jobs.map(j => ({ id: j.id, channel: j.channel, status: j.status, sent_at: j.sent_at, body: j.rendered_body, campaign_id: j.campaign_id, coupon_code: j.coupon_code })),
                });
            }

            case 'customer_update': {
                const p = (await db.CustomerProfile.filter({ id: body.profile_id, restaurant_id: restaurantId }))[0];
                if (!p) return Response.json({ error: 'Customer not found' }, { status: 404 });
                const patch = {};
                if (typeof body.notes === 'string') patch.notes = body.notes.slice(0, 2000);
                if (Array.isArray(body.tags)) patch.tags = [...new Set(body.tags.map(t => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
                if (typeof body.birthday === 'string') patch.birthday = /^\d{2}-\d{2}$/.test(body.birthday) ? body.birthday : '';
                if (typeof body.display_name === 'string' && body.display_name.trim()) patch.display_name = body.display_name.trim().slice(0, 80);
                if (body.consent_change) {
                    const { channel, action: ca, note } = body.consent_change;
                    if (!CHANNELS.includes(channel) || !['grant', 'withdraw'].includes(ca)) return Response.json({ error: 'Invalid consent change' }, { status: 400 });
                    if (ca === 'grant' && !String(note || '').trim()) {
                        return Response.json({ error: 'Say how the customer agreed (e.g. "asked in shop 17 Oct")' }, { status: 400 });
                    }
                    await db.ConsentRecord.create({
                        contact_id: p.contact_id || null, profile_id: p.id, restaurant_id: restaurantId, scope: restaurantId,
                        channel, action: ca, method: 'staff_manual', wording_version: String(note || '').slice(0, 200),
                        captured_by: user.email, at: new Date().toISOString(),
                    });
                    patch.consent = { ...(p.consent || {}), [channel]: ca === 'grant' };
                    patch.consent_updated_at = new Date().toISOString();
                }
                await db.CustomerProfile.update(p.id, patch);
                return Response.json({ success: true });
            }

            // ── Segments ──
            case 'segments_list': {
                const profiles = (await loadProfiles(db, restaurantId)).filter(p => p.order_count > 0);
                const custom = await db.Segment.filter({ restaurant_id: restaurantId }, '-created_date', 200);
                return Response.json({
                    system: SYSTEM_SEGMENTS.map(s => ({ ...s, count: systemFilter(s.key, profiles).length })),
                    custom: custom.map(s => ({ key: s.id, id: s.id, name: s.name, description: s.description, rules: s.rules, count: profiles.filter(p => matchRules(p, s.rules)).length })),
                });
            }

            case 'segment_preview': {
                const profiles = (await loadProfiles(db, restaurantId)).filter(p => p.order_count > 0);
                const settings = await loadSettings(db, restaurantId, restaurant.name);
                const members = body.segment_key
                    ? (await resolveAudience(db, restaurantId, body.segment_key, profiles)).members
                    : profiles.filter(p => matchRules(p, body.rules));
                return Response.json({
                    count: members.length,
                    channels: await audienceBreakdown(db, restaurantId, members, settings),
                    sample: members.slice(0, 10).map(p => ({ id: p.id, name: p.display_name || 'Customer', stage: p.lifecycle_stage, orders: p.order_count, spend: p.total_spend, last_order_at: p.last_order_at })),
                });
            }

            case 'segment_save': {
                const { segment_id, name, description = '', rules } = body;
                if (!String(name || '').trim() || !rules || !Array.isArray(rules.conditions)) return Response.json({ error: 'Name and rules required' }, { status: 400 });
                const clean = {
                    match: rules.match === 'any' ? 'any' : 'all',
                    conditions: rules.conditions.filter(c => FIELD[c.field]).slice(0, 15).map(c => ({ field: c.field, op: c.op, value: c.value })),
                };
                const data = { restaurant_id: restaurantId, name: String(name).slice(0, 80), description: String(description).slice(0, 200), rules: clean, created_by: user.email };
                if (segment_id) {
                    const s = (await db.Segment.filter({ id: segment_id, restaurant_id: restaurantId }))[0];
                    if (!s) return Response.json({ error: 'Segment not found' }, { status: 404 });
                    await db.Segment.update(s.id, data);
                    return Response.json({ id: s.id });
                }
                const s = await db.Segment.create(data);
                return Response.json({ id: s.id });
            }

            case 'segment_delete': {
                const s = (await db.Segment.filter({ id: body.segment_id, restaurant_id: restaurantId }))[0];
                if (s) await db.Segment.delete(s.id);
                return Response.json({ success: true });
            }

            // ── Campaigns ──
            case 'campaigns_list': {
                const campaigns = await db.Campaign.filter({ restaurant_id: restaurantId }, '-created_date', 100);
                return Response.json({
                    campaigns: campaigns.map(c => ({
                        id: c.id, name: c.name, channel: c.channel, status: c.status, segment_name: c.segment_name,
                        schedule_at: c.schedule_at, sent_at: c.sent_at, created_date: c.created_date, stats: c.stats || {},
                    })),
                });
            }

            case 'campaign_get': {
                const c = (await db.Campaign.filter({ id: body.campaign_id, restaurant_id: restaurantId }))[0];
                if (!c) return Response.json({ error: 'Campaign not found' }, { status: 404 });
                const jobs = await listAll(db.MessageJob, { campaign_id: c.id }, 'created_date');
                const report = buildReport(c, jobs);
                // Lift: customers who ordered after the send, recipients vs held-back group
                let lift = null;
                if (c.sent_at && report.holdout > 0) {
                    const ids = jobs.filter(j => !j.is_test && (SENT_STATUSES.includes(j.status) || j.status === 'holdout')).map(j => j.profile_id);
                    const profs = ids.length ? await withRetry(() => db.CustomerProfile.filter({ id: ids })) : [];
                    const orderedSince = new Set(profs.filter(p => p.last_order_at && p.last_order_at > c.sent_at).map(p => p.id));
                    const grp = (pred) => { const g = jobs.filter(pred); return g.length ? Math.round(g.filter(j => orderedSince.has(j.profile_id)).length / g.length * 1000) / 10 : 0; };
                    const rRate = grp(j => !j.is_test && SENT_STATUSES.includes(j.status));
                    const hRate = grp(j => j.status === 'holdout');
                    lift = { recipients_order_rate: rRate, holdout_order_rate: hRate, lift_points: Math.round((rRate - hRate) * 10) / 10 };
                }
                return Response.json({
                    campaign: c, report, lift,
                    recipients: jobs.filter(j => !j.is_test).slice(0, 300).map(j => ({
                        id: j.id, profile_id: j.profile_id, to: mask(j.to, j.channel === 'email' ? 'email' : 'phone'),
                        status: j.status, skip_reason: j.skip_reason, error: j.error, sent_at: j.sent_at, coupon_code: j.coupon_code,
                        converted_total: j.converted_total,
                    })),
                });
            }

            case 'campaign_save': {
                const f = body.campaign || {};
                if (!String(f.name || '').trim()) return Response.json({ error: 'Name required' }, { status: 400 });
                if (!['sms', 'email', 'whatsapp'].includes(f.channel)) return Response.json({ error: 'Choose SMS, email or WhatsApp' }, { status: 400 });
                let waTemplate = null;
                if (f.channel === 'whatsapp') {
                    const wa = await approvedWaTemplates(db, restaurantId);
                    if (!wa.channel) return Response.json({ error: 'Connect this restaurant\'s WhatsApp number first' }, { status: 400 });
                    waTemplate = wa.templates.find(t => t.id === f.wa_template_id);
                    if (!waTemplate) return Response.json({ error: 'Choose a marketing template approved by Meta for this number' }, { status: 400 });
                }
                if (f.coupon_mode === 'shared') {
                    const code = String(f.coupon_code || '').trim().toUpperCase();
                    const cp = (await db.Coupon.filter({ code, restaurant_id: restaurantId, is_active: true }))[0];
                    if (!cp) return Response.json({ error: `Coupon ${code} not found or not active for this restaurant` }, { status: 400 });
                }
                const data = {
                    restaurant_id: restaurantId,
                    name: String(f.name).slice(0, 100),
                    channel: f.channel,
                    sms_provider: ['auto', 'httpsms', 'twilio'].includes(f.sms_provider) ? f.sms_provider : 'auto',
                    segment_key: f.segment_key || 'sys:marketable',
                    segment_name: f.segment_name || '',
                    subject: String(f.subject || '').slice(0, 150),
                    heading: String(f.heading || '').slice(0, 150),
                    body: waTemplate ? String(waTemplate.body || '') : String(f.body || '').slice(0, 2000),
                    button_text: String(f.button_text || 'Order now').slice(0, 40),
                    wa_template_id: waTemplate ? waTemplate.id : null,
                    coupon_mode: ['none', 'shared', 'unique'].includes(f.coupon_mode) ? f.coupon_mode : 'none',
                    coupon_code: f.coupon_mode === 'shared' ? String(f.coupon_code || '').trim().toUpperCase() : null,
                    coupon_config: f.coupon_mode === 'unique' ? {
                        discount_type: f.coupon_config?.discount_type === 'fixed' ? 'fixed' : 'percentage',
                        discount_value: Math.max(0, Math.min(100, Number(f.coupon_config?.discount_value) || 10)),
                        validity_days: Math.max(1, Math.min(90, Number(f.coupon_config?.validity_days) || 14)),
                        minimum_order: Math.max(0, Number(f.coupon_config?.minimum_order) || 0),
                    } : null,
                    holdout_pct: Math.max(0, Math.min(50, Number(f.holdout_pct) || 0)),
                    schedule_at: f.schedule_at || null,
                    created_by_email: user.email,
                    on_behalf_of_admin: auth.isAdmin,
                };
                if (f.id) {
                    const c = (await db.Campaign.filter({ id: f.id, restaurant_id: restaurantId }))[0];
                    if (!c) return Response.json({ error: 'Campaign not found' }, { status: 404 });
                    if (!['draft', 'scheduled'].includes(c.status) || (c.status === 'scheduled' && (await db.MessageJob.filter({ campaign_id: c.id }, '-created_date', 1)).length)) {
                        return Response.json({ error: 'This campaign has already been sent and cannot be edited' }, { status: 400 });
                    }
                    await db.Campaign.update(c.id, data);
                    return Response.json({ id: c.id });
                }
                const c = await db.Campaign.create({ ...data, status: 'draft' });
                return Response.json({ id: c.id });
            }

            case 'campaign_send': {
                const c = (await db.Campaign.filter({ id: body.campaign_id, restaurant_id: restaurantId }))[0];
                if (!c) return Response.json({ error: 'Campaign not found' }, { status: 404 });
                if (c.status !== 'draft') return Response.json({ error: `Campaign is already ${c.status}` }, { status: 400 });
                if (!String(c.body || '').trim()) return Response.json({ error: 'Write a message first' }, { status: 400 });
                if (c.channel === 'email' && !String(c.subject || '').trim()) return Response.json({ error: 'Add an email subject' }, { status: 400 });

                const settings = await loadSettings(db, restaurantId, restaurant.name);
                const profiles = (await loadProfiles(db, restaurantId)).filter(p => p.order_count > 0);
                const { name: segName, members } = await resolveAudience(db, restaurantId, c.segment_key, profiles);
                const ctx = { suppressed: await suppressionSet(db), sentThisWeek: await recentSends(db, restaurantId), settings };

                const scheduleAt = body.schedule_at || c.schedule_at || null;
                const future = scheduleAt && new Date(scheduleAt).getTime() > Date.now() + 60000;
                const jobs = [];
                const eligible = [];
                for (const p of members) {
                    const reason = await blockReason(p, c.channel, ctx);
                    const to = c.channel === 'email' ? (p.emails || [])[0] : p.phone_e164;
                    const base = { restaurant_id: restaurantId, campaign_id: c.id, profile_id: p.id, channel: c.channel, to: to || '', idempotency_key: `cmp_${c.id}_${p.id}` };
                    if (reason) jobs.push({ ...base, status: 'skipped', skip_reason: reason });
                    else eligible.push(base);
                }
                // Random hold-out group for measuring real effect
                const holdN = Math.floor(eligible.length * (c.holdout_pct || 0) / 100);
                const shuffled = eligible.map(e => [Math.random(), e]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
                shuffled.forEach((e, i) => jobs.push(i < holdN ? { ...e, status: 'holdout' } : { ...e, status: 'queued' }));

                for (let i = 0; i < jobs.length; i += 100) await withRetry(() => db.MessageJob.bulkCreate(jobs.slice(i, i + 100)));

                const queued = jobs.filter(j => j.status === 'queued').length;
                const estSegments = c.channel === 'sms' ? smsSegments(c.body + '\nReply STOP to opt out') : 0;
                const providerRate = c.sms_provider === 'twilio' ? settings.sms_cost_pence?.twilio : settings.sms_cost_pence?.httpsms;
                await db.Campaign.update(c.id, {
                    status: future ? 'scheduled' : (queued ? 'sending' : 'sent'),
                    schedule_at: future ? scheduleAt : null,
                    segment_name: segName,
                    sent_at: future ? null : new Date().toISOString(),
                    completed_at: queued || future ? null : new Date().toISOString(),
                    stats: buildReport(c, jobs),
                });

                if (!future && queued) {
                    // Start sending straight away; the 5-minute worker picks up anything left.
                    await base44.asServiceRole.functions.invoke('crmSendWorker', { mode: 'drain', campaign_id: c.id }).catch(e => console.warn('[crmApi] worker kick failed:', e?.message));
                }
                return Response.json({
                    success: true, audience: jobs.length, queued, holdout: holdN,
                    skipped: jobs.filter(j => j.status === 'skipped').length,
                    estimated_cost_pence: c.channel === 'sms' ? Math.round(queued * estSegments * (providerRate || 0)) : 0,
                    scheduled_for: future ? scheduleAt : null,
                });
            }

            case 'campaign_test': {
                const c = (await db.Campaign.filter({ id: body.campaign_id, restaurant_id: restaurantId }))[0];
                if (!c) return Response.json({ error: 'Campaign not found' }, { status: 404 });
                const tests = await db.MessageJob.filter({ campaign_id: c.id, is_test: true });
                if (tests.length >= 10) return Response.json({ error: 'Test limit reached for this campaign (10)' }, { status: 429 });
                const to = c.channel === 'email' ? normaliseEmail(body.to) : normalisePhone(body.to);
                if (!to) return Response.json({ error: c.channel === 'email' ? 'Enter a valid email address' : 'Enter a valid UK mobile number' }, { status: 400 });
                const job = await db.MessageJob.create({
                    restaurant_id: restaurantId, campaign_id: c.id, channel: c.channel, to, status: 'queued', is_test: true,
                    idempotency_key: `test_${c.id}_${Date.now()}`,
                });
                const res = await base44.asServiceRole.functions.invoke('crmSendWorker', { mode: 'drain', job_id: job.id }).catch(e => ({ data: { error: e?.message } }));
                const after = (await db.MessageJob.filter({ id: job.id }))[0];
                return Response.json({ status: after?.status, error: after?.error || res?.data?.error || null, body: after?.rendered_body });
            }

            case 'campaign_cancel':
            case 'campaign_pause':
            case 'campaign_resume': {
                const c = (await db.Campaign.filter({ id: body.campaign_id, restaurant_id: restaurantId }))[0];
                if (!c) return Response.json({ error: 'Campaign not found' }, { status: 404 });
                if (action === 'campaign_pause') {
                    if (!['sending', 'scheduled'].includes(c.status)) return Response.json({ error: 'Only a sending or scheduled campaign can be paused' }, { status: 400 });
                    await db.Campaign.update(c.id, { status: 'paused' });
                } else if (action === 'campaign_resume') {
                    if (c.status !== 'paused') return Response.json({ error: 'Campaign is not paused' }, { status: 400 });
                    await db.Campaign.update(c.id, { status: 'sending', sent_at: c.sent_at || new Date().toISOString() });
                    await base44.asServiceRole.functions.invoke('crmSendWorker', { mode: 'drain', campaign_id: c.id }).catch(() => null);
                } else {
                    if (['sent', 'cancelled'].includes(c.status)) return Response.json({ error: `Campaign is already ${c.status}` }, { status: 400 });
                    const left = await listAll(db.MessageJob, { campaign_id: c.id, status: 'queued' });
                    for (const j of left) await withRetry(() => db.MessageJob.update(j.id, { status: 'skipped', skip_reason: 'cancelled' }));
                    const jobs = await listAll(db.MessageJob, { campaign_id: c.id });
                    await db.Campaign.update(c.id, { status: 'cancelled', completed_at: new Date().toISOString(), stats: buildReport(c, jobs) });
                }
                return Response.json({ success: true });
            }

            case 'campaign_delete': {
                const c = (await db.Campaign.filter({ id: body.campaign_id, restaurant_id: restaurantId }))[0];
                if (!c) return Response.json({ success: true });
                if (c.status !== 'draft') return Response.json({ error: 'Only drafts can be deleted; cancel a sent campaign instead' }, { status: 400 });
                await db.Campaign.delete(c.id);
                return Response.json({ success: true });
            }

            // ── Settings & coupons ──
            case 'settings_get': {
                const s = await loadSettings(db, restaurantId, restaurant.name);
                const { _id, ...settings } = s;
                const wa = await approvedWaTemplates(db, restaurantId);
                return Response.json({
                    settings,
                    whatsapp: wa,
                    providers: {
                        whatsapp: !!wa.channel,
                        httpsms: !!(Deno.env.get('HTTPSMS_API_KEY') && Deno.env.get('HTTPSMS_FROM')),
                        twilio: !!(Deno.env.get('TWILIO_ACCOUNT_SID') && Deno.env.get('TWILIO_AUTH_TOKEN') && Deno.env.get('TWILIO_PHONE_NUMBER')),
                        email: true,
                    },
                });
            }

            case 'settings_save': {
                const f = body.settings || {};
                const time = (t, d) => /^\d{2}:\d{2}$/.test(t) ? t : d;
                const data = {
                    restaurant_id: restaurantId,
                    sender_name: String(f.sender_name || restaurant.name).slice(0, 60),
                    default_sms_provider: ['auto', 'httpsms', 'twilio'].includes(f.default_sms_provider) ? f.default_sms_provider : 'auto',
                    email_from_name: String(f.email_from_name || '').slice(0, 60),
                    reply_to: normaliseEmail(f.reply_to) || '',
                    quiet_hours_start: time(f.quiet_hours_start, '21:00'),
                    quiet_hours_end: time(f.quiet_hours_end, '09:00'),
                    max_marketing_per_week: Math.max(1, Math.min(7, Number(f.max_marketing_per_week) || 2)),
                    monthly_budget_pence: Math.max(0, Math.round(Number(f.monthly_budget_pence) || 0)),
                    sms_cost_pence: {
                        httpsms: Math.max(0, Number(f.sms_cost_pence?.httpsms) || 0),
                        twilio: Math.max(0, Number(f.sms_cost_pence?.twilio) || 0),
                    },
                    attribution_days: Math.max(1, Math.min(30, Number(f.attribution_days) || 7)),
                };
                const existing = (await db.CRMSettings.filter({ restaurant_id: restaurantId }))[0];
                if (existing) await db.CRMSettings.update(existing.id, data); else await db.CRMSettings.create(data);
                return Response.json({ success: true });
            }

            case 'coupons_list': {
                const coupons = await db.Coupon.filter({ restaurant_id: restaurantId, is_active: true }, '-created_date', 200);
                const today = new Date().toISOString().slice(0, 10);
                return Response.json({
                    coupons: coupons
                        .filter(c => !String(c.code).startsWith('WB-') && !String(c.code).startsWith('CRM-') && (!c.valid_until || c.valid_until >= today))
                        .map(c => ({ code: c.code, description: c.description, discount_type: c.discount_type, discount_value: c.discount_value, valid_until: c.valid_until })),
                });
            }

            // ── Automations ──
            case 'automations_list': {
                let rows = await db.Automation.filter({ restaurant_id: restaurantId });
                const missing = AUTOMATION_ORDER.filter(t => !rows.some(r => r.type === t));
                if (missing.length) {
                    await db.Automation.bulkCreate(missing.map(t => ({ restaurant_id: restaurantId, type: t, is_enabled: false, ...AUTOMATION_DEFAULTS[t] })));
                    rows = await db.Automation.filter({ restaurant_id: restaurantId });
                }
                const since = new Date(Date.now() - 30 * DAY).toISOString();
                const enrolments = await listAll(db.AutomationEnrolment, { restaurant_id: restaurantId, enrolled_at: { $gte: since } });
                const profileIds = [...new Set(enrolments.filter(e => ['messaged', 'converted', 'holdout'].includes(e.status)).map(e => e.profile_id))];
                const profs = [];
                for (let i = 0; i < profileIds.length; i += 200) profs.push(...await withRetry(() => db.CustomerProfile.filter({ id: profileIds.slice(i, i + 200) })));
                const lastOrder = new Map(profs.map(p => [p.id, p.last_order_at]));
                const orderedSince = (e) => { const lo = lastOrder.get(e.profile_id); return !!lo && lo > e.enrolled_at; };
                const wa = await approvedWaTemplates(db, restaurantId);
                return Response.json({
                    whatsapp: wa,
                    automations: AUTOMATION_ORDER.map(t => rows.find(r => r.type === t)).filter(Boolean).map(a => {
                        const es = enrolments.filter(e => e.automation_id === a.id);
                        const messaged = es.filter(e => ['messaged', 'converted'].includes(e.status));
                        const held = es.filter(e => e.status === 'holdout');
                        const rate = (g) => g.length ? Math.round(g.filter(orderedSince).length / g.length * 1000) / 10 : null;
                        return {
                            ...a,
                            stats_30d: {
                                enrolled: es.length,
                                messaged: messaged.length,
                                holdout: held.length,
                                skipped: es.filter(e => e.status === 'skipped').length,
                                converted: es.filter(e => e.status === 'converted').length,
                                revenue: Math.round(es.reduce((s, e) => s + (Number(e.converted_total) || 0), 0) * 100) / 100,
                                messaged_order_rate: rate(messaged),
                                holdout_order_rate: rate(held),
                            },
                        };
                    }),
                });
            }

            case 'automation_save': {
                const f = body.automation || {};
                const a = (await db.Automation.filter({ id: f.id, restaurant_id: restaurantId }))[0];
                if (!a) return Response.json({ error: 'Automation not found' }, { status: 404 });
                const channels = (Array.isArray(f.channel_order) ? f.channel_order : a.channel_order || [])
                    .filter((c, i, arr) => ['sms', 'email', 'whatsapp'].includes(c) && arr.indexOf(c) === i);
                if (f.is_enabled && !channels.length) return Response.json({ error: 'Choose at least one channel' }, { status: 400 });
                const clip = (s, n) => String(s || '').slice(0, n);
                const content = {
                    sms: { body: clip(f.content?.sms?.body ?? a.content?.sms?.body, 600) },
                    email: {
                        subject: clip(f.content?.email?.subject ?? a.content?.email?.subject, 150),
                        heading: clip(f.content?.email?.heading ?? a.content?.email?.heading, 150),
                        body: clip(f.content?.email?.body ?? a.content?.email?.body, 2000),
                        button_text: clip(f.content?.email?.button_text ?? a.content?.email?.button_text ?? 'Order now', 40),
                    },
                    whatsapp: { template_id: f.content?.whatsapp?.template_id ?? a.content?.whatsapp?.template_id ?? null },
                };
                if (f.is_enabled && channels.includes('whatsapp') && content.whatsapp.template_id) {
                    const wa = await approvedWaTemplates(db, restaurantId);
                    if (!wa.templates.some(t => t.id === content.whatsapp.template_id)) {
                        return Response.json({ error: 'That WhatsApp template is not approved for this restaurant\'s number' }, { status: 400 });
                    }
                }
                const s = f.settings || a.settings || {};
                const patch = {
                    is_enabled: !!f.is_enabled,
                    channel_order: channels,
                    sms_provider: ['auto', 'httpsms', 'twilio'].includes(f.sms_provider) ? f.sms_provider : null,
                    content,
                    coupon_mode: f.coupon_mode === 'unique' ? 'unique' : 'none',
                    coupon_config: f.coupon_mode === 'unique' ? {
                        discount_type: f.coupon_config?.discount_type === 'fixed' ? 'fixed' : 'percentage',
                        discount_value: Math.max(0, Math.min(100, Number(f.coupon_config?.discount_value) || 10)),
                        validity_days: Math.max(1, Math.min(90, Number(f.coupon_config?.validity_days) || 14)),
                        minimum_order: Math.max(0, Number(f.coupon_config?.minimum_order) || 0),
                    } : null,
                    cooldown_days: Math.max(0, Math.min(365, Number(f.cooldown_days ?? a.cooldown_days) || 0)),
                    holdout_pct: Math.max(0, Math.min(50, Number(f.holdout_pct ?? a.holdout_pct) || 0)),
                    settings: {
                        ...(a.type === 'second_order' ? { delay_days: Math.max(3, Math.min(60, Number(s.delay_days) || 14)) } : {}),
                        ...(a.type === 'birthday' ? { days_before: Math.max(0, Math.min(14, Number(s.days_before ?? 3))) } : {}),
                        ...(a.type === 'vip_milestone' ? { milestones: (s.milestones || [10, 25, 50]).map(Number).filter(n => n > 1 && n < 1000).slice(0, 6) } : {}),
                    },
                };
                if (patch.is_enabled && !a.is_enabled) patch.enabled_at = new Date().toISOString();
                await db.Automation.update(a.id, patch);
                return Response.json({ success: true });
            }

            default:
                return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (error) {
        console.error('[crmApi] Error:', error?.message);
        return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
    }
});
