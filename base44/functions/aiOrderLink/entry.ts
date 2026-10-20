/**
 * aiOrderLink — links a card order paid through an AI pay link back to its AiOrderSession
 *
 * Runs from the "AI Order Link" workflow on every Order create. The pay link
 * (aiOrderingCore send_payment_link -> /AiCheckout) hands the basket to the normal
 * website checkout, which knows nothing about the AI session - so a new ONLINE
 * order is matched to a session waiting for payment at the same restaurant within
 * the link's lifetime, by EITHER the customer's phone (last 10 digits) OR an
 * identical basket. Same rule as whatsappOrderNotify uses for WhatsApp chats.
 *
 * On a unique match: AiOrderSession gets order_id, state 'ordered', token revoked;
 * the Order gets ai_channel + ai_session_id. Cash orders placed by aiOrderingCore
 * are tagged at creation and skipped here.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const LINK_WINDOW_MS = 3 * 60 * 60 * 1000;
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const basketKey = (lines) => (lines || []).map((l) => `${l.menu_item_id}x${l.quantity}`).sort().join('|');

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const orderId = body.orderId || body.event?.entity_id || body.data?.id;
        if (!orderId) return Response.json({ skipped: 'no order id' });

        const db = base44.asServiceRole.entities;
        const order = (await db.Order.filter({ id: orderId }))[0];
        if (!order) return Response.json({ skipped: 'order not found' });
        if (order.ai_session_id) return Response.json({ skipped: 'already linked' });
        if ((order.order_source || 'online') !== 'online') return Response.json({ skipped: 'not an online order' });
        if (Date.now() - new Date(order.created_date).getTime() > LINK_WINDOW_MS) return Response.json({ skipped: 'too old' });

        // Any session with a live pay link counts - including one whose call has ended
        // (sessions closed by an older version of end_session kept their link too).
        const live = (s) => s.checkout_token && !s.order_id
            && (!s.checkout_token_expires_at || new Date(s.checkout_token_expires_at).getTime() > Date.now() - 15 * 60 * 1000)
            && new Date(s.updated_date || s.last_activity_at).getTime() > Date.now() - LINK_WINDOW_MS;
        const waiting = (await db.AiOrderSession.filter({ restaurant_id: order.restaurant_id }, '-updated_date', 200))
            .filter((s) => ['awaiting_payment', 'closed', 'active'].includes(s.state) && live(s));
        if (!waiting.length) return Response.json({ skipped: 'no waiting sessions' });

        const phone = last10(order.phone || order.customer_phone);
        const key = basketKey(order.items);
        const byPhone = phone.length === 10 ? waiting.filter((s) => last10(s.customer_phone) === phone) : [];
        const byBasket = waiting.filter((s) => basketKey(s.cart) === key);
        let candidates = byPhone.length ? byPhone : byBasket;
        // The same customer can have two links open (a call and a chat): the basket decides
        if (candidates.length > 1) {
            const same = candidates.filter((s) => basketKey(s.cart) === key);
            if (same.length >= 1) candidates = same;
        }
        if (candidates.length > 1 && byPhone.length) {
            candidates = [...candidates].sort((a, b) => String(b.last_activity_at || '').localeCompare(String(a.last_activity_at || ''))).slice(0, 1);
        }
        if (candidates.length !== 1) return Response.json({ skipped: `no unique match (${candidates.length})` });

        const session = candidates[0];
        await db.AiOrderSession.update(session.id, {
            order_id: order.id, state: 'ordered', checkout_token: null, checkout_token_expires_at: null,
            last_activity_at: new Date().toISOString(),
            event_log: [...(session.event_log || []), { at: new Date().toISOString(), action: 'linked_paid_order', ok: true, note: `order ${order.id}` }].slice(-50),
        });
        await db.Order.update(order.id, { ai_channel: session.channel === 'test' ? 'web_chat' : session.channel, ai_session_id: session.id });
        return Response.json({ linked: session.id });
    } catch (e) {
        console.error('[aiOrderLink]', e?.message);
        return Response.json({ error: e?.message || 'failed' }, { status: 500 });
    }
});
