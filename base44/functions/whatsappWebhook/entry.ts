/**
 * whatsappWebhook — WhatsApp ordering on each restaurant's OWN number (Meta Cloud API)
 *
 * One webhook serves every restaurant. Meta puts the receiving number's
 * phone_number_id in every event; that id is looked up in WhatsAppChannel to
 * find the restaurant and its token.
 *
 * This function is the WhatsApp CHANNEL only: Meta's API, signatures, menu lists
 * and buttons, templates, staff handoff and the chat prompt. Everything about the
 * ORDER - menu availability, the basket, option questions, prices, opening hours,
 * minimums and the pay link - is done by aiOrderingCore, the same core the phone
 * agent uses. Each chat (WaConversation) is linked to an AiOrderSession there.
 *
 * FLOW
 *   GET  -> Meta's one-time verification (hub.verify_token / hub.challenge)
 *   POST -> 1. verify X-Hub-Signature-256 (HMAC-SHA256 of the raw body, app secret)
 *           2. delivery statuses  -> update WaMessage.status
 *           3. customer messages  -> dedupe on wamid, route to channel, then:
 *                - deterministic taps first (menu list, item rows, option picks,
 *                  Checkout / Cart / Menu buttons) - cheap and exact
 *                - free text goes to the AI agent, which may only ask for ACTIONS
 *                  (add/remove item, set order type, checkout, handoff). The core
 *                  applies them against the real menu, so the AI can never invent
 *                  an item or a price.
 *           4. checkout asks the core for a one-time link (/AiCheckout?t=<token>); that
 *              page loads the basket into the normal website checkout, so pricing
 *              validation, Stripe, POS and printing are exactly as for web orders.
 *              aiOrderLink ties the paid order back to the session, and
 *              whatsappOrderNotify then sends status updates in this chat.
 *
 * POLICY NOTE: Meta allows business-specific AI (ordering, support) on the
 * WhatsApp Business Platform, not general-purpose assistants. The prompt keeps the
 * agent to this restaurant's menu and orders only.
 *
 * ENV
 *   WHATSAPP_APP_SECRET      Meta app secret - signature check (required)
 *   WHATSAPP_VERIFY_TOKEN    any string, also typed into Meta's webhook form (required)
 *   WHATSAPP_GRAPH_VERSION   optional, default v23.0
 *   AI_CORE_API_KEY          key for aiOrderingCore (required)
 *
 * Webhook URL to give Meta: https://<app domain>/functions/whatsappWebhook
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const GRAPH = `https://graph.facebook.com/${Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v23.0'}`;
const HISTORY_TURNS = 12;

// ── Small helpers ───────────────────────────────────────────────────────────
const money = (n) => `£${(Number(n) || 0).toFixed(2)}`;
const clip = (s, n) => {
    const t = String(s ?? '').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
const nowIso = () => new Date().toISOString();
const fill = (text, vars) => String(text).replace(/\{([a-z_]+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));

// ── Editable wording (Super Admin > Message Templates) ────────────────────────────
// Built-in text, same as the catalog defaults in messageTemplateAdmin.
const BOT_DEFAULTS = {
    wa_welcome: 'Hi {customer_first_name}! 👋 Welcome to *{restaurant_name}*.\nTell me what you\'d like (e.g. "2 chicken burgers and a large chips"), or browse the menu.',
    wa_closed: "{closed_reason} Please message us again when we're open. — {restaurant_name}",
    wa_checkout: "{basket}\n\nTap below to confirm your details and pay. The link works for 2 hours. We'll message you here as soon as your order is accepted.",
    wa_handoff: 'Thanks — someone from {restaurant_name} will reply here shortly.',
};

/** Restaurant override -> platform default -> built-in, cached per request. */
async function botText(ctx, key, vars) {
    ctx.textCache = ctx.textCache || {};
    if (!(key in ctx.textCache)) {
        const rows = (await ctx.db.MessageTemplate.filter({ key }).catch(() => [])).filter((r) => r.is_active !== false);
        const rid = ctx.restaurant.id;
        const tries = [
            (r) => r.restaurant_id === rid && r.channel === 'whatsapp',
            (r) => r.restaurant_id === rid && r.channel === 'any',
            (r) => !r.restaurant_id && r.channel === 'whatsapp',
            (r) => !r.restaurant_id && r.channel === 'any',
        ];
        let body = null;
        for (const t of tries) { const hit = rows.find(t); if (hit) { body = hit.body; break; } }
        ctx.textCache[key] = body ?? BOT_DEFAULTS[key];
    }
    return fill(ctx.textCache[key], { restaurant_name: ctx.restaurant.name, ...vars });
}

