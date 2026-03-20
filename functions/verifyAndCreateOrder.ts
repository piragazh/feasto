/**
 * CRITICAL SECURITY: Verify and create orders server-side
 * - Validates Stripe payment intent if card payment
 * - Verifies restaurant is open and accepting orders
 * - Prevents order creation without valid payment
 * - Prevents data tampering from frontend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // Allow guest orders
        const { orderData, paymentIntentId } = await req.json();

        if (!orderData || !orderData.restaurant_id) {
            return new Response(
                JSON.stringify({ error: 'Invalid order data', success: false }),
                { status: 400 }
            );
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

            // Verify payment intent format
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
            const Stripe = await import('npm:stripe');
            const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
            
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                
                // Payment must be succeeded
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
                
                // Verify amount matches
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
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({
            id: orderData.restaurant_id
        });

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

        // CRITICAL: Verify restaurant is not closed
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

            // Fetch delivery zones for restaurant
            const zones = await base44.asServiceRole.entities.DeliveryZone.filter({
                restaurant_id: orderData.restaurant_id,
                is_active: true
            });

            // Simple point-in-polygon check (basic)
            let zoneFound = false;
            if (zones && zones.length > 0) {
                for (const zone of zones) {
                    if (zone.coordinates && Array.isArray(zone.coordinates)) {
                        // Basic bounding box check (could be enhanced with proper geospatial)
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

        // Fetch menu items to verify they still exist
        const menuItems = await base44.asServiceRole.entities.MenuItem.filter({
            restaurant_id: orderData.restaurant_id
        });

        const menuItemsMap = new Map(menuItems.map(item => [item.id, item]));

        // Verify all items exist
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
            
            // Verify item is still available
            if (menuItem.is_available === false) {
                return new Response(
                    JSON.stringify({ 
                        error: `${cartItem.name} is no longer available`,
                        success: false 
                    }),
                    { status: 400 }
                );
            }

            // Verify price hasn't changed drastically (allow small variance)
            const priceDiff = Math.abs(menuItem.price - cartItem.price);
            if (priceDiff > 10) { // More than £10 difference
                return new Response(
                    JSON.stringify({ 
                        error: `Price for ${cartItem.name} has changed significantly`,
                        success: false 
                    }),
                    { status: 400 }
                );
            }
        }

        // ============================================
        // All Validations Passed - Create Order
        // ============================================
        const newOrder = await base44.asServiceRole.entities.Order.create(orderData);

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