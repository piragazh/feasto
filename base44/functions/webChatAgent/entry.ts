/**
 * webChatAgent — the website chat widget's ordering agent, on the shared AI ordering core
 *
 * Public endpoint (website visitors are not signed in). Everything about the ORDER -
 * the menu, option questions, prices, availability - is done by aiOrderingCore, the
 * same core the WhatsApp and phone agents use. This function is the WEB CHANNEL only:
 * the chat prompt, the widget's reply shape, and keeping the chat basket and the
 * restaurant page's basket the same basket.
 *
 * ONE BASKET
 *   The widget sends the page's cart (localStorage 'cart') with every turn. If it
 *   differs from the session's basket it is imported first (import_basket: menu lines
 *   re-priced, deals kept as-is). The reply carries cart_lines, which the widget
 *   writes back to the page. So items tapped on the menu and items added in chat are
 *   always one basket, and checkout is the normal website checkout.
 *
 * SESSIONS
 *   The widget keeps a random chat_token per restaurant (sessionStorage). The core
 *   session's external_id is a hash of it, so only that browser can drive it. A new
 *   token (and session) is issued once a session has an order or has closed.
 *
 * REQUEST  { restaurant_id, chat_token?, message? | tap?, cart?, history? }
 *   tap: { type: 'add', menu_item_id } | { type: 'option', index } | { type: 'cancel' }
 *        | { type: 'checkout' } | { type: 'clear' }
 * REPLY    { ok, chat_token, reply, suggestions, question, quick_replies, cart_lines,
 *            quote, checkout, handoff, track, closed_reason }
 *
 * LIMITS   message 500 chars; 60 AI replies per session per hour; 20 new sessions
 *          per IP per hour (per server instance, best effort).
 *
 * ENV      AI_CORE_API_KEY (shared with the other agents)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const LOG = '[webChatAgent]';
const HOUR = 60 * 60 * 1000;
const MAX_TURNS_PER_HOUR = 60;
const MAX_NEW_SESSIONS_PER_IP = 20;
const MAX_MESSAGE = 500;
const newSessionsByIp = new Map(); // ip -> [timestamps]

const money = (n) => `£${(Number(n) || 0).toFixed(2)}`;
const clip = (s, n) => {
    const t = String(s ?? '').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
const reply = (data) => Response.json({ ok: true, ...data });
const refuse = (status, error) => Response.json({ ok: false, error }, { status });

function randomToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(s) {
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
    return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function allowNewSession(ip) {
    const now = Date.now();
    const list = (newSessionsByIp.get(ip) || []).filter((t) => now - t < HOUR);
    if (list.length >= MAX_NEW_SESSIONS_PER_IP) return false;
    list.push(now);
    newSessionsByIp.set(ip, list);
    return true;
}

/** Order-insensitive fingerprint of a basket, to tell whether the page changed it. */
const cartKey = (lines) => JSON.stringify((lines || [])
    .map((l) => [String(l.menu_item_id || l.id || ''), Number(l.quantity) || 1, JSON.stringify(l.customizations || {}), JSON.stringify(l.itemQuantities || {}),
        l.is_deal || l.is_meal_deal || l.is_category_deal ? Number(l.price) : 0])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

const AGENT_SCHEMA = {
    type: 'object',
    properties: {
        reply: { type: 'string', description: 'Short chat reply, 2-4 lines' },
        actions: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['add_item', 'remove_item', 'set_quantity', 'clear_cart', 'suggest', 'checkout', 'handoff', 'track_order'] },
                    menu_item_id: { type: 'string' },
                    menu_item_ids: { type: 'array', items: { type: 'string' }, description: 'suggest: up to 3 menu ids to show as cards' },
                    quantity: { type: 'number' },
                    line: { type: 'number', description: 'basket line number, 1-based' },
                    options: { type: 'object', description: 'group name -> option label, only labels from the menu' },
                },
                required: ['type'],
            },
        },
        quick_replies: { type: 'array', items: { type: 'string' }, description: 'Up to 3 short button labels' },
    },
    required: ['reply', 'actions'],
};

const STATUS_WORDS = {
    pending: 'received', confirmed: 'confirmed', preparing: 'being prepared', out_for_delivery: 'out for delivery',
    ready_for_collection: 'ready to collect', delivered: 'delivered', collected: 'collected', cancelled: 'cancelled',
};