/** Meta's message_template_status_update webhook: keep WaTemplate submissions current. */
async function handleTemplateStatus(db, wabaId, v) {
    if (!v?.message_template_name || !v?.event) return;
    const rows = await db.WaTemplate.filter({ name: v.message_template_name });
    for (const t of rows) {
        if (v.message_template_language && t.language && t.language !== v.message_template_language) continue;
        const subs = [...(t.submissions || [])];
        const i = subs.findIndex((s) => (v.message_template_id && String(s.meta_id) === String(v.message_template_id)) || s.waba_id === wabaId);
        if (i < 0) continue;
        subs[i] = { ...subs[i], status: v.event, reason: v.reason && v.reason !== 'NONE' ? v.reason : '', updated_at: nowIso() };
        await db.WaTemplate.update(t.id, { submissions: subs });
    }
}

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function validSignature(rawBytes, header) {
    const secret = Deno.env.get('WHATSAPP_APP_SECRET');
    if (!secret || !header || !header.startsWith('sha256=')) return false;
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, rawBytes));
    const hex = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
    return timingSafeEqual(hex, header.slice(7).toLowerCase());
}

// ── Graph API sending ───────────────────────────────────────────────────────
async function graphPost(channel, payload) {
    const res = await fetch(`${GRAPH}/${channel.phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${channel.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Graph API HTTP ${res.status}`);
    return data;
}

const msg = {
    text: (body) => ({ type: 'text', text: { body: clip(body, 4096), preview_url: false } }),
    buttons: (body, buttons) => ({
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: clip(body, 1024) },
            action: {
                buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: clip(b.id, 256), title: clip(b.title, 20) } })),
            },
        },
    }),
    list: (body, buttonText, sections) => ({
        type: 'interactive',
        interactive: {
            type: 'list',
            body: { text: clip(body, 1024) },
            action: {
                button: clip(buttonText, 20),
                sections: sections.map((s) => ({
                    title: clip(s.title, 24),
                    rows: s.rows.slice(0, 10).map((r) => ({
                        id: clip(r.id, 200),
                        title: clip(r.title, 24),
                        ...(r.description ? { description: clip(r.description, 72) } : {}),
                    })),
                })),
            },
        },
    }),
    cta: (body, displayText, url) => ({
        type: 'interactive',
        interactive: {
            type: 'cta_url',
            body: { text: clip(body, 1024) },
            action: { name: 'cta_url', parameters: { display_text: clip(displayText, 20), url } },
        },
    }),
};

/** Sends one message and logs it. Never throws - a failed send is logged, not fatal. */
async function send(ctx, payload, logBody, sender = 'ai') {
    const { db, channel, convo } = ctx;
    let wamid = null;
    let error = null;
    try {
        const data = await graphPost(channel, { recipient_type: 'individual', to: convo.customer_wa_id, ...payload });
        wamid = data?.messages?.[0]?.id || null;
    } catch (e) {
        error = e.message;
        console.error('[whatsappWebhook] send failed:', error);
        // cta_url is newer than the other types; fall back to a plain link if it is refused
        if (payload.type === 'interactive' && payload.interactive?.type === 'cta_url') {
            const url = payload.interactive.action.parameters.url;
            try {
                const data = await graphPost(channel, {
                    recipient_type: 'individual', to: convo.customer_wa_id,
                    ...msg.text(`${payload.interactive.body.text}\n\n${url}`),
                });
                wamid = data?.messages?.[0]?.id || null;
                error = null;
            } catch (e2) {
                error = e2.message;
            }
        }
    }
    await db.WaMessage.create({
        conversation_id: convo.id,
        restaurant_id: convo.restaurant_id,
        wamid,
        direction: 'outbound',
        sender,
        msg_type: payload.type === 'interactive' ? `interactive:${payload.interactive.type}` : payload.type,
        body: logBody,
        status: error ? 'failed' : 'sent',
        error: error || undefined,
    }).catch((e) => console.error('[whatsappWebhook] log outbound failed:', e.message));
    ctx.sentTexts.push(logBody);
    return !error;
}

async function markReadWithTyping(channel, wamid) {
    try {
        await graphPost(channel, { status: 'read', message_id: wamid, typing_indicator: { type: 'text' } });
    } catch {
        // typing indicator is cosmetic; older API versions reject it
        try { await graphPost(channel, { status: 'read', message_id: wamid }); } catch { /* ignore */ }
    }
}

// WhatsApp caps interactive message bodies at 1024 characters
const BODY_LIMIT = 1000;
function splitText(t, n = 4000) {
    const out = [];
    let rest = t;
    while (rest.length > n) {
        const cut = rest.lastIndexOf('\n', n) > n / 2 ? rest.lastIndexOf('\n', n) : n;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut).replace(/^\n/, '');
    }
    if (rest) out.push(rest);
    return out;
}

// ── AI ordering core ────────────────────────────────────────────────────────
/** One call to aiOrderingCore for this chat's session. Returns its JSON ({ ok, ... }). */
async function core(ctx, action, args = {}) {
    const payload = { action, key: Deno.env.get('AI_CORE_API_KEY'), ...args };
    if (action !== 'start_session') payload.session_id = ctx.sessionId;
    const res = await ctx.base44.asServiceRole.functions.invoke('aiOrderingCore', payload);
    const data = res?.data ?? res;
    if (!data || typeof data !== 'object' || !('ok' in data)) throw new Error(`aiOrderingCore ${action}: unexpected response`);
    return data;
}

