/**
 * messageTemplateAdmin — Super Admin template builder backend (admins only)
 *
 * Two kinds of template:
 *
 * 1. MESSAGE WORDING (MessageTemplate)
 *    The text of SMS and free-form WhatsApp messages: order updates and the
 *    WhatsApp ordering bot. A row without restaurant_id is the platform default;
 *    a row with one overrides it for that restaurant. CATALOG below lists every
 *    key, where it is used, its variables and the built-in text used when no row
 *    exists - senders keep a copy of the same built-in text as a last resort.
 *
 * 2. WHATSAPP (META) TEMPLATES (WaTemplate)
 *    Pre-approved templates Meta requires for messages sent more than 24h after
 *    the customer last wrote. Built here with named {variables}, converted to
 *    Meta's {{1}}, {{2}}... on submission, and submitted to every connected
 *    restaurant's WhatsApp Business Account (or chosen ones). Approval status is
 *    refreshed by wa_sync and also arrives live via the
 *    message_template_status_update webhook (whatsappWebhook).
 *
 * ACTIONS  catalog | list_texts | save_text | delete_text
 *          wa_list | wa_save | wa_delete | wa_submit | wa_sync
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const GRAPH = `https://graph.facebook.com/${Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v23.0'}`;

// ── Catalog: every message the app sends that can be edited here ────────────
// channels: which channels use this key; defaults: built-in text per channel
// (null = not sent on that channel unless a template is written).
const ORDER_VARS = ['customer_name', 'restaurant_name', 'order_number', 'total', 'eta', 'delivery_address', 'items_count'];
export const CATALOG = [
    {
        key: 'order_received', group: 'Order updates', label: 'Order received',
        used_for: 'WhatsApp chat, right after a WhatsApp order is placed',
        channels: ['whatsapp'], variables: ORDER_VARS,
        defaults: { whatsapp: "📥 We've received order {order_number} ({total}). We'll confirm it shortly." },
    },
    {
        key: 'order_confirmed', group: 'Order updates', label: 'Order accepted',
        used_for: 'When the restaurant accepts the order',
        channels: ['sms', 'whatsapp'], variables: ORDER_VARS,
        defaults: {
            sms: '{restaurant_name}: Your order has been confirmed and is being prepared! (Order {order_number})',
            whatsapp: "✅ Order {order_number} accepted — we're on it! Estimated time: {eta}.",
        },
    },
    {
        key: 'order_preparing', group: 'Order updates', label: 'Preparing',
        used_for: 'When the kitchen starts the order',
        channels: ['sms', 'whatsapp'], variables: ORDER_VARS,
        defaults: { sms: '{restaurant_name}: The kitchen is preparing your order now. (Order {order_number})', whatsapp: null },
    },
    {
        key: 'order_out_for_delivery', group: 'Order updates', label: 'Out for delivery',
        used_for: 'When the driver leaves',
        channels: ['sms', 'whatsapp'], variables: ORDER_VARS,
        defaults: {
            sms: '{restaurant_name}: Your order is out for delivery! (Order {order_number})',
            whatsapp: '🛵 Order {order_number} is on its way.',
        },
    },
    {
        key: 'order_ready_for_collection', group: 'Order updates', label: 'Ready to collect',
        used_for: 'When a collection order is ready',
        channels: ['sms', 'whatsapp'], variables: ORDER_VARS,
        defaults: {
            sms: '{restaurant_name}: Your order is ready for collection! (Order {order_number})',
            whatsapp: '🛍️ Order {order_number} is ready to collect.',
        },
    },
    {
        key: 'order_delivered', group: 'Order updates', label: 'Delivered',
        used_for: 'When the order is marked delivered',
        channels: ['sms', 'whatsapp'], variables: ORDER_VARS,
        defaults: {
            sms: '{restaurant_name}: Your order has been delivered. Enjoy your meal! (Order {order_number})',
            whatsapp: '🎉 Order {order_number} delivered. Enjoy! Message us any time to order again.',
        },
    },
    {
        key: 'order_collected', group: 'Order updates', label: 'Collected',
        used_for: 'When a collection order is picked up',
        channels: ['sms', 'whatsapp'], variables: ORDER_VARS,
        defaults: {
            sms: '{restaurant_name}: Thank you for collecting your order! (Order {order_number})',
            whatsapp: '🎉 Thanks for collecting order {order_number}. Enjoy!',
        },
    },
    {
        key: 'order_cancelled', group: 'Order updates', label: 'Cancelled',
        used_for: 'When an order is cancelled or rejected',
        channels: ['sms', 'whatsapp'], variables: [...ORDER_VARS, 'reason'],
        defaults: {
            sms: '{restaurant_name}: Your order has been cancelled. (Order {order_number})',
            whatsapp: '❌ Sorry, order {order_number} was cancelled: {reason}. Any card payment will be refunded. Reply here if you need help.',
        },
    },
    {
        key: 'order_refunded', group: 'Order updates', label: 'Refunded',
        used_for: 'When a refund is completed',
        channels: ['whatsapp'], variables: ORDER_VARS,
        defaults: { whatsapp: '💷 Order {order_number} has been refunded.' },
    },
    {
        key: 'wa_welcome', group: 'WhatsApp ordering bot', label: 'Welcome',
        used_for: "First reply to a new customer (a restaurant's own welcome message on its WhatsApp page wins)",
        channels: ['whatsapp'], variables: ['customer_first_name', 'restaurant_name'],
        defaults: { whatsapp: 'Hi {customer_first_name}! 👋 Welcome to *{restaurant_name}*.\nTell me what you\'d like (e.g. "2 chicken burgers and a large chips"), or browse the menu.' },
    },
    {
        key: 'wa_closed', group: 'WhatsApp ordering bot', label: 'Restaurant closed',
        used_for: 'When someone messages while the restaurant is closed',
        channels: ['whatsapp'], variables: ['closed_reason', 'restaurant_name'],
        defaults: { whatsapp: "{closed_reason} Please message us again when we're open. — {restaurant_name}" },
    },
    {
        key: 'wa_checkout', group: 'WhatsApp ordering bot', label: 'Checkout link',
        used_for: 'Message above the "Pay & place order" button',
        channels: ['whatsapp'], variables: ['basket', 'restaurant_name'],
        defaults: { whatsapp: "{basket}\n\nTap below to confirm your details and pay. The link works for 2 hours. We'll message you here as soon as your order is accepted." },
    },
    {
        key: 'wa_handoff', group: 'WhatsApp ordering bot', label: 'Handed to staff',
        used_for: 'When the chat is passed to a member of staff',
        channels: ['whatsapp'], variables: ['restaurant_name'],
        defaults: { whatsapp: 'Thanks — someone from {restaurant_name} will reply here shortly.' },
    },
];

// Variables a Meta template may use, with the sample values sent to Meta for review
const WA_TEMPLATE_VARS = {
    customer_name: 'Sam',
    restaurant_name: 'Tilbury Chicken',
    order_number: 'C-1042',
    status_text: 'out for delivery',
    total: '£18.50',
    eta: '25-35 mins',
    reason: 'we have run out of an item',
};

const fail = (error, status = 400) => Response.json({ error }, { status });

// ── Meta template helpers ───────────────────────────────────────────────────
function toPositional(text) {
    const order = [];
    const out = String(text || '').replace(/\{([a-z_]+)\}/g, (_m, name) => {
        let i = order.indexOf(name);
        if (i === -1) { order.push(name); i = order.length - 1; }
        return `{{${i + 1}}}`;
    });
    return { text: out, params: order };
}

function validateWaTemplate(t) {
    const errors = [];
    if (!/^[a-z0-9_]{1,512}$/.test(t.name || '')) errors.push('Name must be lowercase letters, numbers and underscores only.');
    if (!t.body?.trim()) errors.push('Body is required.');
    if ((t.body || '').length > 1024) errors.push('Body must be 1024 characters or fewer.');
    if ((t.header_text || '').length > 60) errors.push('Header must be 60 characters or fewer.');
    if ((t.footer || '').length > 60) errors.push('Footer must be 60 characters or fewer.');
    if (/\{[a-z_]+\}/.test(t.header_text || '') || /\{[a-z_]+\}/.test(t.footer || '')) errors.push('Variables are only allowed in the body.');
    const vars = [...(t.body || '').matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
    const unknown = [...new Set(vars.filter((v) => !(v in WA_TEMPLATE_VARS)))];
    if (unknown.length) errors.push(`Unknown variable(s): ${unknown.map((v) => `{${v}}`).join(', ')}`);
    const body = (t.body || '').trim();
    if (/^\{[a-z_]+\}/.test(body) || /\{[a-z_]+\}$/.test(body)) errors.push('Meta rejects a body that starts or ends with a variable.');
    if (/\{[a-z_]+\}\s*\{[a-z_]+\}/.test(body)) errors.push('Two variables next to each other are rejected by Meta - put words between them.');
    const buttons = t.buttons || [];
    if (buttons.length > 10) errors.push('At most 10 buttons.');
    if (buttons.filter((b) => b.type === 'URL').length > 2) errors.push('At most 2 website buttons.');
    if (buttons.filter((b) => b.type === 'PHONE_NUMBER').length > 1) errors.push('At most 1 call button.');
    for (const b of buttons) {
        if (!b.text?.trim() || b.text.length > 25) errors.push('Each button needs text of 25 characters or fewer.');
        if (b.type === 'URL' && !/^https:\/\//.test(b.url || '')) errors.push('Website buttons need an https:// link.');
        if (b.type === 'PHONE_NUMBER' && !/^\+\d{7,15}$/.test((b.phone_number || '').replace(/\s/g, ''))) errors.push('Call buttons need a number in +44... format.');
    }
    if (t.category === 'AUTHENTICATION') errors.push('Authentication templates use a fixed Meta format and are not supported here.');
    return [...new Set(errors)];
}

function metaPayload(t) {
    const { text, params } = toPositional(t.body.trim());
    const components = [];
    if (t.header_text?.trim()) components.push({ type: 'HEADER', format: 'TEXT', text: t.header_text.trim() });
    components.push({
        type: 'BODY', text,
        ...(params.length ? { example: { body_text: [params.map((p) => WA_TEMPLATE_VARS[p])] } } : {}),
    });
    if (t.footer?.trim()) components.push({ type: 'FOOTER', text: t.footer.trim() });
    if (t.buttons?.length) {
        components.push({
            type: 'BUTTONS',
            buttons: t.buttons.map((b) => (
                b.type === 'URL' ? { type: 'URL', text: b.text.trim(), url: b.url.trim() }
                    : b.type === 'PHONE_NUMBER' ? { type: 'PHONE_NUMBER', text: b.text.trim(), phone_number: b.phone_number.replace(/\s/g, '') }
                        : { type: 'QUICK_REPLY', text: b.text.trim() })),
        });
    }
    return { payload: { name: t.name, language: t.language || 'en_GB', category: t.category || 'UTILITY', components }, params };
}

async function graph(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${GRAPH}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const e = data?.error || {};
        throw Object.assign(new Error(e.error_user_msg || e.message || `Graph API HTTP ${res.status}`), { code: e.code, subcode: e.error_subcode });
    }
    return data;
}

/** Connected numbers grouped by WhatsApp Business Account: [{ waba_id, token, channel_ids, restaurant_names }] */
async function connectedWabas(db, targetChannelIds) {
    const channels = (await db.WhatsAppChannel.filter({ status: 'connected' }))
        .filter((c) => c.waba_id && c.access_token)
        .filter((c) => !targetChannelIds?.length || targetChannelIds.includes(c.id));
    const map = new Map();
    for (const c of channels) {
        const w = map.get(c.waba_id) || { waba_id: c.waba_id, token: c.access_token, channel_ids: [], restaurant_names: [] };
        w.channel_ids.push(c.id);
        w.restaurant_names.push(c.restaurant_name || c.display_phone_number);
        map.set(c.waba_id, w);
    }
    return [...map.values()];
}

