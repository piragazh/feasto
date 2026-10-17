import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * crmIngestOrder — keeps the CRM customer store in step with orders.
 *
 * MODES
 *   { orderId }            One order (fired by the "CRM: Ingest Order" workflow on every Order
 *                          create/update). Resolves who the customer is, links the order to a
 *                          CustomerProfile + Contact, records any marketing consent given with the
 *                          order, and recalculates that profile's stats and lifecycle stage.
 *   { mode: 'backfill' }   Admin / scheduler. Links every order that has contact details, migrates
 *                          old Customer records, and recalculates EVERY profile. Idempotent, so it
 *                          also runs nightly to move customers between stages as time passes
 *                          (Active -> At risk -> Lapsed happens with no new order).
 *
 * IDENTITY (one profile per real person per restaurant)
 *   Phone normalised to E.164 first, then lowercase email. order.created_by is never used: for
 *   online orders it is the Base44 service account. The same person at two restaurants = two
 *   profiles under one Contact.
 *
 * SAFE NO MATTER WHO CALLS IT (single-order mode)
 *   Takes only an order id and reads everything from the database; the most any caller can do is
 *   trigger a recalculation that would have happened anyway. Same pattern as applyOrderStock.
 *
 * NEVER WRITES TO ORDER
 *   Every Order update fires five other workflows (stock, loyalty, Uber, notifications, WhatsApp).
 *   Linking is stored on the profile (CustomerProfile.order_ids) instead, so the CRM can rebuild
 *   itself at any time without disturbing order processing. (Order.crm_profile_id exists on a
 *   handful of orders from the first backfill attempt and is only read, never written.)
 */

const COMPLETED = new Set([
    'confirmed', 'preparing', 'ready_for_collection', 'out_for_delivery', 'delivered', 'collected',
    // money was taken; a refund request is not a refund
    'refund_requested', 'refund_rejected_by_restaurant', 'refund_under_platform_review',
]);
const DAY = 86400000;
const CHANNELS = ['sms', 'email', 'whatsapp'];
const SCHEDULED_SECRET = Deno.env.get('SCHEDULED_DIGEST_SECRET') || '';

// ── Normalisation ─────────────────────────────────────────────────────────
function normaliseEmail(raw) {
    const e = String(raw || '').trim().toLowerCase();
    if (!e.includes('@') || e.endsWith('@no-reply.base44.com') || e === 'deleted_user@deleted') return null;
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

const isMarketplace = (o) => o?.order_source === 'third_party' || !!o?.third_party_platform;
const ts = (d) => new Date(d).getTime();
const round2 = (n) => Math.round(n * 100) / 100;
const firstToken = (s) => String(s || '').trim().toLowerCase().split(/\s+/)[0] || '';

function contactOf(order) {
    return {
        phone: normalisePhone(order.phone || order.customer_phone),
        email: normaliseEmail(order.customer_email) || normaliseEmail(order.guest_email),
        name: String(order.guest_name || '').trim() || null,
    };
}

// The entity API is rate limited. Every call retries with back-off on a rate-limit error, and
// backfill writes are paced so a full rebuild does not trip the limit in the first place.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function withRetry(fn) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn();
        } catch (e) {
            if (attempt < 6 && /rate limit|429|too many/i.test(String(e?.message || e))) {
                await sleep(1000 * 2 ** attempt);
                continue;
            }
            throw e;
        }
    }
}
const WRITE_GAP_MS = 250;
let lastWrite = 0;
async function write(fn) {
    const wait = lastWrite + WRITE_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastWrite = Date.now();
    return withRetry(fn);
}

async function listAll(entity, query = {}, sort = 'created_date') {
    const out = [];
    for (let skip = 0; ; skip += 500) {
        const page = await withRetry(() => entity.filter(query, sort, 500, skip));
        out.push(...page);
        if (page.length < 500) break;
    }
    return out;
}

// Fingerprint of what a profile update would change, so an unchanged profile is not rewritten.
const fingerprint = (o) => JSON.stringify([
    o.order_count, o.total_spend, o.last_order_at, o.first_order_at, o.lifecycle_stage, o.is_vip,
    o.rfm, o.consent, o.contact_id, o.phone_e164, o.emails, o.display_name, o.marketing_eligible,
    o.favourite_items, o.addresses, o.avg_days_between_orders, [...(o.order_ids || [])].sort(),
]);