/** The chat's current core session; a new one after an order (or if it went missing). */
async function ensureSession(ctx) {
    const { convo } = ctx;
    if (convo.ai_session_id) {
        ctx.sessionId = convo.ai_session_id;
        const c = await core(ctx, 'get_context', { skip_returning: true });
        if (c.ok && !['ordered', 'closed'].includes(c.session?.state)) {
            ctx.context = c;
            if (c.session?.order_type) convo.order_type = c.session.order_type;
            return c;
        }
    }
    const c = await core(ctx, 'start_session', {
        channel: 'whatsapp', restaurant_id: convo.restaurant_id,
        customer_phone: convo.customer_wa_id, customer_name: convo.customer_name || undefined,
    });
    if (!c.ok) throw new Error(`aiOrderingCore start_session: ${c.code}`);
    ctx.sessionId = c.session_id;
    ctx.context = c;
    convo.ai_session_id = c.session_id;
    convo.pending_item = null;
    convo.cart = [];
    convo.order_type = null;
    if (convo.state === 'cart' || convo.state === 'awaiting_payment') convo.state = 'browsing';
    return c;
}

/** Keep the inbox's display copy of the basket in step with the core. */
function syncCart(convo, basket) {
    if (!Array.isArray(basket)) return;
    convo.cart = basket.map((l) => ({ menu_item_id: l.menu_item_id, name: l.name, quantity: l.quantity, price: l.unit_price, options_summary: l.options || '' }));
    if (convo.cart.length && convo.state === 'browsing') convo.state = 'cart';
    if (!convo.cart.length && convo.state === 'cart') convo.state = 'browsing';
}

function rememberQuestion(convo, q) {
    convo.pending_item = q ? { menu_item_id: q.menu_item_id, item_name: q.item_name, group: q.group, options: (q.options || []).map((o) => o.label) } : null;
}

function cartText(convo, quote) {
    const cart = convo.cart || [];
    if (!cart.length) return 'Your basket is empty.';
    const lines = cart.map((l, i) =>
        `${i + 1}. ${l.quantity}× ${l.name}${l.options_summary ? ` (${l.options_summary})` : ''} — ${money(l.price * l.quantity)}`);
    const subtotal = quote?.subtotal ?? cart.reduce((s, l) => s + l.price * l.quantity, 0);
    const type = convo.order_type ? `\n${convo.order_type === 'delivery' ? '🛵 Delivery' : '🏃 Collection'}` : '';
    return `🛒 *Your basket*\n${lines.join('\n')}\n\n*Subtotal: ${money(subtotal)}*${type}\nDelivery fee and offers are applied at checkout.`;
}

// ── Screens (deterministic messages) ─────────────────────────────────────────
async function showCategories(ctx, intro, page = 0) {
    const r = await core(ctx, 'browse_menu', { mode: 'categories' });
    const cats = r.ok ? r.categories : [];
    if (!cats.length) return send(ctx, msg.text('Sorry, our menu is not available on WhatsApp right now.'), 'menu unavailable');
    const per = 9;
    const rows = cats.slice(page * per, page * per + per).map((c) => ({
        id: `cat:${c.index}:0`, title: c.name, description: `${c.count} items`,
    }));
    if (cats.length > (page + 1) * per) rows.push({ id: `cats:${page + 1}`, title: 'More categories…' });
    return send(ctx, msg.list(intro || 'What are you in the mood for?', 'View menu', [{ title: 'Menu', rows }]), `[menu categories p${page}]`);
}

async function showCategory(ctx, catIndex, page = 0) {
    const r = await core(ctx, 'browse_menu', { mode: 'category', category: catIndex, page, per_page: 9 });
    if (!r.ok) return showCategories(ctx);
    const rows = r.items.map((it) => ({
        id: `item:${it.menu_item_id}`,
        title: it.name,
        description: `${money(it.price)}${it.popular ? ' · ⭐ popular' : ''}${it.description ? ` · ${it.description}` : ''}`,
    }));
    if (r.has_more) rows.push({ id: `cat:${r.category_index}:${page + 1}`, title: 'More…' });
    return send(ctx, msg.list(`*${r.category}* — tap an item to add it.`, 'Choose item', [{ title: r.category, rows }]), `[category ${r.category} p${page}]`);
}

async function askOption(ctx, q, prefix = '') {
    rememberQuestion(ctx.convo, q);
    const rows = (q.options || []).slice(0, 10).map((o, i) => ({
        id: `opt:${q.menu_item_id}:${i}`,
        title: o.label,
        description: o.extra_price ? `+${money(o.extra_price)}` : undefined,
    }));
    const more = (q.options || []).length > 10 ? '\n(Not listed? Type the option name.)' : '';
    return send(ctx, msg.list(`${prefix ? prefix + '\n\n' : ''}*${q.item_name}* — choose ${q.group || 'an option'}:${more}`, 'Choose', [{ title: q.group || 'Options', rows }]),
        `[options ${q.item_name} / ${q.group}]`);
}

