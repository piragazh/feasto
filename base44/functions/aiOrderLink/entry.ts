/**
 * aiOrderLink — closes the AI session once its pay-link order has been placed
 *
 * Runs from the "AI Order Link" workflow on every Order create.
 *
 * HOW AN ORDER IS TIED TO ITS CONVERSATION
 *   The pay link (aiOrderingCore send_payment_link -> /AiCheckout?t=TOKEN) hands the
 *   basket to the normal website checkout. The page keeps the link's token and sends
 *   it with the order; verifyAndCreateOrder looks the token up and creates the Order
 *   already tagged with ai_channel + ai_session_id. This function then marks that
 *   session 'ordered' and revokes the token.
 *
 *   There is NO guessing. An earlier version matched a new order to a waiting session
 *   by phone number or by an identical basket, which could attach a stranger's website
 *   order to someone else's chat (and send them its WhatsApp updates). An order that
 *   arrives without a valid token is simply an ordinary online order.
 *
 * Cash orders placed by aiOrderingCore are tagged and closed by the core itself; they
 * are not tagged yet when this runs, so they are skipped here.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const orderId = body.orderId || body.event?.entity_id || body.data?.id;
        if (!orderId) return Response.json({ skipped: 'no order id' });

        const db = base44.asServiceRole.entities;
        const order = (await db.Order.filter({ id: String(orderId) }).catch(() => []))[0];
        if (!order) return Response.json({ skipped: 'order not found' });
        if (!order.ai_session_id) return Response.json({ skipped: 'not from an AI pay link' });

        const session = (await db.AiOrderSession.filter({ id: String(order.ai_session_id) }).catch(() => []))[0];
        if (!session) return Response.json({ skipped: 'session not found' });
        if (session.restaurant_id !== order.restaurant_id) return Response.json({ skipped: 'session belongs to another restaurant' });
        if (session.order_id) return Response.json({ skipped: session.order_id === order.id ? 'already closed' : 'session already has an order' });

        const at = new Date().toISOString();
        await db.AiOrderSession.update(session.id, {
            order_id: order.id, state: 'ordered', checkout_token: null, checkout_token_expires_at: null,
            last_activity_at: at,
            event_log: [...(session.event_log || []), { at, action: 'linked_paid_order', ok: true, note: `order ${order.id}` }].slice(-50),
        });
        return Response.json({ linked: session.id });
    } catch (e) {
        console.error('[aiOrderLink]', e?.message);
        return Response.json({ error: e?.message || 'failed' }, { status: 500 });
    }
});