async function fetchMetaStatus(w, t) {
    const res = await graph(`/${w.waba_id}/message_templates?name=${encodeURIComponent(t.name)}&fields=id,name,status,language,category,rejected_reason`, { token: w.token });
    return (res.data || []).find((r) => r.name === t.name && r.language === (t.language || 'en_GB')) || null;
}

const nowIso = () => new Date().toISOString();

Deno.serve(async (req) => {
    if (req.method !== 'POST') return fail('POST only', 405);
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (!user) return fail('Unauthorized', 401);
        if (user.role !== 'admin') return fail('Admins only', 403);

        const db = base44.asServiceRole.entities;
        const p = await req.json().catch(() => ({}));

        switch (p.action) {
            // ── Wording ──
            case 'catalog':
                return Response.json({ catalog: CATALOG, wa_variables: WA_TEMPLATE_VARS });

            case 'list_texts': {
                const rows = await db.MessageTemplate.list('-updated_date', 1000);
                return Response.json({ texts: rows });
            }

            case 'save_text': {
                const entry = CATALOG.find((c) => c.key === p.key);
                if (!entry) return fail('Unknown message key');
                const channel = p.channel || 'any';
                if (channel !== 'any' && !entry.channels.includes(channel)) return fail(`"${entry.label}" is not sent by ${channel}`);
                const body = String(p.body || '').trim();
                if (!body) return fail('Message text is required');
                if (body.length > 1500) return fail('Keep messages under 1500 characters');
                const unknown = [...new Set([...body.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((v) => !entry.variables.includes(v)))];
                if (unknown.length) return fail(`Unknown variable(s) for this message: ${unknown.map((v) => `{${v}}`).join(', ')}`);

                let restaurant_name;
                if (p.restaurant_id) {
                    const r = (await db.Restaurant.filter({ id: p.restaurant_id }))[0];
                    if (!r) return fail('Restaurant not found', 404);
                    restaurant_name = r.name;
                }
                const data = {
                    key: p.key, channel, restaurant_id: p.restaurant_id || null, restaurant_name: restaurant_name || null,
                    body, is_active: p.is_active !== false, updated_by: user.email,
                };
                // one row per key + channel + restaurant
                const existing = p.id
                    ? (await db.MessageTemplate.filter({ id: p.id }))[0]
                    : (await db.MessageTemplate.filter({ key: p.key, channel })).find((r) => (r.restaurant_id || null) === (p.restaurant_id || null));
                const saved = existing ? await db.MessageTemplate.update(existing.id, data) : await db.MessageTemplate.create(data);
                return Response.json({ text: { ...(existing || {}), ...data, ...(saved || {}) } });
            }

            case 'delete_text': {
                if (!p.id) return fail('id required');
                await db.MessageTemplate.delete(p.id);
                return Response.json({ ok: true });
            }

            // ── Meta templates ──
            case 'wa_list': {
                const [templates, wabas, channels] = await Promise.all([
                    db.WaTemplate.list('-updated_date', 500),
                    connectedWabas(db),
                    db.WhatsAppChannel.filter({ status: 'connected' }),
                ]);
                return Response.json({
                    templates,
                    accounts: wabas.map(({ token: _t, ...w }) => w),
                    channels: channels.map((c) => ({ id: c.id, restaurant_name: c.restaurant_name, display_phone_number: c.display_phone_number, waba_id: c.waba_id })),
                    variables: WA_TEMPLATE_VARS,
                });
            }

            case 'wa_save': {
                const t = p.template || {};
                const errors = validateWaTemplate(t);
                if (errors.length) return fail(errors.join(' '));
                const data = {
                    name: t.name, language: t.language || 'en_GB', category: t.category || 'UTILITY',
                    purpose: t.purpose || 'other', header_text: t.header_text || '', body: t.body.trim(),
                    footer: t.footer || '', buttons: t.buttons || [], notes: t.notes || '',
                    target_channel_ids: t.target_channel_ids || [],
                    param_order: toPositional(t.body.trim()).params,
                };
                const clash = (await db.WaTemplate.filter({ name: data.name })).find((r) => r.id !== t.id && r.language === data.language);
                if (clash) return fail('A template with this name and language already exists.');
                if (t.id) {
                    const cur = (await db.WaTemplate.filter({ id: t.id }))[0];
                    if (!cur) return fail('Not found', 404);
                    // Meta does not allow renaming; an approved template's content can only be edited in Meta's own tools
                    if ((cur.submissions || []).length) {
                        const contentKey = (x) => JSON.stringify([x.name, x.language, x.category, x.header_text || '', (x.body || '').trim(), x.footer || '', x.buttons || []]);
                        if (contentKey(cur) !== contentKey(data)) {
                            return fail('This template has been submitted to Meta, so its content is locked. Duplicate it to make a new version.');
                        }
                    }
                    await db.WaTemplate.update(t.id, data);
                    return Response.json({ template: { ...cur, ...data } });
                }
                const created = await db.WaTemplate.create({ ...data, submissions: [] });
                return Response.json({ template: created });
            }

            case 'wa_submit': {
                const t = (await db.WaTemplate.filter({ id: p.id }))[0];
                if (!t) return fail('Not found', 404);
                const errors = validateWaTemplate(t);
                if (errors.length) return fail(errors.join(' '));
                const wabas = await connectedWabas(db, t.target_channel_ids);
                if (!wabas.length) return fail('No connected WhatsApp numbers to submit to.', 409);

                const { payload, params } = metaPayload(t);
                const submissions = [...(t.submissions || [])];
                const results = [];
                for (const w of wabas) {
                    const idx = submissions.findIndex((s) => s.waba_id === w.waba_id);
                    const prev = idx >= 0 ? submissions[idx] : null;
                    if (prev && ['APPROVED', 'PENDING', 'IN_APPEAL'].includes(prev.status)) {
                        results.push({ waba_id: w.waba_id, skipped: prev.status });
                        continue;
                    }
                    let entry;
                    try {
                        const res = await graph(`/${w.waba_id}/message_templates`, { method: 'POST', token: w.token, body: payload });
                        entry = { waba_id: w.waba_id, restaurant_names: w.restaurant_names.join(', '), meta_id: res.id, status: res.status || 'PENDING', reason: '', submitted_at: nowIso(), updated_at: nowIso() };
                    } catch (e) {
                        // Already exists on that account (e.g. created in Meta directly): adopt its status
                        const existing = await fetchMetaStatus(w, t).catch(() => null);
                        entry = existing
                            ? { waba_id: w.waba_id, restaurant_names: w.restaurant_names.join(', '), meta_id: existing.id, status: existing.status, reason: existing.rejected_reason || '', submitted_at: prev?.submitted_at || nowIso(), updated_at: nowIso() }
                            : { waba_id: w.waba_id, restaurant_names: w.restaurant_names.join(', '), meta_id: prev?.meta_id || '', status: 'ERROR', reason: e.message, submitted_at: nowIso(), updated_at: nowIso() };
                    }
                    if (idx >= 0) submissions[idx] = entry; else submissions.push(entry);
                    results.push(entry);
                }
                await db.WaTemplate.update(t.id, { submissions, param_order: params });
                return Response.json({ submissions, results });
            }

            case 'wa_sync': {
                const t = (await db.WaTemplate.filter({ id: p.id }))[0];
                if (!t) return fail('Not found', 404);
                const wabas = await connectedWabas(db);
                const submissions = [];
                for (const s of t.submissions || []) {
                    const w = wabas.find((x) => x.waba_id === s.waba_id);
                    if (!w) { submissions.push({ ...s, status: s.status === 'APPROVED' ? 'DISCONNECTED' : s.status }); continue; }
                    try {
                        const m = await fetchMetaStatus(w, t);
                        submissions.push(m
                            ? { ...s, meta_id: m.id, status: m.status, reason: m.rejected_reason && m.rejected_reason !== 'NONE' ? m.rejected_reason : '', updated_at: nowIso() }
                            : { ...s, status: 'NOT_FOUND', updated_at: nowIso() });
                    } catch (e) {
                        submissions.push({ ...s, reason: e.message, updated_at: nowIso() });
                    }
                }
                await db.WaTemplate.update(t.id, { submissions });
                return Response.json({ submissions });
            }

            case 'wa_delete': {
                const t = (await db.WaTemplate.filter({ id: p.id }))[0];
                if (!t) return fail('Not found', 404);
                const problems = [];
                if (p.remove_from_meta) {
                    const wabas = await connectedWabas(db);
                    for (const s of t.submissions || []) {
                        const w = wabas.find((x) => x.waba_id === s.waba_id);
                        if (!w) continue;
                        try {
                            await graph(`/${w.waba_id}/message_templates?name=${encodeURIComponent(t.name)}`, { method: 'DELETE', token: w.token });
                        } catch (e) { problems.push(`${s.restaurant_names}: ${e.message}`); }
                    }
                }
                await db.WaTemplate.delete(t.id);
                return Response.json({ ok: true, problems });
            }

            default:
                return fail('Unknown action');
        }
    } catch (e) {
        console.error('[messageTemplateAdmin]', e);
        return fail(e.message || 'Something went wrong', 500);
    }
});