async function showCartWithActions(ctx, prefix, basket, quote) {
    if (!basket) {
        const r = await core(ctx, 'get_basket');
        basket = r.basket; quote = r.quote;
        if (r.removed_unavailable?.length) prefix = [prefix, `${r.removed_unavailable.join(', ')} is no longer available, so I took it off.`].filter(Boolean).join('\n');
    }
    syncCart(ctx.convo, basket);
    let text = `${prefix ? prefix + '\n\n' : ''}${cartText(ctx.convo, quote)}`;
    if (!(ctx.convo.cart || []).length) {
        return send(ctx, msg.buttons(text, [{ id: 'menu', title: 'View menu' }]), text);
    }
    // A big basket doesn't fit a button message: send it as text, then the buttons
    if (text.length > BODY_LIMIT) {
        for (const chunk of splitText(text)) await send(ctx, msg.text(chunk), chunk);
        text = `${ctx.convo.cart.reduce((n, l) => n + l.quantity, 0)} items · Subtotal ${money(quote?.subtotal)}. What next?`;
    }
    return send(ctx, msg.buttons(text, [
        { id: 'checkout', title: 'Checkout' },
        { id: 'menu', title: 'Add more' },
        { id: 'clear', title: 'Empty basket' },
    ]), text);
}

/** A core reply to add_item / choose_option: ask the next question, or show the basket. */
async function afterAdd(ctx, r) {
    if (r.needs_choice) return askOption(ctx, r.needs_choice);
    rememberQuestion(ctx.convo, null);
    const l = r.line;
    return showCartWithActions(ctx, l ? `✅ Added ${l.quantity}× ${l.name}.` : '', r.basket, r.quote);
}

async function askOrderType(ctx) {
    const r = ctx.context?.restaurant || {};
    if (!r.collection_enabled) {
        const t = await core(ctx, 'set_order_type', { order_type: 'delivery' });
        if (t.ok) ctx.convo.order_type = 'delivery';
        return startCheckout(ctx, true);
    }
    return send(ctx, msg.buttons('Is this for delivery or collection?', [
        { id: 'type:delivery', title: 'Delivery' }, { id: 'type:collection', title: 'Collection' },
    ]), '[ask order type]');
}

async function startCheckout(ctx, typeJustSet = false) {
    const { convo } = ctx;
    const r = await core(ctx, 'send_payment_link', { send_sms: false, details_at_checkout: true });
    if (r.ok) {
        syncCart(convo, r.basket);
        convo.state = 'awaiting_payment';
        let body = await botText(ctx, 'wa_checkout', { basket: cartText(convo, r.quote) });
        if (body.length > BODY_LIMIT) {
            for (const chunk of splitText(body)) await send(ctx, msg.text(chunk), chunk);
            body = 'Tap below to confirm your details and pay.';
        }
        return send(ctx, msg.cta(body, 'Pay & place order', r.checkout_url), `[checkout link] ${r.checkout_url}`);
    }
    const rest = ctx.context?.restaurant || {};
    switch (r.code) {
        case 'OPTIONS_PENDING':
            return r.question ? askOption(ctx, r.question, `Let's finish your ${r.question.item_name} first — then tap Checkout.`) : showCartWithActions(ctx);
        case 'EMPTY_BASKET':
            return showCategories(ctx, 'Your basket is empty — what would you like?');
        case 'ORDER_TYPE_NEEDED':
            return typeJustSet ? send(ctx, msg.text(r.say), r.say, 'system') : askOrderType(ctx);
        case 'NO_COLLECTION': {
            const t = await core(ctx, 'set_order_type', { order_type: 'delivery' });
            if (t.ok && !typeJustSet) { convo.order_type = 'delivery'; return startCheckout(ctx, true); }
            return send(ctx, msg.text(r.say), r.say, 'system');
        }
        case 'SERVICE_CLOSED': {
            const other = convo.order_type === 'delivery' ? 'collection' : 'delivery';
            const otherOk = other === 'delivery' ? rest.delivery_open : rest.collection_open;
            const t = `${r.say}${otherOk ? ` You can still choose ${other}.` : ''}`;
            return otherOk
                ? send(ctx, msg.buttons(t, [{ id: `type:${other}`, title: other === 'delivery' ? 'Delivery' : 'Collection' }]), t, 'system')
                : send(ctx, msg.text(t), t, 'system');
        }
        case 'BELOW_MINIMUM':
            return send(ctx, msg.buttons(r.say,
                [{ id: 'menu', title: 'Add more' }, ...(rest.collection_enabled ? [{ id: 'type:collection', title: 'Collection' }] : [])],
            ), '[below minimum order]');
        case 'ITEM_UNAVAILABLE':
            return showCartWithActions(ctx, r.say);
        default:
            return send(ctx, msg.text(r.say || 'Sorry, something went wrong. Please try again.'), r.say || r.code, 'system');
    }
}

