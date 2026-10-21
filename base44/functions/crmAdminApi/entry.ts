import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * crmAdminApi — Super Admin's platform-wide CRM. Admin only.
 *
 * POST { action, ... }
 *   overview                     platform totals and a row per restaurant
 *   contacts_list / contact_get  one real person across every restaurant they order from
 *   suppressions_list / suppression_add / suppression_remove
 *   consent_log                  latest consent grants and withdrawals, platform-wide
 *   sar_export                   everything held about a contact (subject access request)
 *   erase                        anonymise a contact everywhere; they stay on the do-not-market list
 *   costs                        messages and cost per restaurant and channel for a month; provider status
 *   approvals_list / campaign_reject
 *   platform_settings_get / platform_settings_save
 * Approving a campaign is done by calling crmApi campaign_send as an admin.
 */

const DAY = 86400000;
const enc = new TextEncoder();
const CHANNELS = ['sms', 'email', 'whatsapp'];
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
async function listAll(entity, query = {}, sort = '-created_date', cap = 20000) {
    const out = [];
    for (let skip = 0; skip < cap; skip += 500) {
        const page = await withRetry(() => entity.filter(query, sort, 500, skip));
        out.push(...page);
        if (page.length < 500) break;
    }
    return out;
}
async function byIds(entity, ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 200) out.push(...await withRetry(() => entity.filter({ id: ids.slice(i, i + 200) })));
    return out;
}
async function sha256Hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function normaliseEmail(raw) {
    const e = String(raw || '').trim().toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
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
const hint = (key, type) => type === 'email' ? key.replace(/^(.).*(@.*)$/, '$1***$2') : `${key.slice(0, 5)}*****${key.slice(-4)}`;
const round2 = (n) => Math.round(n * 100) / 100;
const monthStart = (ym) => {
    const [y, m] = (ym || new Date().toISOString().slice(0, 7)).split('-').map(Number);
    return { from: new Date(Date.UTC(y, m - 1, 1)).toISOString(), to: new Date(Date.UTC(y, m, 1)).toISOString() };
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (user?.role !== 'admin') return Response.json({ error: 'Super Admin only' }, { status: 403 });
        const db = base44.asServiceRole.entities;
        const body = await req.json().catch(() => ({}));
        const restaurants = await listAll(db.Restaurant, {}, 'name');
        const rName = new Map(restaurants.map(r => [r.id, r.name]));

        switch (body.action) {
            // ── Overview ──
            case 'overview': {
                const { from, to } = monthStart(body.month);
                const [profiles, contacts, jobs, automations, suppressions, pending] = await Promise.all([
                    listAll(db.CustomerProfile), listAll(db.Contact),
                    listAll(db.MessageJob, { sent_at: { $gte: from, $lt: to } }),
                    listAll(db.Automation, { is_enabled: true }), listAll(db.Suppression),
                    db.Campaign.filter({ status: 'pending_approval' }),
                ]);
                const live = profiles.filter(p => !p.merged_into && !p.is_anonymised && p.order_count > 0);
                const real = jobs.filter(j => !j.is_test && SENT.includes(j.status) || j.status === 'converted');
                const perRestaurant = new Map();
                const row = (id) => {
                    if (!perRestaurant.has(id)) perRestaurant.set(id, { restaurant_id: id, name: rName.get(id) || id, customers: 0, marketable: 0, at_risk: 0, spend: 0, sent: 0, converted: 0, revenue: 0, cost_pence: 0, automations_on: 0 });
                    return perRestaurant.get(id);
                };
                live.forEach(p => {
                    const r = row(p.restaurant_id);
                    r.customers++; r.spend += p.total_spend || 0;
                    if (p.marketing_eligible !== false && CHANNELS.some(c => p.consent?.[c])) r.marketable++;
                    if (p.lifecycle_stage === 'at_risk') r.at_risk++;
                });
                real.forEach(j => {
                    const r = row(j.restaurant_id);
                    r.sent++; r.cost_pence += Number(j.cost_pence) || 0;
                    if (j.status === 'converted') { r.converted++; r.revenue += Number(j.converted_total) || 0; }
                });
                automations.forEach(a => { row(a.restaurant_id).automations_on++; });
                const byChannel = {};
                real.forEach(j => {
                    const k = j.channel === 'sms' ? `sms:${j.provider || 'unknown'}` : j.channel;
                    byChannel[k] = byChannel[k] || { sent: 0, cost_pence: 0 };
                    byChannel[k].sent++; byChannel[k].cost_pence += Number(j.cost_pence) || 0;
                });
                const consent = {};
                CHANNELS.forEach(c => { consent[c] = live.filter(p => p.consent?.[c] && p.marketing_eligible !== false).length; });
                return Response.json({
                    totals: {
                        contacts: contacts.filter(c => !c.merged_into).length,
                        profiles: live.length,
                        consent,
                        suppressed: suppressions.length,
                        sent: real.length,
                        converted: real.filter(j => j.status === 'converted').length,
                        revenue: round2(real.filter(j => j.status === 'converted').reduce((s, j) => s + (Number(j.converted_total) || 0), 0)),
                        cost_pence: real.reduce((s, j) => s + (Number(j.cost_pence) || 0), 0),
                        pending_approvals: pending.length,
                        automations_on: automations.length,
                    },
                    by_channel: byChannel,
                    restaurants: [...perRestaurant.values()].map(r => ({ ...r, spend: round2(r.spend), revenue: round2(r.revenue) }))
                        .sort((a, b) => b.customers - a.customers),
                });
            }

            // ── People across restaurants ──
            case 'contacts_list': {
                const { search = '', restaurant_id, page = 1, page_size = 50 } = body;
                const [contacts, profiles] = await Promise.all([listAll(db.Contact), listAll(db.CustomerProfile)]);
                const profByContact = new Map();
                profiles.filter(p => !p.merged_into).forEach(p => {
                    if (!profByContact.has(p.contact_id)) profByContact.set(p.contact_id, []);
                    profByContact.get(p.contact_id).push(p);
                });
                const q = String(search).trim().toLowerCase();
                const qPhone = normalisePhone(q);
                let rows = contacts.filter(c => !c.merged_into).map(c => {
                    const ps = profByContact.get(c.id) || [];
                    return {
                        id: c.id,
                        name: c.name || ps.find(p => p.display_name)?.display_name || 'Customer',
                        phone: c.phone_e164 || '', email: c.email_lower || '',
                        restaurants: ps.map(p => ({ id: p.restaurant_id, name: rName.get(p.restaurant_id) || p.restaurant_id, stage: p.lifecycle_stage })),
                        orders: ps.reduce((s, p) => s + (p.order_count || 0), 0),
                        spend: round2(ps.reduce((s, p) => s + (p.total_spend || 0), 0)),
                        last_order_at: ps.map(p => p.last_order_at).filter(Boolean).sort().pop() || null,
                        anonymised: ps.length > 0 && ps.every(p => p.is_anonymised),
                    };
                });
                if (restaurant_id) rows = rows.filter(r => r.restaurants.some(x => x.id === restaurant_id));
                if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.email.includes(q) || (qPhone && r.phone === qPhone) || r.phone.replace('+44', '0').includes(q.replace(/\s/g, '')));
                rows.sort((a, b) => b.spend - a.spend);
                const start = (Math.max(1, page) - 1) * page_size;
                return Response.json({ total: rows.length, page, page_size, contacts: rows.slice(start, start + page_size) });
            }

            case 'contact_get': {
                const c = (await db.Contact.filter({ id: body.contact_id }))[0];
                if (!c) return Response.json({ error: 'Contact not found' }, { status: 404 });
                const profiles = (await db.CustomerProfile.filter({ contact_id: c.id })).filter(p => !p.merged_into);
                const pids = profiles.map(p => p.id);
                const [consent, jobs] = await Promise.all([
                    pids.length ? withRetry(() => db.ConsentRecord.filter({ profile_id: pids }, '-created_date', 100)) : [],
                    pids.length ? withRetry(() => db.MessageJob.filter({ profile_id: pids }, '-created_date', 50)) : [],
                ]);
                const suppressed = {};
                const keys = [c.phone_e164, c.email_lower].filter(Boolean);
                for (const k of keys) {
                    const rows = await db.Suppression.filter({ key_hash: await sha256Hex(k) });
                    rows.forEach(r => { suppressed[r.channel] = { reason: r.reason, at: r.created_date }; });
                }
                return Response.json({
                    contact: { id: c.id, name: c.name, phone: c.phone_e164, email: c.email_lower, platform_consent: c.platform_consent || {} },
                    profiles: profiles.map(p => ({
                        id: p.id, restaurant_id: p.restaurant_id, restaurant: rName.get(p.restaurant_id) || p.restaurant_id,
                        name: p.display_name, stage: p.lifecycle_stage, is_vip: !!p.is_vip, orders: p.order_count, spend: p.total_spend,
                        last_order_at: p.last_order_at, consent: p.consent || {}, emails: p.emails || [], anonymised: !!p.is_anonymised,
                        marketing_eligible: p.marketing_eligible !== false,
                    })),
                    suppressed,
                    consent_history: consent.map(r => ({ restaurant: rName.get(r.restaurant_id) || r.scope, channel: r.channel, action: r.action, method: r.method, at: r.at || r.created_date, captured_by: r.captured_by, wording: r.wording_version })),
                    messages: jobs.map(j => ({ restaurant: rName.get(j.restaurant_id), channel: j.channel, status: j.status, sent_at: j.sent_at, body: j.rendered_body, campaign_id: j.campaign_id, automation_id: j.automation_id })),
                });
            }

            // ── Compliance ──
            case 'suppressions_list': {
                const q = String(body.search || '').trim();
                let rows;
                if (q) {
                    const key = normaliseEmail(q) || normalisePhone(q);
                    rows = key ? await db.Suppression.filter({ key_hash: await sha256Hex(key) }) : [];
                } else {
                    rows = await db.Suppression.filter(body.channel ? { channel: body.channel } : {}, '-created_date', 300);
                }
                return Response.json({
                    suppressions: rows.map(s => ({ id: s.id, hint: s.key_hint, type: s.key_type, channel: s.channel, reason: s.reason, restaurant: rName.get(s.restaurant_id) || null, at: s.created_date, notes: s.notes })),
                });
            }

            case 'suppression_add': {
                const key = normaliseEmail(body.value) || normalisePhone(body.value);
                if (!key) return Response.json({ error: 'Enter a valid email or UK mobile number' }, { status: 400 });
                const type = key.includes('@') ? 'email' : 'phone';
                const channels = (body.channels || (type === 'email' ? ['email'] : ['sms', 'whatsapp'])).filter(c => CHANNELS.includes(c));
                const key_hash = await sha256Hex(key);
                for (const channel of channels) {
                    if ((await db.Suppression.filter({ key_hash, channel })).length) continue;
                    await db.Suppression.create({ key_hash, key_type: type, key_hint: hint(key, type), channel, scope: 'global', reason: 'admin', source_ref: user.email, notes: String(body.note || '').slice(0, 300) });
                }
                // Mirror into the consent ledger of every matching profile
                const profiles = type === 'email' ? await db.CustomerProfile.filter({ emails: key }) : await db.CustomerProfile.filter({ phone_e164: key });
                const at = new Date().toISOString();
                for (const p of profiles) {
                    for (const ch of channels) {
                        await db.ConsentRecord.create({ contact_id: p.contact_id || null, profile_id: p.id, restaurant_id: p.restaurant_id, scope: p.restaurant_id, channel: ch, action: 'withdraw', method: 'admin', wording_version: String(body.note || 'Super Admin opt-out').slice(0, 200), captured_by: user.email, at });
                    }
                    const consent = { ...(p.consent || {}) };
                    channels.forEach(ch => { consent[ch] = false; });
                    await db.CustomerProfile.update(p.id, { consent, consent_updated_at: at });
                }
                return Response.json({ success: true, channels, profiles_updated: profiles.length });
            }

            case 'suppression_remove': {
                const s = (await db.Suppression.filter({ id: body.suppression_id }))[0];
                if (!s) return Response.json({ success: true });
                // An opt-out the customer made themselves can only be lifted by the customer opting in again.
                if (s.reason !== 'admin') return Response.json({ error: `This opt-out came from the customer (${s.reason}) and can't be removed here` }, { status: 400 });
                await db.Suppression.delete(s.id);
                return Response.json({ success: true });
            }

            case 'consent_log': {
                const rows = await db.ConsentRecord.filter(body.method ? { method: body.method } : {}, '-created_date', 300);
                const profiles = await byIds(db.CustomerProfile, [...new Set(rows.map(r => r.profile_id).filter(Boolean))]);
                const pName = new Map(profiles.map(p => [p.id, p.is_anonymised ? 'Erased customer' : (p.display_name || 'Customer')]));
                return Response.json({
                    records: rows.map(r => ({
                        at: r.at || r.created_date, customer: pName.get(r.profile_id) || '—', restaurant: rName.get(r.restaurant_id) || r.scope,
                        channel: r.channel, action: r.action, method: r.method, captured_by: r.captured_by, wording: r.wording_version,
                    })),
                });
            }

            case 'sar_export': {
                const c = (await db.Contact.filter({ id: body.contact_id }))[0];
                if (!c) return Response.json({ error: 'Contact not found' }, { status: 404 });
                const profiles = await db.CustomerProfile.filter({ contact_id: c.id });
                const orderIds = profiles.flatMap(p => p.order_ids || []);
                const orders = await byIds(db.Order, orderIds);
                const pids = profiles.map(p => p.id);
                const [consent, jobs] = await Promise.all([
                    pids.length ? listAll(db.ConsentRecord, { profile_id: pids }) : [],
                    pids.length ? listAll(db.MessageJob, { profile_id: pids }) : [],
                ]);
                return Response.json({
                    generated_at: new Date().toISOString(),
                    generated_by: user.email,
                    person: { name: c.name, phone: c.phone_e164, email: c.email_lower },
                    restaurants: profiles.map(p => ({
                        restaurant: rName.get(p.restaurant_id), first_order_at: p.first_order_at, last_order_at: p.last_order_at,
                        order_count: p.order_count, total_spend: p.total_spend, emails: p.emails, phone: p.phone_e164,
                        addresses: p.addresses, tags: p.tags, notes: p.notes, birthday: p.birthday, marketing_consent: p.consent,
                    })),
                    orders: orders.map(o => ({
                        date: o.created_date, restaurant: rName.get(o.restaurant_id), status: o.status, total: o.total, order_type: o.order_type,
                        items: (o.items || []).map(i => `${i.quantity}x ${i.name}`), delivery_address: o.delivery_address,
                        name: o.guest_name, phone: o.phone || o.customer_phone, email: o.customer_email || o.guest_email,
                    })),
                    consent_history: consent.map(r => ({ restaurant: rName.get(r.restaurant_id) || r.scope, channel: r.channel, action: r.action, method: r.method, at: r.at || r.created_date, wording: r.wording_version })),
                    marketing_messages: jobs.filter(j => !j.is_test).map(j => ({ restaurant: rName.get(j.restaurant_id), channel: j.channel, status: j.status, sent_at: j.sent_at, text: j.rendered_body })),
                });
            }

            case 'erase': {
                if (body.confirm !== 'ERASE') return Response.json({ error: 'Type ERASE to confirm' }, { status: 400 });
                const c = (await db.Contact.filter({ id: body.contact_id }))[0];
                if (!c) return Response.json({ error: 'Contact not found' }, { status: 404 });
                const profiles = await db.CustomerProfile.filter({ contact_id: c.id });
                const keys = new Set([c.phone_e164, c.email_lower, ...profiles.flatMap(p => [p.phone_e164, ...(p.emails || [])])].filter(Boolean));

                // 1. Never market to them again, on any channel
                for (const k of keys) {
                    const type = k.includes('@') ? 'email' : 'phone';
                    const key_hash = await sha256Hex(k);
                    if (!(await db.Suppression.filter({ key_hash, channel: 'all' })).length) {
                        await db.Suppression.create({ key_hash, key_type: type, key_hint: hint(k, type), channel: 'all', scope: 'global', reason: 'erased', source_ref: user.email });
                    }
                }
                // 2. Orders keep their money and items (accounting) but lose the personal details
                const orderIds = profiles.flatMap(p => p.order_ids || []);
                const orders = await byIds(db.Order, orderIds);
                for (const o of orders) {
                    await withRetry(() => db.Order.update(o.id, {
                        guest_name: 'Erased customer', phone: null, customer_phone: null, customer_email: null, guest_email: null,
                        delivery_address: o.order_type === 'delivery' ? 'Address removed' : o.delivery_address,
                    }));
                    await sleep(300);
                }
                // 3. Profiles, contact and message history
                for (const p of profiles) {
                    await db.CustomerProfile.update(p.id, {
                        display_name: 'Erased customer', phone_e164: null, phone_raw: null, emails: [], addresses: [], notes: '',
                        tags: [], birthday: '', is_anonymised: true, consent: { sms: false, email: false, whatsapp: false },
                    });
                    for (const j of await listAll(db.MessageJob, { profile_id: p.id })) {
                        if (j.to) await withRetry(() => db.MessageJob.update(j.id, { to: '[erased]', rendered_body: '' }));
                    }
                }
                await db.Contact.update(c.id, { name: 'Erased customer', phone_e164: null, email_lower: null });
                console.log(`[crmAdminApi] contact ${c.id} erased by ${user.email}: ${profiles.length} profiles, ${orders.length} orders`);
                return Response.json({ success: true, profiles: profiles.length, orders: orders.length });
            }

            // ── Channels & costs ──
            case 'costs': {
                const { from, to } = monthStart(body.month);
                const jobs = (await listAll(db.MessageJob, { sent_at: { $gte: from, $lt: to } })).filter(j => !j.is_test);
                const rows = new Map();
                jobs.filter(j => SENT.includes(j.status) || j.status === 'converted').forEach(j => {
                    const k = j.restaurant_id;
                    if (!rows.has(k)) rows.set(k, { restaurant_id: k, name: rName.get(k) || k, sms_httpsms: 0, sms_twilio: 0, email: 0, whatsapp: 0, cost_pence: 0, revenue: 0 });
                    const r = rows.get(k);
                    if (j.channel === 'sms') r[j.provider === 'twilio' ? 'sms_twilio' : 'sms_httpsms']++;
                    else if (j.channel === 'email') r.email++;
                    else r.whatsapp++;
                    r.cost_pence += Number(j.cost_pence) || 0;
                    if (j.status === 'converted') r.revenue += Number(j.converted_total) || 0;
                });
                const failed = jobs.filter(j => j.status === 'failed');
                // Provider status
                let twilio = { configured: false };
                const sid = Deno.env.get('TWILIO_ACCOUNT_SID'), tok = Deno.env.get('TWILIO_AUTH_TOKEN');
                if (sid && tok) {
                    twilio = { configured: true };
                    try {
                        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`, { headers: { Authorization: 'Basic ' + btoa(`${sid}:${tok}`) } });
                        if (r.ok) { const d = await r.json(); twilio.balance = `${d.balance} ${d.currency}`; }
                    } catch { /* balance is optional */ }
                }
                const waChannels = await db.WhatsAppChannel.filter({});
                const waTemplates = await db.WaTemplate.filter({ category: 'MARKETING' }).catch(() => []);
                return Response.json({
                    month: (body.month || new Date().toISOString().slice(0, 7)),
                    restaurants: [...rows.values()].map(r => ({ ...r, revenue: round2(r.revenue) })).sort((a, b) => b.cost_pence - a.cost_pence),
                    failures: { total: failed.length, sample: failed.slice(0, 10).map(j => ({ restaurant: rName.get(j.restaurant_id), channel: j.channel, provider: j.provider, error: j.error, at: j.updated_date })) },
                    providers: {
                        httpsms: { configured: !!(Deno.env.get('HTTPSMS_API_KEY') && Deno.env.get('HTTPSMS_FROM')) },
                        twilio,
                        email: { configured: true, note: 'Base44 SendEmail (no bounce tracking yet)' },
                        whatsapp: {
                            numbers: waChannels.map(w => ({ restaurant: rName.get(w.restaurant_id) || w.restaurant_name, number: w.display_phone_number, status: w.status })),
                            marketing_templates: waTemplates.map(t => ({ name: t.name, approvals: (t.submissions || []).map(s => s.status) })),
                        },
                    },
                });
            }

            // ── Approvals ──
            case 'approvals_list': {
                const rows = await db.Campaign.filter({ status: 'pending_approval' }, '-updated_date', 100);
                return Response.json({
                    campaigns: rows.map(c => ({
                        id: c.id, restaurant_id: c.restaurant_id, restaurant: rName.get(c.restaurant_id) || c.restaurant_id,
                        name: c.name, channel: c.channel, segment_name: c.segment_name, subject: c.subject, body: c.body,
                        coupon_mode: c.coupon_mode, coupon_code: c.coupon_code, coupon_config: c.coupon_config,
                        reason: c.approval_reason, created_by: c.created_by_email, requested_at: c.updated_date, schedule_at: c.schedule_at,
                    })),
                });
            }

            case 'campaign_reject': {
                const c = (await db.Campaign.filter({ id: body.campaign_id }))[0];
                if (!c || c.status !== 'pending_approval') return Response.json({ error: 'Campaign is not waiting for approval' }, { status: 400 });
                const reason = String(body.reason || '').trim();
                if (!reason) return Response.json({ error: 'Give a reason so the restaurant can fix it' }, { status: 400 });
                await db.Campaign.update(c.id, { status: 'draft', rejection_reason: reason.slice(0, 300) });
                return Response.json({ success: true });
            }

            case 'platform_settings_get': {
                const s = (await db.CRMSettings.filter({ restaurant_id: 'platform' }))[0] || {};
                return Response.json({ approval_first_n: s.approval_first_n || 0, approval_over_pence: s.approval_over_pence || 0 });
            }

            case 'platform_settings_save': {
                const data = {
                    restaurant_id: 'platform',
                    approval_first_n: Math.max(0, Math.min(20, Number(body.approval_first_n) || 0)),
                    approval_over_pence: Math.max(0, Math.round(Number(body.approval_over_pence) || 0)),
                };
                const s = (await db.CRMSettings.filter({ restaurant_id: 'platform' }))[0];
                if (s) await db.CRMSettings.update(s.id, data); else await db.CRMSettings.create(data);
                return Response.json({ success: true });
            }

            default:
                return Response.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
        }
    } catch (error) {
        console.error('[crmAdminApi] Error:', error?.message);
        return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
    }
});
