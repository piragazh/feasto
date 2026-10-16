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
 *   Each status is sent once (WaConversation.last_notified_status). Free-form
 *   messages are only allowed within 24h of the customer's last message; outside
 *   that, an approved template is used if WHATSAPP_STATUS_TEMPLATE is set
 *   (body params: {{1}} order number, {{2}} status text), otherwise it is skipped.
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

function statusText(order, restaurant) {
    const num = order.order_number || `#${order.id.slice(-6).toUpperCase()}`;
    const eta = restaurant?.delivery_time ? ` Estimated ${restaurant.delivery_time}.` : '';
    switch (order.status) {
        case 'pending': return `📥 We've received order ${num} (${'£' + (order.total || 0).toFixed(2)}). We'll confirm it shortly.`;
        case 'confirmed': return `✅ Order ${num} accepted — we're on it!${order.order_type === 'delivery' ? eta : ''}`;
        case 'out_for_delivery': return `🛵 Order ${num} is on its way.`;
        case 'ready_for_collection': return `🛍️ Order ${num} is ready to collect.`;
        case 'delivered': return `🎉 Order ${num} delivered. Enjoy! Message us any time to order again.`;
        case 'collected': return `🎉 Thanks for collecting order ${num}. Enjoy!`;
        case 'cancelled': return `❌ Sorry, order ${num} was cancelled${order.rejection_reason || order.cancellation_reason ? `: ${order.rejection_reason || order.cancellation_reason}` : ''}. Any card payment will be refunded. Reply here if you need help.`;
        case 'refunded': return `💷 Order ${num} has been refunded.`;
        default: return null; // preparing etc. - not worth a message
    }
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
        const text = statusText(order, restaurant);
        if (!text) return Response.json({ skipped: `no message for ${order.status}` });

        const inWindow = convo.last_inbound_at && Date.now() - new Date(convo.last_inbound_at).getTime() < SERVICE_WINDOW_MS;
        const template = Deno.env.get('WHATSAPP_STATUS_TEMPLATE');
        let payload;
        if (inWindow) {
            payload = { type: 'text', text: { body: text } };
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