async function startHandoff(ctx, reason) {
    ctx.convo.state = 'handoff';
    ctx.convo.unread_count = (ctx.convo.unread_count || 0) + 1;
    const text = reason || await botText(ctx, 'wa_handoff', {});
    return send(ctx, msg.text(text), text, 'system');
}

// ── AI agent ────────────────────────────────────────────────────────────────
const AGENT_SCHEMA = {
    type: 'object',
    properties: {
        reply: { type: 'string', description: 'Short WhatsApp reply to the customer, max 3 lines' },
        actions: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['add_item', 'remove_item', 'set_quantity', 'clear_cart', 'set_order_type',
                            'set_address', 'show_menu', 'show_category', 'show_cart', 'checkout', 'handoff'],
                    },
                    menu_item_id: { type: 'string' },
                    quantity: { type: 'number' },
                    line: { type: 'number', description: 'basket line number, 1-based' },
                    options: { type: 'object', description: 'group name -> option label, only labels from the menu' },
                    category: { type: 'string' },
                    order_type: { type: 'string', enum: ['delivery', 'collection'] },
                    address: { type: 'string' },
                },
                required: ['type'],
            },
        },
        quick_replies: { type: 'array', items: { type: 'string' }, description: 'Up to 3 short button labels' },
    },
    required: ['reply', 'actions'],
};