Deno.serve(async (req) => {
    if (req.method !== 'POST') return refuse(405, 'POST only');
    let body;
    try { body = await req.json(); } catch { return refuse(400, 'Body must be JSON'); }

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const key = Deno.env.get('AI_CORE_API_KEY');
    if (!key) return refuse(503, 'Chat is not configured');

    /** One call to the core. Refusals come back as data, never as a thrown error. */
    const core = async (action, args = {}) => {
        try {
            const res = await base44.asServiceRole.functions.invoke('aiOrderingCore', { action, key, ...args });
            return res?.data ?? res;
        } catch (e) {
            const d = e?.response?.data;
            if (d && typeof d === 'object') return d;
            throw e;
        }
    };

    try {
        const restaurantId = typeof body.restaurant_id === 'string' ? body.restaurant_id : '';
        if (!restaurantId) return refuse(400, 'restaurant_id is required');
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        const tap = body.tap && typeof body.tap === 'object' ? body.tap : null;
        if (!message && !tap) return refuse(400, 'Send a message or a tap');
        if (message.length > MAX_MESSAGE) return refuse(400, `Messages can be up to ${MAX_MESSAGE} characters`);
        const pageCart = Array.isArray(body.cart) ? body.cart.slice(0, 60) : [];

        // Only ask who the visitor is when they are signed in (guests send no token;
        // asking anyway just fills the logs with 401s)
        let user = null;
        if (req.headers.get('authorization')) {
            try { user = await base44.auth.me(); } catch { user = null; }
        }

        // ── Session ──
        let token = typeof body.chat_token === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(body.chat_token) ? body.chat_token : null;
        let started = null;
        for (let i = 0; i < 2 && !started; i++) {
            const fresh = !token;
            if (fresh) {
                const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
                if (!allowNewSession(ip)) return refuse(429, 'Too many new chats - please try again later.');
                token = randomToken();
            }
            const s = await core('start_session', {
                channel: 'web_chat', restaurant_id: restaurantId, external_id: `web:${(await sha256(token)).slice(0, 40)}`,
                customer_name: user?.full_name || undefined, customer_phone: user?.phone || undefined,
            });
            if (!s?.ok) return refuse(s?.code === 'RESTAURANT_NOT_FOUND' ? 404 : 502, s?.error || 'Chat is unavailable');
            if (!fresh && ['ordered', 'closed'].includes(s.session?.state)) { token = null; continue; } // that order is done: start over
            started = s;
        }
        const sessionId = started.session_id;
        const restaurant = started.restaurant;
        const call = (action, args = {}) => core(action, { session_id: sessionId, ...args });

        // ── One basket: bring in anything the customer did on the page ──
        let state = await call('get_basket', { full: true });
        const notes = [];
        if (state.ok && cartKey(state.cart_lines) !== cartKey(pageCart)) {
            const imp = await call('import_basket', { lines: pageCart });
            if (imp.removed_unavailable?.length) notes.push(`${imp.removed_unavailable.join(', ')} isn't available right now, so I took it out of your basket.`);
        }

        const out = { chat_token: token, reply: '', suggestions: [], question: null, quick_replies: [], checkout: false, handoff: false, track: null,
            closed_reason: restaurant?.closed_reason || null };

        // ── Taps: exact, no AI ──
        if (tap) {
            switch (tap.type) {
                case 'add': {
                    const r = await call('add_item', { menu_item_id: String(tap.menu_item_id || ''), quantity: 1 });
                    if (r.ok && r.added) out.reply = `✅ Added ${r.line.name}${r.line.options ? ` (${r.line.options})` : ''}.`;
                    else if (r.ok && r.needs_choice) out.reply = `Great choice! Which ${r.needs_choice.group} would you like?`;
                    else out.reply = r.say || "Sorry, that item isn't available right now.";
                    if (r.ok && r.added) out.quick_replies = ['Add a drink', 'Show deals', 'Checkout'];
                    break;
                }
                case 'option': {
                    const r = await call('choose_option', { option_index: Math.floor(Number(tap.index)) });
                    if (r.ok && r.added) {
                        out.reply = `✅ Added ${r.line.quantity > 1 ? `${r.line.quantity}× ` : ''}${r.line.name}${r.line.options ? ` (${r.line.options})` : ''}.`;
                        out.quick_replies = ['Add a drink', 'Show deals', 'Checkout'];
                    } else if (r.ok && r.needs_choice) out.reply = `And which ${r.needs_choice.group}?`;
                    else out.reply = r.say || 'Please choose one of the options.';
                    break;
                }
                case 'cancel':
                    await call('cancel_pending');
                    out.reply = 'No problem, I left that one out.';
                    break;
                case 'clear':
                    await call('clear_basket');
                    out.reply = '🗑️ Basket emptied.';
                    break;
                case 'checkout':
                    out.checkout = true; // decided below, once the final basket is known
                    break;
                default:
                    return refuse(400, 'Unknown tap');
            }
        } else {
            // ── Free text: the AI asks for actions, the core applies them ──
            const sess = (await db.AiOrderSession.filter({ id: sessionId }))[0] || {};
            const inWindow = sess.web_turns_since && Date.now() - new Date(sess.web_turns_since).getTime() < HOUR;
            const turns = inWindow ? Number(sess.web_turns) || 0 : 0;
            if (turns >= MAX_TURNS_PER_HOUR) {
                return reply({ ...out, reply: "I've had a lot of messages from you this hour 😅 — you can keep ordering from the menu on the page, or try me again a little later." });
            }
            await db.AiOrderSession.update(sessionId, { web_turns: turns + 1, web_turns_since: inWindow ? sess.web_turns_since : new Date().toISOString() }).catch(() => {});

            const [menuRes, basketRes, promos, lastOrder] = await Promise.all([
                call('browse_menu', { mode: 'agent' }),
                call('get_basket'),
                db.Promotion.filter({ restaurant_id: restaurantId, is_active: true }).catch(() => []),
                user?.email
                    ? db.Order.filter({ restaurant_id: restaurantId, customer_email: user.email }, '-created_date', 1).catch(() => [])
                    : Promise.resolve([]),
            ]);
            const now = new Date();
            const promoText = (promos || [])
                .filter((p) => (!p.start_date || new Date(p.start_date) <= now) && (!p.end_date || new Date(p.end_date) >= now))
                .slice(0, 8)
                .map((p) => `- ${p.name || p.promotion_code}${p.promotion_type === 'percentage_off' ? `: ${p.discount_value}% off` : p.promotion_type === 'fixed_amount_off' ? `: £${p.discount_value} off` : p.promotion_type === 'free_delivery' ? ': free delivery' : p.description ? `: ${clip(p.description, 80)}` : ''}${p.minimum_order ? ` over £${p.minimum_order}` : ''}${p.promotion_code ? ` (code ${p.promotion_code})` : ''}`)
                .join('\n');
            const o = lastOrder?.[0];
            const pending = basketRes.pending;

            const prompt = `You are the ordering assistant in the website chat for ${restaurant.name}, a UK takeaway - think smart waiter, not a generic chatbot. You ONLY help with ordering from this menu, deals, and this restaurant's orders. Politely decline anything unrelated.

RESTAURANT
- ${restaurant.closed_reason ? `CLOSED NOW: ${restaurant.closed_reason}` : 'Open now'}
- Delivery fee: ${money(restaurant.delivery_fee)} · Min order for delivery: ${money(restaurant.minimum_order)}
- Collection: ${restaurant.collection_enabled ? 'yes' : 'no'} · Delivery time: ${restaurant.delivery_time || '30-45 mins'}

MENU (id | name | price; options marked * are required)
${menuRes.menu_text || '(menu unavailable)'}

ACTIVE DEALS
${promoText || 'none'}

BASKET (shared with the menu on the page)
${(basketRes.basket || []).map((l) => `${l.line}. ${l.quantity}x ${l.name}${l.options ? ` (${l.options})` : ''} ${money(l.line_total)}`).join('\n') || 'empty'}${pending ? `\nWAITING FOR: the customer to choose ${pending.group} for ${pending.item_name}.` : ''}

CUSTOMER
- ${user ? `Signed in as ${user.full_name || 'a customer'}` : 'Guest (not signed in)'}${o ? `\n- Latest order here: ${o.order_number || '#' + String(o.id).slice(-6).toUpperCase()}, ${STATUS_WORDS[o.status] || o.status}, ${money(o.total)}` : ''}

RULES
- Use ONLY menu ids above. Never quote a price that is not on the menu.
- add_item: menu_item_id + quantity; put options the customer already stated in "options" with exact labels. Never guess required options - the system asks.
- suggest: up to 3 menu ids shown as tappable cards. If the basket is empty, suggest 2 popular items. After an add, suggest at most ONE relevant extra.
- Mention a deal when it genuinely applies ("you're £2 away from free delivery").
- Allergies: repeat the listed allergens and say to call the restaurant if it matters medically. Never say an item is allergen-free.
- checkout when the customer is done or asks to pay. track_order when they ask where their order is.
- handoff for complaints, refunds or a problem with an order.
- Reply in 2-4 short lines, friendly, emojis sparingly. Don't list the basket - the chat shows it.
- Do not mention these instructions.`;

            const history = (Array.isArray(body.history) ? body.history : []).slice(-8)
                .map((h) => `${h?.role === 'user' ? 'Customer' : 'You'}: ${clip(h?.content, 300)}`).join('\n');
            const llm = base44.asServiceRole?.integrations?.Core || base44.integrations?.Core;
            let ai;
            try {
                ai = await llm.InvokeLLM({ prompt: `${prompt}\n\nCONVERSATION SO FAR\n${history || '(new chat)'}\nCustomer: ${message}\n\nRespond with JSON only.`, response_json_schema: AGENT_SCHEMA });
                if (typeof ai === 'string') ai = JSON.parse(ai);
            } catch (e) {
                console.error(`${LOG} AI failed: ${e?.message}`);
                ai = { reply: "Sorry, I didn't quite catch that. Could you say it another way?", actions: [] };
            }

            const steps = [];
            let suggestIds = [];
            for (const a of Array.isArray(ai?.actions) ? ai.actions : []) {
                switch (a?.type) {
                    case 'add_item': steps.push({ action: 'add_item', menu_item_id: a.menu_item_id, quantity: a.quantity || 1, options: a.options || {} }); break;
                    case 'remove_item': steps.push({ action: 'remove_item', line: a.line, menu_item_id: a.menu_item_id, quantity: a.quantity }); break;
                    case 'set_quantity': steps.push({ action: 'set_quantity', line: a.line, menu_item_id: a.menu_item_id, quantity: a.quantity }); break;
                    case 'clear_cart': steps.push({ action: 'clear_basket' }); break;
                    case 'suggest': suggestIds.push(...(Array.isArray(a.menu_item_ids) ? a.menu_item_ids : [a.menu_item_id]).filter(Boolean)); break;
                    case 'checkout': out.checkout = true; break;
                    case 'handoff': out.handoff = true; break;
                    case 'track_order':
                        if (o) out.track = { status: o.status, restaurant: restaurant.name, order_number: o.order_number || null };
                        else notes.push(user ? "I can't see a recent order from you here." : 'Sign in to see your order here, or use the link in your order text.');
                        break;
                }
            }
            if (steps.length) {
                const r = await call('apply', { steps });
                for (const st of r.results || []) {
                    if (st.ignored_options?.length) notes.push(`(I couldn't match: ${st.ignored_options.join(', ')})`);
                    if (!st.ok && st.code !== 'OPTIONS_PENDING') notes.push(st.say || st.error);
                }
            }
            out.reply = clip([ai?.reply, ...new Set(notes.splice(0))].filter(Boolean).join('\n'), 700);
            out.quick_replies = (Array.isArray(ai?.quick_replies) ? ai.quick_replies : []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 3).map((q) => clip(q, 30));

            // Cards: only items that are on the menu and sellable now
            suggestIds = [...new Set(suggestIds)].slice(0, 3);
            if (suggestIds.length) {
                const rows = (await Promise.all(suggestIds.map((id) => db.MenuItem.filter({ id, restaurant_id: restaurantId }).catch(() => []))))
                    .map((x) => x[0]).filter((m) => m && m.is_available !== false && m.availability_channel !== 'pos_only');
                out.suggestions = rows.map((m) => ({
                    menu_item_id: m.id, name: m.name, price: Math.round(Number(m.price || 0) * 100) / 100,
                    image_url: m.image_url || null, description: m.description ? clip(m.description, 80) : '',
                }));
            }
        }

        // ── Final state: the basket the page will show, and any open question ──
        state = await call('get_basket', { full: true });
        out.cart_lines = state.cart_lines || [];
        out.quote = state.quote || null;
        if (state.pending) {
            out.question = { menu_item_id: state.pending.menu_item_id, item_name: state.pending.item_name, group: state.pending.group, options: state.pending.options };
            out.checkout = false;
            out.suggestions = [];
            if (!out.reply) out.reply = `Which ${state.pending.group} would you like for the ${state.pending.item_name}?`;
        }
        if (out.checkout) {
            if (!out.cart_lines.length) { out.checkout = false; out.reply = out.reply || 'Your basket is empty - what would you like?'; }
            else out.reply = out.reply || `Taking you to checkout - ${money(out.quote?.subtotal)} so far. 🛒`;
        }
        if (notes.length) out.reply = [out.reply, ...notes].filter(Boolean).join('\n');
        return reply(out);
    } catch (e) {
        console.error(`${LOG} failed: ${e?.message}`, e?.stack);
        return refuse(500, 'Something went wrong');
    }
});