// ── Stats and lifecycle ───────────────────────────────────────────────────
function computeStats(orders, now) {
    const all = [...orders].sort((a, b) => ts(b.created_date) - ts(a.created_date)); // newest first
    const done = all.filter(o => COMPLETED.has(o.status)).reverse();              // oldest first
    const n = done.length;
    const spend = round2(done.reduce((s, o) => s + (Number(o.total) || 0), 0));
    const first = done[0]?.created_date || null;
    const last = done[n - 1]?.created_date || null;
    const avgGap = n > 1 ? (ts(last) - ts(first)) / DAY / (n - 1) : null;
    const daysSinceLast = last ? (now - ts(last)) / DAY : null;

    const recent = done.filter(o => now - ts(o.created_date) <= 180 * DAY);
    const recentSpend = recent.reduce((s, o) => s + (Number(o.total) || 0), 0);

    let stage = 'prospect';
    if (n > 0) {
        if (daysSinceLast >= 90) stage = 'lapsed';
        else if (n === 1 && daysSinceLast <= 30) stage = 'new';
        else if (daysSinceLast > Math.max(30, 2 * (avgGap || 30))) stage = 'at_risk';
        else stage = 'active';
    }

    const bucket = (v, steps) => { let s = 1; steps.forEach((t, i) => { if (v >= t) s = i + 2; }); return s; };
    const rfm = n === 0 ? null : {
        r: daysSinceLast <= 14 ? 5 : daysSinceLast <= 30 ? 4 : daysSinceLast <= 60 ? 3 : daysSinceLast <= 90 ? 2 : 1,
        f: bucket(recent.length, [2, 3, 6, 12]),
        m: bucket(recentSpend, [30, 75, 150, 300]),
    };

    const items = {};
    done.forEach(o => (o.items || []).forEach(it => {
        if (!it?.name) return;
        items[it.name] = (items[it.name] || 0) + (Number(it.quantity) || 1);
    }));
    const favourite_items = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([name, quantity]) => ({ name, quantity }));

    const order_sources = { online: 0, pos: 0, kiosk: 0, table: 0, third_party: 0 };
    const order_types = { delivery: 0, collection: 0, dine_in: 0 };
    done.forEach(o => {
        const src = isMarketplace(o) ? 'third_party' : o.table_id ? 'table' : (o.order_source || 'online');
        order_sources[src] = (order_sources[src] || 0) + 1;
        const t = o.order_type === 'takeaway' ? 'collection' : (o.order_type || 'delivery');
        order_types[t] = (order_types[t] || 0) + 1;
    });

    const addresses = [];
    for (const o of all) {
        const a = String(o.delivery_address || '').trim();
        if (!a || o.order_type !== 'delivery' || a === 'Address removed' || a === 'Address not provided') continue;
        if (addresses.some(x => x.address.toLowerCase() === a.toLowerCase())) continue;
        addresses.push({ address: a, last_used_at: o.created_date });
        if (addresses.length === 5) break;
    }

    return {
        display_name: all.find(o => String(o.guest_name || '').trim())?.guest_name?.trim() || undefined,
        phone_raw: all.find(o => o.phone || o.customer_phone)?.phone || all.find(o => o.customer_phone)?.customer_phone || undefined,
        first_order_at: first,
        last_order_at: last,
        order_count: n,
        total_spend: spend,
        avg_order_value: n ? round2(spend / n) : 0,
        avg_days_between_orders: avgGap === null ? null : Math.round(avgGap * 10) / 10,
        favourite_items,
        order_sources,
        order_types,
        addresses,
        lifecycle_stage: stage,
        is_vip: recent.length >= 10 || recentSpend >= 300,
        rfm,
        marketing_eligible: all.some(o => !isMarketplace(o)),
        stats_updated_at: new Date(now).toISOString(),
    };
}