async function runAgent(ctx, userText) {
    const { convo, restaurant } = ctx;
    const menuRes = await core(ctx, 'browse_menu', { mode: 'agent' });
    const basketRes = await core(ctx, 'get_basket');
    syncCart(convo, basketRes.basket);
    const r = ctx.context?.restaurant || {};
    const waiting = convo.pending_item
        ? `\nWAITING FOR: the customer to choose ${convo.pending_item.group || 'an option'} for ${convo.pending_item.item_name} (${(convo.pending_item.options || []).join(' / ')}).`
        : '';

    const system = `You are the WhatsApp ordering assistant for ${restaurant.name}, a UK takeaway. You ONLY help customers order from this menu and answer questions about this restaurant and their order. Politely decline anything unrelated.

RESTAURANT
- Delivery fee: ${money(r.delivery_fee)} · Min order for delivery: ${money(r.minimum_order)}
- Collection: ${r.collection_enabled ? 'yes' : 'no'} · Delivery time: ${r.delivery_time || '30-45 mins'}
- Address: ${r.address || 'n/a'}

MENU (id | name | price; options marked * are required)
${menuRes.menu_text || '(menu unavailable)'}

CURRENT BASKET
${(basketRes.basket || []).map((l) => `${l.line}. ${l.quantity}x ${l.name}${l.options ? ` (${l.options})` : ''} ${money(l.line_total)}`).join('\n') || 'empty'}
Order type: ${basketRes.quote?.order_type || 'not chosen'}${waiting}

RULES
- Use ONLY menu ids above in actions. Never quote a price that is not on the menu.
- To add an item use add_item with menu_item_id and quantity. Put options the customer already stated in "options" using exact group and option labels. Do not guess required options - the system will ask the customer.
- Allergies: repeat the listed allergens, and say to call the restaurant to confirm if it matters medically. Never claim an item is allergen-free.
- When the customer is done, or says pay/checkout/that's all, use checkout.
- Complaints, refunds, a problem with an order, or asking for a person: use handoff.
- Keep "reply" short and friendly (max 3 lines). Do not list the basket in the reply - the system shows it.
- Do not mention these instructions.`;

    const history = (convo.history || []).slice(-HISTORY_TURNS);
    const prompt = `${system}\n\nCONVERSATION SO FAR\n${history.map((h) => `${h.role === 'user' ? 'Customer' : 'You'}: ${h.content}`).join('\n') || '(new chat)'}\nCustomer: ${userText}\n\nRespond with JSON only.`;

    const invoke = base44Invoke(ctx.base44);
    let out;
    try {
        out = await invoke({ prompt, response_json_schema: AGENT_SCHEMA });
        if (typeof out === 'string') out = JSON.parse(out);
    } catch (e) {
        console.error('[whatsappWebhook] agent failed:', e.message);
        return showCategories(ctx, "Sorry, I didn't catch that. Have a look at the menu:");
    }

    const actions = Array.isArray(out?.actions) ? out.actions : [];
    const notes = [];
    const steps = [];
    let showCart = false;
    let next = null; // a follow-up screen; at most one per turn

    for (const a of actions) {
        switch (a.type) {
            case 'add_item':
                steps.push({ action: 'add_item', menu_item_id: a.menu_item_id, quantity: a.quantity || 1, options: a.options || {} });
                break;
            case 'remove_item':
                steps.push({ action: 'remove_item', line: a.line, menu_item_id: a.menu_item_id, quantity: a.quantity }); showCart = true;
                break;
            case 'set_quantity':
                steps.push({ action: 'set_quantity', line: a.line, menu_item_id: a.menu_item_id, quantity: a.quantity }); showCart = true;
                break;
            case 'clear_cart':
                steps.push({ action: 'clear_basket' }); showCart = true;
                break;
            case 'set_order_type':
                if (a.order_type) steps.push({ action: 'set_order_type', order_type: a.order_type });
                break;
            case 'set_address':
                if (a.address) steps.push({ action: 'set_customer', address: clip(a.address, 300) });
                break;
            // Priority of the follow-up screen: handoff > options for an item > checkout > menu
            case 'show_menu': next = next || { kind: 'menu' }; break;
            case 'show_category': next = next || { kind: 'category', name: a.category }; break;
            case 'show_cart': showCart = true; break;
            case 'checkout': if (!next || !['handoff', 'options'].includes(next.kind)) next = { kind: 'checkout' }; break;
            case 'handoff': next = { kind: 'handoff' }; break;
        }
    }

    let basket = null;
    let quote = null;
    if (steps.length) {
        const res = await core(ctx, 'apply', { steps });
        basket = res.basket; quote = res.quote;
        syncCart(convo, basket);
        for (const s of res.results || []) {
            if (s.ok && s.action === 'add_item' && s.added) showCart = true;
            if (s.ok && s.action === 'set_order_type') convo.order_type = s.order_type;
            if (s.ignored_options?.length) notes.push(`(ignored unknown option ${s.ignored_options.join(', ')})`);
            if (!s.ok && s.code !== 'OPTIONS_PENDING') notes.push(s.say || s.error);
        }
        if (res.pending && next?.kind !== 'handoff') next = { kind: 'options', question: res.pending };
    }

    const reply = clip([out?.reply, ...new Set(notes)].filter(Boolean).join('\n'), 900);
    convo.history = [...(convo.history || []), { role: 'user', content: clip(userText, 500) }, { role: 'assistant', content: reply }].slice(-HISTORY_TURNS);

    if (next?.kind === 'handoff') return startHandoff(ctx, reply || undefined);
    if (next?.kind === 'checkout') {
        if (reply) await send(ctx, msg.text(reply), reply);
        return startCheckout(ctx);
    }
    if (next?.kind === 'options') {
        if (reply) await send(ctx, msg.text(reply), reply);
        return askOption(ctx, next.question);
    }
    if (next?.kind === 'menu') return showCategories(ctx, reply || undefined);
    if (next?.kind === 'category') {
        if (reply) await send(ctx, msg.text(reply), reply);
        const cats = await core(ctx, 'browse_menu', { mode: 'categories' });
        const hit = (cats.categories || []).find((c) => c.name.toLowerCase() === String(next.name || '').toLowerCase());
        return hit ? showCategory(ctx, hit.index) : showCategories(ctx);
    }
    if (showCart) return showCartWithActions(ctx, reply, basket || undefined, quote || undefined);

    const quick = (Array.isArray(out?.quick_replies) ? out.quick_replies : []).filter(Boolean).slice(0, 3);
    if (quick.length) {
        return send(ctx, msg.buttons(reply || 'Anything else?', quick.map((q, i) => ({ id: `qr:${i}:${clip(q, 20)}`, title: q }))), reply);
    }
    return send(ctx, msg.text(reply || 'Anything else?'), reply);
}

function base44Invoke(base44) {
    const llm = base44.asServiceRole?.integrations?.Core || base44.integrations?.Core;
    return (args) => llm.InvokeLLM(args);
}

// ── Inbound message handling ────────────────────────────────────────────────
function readInbound(m) {
    switch (m.type) {
        case 'text': return { text: m.text?.body || '' };
        case 'interactive': {
            const r = m.interactive?.button_reply || m.interactive?.list_reply;
            return { id: r?.id || '', text: r?.title || '' };
        }
        case 'button': return { id: m.button?.payload || '', text: m.button?.text || '' };
        case 'location': return {
            text: [m.location?.name, m.location?.address].filter(Boolean).join(', ') || `${m.location?.latitude},${m.location?.longitude}`,
            location: m.location,
        };
        default: return { unsupported: true, text: `[${m.type}]` };
    }
}

const GREETING = /^(hi|hii+|hello|hey|hiya|yo|good (morning|afternoon|evening)|salam|assalam.*|start|order)[!. ]*$/i;

