/**
 * whatsappOrderNotify — links a placed order to its WhatsApp chat and sends status updates
 *
 * Runs from the "WhatsApp Order Updates" workflow on every Order create/update.
 *
 * LINKING
 *   WhatsApp orders go through aiOrderingCore. A card order paid via the chat's
 *   link is tied to its AiOrderSession by aiOrderLink, and a cash order is tagged
 *   when the core creates it; either way the Order ends up with ai_channel
 *   'whatsapp' and ai_session_id. The chat is the WaConversation whose
 *   ai_session_id matches. Once linked, WaConversation.order_id is set and the
 *   basket copy is cleared. Orders from any other channel are never linked.
 *
 * SEND ONCE
 *   The workflow fires on create AND update, and Order changes in quick bursts,
 *   so two runs can race. Each update is claimed first with a WaMessage row keyed
 *   <order id>:<status>; when two claims exist, only the earliest sends.
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
            // Until aiOrderLink (or the core) has tagged it, this is not known to be a WhatsApp order;
            // the tag is an Order update, which runs this function again.
            if (order.ai_channel !== 'whatsapp' || !order.ai_session_id) return Response.json({ skipped: 'not a whatsapp order' });
            if (Date.now() - new Date(order.created_date).getTime() > LINK_WINDOW_MS) return Response.json({ skipped: 'too old to link' });

            convo = (await db.WaConversation.filter({ ai_session_id: order.ai_session_id }))[0];
            if (!convo) return Response.json({ skipped: 'no chat for this session' });

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

        // ── Claim this update; the earliest claim wins ──
        const dedupeKey = `${order.id}:${order.status}`;
        if ((await db.WaMessage.filter({ dedupe_key: dedupeKey })).some((m) => m.status !== 'failed')) {
            return Response.json({ skipped: 'already sent' });
        }
        const claim = await db.WaMessage.create({
            conversation_id: convo.id, restaurant_id: convo.restaurant_id, direction: 'outbound', sender: 'system',
            msg_type: payload.type, body: text, status: 'sending', dedupe_key: dedupeKey,
        });
        const byAge = (a, b) => String(a.created_date || '').localeCompare(String(b.created_date || ''))
            || String(a.id).length - String(b.id).length || (String(a.id) < String(b.id) ? -1 : 1);
        const claims = (await db.WaMessage.filter({ dedupe_key: dedupeKey })).filter((m) => m.status !== 'failed').sort(byAge);
        if (claims[0]?.id !== claim.id) {
            await db.WaMessage.delete(claim.id).catch(() => {});
            return Response.json({ skipped: 'another run is sending this update' });
        }

        let wamid = null;
        let error = null;
        try { wamid = await sendWa(channel, convo.customer_wa_id, payload); } catch (e) { error = e.message; }

        await db.WaMessage.update(claim.id, { wamid, status: error ? 'failed' : 'sent', error: error || undefined });
        if (!error) await db.WaConversation.update(convo.id, { last_notified_status: order.status });

        return Response.json({ sent: !error, error });
    } catch (e) {
        console.error('[whatsappOrderNotify]', e);
        return Response.json({ error: e.message }, { status: 500 });
    }
});
