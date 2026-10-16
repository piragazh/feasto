/**
 * whatsappOrderNotify — links a placed order to its WhatsApp chat and sends status updates
 *
 * Runs from the "WhatsApp Order Updates" workflow on every Order create/update.
 *
 * LINKING
 *   The website checkout doesn't know about WhatsApp, so a new order is matched to
 *   a chat that is waiting for payment at the same restaurant, placed within the
 *   checkout link's lifetime, by EITHER
 *     - the customer's phone number (last 10 digits), or
 *     - an identical basket (same items and quantities) - covers a customer who
 *       typed a different number at checkout.
 *   Once linked, WaConversation.order_id is set and the basket is cleared.
 *
 * UPDATES
 *   Each status is sent once (WaConversation.last_notified_status). The wording
 *   comes from Super Admin > Message Templates (MessageTemplate key order_<status>,
 *   restaurant override first), falling back to the built-in text below.
 *   Free-form messages are only allowed within 24h of the customer's last message;
 *   outside that, an APPROVED Meta template with purpose "order_status_update" on
 *   this restaurant's WhatsApp Business Account is used (WaTemplate), else the
 *   legacy WHATSAPP_STATUS_TEMPLATE env ({{1}} order number, {{2}} status text),
 *   otherwise it is skipped.
 *
 * ENV  WHATSAPP_GRAPH_VERSION (default v23.0), WHATSAPP_STATUS_TEMPLATE, WHATSAPP_TEMPLATE_LANG (default en_GB)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const GRAPH = `https://graph.facebook.com/${Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v23.0'}`;
const LINK_WINDOW_MS = 3 * 60 * 60 * 1000;
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000 - 5 * 60 * 1000;

const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const basketKey = (lines) => (lines || [])
    .map((l) => `${l.menu_item_id}x${l.quantity}`)
    .sort()
    .join('|');

// Built-in wording - same defaults as the catalog in messageTemplateAdmin.
// null = not sent unless a template has been written for it.
const DEFAULT_TEXT = {
    order_received: "📥 We've received order {order_number} ({total}). We'll confirm it shortly.",
    order_confirmed: "✅ Order {order_number} accepted — we're on it! Estimated time: {eta}.",
    order_preparing: null,
    order_out_for_delivery: '🛵 Order {order_number} is on its way.',
    order_ready_for_collection: '🛍️ Order {order_number} is ready to collect.',
    order_delivered: '🎉 Order {order_number} delivered. Enjoy! Message us any time to order again.',
    order_collected: '🎉 Thanks for collecting order {order_number}. Enjoy!',
    order_cancelled: '❌ Sorry, order {order_number} was cancelled: {reason}. Any card payment will be refunded. Reply here if you need help.',
    order_refunded: '💷 Order {order_number} has been refunded.',
};

// Short phrase for {status_text} in Meta templates
const STATUS_PHRASE = {
    pending: 'received', confirmed: 'accepted and being prepared', preparing: 'being prepared',
    out_for_delivery: 'out for delivery', ready_for_collection: 'ready to collect', delivered: 'delivered',
    collected: 'collected', cancelled: 'cancelled', refunded: 'refunded',
};

const keyFor = (status) => (status === 'pending' ? 'order_received' : `order_${status}`);

function orderVars(order, restaurant, convo) {
    return {
        order_number: order.order_number || `#${order.id.slice(-6).toUpperCase()}`,
        restaurant_name: restaurant?.name || order.restaurant_name || '',
        customer_name: order.guest_name || convo?.customer_name || 'there',
        total: `£${(Number(order.total) || 0).toFixed(2)}`,
        eta: order.estimated_delivery || restaurant?.delivery_time || 'soon',
        delivery_address: order.delivery_address || '',
        items_count: String((order.items || []).length),
        reason: order.rejection_reason || order.cancellation_reason || 'please contact us for details',
        status_text: STATUS_PHRASE[order.status] || order.status,
    };
}

const fill = (text, vars) => String(text).replace(/\{([a-z_]+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));

async function statusText(db, order, restaurant, convo) {
    const key = keyFor(order.status);
    const rows = (await db.MessageTemplate.filter({ key }).catch(() => [])).filter((r) => r.is_active !== false);
    const tries = [
        (r) => r.restaurant_id === order.restaurant_id && r.channel === 'whatsapp',
        (r) => r.restaurant_id === order.restaurant_id && r.channel === 'any',
        (r) => !r.restaurant_id && r.channel === 'whatsapp',
        (r) => !r.restaurant_id && r.channel === 'any',
    ];
    let body = null;
    for (const t of tries) { const hit = rows.find(t); if (hit) { body = hit.body; break; } }
    body = body ?? DEFAULT_TEXT[key] ?? null;
    return body ? fill(body, orderVars(order, restaurant, convo)) : null;
}

/** An approved order-update Meta template on this WhatsApp Business Account, if any. */
async function approvedStatusTemplate(db, wabaId) {
    const rows = await db.WaTemplate.filter({ purpose: 'order_status_update' }).catch(() => []);
    return rows.find((t) => (t.submissions || []).some((s) => s.waba_id === wabaId && s.status === 'APPROVED')) || null;
}