async function handleMessage(ctx, m) {
    const { convo, channel, isNew } = ctx;
    const input = readInbound(m);

    if (input.unsupported) {
        return send(ctx, msg.text('Sorry, I can only read text messages. Type what you would like, or send "menu".'), 'unsupported type', 'system');
    }

    // Staff are handling this chat, or the restaurant switched the AI off: just log it.
    const aiOn = channel.ai_enabled !== false;
    if (convo.state === 'handoff' || !aiOn) {
        convo.unread_count = (convo.unread_count || 0) + 1;
        if (input.text.trim().toLowerCase() === 'menu' && convo.state === 'handoff' && aiOn) {
            convo.state = (convo.cart || []).length ? 'cart' : 'browsing';
            convo.unread_count = 0;
            await ensureSession(ctx);
            return showCategories(ctx);
        }
        return;
    }

    const context = await ensureSession(ctx);
    if (context.restaurant?.closed_reason) {
        const t = await botText(ctx, 'wa_closed', { closed_reason: context.restaurant.closed_reason });
        return send(ctx, msg.text(t), t, 'system');
    }

    const id = input.id || '';
    const lower = input.text.trim().toLowerCase();

    // ── Pending option choice (tap, or the option typed as text) ──
    const pq = convo.pending_item;
    if (pq?.menu_item_id) {
        let choice = null;
        if (id.startsWith(`opt:${pq.menu_item_id}:`)) choice = { option_index: Number(id.split(':')[2]) };
        else if (!id && (pq.options || []).some((o) => o.toLowerCase() === lower)) choice = { option: input.text.trim() };
        if (choice) {
            const r = await core(ctx, 'choose_option', choice);
            if (r.ok) return afterAdd(ctx, r);
            if (r.code === 'OPTION_NOT_FOUND' && r.question) return askOption(ctx, r.question, 'Please choose one of these:');
            rememberQuestion(convo, null); // nothing pending any more - carry on below
        } else if (['cancel', 'stop', 'back'].includes(lower)) {
            await core(ctx, 'cancel_pending');
            rememberQuestion(convo, null);
            return showCartWithActions(ctx, `OK, I've dropped ${pq.item_name}.`);
        }
        // anything else: fall through to the normal handling below (keeps the pending item)
    }

    // ── Deterministic taps and keywords ──
    if (id === 'menu' || lower === 'menu') return showCategories(ctx);
    if (id.startsWith('cats:')) return showCategories(ctx, undefined, Number(id.split(':')[1]) || 0);
    if (id.startsWith('cat:')) {
        const [, ci, pg] = id.split(':');
        return showCategory(ctx, Number(ci), Number(pg) || 0);
    }
    if (id.startsWith('item:')) {
        if (convo.pending_item) {
            return send(ctx, msg.text(`Let's finish your ${convo.pending_item.item_name || 'current item'} first — choose from the list above, or type "cancel".`), 'finish pending first', 'system');
        }
        const r = await core(ctx, 'add_item', { menu_item_id: id.slice(5), quantity: 1 });
        if (r.ok) return afterAdd(ctx, r);
        if (r.code === 'OPTIONS_PENDING' && r.question) return askOption(ctx, r.question, r.say);
        return showCategories(ctx, 'Sorry, that item is no longer available.');
    }
    if (id === 'cart' || ['cart', 'basket'].includes(lower)) return showCartWithActions(ctx);
    if (id === 'clear') {
        const r = await core(ctx, 'clear_basket');
        rememberQuestion(convo, null);
        convo.state = 'browsing';
        return showCartWithActions(ctx, '🗑️ Basket emptied.', r.basket || [], r.quote);
    }
    if (id === 'checkout' || ['checkout', 'pay'].includes(lower)) return startCheckout(ctx);
    if (id.startsWith('type:')) {
        const type = id.slice(5) === 'collection' ? 'collection' : 'delivery';
        const r = await core(ctx, 'set_order_type', { order_type: type });
        if (!r.ok) return send(ctx, msg.text(r.say), r.say, 'system');
        convo.order_type = type;
        return startCheckout(ctx, true);
    }
    if (['staff', 'human', 'agent', 'speak to someone'].includes(lower)) return startHandoff(ctx);

    // Quick-reply buttons from the AI carry their label back as text
    const text = id.startsWith('qr:') ? id.split(':').slice(2).join(':') : input.text;

    if (isNew && GREETING.test(text.trim())) {
        const welcome = channel.welcome_message
            || await botText(ctx, 'wa_welcome', { customer_first_name: convo.customer_name ? convo.customer_name.split(' ')[0] : 'there' });
        return showCategories(ctx, welcome);
    }

    return runAgent(ctx, text);
}

