/**
 * aiCheckoutCart — public lookup behind the AI ordering pay link (/AiCheckout?t=...)
 *
 * The link sent by aiOrderingCore (send_payment_link) carries a random one-time
 * token. This returns ONLY what the website checkout needs (restaurant, basket,
 * order type, address, phone, name) for that token, nothing else about the session.
 * The token expires after 2 hours and is cleared once the order is placed
 * (aiOrderLink, or a cash order in aiOrderingCore).
 *
 * Prices returned here are for display; verifyAndCreateOrder re-validates every
 * price server-side. Same contract as whatsappCheckoutCart.
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
        const session = (await db.AiOrderSession.filter({ checkout_token: token }))[0];
        if (!session) return Response.json({ error: 'This payment link has already been used or is invalid.' }, { status: 404 });
        if (!session.checkout_token_expires_at || new Date(session.checkout_token_expires_at) < new Date()) {
            return Response.json({ error: 'This payment link has expired. Please call or message us again for a new one.' }, { status: 410 });
        }
        const restaurant = (await db.Restaurant.filter({ id: session.restaurant_id }))[0];
        if (!restaurant) return Response.json({ error: 'Restaurant not found' }, { status: 404 });

        const cart = (session.cart || []).map((l) => ({
            menu_item_id: l.menu_item_id, name: l.name, price: l.price, quantity: l.quantity,
            image_url: l.image_url, customizations: l.customizations || {}, itemQuantities: l.itemQuantities || {},
        }));
        if (!cart.length) return Response.json({ error: 'Your basket is empty.' }, { status: 409 });

        const d = String(session.customer_phone || '');
        const phone = !d ? '' : d.startsWith('44') ? `0${d.slice(2)}` : `+${d}`;
        const address = session.order_type === 'delivery'
            ? [session.delivery_address, session.delivery_postcode && !String(session.delivery_address || '').toUpperCase().includes(session.delivery_postcode) ? session.delivery_postcode : null].filter(Boolean).join(', ')
            : '';

        return Response.json({
            restaurant_id: restaurant.id,
            restaurant_name: restaurant.name,
            cart,
            order_type: session.order_type || 'delivery',
            delivery_address: address,
            phone,
            customer_name: session.customer_name || '',
        });
    } catch (error) {
        console.error('[aiCheckoutCart]', error);
        return Response.json({ error: 'Something went wrong' }, { status: 500 });
    }
});