async function sendWa(channel, to, payload) {
    const res = await fetch(`${GRAPH}/${channel.phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${channel.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return data?.messages?.[0]?.id || null;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const orderId = body.orderId || body.event?.entity_id || body.data?.id;
        if (!orderId) return Response.json({ skipped: 'no order id' });

        const db = base44.asServiceRole.entities;
        const order = (await db.Order.filter({ id: orderId }))[0];
        if (!order) return Response.json({ skipped: 'order not found' });

        // ── Find or establish the link ──
        let convo = (await db.WaConversation.filter({ order_id: order.id }))[0];
        if (!convo) {
            const ageMs = Date.now() - new Date(order.created_date).getTime();
            if (ageMs > LINK_WINDOW_MS) return Response.json({ skipped: 'not a whatsapp order' });

            const waiting = (await db.WaConversation.filter({ restaurant_id: order.restaurant_id, state: 'awaiting_payment' }))
                .filter((c) => c.checkout_token && new Date(c.updated_date).getTime() > Date.now() - LINK_WINDOW_MS);
            if (!waiting.length) return Response.json({ skipped: 'no waiting chats' });

            const phone = last10(order.phone || order.customer_phone);
            const key = basketKey(order.items);
            const byPhone = phone.length === 10 ? waiting.filter((c) => last10(c.customer_wa_id) === phone) : [];
            const byBasket = waiting.filter((c) => basketKey(c.cart) === key);
            const candidates = byPhone.length ? byPhone : byBasket;
            // Ambiguous basket match (two chats, same basket) - don't guess
            if (candidates.length !== 1) return Response.json({ skipped: `no unique match (${candidates.length})` });

            convo = candidates[0];
            await db.WaConversation.update(convo.id, {
                order_id: order.id, cart: [], pending_item: null, checkout_token: null,
                checkout_token_expires_at: null, state: 'browsing', last_notified_status: null,
            });
            convo = { ...convo, order_id: order.id, last_notified_status: null };
        }

        if (convo.last_notified_status === order.status) return Response.json({ skipped: 'already sent' });
        const channel = (await db.WhatsAppChannel.filter({ id: convo.channel_id }))[0];
        if (!channel || channel.status !== 'connected') return Response.json({ skipped: 'channel not connected' });

        const restaurant = (await db.Restaurant.filter({ id: order.restaurant_id }))[0];
        const text = await statusText(db, order, restaurant, convo);
        if (!text) return Response.json({ skipped: `no message for ${order.status}` });

        const inWindow = convo.last_inbound_at && Date.now() - new Date(convo.last_inbound_at).getTime() < SERVICE_WINDOW_MS;
        const template = Deno.env.get('WHATSAPP_STATUS_TEMPLATE');
        const built = inWindow ? null : await approvedStatusTemplate(db, channel.waba_id);
        let payload;
        if (inWindow) {
            payload = { type: 'text', text: { body: text } };
        } else if (built) {
            const vars = orderVars(order, restaurant, convo);
            const params = built.param_order || [];
            payload = {
                type: 'template',
                template: {
                    name: built.name,
                    language: { code: built.language || 'en_GB' },
                    components: params.length
                        ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(vars[p] ?? '') || '-' })) }]
                        : [],
                },
            };
        } else if (template) {
            payload = {
                type: 'template',
                template: {
                    name: template,
                    language: { code: Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'en_GB' },
                    components: [{
                        type: 'body',
                        parameters: [
                            { type: 'text', text: order.order_number || order.id.slice(-6).toUpperCase() },
                            { type: 'text', text: text.replace(/^\S+\s/, '') },
                        ],
                    }],
                },
            };
        } else {
            return Response.json({ skipped: 'outside 24h window and no template configured' });
        }

        let wamid = null;
        let error = null;
        try { wamid = await sendWa(channel, convo.customer_wa_id, payload); } catch (e) { error = e.message; }

        await db.WaMessage.create({
            conversation_id: convo.id, restaurant_id: convo.restaurant_id, wamid, direction: 'outbound',
            sender: 'system', msg_type: payload.type, body: text, status: error ? 'failed' : 'sent', error: error || undefined,
        });
        if (!error) await db.WaConversation.update(convo.id, { last_notified_status: order.status });

        return Response.json({ sent: !error, error });
    } catch (e) {
        console.error('[whatsappOrderNotify]', e);
        return Response.json({ error: e.message }, { status: 500 });
    }
});