// ── Entry point ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    const url = new URL(req.url);

    if (req.method === 'GET') {
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token');
        const challenge = url.searchParams.get('hub.challenge') || '';
        const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
        if (mode === 'subscribe' && expected && token && timingSafeEqual(token, expected)) {
            return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
        }
        return new Response('Forbidden', { status: 403 });
    }
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const raw = new Uint8Array(await req.arrayBuffer());
    if (!(await validSignature(raw, req.headers.get('x-hub-signature-256')))) {
        console.warn('[whatsappWebhook] invalid or missing signature');
        return new Response('Invalid signature', { status: 401 });
    }

    let body;
    try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return new Response('OK', { status: 200 }); }
    if (body?.object !== 'whatsapp_business_account') return new Response('OK', { status: 200 });

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
            if (change.field === 'message_template_status_update') {
                await handleTemplateStatus(db, entry.id, change.value).catch((e) => console.error('[whatsappWebhook] template status failed:', e.message));
                continue;
            }
            if (change.field !== 'messages') continue;
            const value = change.value || {};
            const phoneNumberId = value.metadata?.phone_number_id;

            // ── Delivery receipts ──
            for (const st of value.statuses || []) {
                try {
                    const rows = await db.WaMessage.filter({ wamid: st.id });
                    if (rows[0]) {
                        const rank = { sent: 1, delivered: 2, read: 3, failed: 4 };
                        if ((rank[st.status] || 0) >= (rank[rows[0].status] || 0)) {
                            await db.WaMessage.update(rows[0].id, {
                                status: st.status,
                                ...(st.errors?.length ? { error: st.errors.map((e) => `${e.code}: ${e.title}`).join('; ') } : {}),
                            });
                        }
                    }
                } catch (e) { console.error('[whatsappWebhook] status update failed:', e.message); }
            }

            if (!value.messages?.length || !phoneNumberId) continue;

            const channels = await db.WhatsAppChannel.filter({ phone_number_id: phoneNumberId });
            const channel = channels.find((c) => c.status === 'connected');
            if (!channel) { console.warn(`[whatsappWebhook] no connected channel for ${phoneNumberId}`); continue; }

            const restaurant = (await db.Restaurant.filter({ id: channel.restaurant_id }))[0];
            if (!restaurant) continue;

            for (const m of value.messages) {
                try {
                    // Dedupe: Meta retries until it gets a 200, so the same wamid can arrive twice
                    const seen = await db.WaMessage.filter({ wamid: m.id });
                    if (seen.length) continue;

                    const waId = m.from;
                    const profileName = (value.contacts || []).find((c) => c.wa_id === waId)?.profile?.name;
                    let convo = (await db.WaConversation.filter({ channel_id: channel.id, customer_wa_id: waId }))[0];
                    const isNew = !convo;
                    if (!convo) {
                        convo = await db.WaConversation.create({
                            channel_id: channel.id, restaurant_id: channel.restaurant_id, customer_wa_id: waId,
                            customer_name: profileName, state: 'browsing', cart: [], history: [], unread_count: 0,
                        });
                    }

                    const inbound = readInbound(m);
                    await db.WaMessage.create({
                        conversation_id: convo.id, restaurant_id: channel.restaurant_id, wamid: m.id,
                        direction: 'inbound', sender: 'customer', msg_type: m.type,
                        body: clip(inbound.text, 2000), payload: inbound.id ? { reply_id: inbound.id } : undefined,
                        status: 'received',
                    });

                    // Deep copy: handlers mutate nested objects (cart copy, pending question)
                    const ctx = { base44, db, channel, restaurant, convo: JSON.parse(JSON.stringify(convo)), isNew, sentTexts: [] };
                    ctx.convo.customer_name = ctx.convo.customer_name || profileName;
                    ctx.convo.last_inbound_at = nowIso();
                    ctx.convo.last_message_preview = clip(inbound.text, 120);

                    await markReadWithTyping(channel, m.id);
                    try {
                        await handleMessage(ctx, m);
                    } catch (e) {
                        // The order engine could not be reached: tell the customer rather than go silent
                        console.error(`[whatsappWebhook] handling ${m.id} failed:`, e.message);
                        const t = 'Sorry, something went wrong on our side. Please try again in a moment, or type *staff* to reach the team.';
                        await send(ctx, msg.text(t), `[error] ${clip(e.message, 200)}`, 'system');
                    }

                    // Write back ONLY what this message changed. The LLM call takes seconds, and in
                    // that time whatsappOrderNotify may link a placed order (order_id, empty cart)
                    // or staff may take over - rewriting every field from the copy taken before
                    // would silently undo those changes.
                    const c = ctx.convo;
                    const OWNED = ['state', 'cart', 'pending_item', 'order_type', 'delivery_address', 'ai_session_id',
                        'history', 'last_inbound_at', 'last_message_preview', 'unread_count', 'customer_name'];
                    const patch = {};
                    for (const f of OWNED) {
                        const after = c[f] ?? null;
                        if (JSON.stringify(after) !== JSON.stringify(convo[f] ?? null)) patch[f] = after;
                    }
                    if (Object.keys(patch).length) await db.WaConversation.update(convo.id, patch);
                } catch (e) {
                    console.error(`[whatsappWebhook] message ${m.id} failed:`, e.message);
                }
            }

            await db.WhatsAppChannel.update(channel.id, { last_inbound_at: nowIso() }).catch(() => {});
        }
    }

    return new Response('OK', { status: 200 });
});
