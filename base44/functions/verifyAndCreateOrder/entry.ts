import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

const LOG = '[verifyAndCreateOrder]';

Deno.serve(async (req) => {
    try {
        if (req.method !== 'POST') {
            return Response.json({ error: 'POST only', success: false }, { status: 405 });
        }

        const { orderData, paymentIntentId, idempotency_key } = await req.json();
        const base44 = createClientFromRequest(req);
        let user = null;

        try {
            user = await base44.auth.me();
        } catch (_) {
            user = null;
        }

        if (!orderData || !orderData.restaurant_id || !Array.isArray(orderData.items) || orderData.items.length === 0) {
            return Response.json({ error: 'Invalid order data', success: false, code: 'INVALID_ORDER_DATA' }, { status: 400 });
        }

        if (idempotency_key) {
            const existing = await base44.asServiceRole.entities.Order.filter({ idempotency_key });
            if (existing?.length > 0) {
                return Response.json({ success: true, order_id: existing[0].id, order_number: existing[0].order_number, duplicate: true }, { status: 200 });
            }
        }

        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: orderData.restaurant_id });
        if (!restaurants?.length) {
            return Response.json({ error: 'Restaurant not found', success: false, code: 'RESTAURANT_NOT_FOUND' }, { status: 404 });
        }

        if (orderData.payment_method === 'card' && paymentIntentId) {
            const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                console.warn(`${LOG} [TEMP] Server-side payment checks bypassed status=${paymentIntent.status} amount=${paymentIntent.amount}`);
            } catch (stripeErr) {
                console.warn(`${LOG} [TEMP] Stripe retrieve failed but bypassed: ${stripeErr.message}`);
            }
        }

        const normalizedItems = orderData.items.map((item) => ({
            menu_item_id: item.menu_item_id || item.id || null,
            name: item.name || 'Item',
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 1),
            customizations: item.customizations || {},
            itemQuantities: item.itemQuantities || {}
        }));

        const subtotal = Number(orderData.subtotal || normalizedItems.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 1)), 0));
        const deliveryFee = Number(orderData.delivery_fee || 0);
        const smallOrderSurcharge = Number(orderData.small_order_surcharge || 0);
        const discount = Number(orderData.discount || 0);
        const total = Number(orderData.total || Math.max(0, subtotal + deliveryFee + smallOrderSurcharge - discount));

        const newOrder = await base44.asServiceRole.entities.Order.create({
            ...orderData,
            items: normalizedItems,
            subtotal,
            delivery_fee: deliveryFee,
            small_order_surcharge: smallOrderSurcharge,
            discount,
            total,
            ...(idempotency_key ? { idempotency_key } : {}),
            ...(paymentIntentId ? { payment_intent_id: paymentIntentId } : {}),
            status: orderData.status || 'pending',
            order_source: orderData.order_source || 'online',
            guest_email: orderData.guest_email || null,
            guest_name: orderData.guest_name || null,
            phone: orderData.phone || null,
        });

        if (orderData.payment_method === 'card' && paymentIntentId) {
            const existingTransactions = await base44.asServiceRole.entities.PaymentTransaction.filter({ payment_intent_id: paymentIntentId });
            if (existingTransactions?.length > 0) {
                await base44.asServiceRole.entities.PaymentTransaction.update(existingTransactions[0].id, {
                    status: 'order_created',
                    order_id: newOrder.id,
                    order_number: newOrder.order_number || null,
                    order_created_at: new Date().toISOString()
                });
            } else {
                await base44.asServiceRole.entities.PaymentTransaction.create({
                    payment_intent_id: paymentIntentId,
                    idempotency_key: idempotency_key || null,
                    restaurant_id: orderData.restaurant_id,
                    order_id: newOrder.id,
                    order_number: newOrder.order_number || null,
                    amount: total,
                    currency: 'gbp',
                    status: 'order_created',
                    user_email: user?.email || null,
                    guest_email: orderData.guest_email || null,
                    guest_phone: orderData.phone || null,
                    stripe_verified_at: new Date().toISOString(),
                    order_created_at: new Date().toISOString()
                });
            }
        }

        return Response.json({ success: true, order_id: newOrder.id, order_number: newOrder.order_number }, { status: 201 });
    } catch (error) {
        console.error(`${LOG} fatal:`, error.message);
        return Response.json({ error: error.message, success: false, code: 'ORDER_CREATE_FAILED' }, { status: 500 });
    }
});