function currentConsent(records) {
    const latest = {};
    for (const r of records) {
        const prev = latest[r.channel];
        if (!prev || ts(r.at || r.created_date) >= ts(prev.at || prev.created_date)) latest[r.channel] = r;
    }
    const consent = {};
    CHANNELS.forEach(ch => { consent[ch] = latest[ch]?.action === 'grant'; });
    return consent;
}

function consentGrantsFromOrder(order, profile, contactId) {
    const mo = order.marketing_opt_in;
    if (!mo || typeof mo !== 'object') return [];
    return CHANNELS.filter(ch => mo[ch] === true).map(ch => ({
        contact_id: contactId,
        profile_id: profile.id,
        restaurant_id: order.restaurant_id,
        scope: order.restaurant_id,
        channel: ch,
        action: 'grant',
        method: ['checkout_tickbox', 'pos_verbal', 'soft_opt_in', 'whatsapp_optin'].includes(mo.method) ? mo.method : 'checkout_tickbox',
        wording_version: mo.wording_version || 'v1',
        source_ref: order.id,
        captured_by: mo.captured_by || null,
        at: order.created_date || new Date().toISOString(),
    }));
}

// ── Contacts ──────────────────────────────────────────────────────────────
async function ensureContact(db, { phone, email, name, profileId, restaurantId }) {
    let contact = null;
    if (phone) contact = (await db.Contact.filter({ phone_e164: phone }))[0] || null;
    if (!contact && email) contact = (await db.Contact.filter({ email_lower: email }))[0] || null;
    if (!contact) {
        return db.Contact.create({
            phone_e164: phone || null, email_lower: email || null, name: name || null,
            profile_ids: [profileId], restaurant_ids: [restaurantId],
            platform_consent: { sms: false, email: false, whatsapp: false },
        });
    }
    const patch = {};
    if (phone && !contact.phone_e164) patch.phone_e164 = phone;
    if (email && !contact.email_lower) patch.email_lower = email;
    if (name && !contact.name) patch.name = name;
    if (!(contact.profile_ids || []).includes(profileId)) patch.profile_ids = [...(contact.profile_ids || []), profileId];
    if (!(contact.restaurant_ids || []).includes(restaurantId)) patch.restaurant_ids = [...(contact.restaurant_ids || []), restaurantId];
    if (Object.keys(patch).length) contact = { ...contact, ...(await db.Contact.update(contact.id, patch)), ...patch };
    return contact;
}

// ── Single order ──────────────────────────────────────────────────────────
async function ingestOne(db, orderId) {
    const order = (await db.Order.filter({ id: orderId }))[0];
    if (!order) return { skipped: 'order_not_found' };
    if (!order.restaurant_id) return { skipped: 'no_restaurant' };
    const restaurantId = order.restaurant_id;
    const { phone, email, name } = contactOf(order);

    let profile = (await withRetry(() => db.CustomerProfile.filter({ order_ids: order.id })))[0] || null;
    if (!profile && order.crm_profile_id) {
        profile = (await db.CustomerProfile.filter({ id: order.crm_profile_id }))[0] || null;
    }
    if (profile?.merged_into) profile = (await db.CustomerProfile.filter({ id: profile.merged_into }))[0] || profile;
    if (!profile && !phone && !email) return { skipped: 'no_contact_details' };
    if (!profile && phone) profile = (await db.CustomerProfile.filter({ restaurant_id: restaurantId, phone_e164: phone }))[0] || null;
    if (!profile && email) profile = (await db.CustomerProfile.filter({ restaurant_id: restaurantId, emails: email }))[0] || null;

    let created = false;
    if (!profile) {
        profile = await db.CustomerProfile.create({
            restaurant_id: restaurantId,
            phone_e164: phone || null,
            emails: email ? [email] : [],
            display_name: name,
            consent: { sms: false, email: false, whatsapp: false },
            lifecycle_stage: 'prospect',
        });
        created = true;
    }

    // Identity enrichment
    const patch = {};
    if (phone && !profile.phone_e164) patch.phone_e164 = phone;
    const emails = profile.emails || [];
    if (email && !emails.includes(email)) {
        if (phone && profile.phone_e164 === phone && emails.length && name && profile.display_name
            && firstToken(name) !== firstToken(profile.display_name)) {
            patch.possible_shared_number = true;
        }
        patch.emails = [...emails, email];
    }

    const contact = await ensureContact(db, {
        phone: patch.phone_e164 || profile.phone_e164, email: (patch.emails || emails)[0] || email,
        name, profileId: profile.id, restaurantId,
    });
    if (profile.contact_id !== contact.id) patch.contact_id = contact.id;

    const orderIds = profile.order_ids || [];
    if (!orderIds.includes(order.id)) patch.order_ids = [...orderIds, order.id];

    // Consent captured with this order (once per order + channel)
    for (const grant of consentGrantsFromOrder(order, profile, contact.id)) {
        const exists = await db.ConsentRecord.filter({ source_ref: order.id, channel: grant.channel, action: 'grant' });
        if (!exists.length) await db.ConsentRecord.create(grant);
    }

    // Recalculate from every order linked to this profile
    const ids = patch.order_ids || orderIds;
    const orders = [];
    for (let i = 0; i < ids.length; i += 200) {
        orders.push(...await withRetry(() => db.Order.filter({ id: ids.slice(i, i + 200) })));
    }
    if (!orders.some(o => o.id === order.id)) orders.push(order);
    const stats = computeStats(orders, Date.now());
    const consentRecords = await db.ConsentRecord.filter({ profile_id: profile.id, scope: restaurantId });
    const consent = currentConsent(consentRecords);

    await db.CustomerProfile.update(profile.id, {
        ...patch, ...stats, consent,
        display_name: stats.display_name || profile.display_name || name || null,
    });
    return { profile_id: profile.id, contact_id: contact.id, created, stage: stats.lifecycle_stage };
}

