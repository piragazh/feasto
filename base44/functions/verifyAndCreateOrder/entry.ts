/**
 * CRITICAL SECURITY: Verify and create orders server-side
 * - Validates Stripe payment intent if card payment
 * - Verifies restaurant is open and accepting orders
 * - Prevents order creation without valid payment
 * - Prevents data tampering from frontend
 * - Idempotency: client must supply idempotency_key to prevent duplicate orders
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // Allow guest orders
        const { orderData, paymentIntentId, idempotency_key } = await req.json();

        if (!orderData || !orderData.restaurant_id) {
            return new Response(
                JSON.stringify({ error: 'Invalid order data', success: false }),
                { status: 400 }
            );
        }

        // ============================================
        // IDEMPOTENCY CHECK — prevent double submission
        // ============================================
        if (idempotency_key) {
            const existing = await base44.asServiceRole.entities.Order.filter({
                idempotency_key
            });
            if (existing && existing.length > 0) {
                console.log(`[IDEMPOTENCY] Duplicate order request for key ${idempotency_key}, returning existing order ${existing[0].id}`);
                return new Response(
                    JSON.stringify({
                        success: true,
                        order_id: existing[0].id,
                        order_number: existing[0].order_number,
                        message: 'Order already created',
                        duplicate: true
                    }),
                    { status: 200 }
                );
            }
        }

        // ============================================
        // CRITICAL: Payment Verification
        // ============================================
        if (orderData.payment_method === 'card') {
            if (!paymentIntentId) {
                return new Response(
                    JSON.stringify({ 
                        error: 'Card payment selected but no payment intent found',
                        success: false 
                    }),
                    { status: 400 }
                );
            }

            if (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
                return new Response(
                    JSON.stringify({ 
                        error: 'Invalid payment intent format',
                        success: false 
                    }),
                    { status: 400 }
                );
            }

            // CRITICAL: Verify payment actually succeeded with Stripe
            const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
            
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                
                if (paymentIntent.status !== 'succeeded') {
                    console.error(`Payment not succeeded for intent ${paymentIntentId}: status=${paymentIntent.status}`);
                    return new Response(
                        JSON.stringify({ 
                            error: 'Payment not confirmed. Status: ' + paymentIntent.status,
                            success: false 
                        }),
                        { status: 400 }
                    );
                }
                
                const expectedAmountCents = Math.round(orderData.total * 100);
                if (paymentIntent.amount !== expectedAmountCents) {
                    console.error(`Payment amount mismatch: expected ${expectedAmountCents}, got ${paymentIntent.amount}`);
                    return new Response(
                        JSON.stringify({ 
                            error: 'Payment amount does not match order total',
                            success: false 
                        }),
                        { status: 400 }
                    );
                }

                // DEDUP: ensure this payment intent hasn't already been used for a different order
                const piOrders = await base44.asServiceRole.entities.Order.filter({ payment_intent_id: paymentIntentId });
                if (piOrders && piOrders.length > 0) {
                    console.log(`[IDEMPOTENCY] PaymentIntent ${paymentIntentId} already used for order ${piOrders[0].id}`);
                    return new Response(
                        JSON.stringify({
                            success: true,
                            order_id: piOrders[0].id,
                            order_number: piOrders[0].order_number,
                            message: 'Order already created',
                            duplicate: true
                        }),
                        { status: 200 }
                    );
                }
                
                console.log('✅ Payment verified:', paymentIntentId);
            } catch (stripeError) {
                console.error('Stripe verification failed:', stripeError);
                return new Response(
                    JSON.stringify({ 
                        error: 'Unable to verify payment. Please try again.',
                        success: false 
                    }),
                    { status: 500 }
                );
            }
        }

        // ============================================
        // Verify Restaurant Exists and Is Open
        // ============================================
        let restaurants;
        try {
            restaurants = await base44.asServiceRole.entities.Restaurant.filter({
                id: orderData.restaurant_id
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: 'Restaurant not found or unavailable', success: false }), { status: 404 });
        }

        if (!restaurants || restaurants.length === 0) {
            return new Response(
                JSON.stringify({ 
                    error: 'Restaurant not found or unavailable',
                    success: false 
                }),
                { status: 404 }
            );
        }

        const restaurant = restaurants[0];

        if (restaurant.is_open === false) {
            return new Response(
                JSON.stringify({ 
                    error: 'Restaurant is currently closed',
                    success: false 
                }),
                { status: 400 }
            );
        }

        // ============================================
        // Verify Delivery Zone (if applicable)
        // ============================================
        if (orderData.order_type === 'delivery' && orderData.delivery_coordinates) {
            const lat = orderData.delivery_coordinates.lat;
            const lng = orderData.delivery_coordinates.lng;

            const zones = await base44.asServiceRole.entities.DeliveryZone.filter({
                restaurant_id: orderData.restaurant_id,
                is_active: true
            });

            let zoneFound = false;
            if (zones && zones.length > 0) {
                for (const zone of zones) {
                    if (zone.coordinates && Array.isArray(zone.coordinates)) {
                        const bounds = zone.coordinates.reduce((acc, coord) => ({
                            minLat: Math.min(acc.minLat || 90, coord.lat),
                            maxLat: Math.max(acc.maxLat || -90, coord.lat),
                            minLng: Math.min(acc.minLng || 180, coord.lng),
                            maxLng: Math.max(acc.maxLng || -180, coord.lng)
                        }), {});

                        if (
                            lat >= bounds.minLat && lat <= bounds.maxLat &&
                            lng >= bounds.minLng && lng <= bounds.maxLng
                        ) {
                            zoneFound = true;
                            break;
                        }
                    }
                }
            }

            if (!zoneFound) {
                return new Response(
                    JSON.stringify({ 
                        error: 'Delivery not available to selected location',
                        success: false 
                    }),
                    { status: 400 }
                );
            }
        }

        // ============================================
        // Verify Cart Items Still Exist
        // ============================================
        if (!orderData.items || orderData.items.length === 0) {
            return new Response(
                JSON.stringify({ 
                    error: 'Order contains no items',
                    success: false 
                }),
                { status: 400 }
            );
        }

        const menuItems = await base44.asServiceRole.entities.MenuItem.filter({
            restaurant_id: orderData.restaurant_id
        });

        const menuItemsMap = new Map(menuItems.map(item => [item.id, item]));

        for (const cartItem of orderData.items) {
            if (!menuItemsMap.has(cartItem.menu_item_id)) {
                return new Response(
                    JSON.stringify({ 
                        error: `Item ${cartItem.name} is no longer available`,
                        success: false 
                    }),
                    { status: 400 }
                );
            }

            const menuItem = menuItemsMap.get(cartItem.menu_item_id);
            
            if (menuItem.is_available === false) {
                return new Response(
                    JSON.stringify({ 
                        error: `${cartItem.name} is no longer available`,
                        success: false 
                    }),
                    { status: 400 }
                );
            }

            // SECURITY: Use server-side price — do not trust client-supplied price.
            // Overwrite with the authoritative menu price before storing.
            cartItem.price = menuItem.price;

            const priceDiff = Math.abs(menuItem.price - (orderData.items.find(i => i.menu_item_id === cartItem.menu_item_id)?.price || 0));
            if (priceDiff > 0.50) {
                console.warn(`[SECURITY] Price mismatch for ${cartItem.name}: menu=${menuItem.price}, submitted=${cartItem.price}`);
            }
        }

        // Re-derive subtotal and total from authoritative menu prices (not client values)
        const serverSubtotal = orderData.items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
        const deliveryFee = orderData.delivery_fee || 0;
        const discount = orderData.discount || 0;
        const serverTotal = Math.max(0, serverSubtotal + deliveryFee - discount);

        // Reject if client total deviates by more than £0.50 (rounding tolerance)
        if (Math.abs(serverTotal - orderData.total) > 0.50) {
            console.error(`[SECURITY] Total mismatch: server=${serverTotal}, client=${orderData.total}`);
            return new Response(
                JSON.stringify({
                    error: 'Order total does not match current menu prices. Please refresh and try again.',
                    success: false
                }),
                { status: 400 }
            );
        }

        // Use server-computed total for the stored order
        orderData.total = serverTotal;
        orderData.subtotal = serverSubtotal;

        // ============================================
        // All Validations Passed - Create Order
        // Store idempotency_key and payment_intent_id so concurrent dupes are caught
        // ============================================
        const newOrder = await base44.asServiceRole.entities.Order.create({
            ...orderData,
            ...(idempotency_key ? { idempotency_key } : {}),
            ...(paymentIntentId ? { payment_intent_id: paymentIntentId } : {}),
        });

        if (!newOrder || !newOrder.id) {
            return new Response(
                JSON.stringify({ 
                    error: 'Failed to create order',
                    success: false 
                }),
                { status: 500 }
            );
        }

        return new Response(
            JSON.stringify({
                success: true,
                order_id: newOrder.id,
                order_number: newOrder.order_number,
                message: 'Order created successfully'
            }),
            { status: 201 }
        );

    } catch (error) {
        console.error('Order creation error:', error);
        return new Response(
            JSON.stringify({ 
                error: error.message || 'Order creation failed',
                success: false 
            }),
            { status: 500 }
        );
    }
});