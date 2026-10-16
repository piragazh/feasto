/**
 * whatsappCheckoutCart — public lookup behind the WhatsApp checkout link
 *
 * The link sent in WhatsApp carries a random one-time token. This returns ONLY
 * what the website checkout needs (restaurant, basket, order type, address hint)
 * for that token, and nothing else about the conversation. The token expires
 * after 2 hours and is cleared once the order is placed (whatsappOrderNotify).
 *
 * Prices returned here are a convenience for the basket display; the website
 * checkout re-validates every price server-side in verifyAndCreateOrder.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });
    try {
        const { token } = await req.json().catch(() => ({}));
        if (!token || typeof token !== 'string' || token.length < 20 || token.length > 64) {
            return Response.json({ error: 'Invalid link' }, { status: 400 });
        }

        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole.entities;
        const convo = (await db.WaConversation.filter({ checkout_token: token }))[0];
        if (!convo) return Response.json({ error: 'This checkout link has already been used or is invalid.' }, { status: 404 });
        if (!convo.checkout_token_expires_at || new Date(convo.checkout_token_expires_at) < new Date()) {
            return Response.json({ error: 'This checkout link has expired. Send "checkout" in WhatsApp for a new one.' }, { status: 410 });
        }

        const restaurant = (await db.Restaurant.filter({ id: convo.restaurant_id }))[0];
        if (!restaurant) return Response.json({ error: 'Restaurant not found' }, { status: 404 });

        const cart = (convo.cart || []).map((l) => ({
            menu_item_id: l.menu_item_id,
            name: l.name,
            price: l.price,
            quantity: l.quantity,
            image_url: l.image_url,
            customizations: l.customizations || {},
            itemQuantities: l.itemQuantities || {},
        }));
        if (!cart.length) return Response.json({ error: 'Your basket is empty.' }, { status: 409 });

        // Customer's WhatsApp number in UK local format, to prefill the phone field
        const wa = String(convo.customer_wa_id || '');
        const phone = wa.startsWith('44') ? `0${wa.slice(2)}` : `+${wa}`;

        return Response.json({
            restaurant_id: restaurant.id,
            restaurant_name: restaurant.name,
            cart,
            order_type: convo.order_type || 'delivery',
            delivery_address: convo.delivery_address || '',
            phone,
            customer_name: convo.customer_name || '',
        });
    } catch (error) {
        console.error('[whatsappCheckoutCart]', error);
        return Response.json({ error: 'Something went wrong' }, { status: 500 });
    }
});