// ── Backfill / nightly refresh ────────────────────────────────────────────
async function backfill(db) {
    const now = Date.now();
    // Stays inside the function time limit. Every step skips work already done, so a partial run
    // is simply continued by the next one (run it again, or let the nightly schedule finish it).
    const BUDGET_MS = 110000;
    const outOfTime = () => Date.now() - now > BUDGET_MS;
    const partial = (step) => ({ partial: true, stopped_at: step, message: 'Time budget reached; run again to continue.' });
    const [orders, profiles, contacts, consentRecords, legacyCustomers] = await Promise.all([
        listAll(db.Order),
        listAll(db.CustomerProfile),
        listAll(db.Contact),
        listAll(db.ConsentRecord),
        listAll(db.Customer).catch(() => []),
    ]);

    const byId = new Map(profiles.map(p => [p.id, p]));
    // Snapshot as stored, before the in-memory enrichment below, to decide what really changed.
    const original = new Map(profiles.map(p => [p.id, JSON.parse(JSON.stringify(p))]));
    const byPhone = new Map(), byEmail = new Map();
    const index = (p) => {
        if (p.merged_into) return;
        if (p.phone_e164) byPhone.set(`${p.restaurant_id}|${p.phone_e164}`, p);
        (p.emails || []).forEach(e => byEmail.set(`${p.restaurant_id}|${e}`, p));
    };
    profiles.forEach(index);

    const patches = new Map();               // profile id -> identity patch
    const assigned = new Map();              // profile id -> orders
    const linkedTo = new Map();              // order id -> profile id, as currently stored
    profiles.forEach(p => (p.order_ids || []).forEach(id => linkedTo.set(id, p.id)));
    const patchOf = (p) => { if (!patches.has(p.id)) patches.set(p.id, {}); return patches.get(p.id); };
    let createdProfiles = 0;

    // 1. Resolve every order to a profile (oldest first, so names/emails accrue in order)
    for (const order of orders) {
        if (!order.restaurant_id) continue;
        const { phone, email, name } = contactOf(order);
        const knownId = linkedTo.get(order.id) || order.crm_profile_id;
        let p = knownId ? byId.get(knownId) : null;
        if (p?.merged_into) p = byId.get(p.merged_into) || p;
        if (!p && !phone && !email) continue;
        if (!p && phone) p = byPhone.get(`${order.restaurant_id}|${phone}`) || null;
        if (!p && email) p = byEmail.get(`${order.restaurant_id}|${email}`) || null;
        if (!p) {
            if (outOfTime()) return partial('profiles');
            p = await write(() => db.CustomerProfile.create({
                restaurant_id: order.restaurant_id, phone_e164: phone || null, emails: email ? [email] : [],
                display_name: name, consent: { sms: false, email: false, whatsapp: false }, lifecycle_stage: 'prospect',
            }));
            createdProfiles++;
            byId.set(p.id, p);
        }
        // identity enrichment, applied in memory so later orders match
        if (phone && !p.phone_e164) { p.phone_e164 = phone; patchOf(p).phone_e164 = phone; }
        if (email && !(p.emails || []).includes(email)) {
            if (phone && p.phone_e164 === phone && (p.emails || []).length && name && p.display_name
                && firstToken(name) !== firstToken(p.display_name)) {
                p.possible_shared_number = true; patchOf(p).possible_shared_number = true;
            }
            p.emails = [...(p.emails || []), email]; patchOf(p).emails = p.emails;
        }
        if (name && !p.display_name) p.display_name = name;
        index(p);
        if (!assigned.has(p.id)) assigned.set(p.id, []);
        assigned.get(p.id).push(order);
    }

    // 2. Legacy Customer records (POS phone customers) -> profiles
    let migratedCustomers = 0;
    for (const c of legacyCustomers) {
        const phone = normalisePhone(c.phone_number);
        const email = normaliseEmail(c.email);
        if (!c.restaurant_id || (!phone && !email)) continue;
        let p = (phone && byPhone.get(`${c.restaurant_id}|${phone}`)) || (email && byEmail.get(`${c.restaurant_id}|${email}`)) || null;
        if (p?.legacy_customer_id === c.id) continue;
        if (!p) {
            if (outOfTime()) return partial('legacy_customers');
            p = await write(() => db.CustomerProfile.create({
                restaurant_id: c.restaurant_id, phone_e164: phone || null, emails: email ? [email] : [],
                display_name: c.full_name || null, consent: { sms: false, email: false, whatsapp: false },
                lifecycle_stage: 'prospect',
            }));
            createdProfiles++;
            byId.set(p.id, p); index(p);
            assigned.set(p.id, assigned.get(p.id) || []);
        }
        const pp = patchOf(p);
        pp.legacy_customer_id = c.id;
        if (c.notes && !p.notes) pp.notes = c.notes;
        if (c.full_name && !p.display_name) { p.display_name = c.full_name; }
        migratedCustomers++;
    }

    // 3. Contacts
    const cByPhone = new Map(), cByEmail = new Map();
    contacts.forEach(c => { if (c.phone_e164) cByPhone.set(c.phone_e164, c); if (c.email_lower) cByEmail.set(c.email_lower, c); });
    let createdContacts = 0;
    const contactPatches = new Map();
    for (const p of byId.values()) {
        if (p.merged_into) continue;
        const email = (p.emails || [])[0] || null;
        let c = (p.phone_e164 && cByPhone.get(p.phone_e164)) || (email && cByEmail.get(email)) || null;
        if (!c) {
            if (outOfTime()) return partial('contacts');
            c = await write(() => db.Contact.create({
                phone_e164: p.phone_e164 || null, email_lower: email, name: p.display_name || null,
                profile_ids: [p.id], restaurant_ids: [p.restaurant_id],
                platform_consent: { sms: false, email: false, whatsapp: false },
            }));
            createdContacts++;
        } else {
            const cp = contactPatches.get(c.id) || {};
            const pids = cp.profile_ids || c.profile_ids || [];
            const rids = cp.restaurant_ids || c.restaurant_ids || [];
            if (!pids.includes(p.id)) cp.profile_ids = [...pids, p.id];
            if (!rids.includes(p.restaurant_id)) cp.restaurant_ids = [...rids, p.restaurant_id];
            if (p.phone_e164 && !c.phone_e164) cp.phone_e164 = p.phone_e164;
            if (email && !c.email_lower) cp.email_lower = email;
            if (Object.keys(cp).length) contactPatches.set(c.id, cp);
        }
        if (c.phone_e164) cByPhone.set(c.phone_e164, c);
        if (c.email_lower) cByEmail.set(c.email_lower, c);
        if (p.contact_id !== c.id) { patchOf(p).contact_id = c.id; }
        p.contact_id = c.id;
    }
    for (const [id, patch] of contactPatches) {
        if (outOfTime()) return partial('contact_links');
        await write(() => db.Contact.update(id, patch));
    }

    // 4. Orders are linked through CustomerProfile.order_ids, written with the stats in step 6.

    // 5. Consent captured on orders not yet in the ledger
    const ledgerKeys = new Set(consentRecords.map(r => `${r.source_ref}|${r.channel}|${r.action}`));
    const newGrants = [];
    for (const [pid, list] of assigned) {
        const p = byId.get(pid);
        for (const o of list) {
            for (const g of consentGrantsFromOrder(o, p, p.contact_id)) {
                if (!ledgerKeys.has(`${o.id}|${g.channel}|grant`)) { newGrants.push(g); ledgerKeys.add(`${o.id}|${g.channel}|grant`); }
            }
        }
    }
    for (const g of newGrants) {
        if (outOfTime()) return partial('consent');
        await write(() => db.ConsentRecord.create(g));
    }
    const allConsent = [...consentRecords, ...newGrants];

    // 6. Recalculate every profile
    let reconcileOrders = 0, reconcileSpend = 0, profilesWritten = 0;
    for (const p of byId.values()) {
        if (p.merged_into) continue;
        const list = assigned.get(p.id) || [];
        const stats = computeStats(list, now);
        reconcileOrders += stats.order_count;
        reconcileSpend += stats.total_spend;
        const consent = currentConsent(allConsent.filter(r => r.profile_id === p.id && r.scope === p.restaurant_id));
        const update = {
            ...(patches.get(p.id) || {}), ...stats, consent,
            order_ids: list.map(o => o.id),
            display_name: stats.display_name || p.display_name || null,
        };
        const before = original.get(p.id);
        if (before && before.stats_updated_at && fingerprint({ ...before, ...update }) === fingerprint(before)) continue;
        if (outOfTime()) return partial('profile_stats');
        await write(() => db.CustomerProfile.update(p.id, update));
        profilesWritten++;
    }

    // Reconciliation figures for the Phase 1 gate
    const completedWithContact = orders.filter(o => COMPLETED.has(o.status) && o.restaurant_id
        && (contactOf(o).phone || contactOf(o).email));
    const expectedSpend = round2(completedWithContact.reduce((s, o) => s + (Number(o.total) || 0), 0));

    return {
        orders_total: orders.length,
        orders_linked: [...assigned.values()].reduce((s, l) => s + l.length, 0),
        profiles_total: [...byId.values()].filter(p => !p.merged_into).length,
        profiles_created: createdProfiles,
        contacts_created: createdContacts,
        legacy_customers_migrated: migratedCustomers,
        consent_grants_recorded: newGrants.length,
        profiles_written: profilesWritten,
        reconcile: {
            completed_orders_with_contact: completedWithContact.length,
            completed_orders_on_profiles: reconcileOrders,
            expected_spend: expectedSpend,
            spend_on_profiles: round2(reconcileSpend),
        },
    };
}

// ── Entry ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole.entities;
        const body = await req.json().catch(() => ({}));

        if (body.mode === 'backfill') {
            const isScheduler = SCHEDULED_SECRET && req.headers.get('x-scheduler-secret') === SCHEDULED_SECRET;
            if (!isScheduler) {
                const user = await base44.auth.me().catch(() => null);
                if (user?.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
            const result = await backfill(db);
            console.log('[crmIngestOrder] backfill', JSON.stringify(result));
            return Response.json({ success: true, ...result });
        }

        // Workflow payloads come in several shapes; accept them all.
        const orderId = body.orderId || body.order_id || body.entity_id || body.event?.entity_id || body.data?.id;
        if (!orderId || typeof orderId !== 'string') {
            // 200, not 400: a workflow counting failures would eventually be switched off.
            return Response.json({ skipped: 'no_order_id' });
        }
        const result = await ingestOne(db, orderId);
        return Response.json({ success: true, ...result });
    } catch (error) {
        console.error('[crmIngestOrder] Error:', error?.message);
        return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
    }
});
