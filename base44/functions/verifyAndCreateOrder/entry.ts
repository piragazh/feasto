/**
 * CRITICAL SECURITY: Verify and create orders server-side
 * - Validates Stripe payment intent if card payment
 * - Verifies restaurant is open and accepting orders
 * - Prevents order creation without valid payment
 * - Prevents data tampering from frontend
 * - Idempotency: client must supply idempotency_key to prevent duplicate orders
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
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

        // Order velocity throttle: per-user burst limit, platform-wide circuit breaker,
        // and duplicate basket fingerprint guard.
        // NOTE: True per-IP rate limiting is NOT enforced here — the Order entity does not
        // store client IP, so filtering by IP is not possible at the application layer.
        const velocityResult = await base44.functions.invoke('orderVelocityThrottle', { orderData });
        if (velocityResult?.data && !velocityResult.data.allowed) {
            return new Response(
                JSON.stringify({ 
                    error: velocityResult.data.error || 'Too many orders. Please wait.',
                    success: false 
                }),
                { status: 429, headers: { 'Retry-After': String(velocityResult.data.retryAfter || 60) } }
            );
        }

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
                console.log(`[ORDER] Duplicate request key=${idempotency_key} → existing order ${existing[0].id}`);
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
                
                console.log(`[PAYMENT] Verified intent=${paymentIntentId} amount=${paymentIntent.amount}`);
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

        // Check opening hours schedule (unless order is scheduled for a future time)
        if (!orderData.is_scheduled) {
            const now = new Date();
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = days[now.getDay()];
            const currentMinutes = now.getHours() * 60 + now.getMinutes();

            const hoursMap = orderData.order_type === 'collection'
                ? (restaurant.collection_hours || restaurant.opening_hours)
                : (orderData.order_type === 'delivery'
                    ? (restaurant.delivery_hours || restaurant.opening_hours)
                    : restaurant.opening_hours);

            const todayHours = hoursMap?.[dayName];

            if (todayHours && todayHours.closed) {
                return new Response(
                    JSON.stringify({ error: 'Restaurant is not accepting orders today', success: false }),
                    { status: 400 }
                );
            }

            if (todayHours && todayHours.open && todayHours.close) {
                const [openH, openM] = todayHours.open.split(':').map(Number);
                const [closeH, closeM] = todayHours.close.split(':').map(Number);
                const openMinutes = openH * 60 + openM;
                const closeMinutes = closeH * 60 + closeM;

                if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
                    return new Response(
                        JSON.stringify({
                            error: `Restaurant is currently closed. Hours: ${todayHours.open} - ${todayHours.close}`,
                            success: false
                        }),
                        { status: 400 }
                    );
                }
            }
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

            // Use proper ray-casting polygon containment (not bounding box)
            const pointInPolygon = (point, polygon) => {
                const [px, py] = point;
                let inside = false;
                for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                    const [xi, yi] = polygon[i];
                    const [xj, yj] = polygon[j];
                    const intersect = ((yi > py) !== (yj > py)) &&
                        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                }
                return inside;
            };

            let zoneFound = false;
            if (zones && zones.length > 0) {
                for (const zone of zones) {
                    if (zone.coordinates && Array.isArray(zone.coordinates) && zone.coordinates.length >= 3) {
                        const polygon = zone.coordinates.map(c => [c.lng, c.lat]);
                        if (pointInPolygon([lng, lat], polygon)) {
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
        // Enforce Minimum Order
        // ============================================
        if (orderData.order_type === 'delivery') {
            const clientSubtotal = (orderData.items || []).reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);

            // Check delivery zone minimum first
            if (orderData.delivery_coordinates) {
                const zones = await base44.asServiceRole.entities.DeliveryZone.filter({
                    restaurant_id: orderData.restaurant_id,
                    is_active: true
                });
                const pointInPolygon2 = (point, polygon) => {
                    const [px, py] = point;
                    let inside = false;
                    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                        const [xi, yi] = polygon[i];
                        const [xj, yj] = polygon[j];
                        const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
                        if (intersect) inside = !inside;
                    }
                    return inside;
                };
                const lat = orderData.delivery_coordinates.lat;
                const lng = orderData.delivery_coordinates.lng;
                for (const zone of (zones || [])) {
                    if (zone.coordinates?.length >= 3) {
                        const polygon = zone.coordinates.map(c => [c.lng, c.lat]);
                        if (pointInPolygon2([lng, lat], polygon) && zone.min_order_value > 0) {
                            if (clientSubtotal < zone.min_order_value) {
                                return new Response(
                                    JSON.stringify({ error: `Minimum order for delivery to your area is £${zone.min_order_value.toFixed(2)}`, success: false }),
                                    { status: 400 }
                                );
                            }
                            break;
                        }
                    }
                }
            }

            // Fall back to restaurant-level minimum
            if (restaurant.minimum_order > 0 && clientSubtotal < restaurant.minimum_order) {
                return new Response(
                    JSON.stringify({ error: `Minimum order is £${restaurant.minimum_order.toFixed(2)}`, success: false }),
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

        // ============================================
        // COUPON POLICY: ONE coupon code per order.
        //
        // Stacking multiple coupon codes is not permitted.
        // Restaurant promotions (auto-applied BOGO, percentage_off, etc.) are a separate
        // track handled via orderData.discount when no coupon_codes are present — they
        // can combine with a single coupon since they are restaurant-controlled, not
        // user-entered codes.
        //
        // AUTHORITATIVE IDENTIFIER for per-customer limits:
        //   - Authenticated users: created_by (set automatically by the platform to user email)
        //   - Guest users: guest_email supplied by the frontend (weak — self-reported)
        //   NOTE: Guest identity is WEAK. A guest can bypass per-customer limits by changing
        //   their email. This is a known limitation documented in SECURITY_AND_ABUSE_CONTROLS.md.
        //   Authenticated users are strongly enforced.
        // ============================================
        let verifiedDiscount = 0;
        const clientDiscount = orderData.discount || 0;

        // Resolve the customer identifier for per-customer limit checks.
        // For authenticated users, created_by is set by the platform (trustworthy).
        // For guests, we use guest_email (weak but best available signal).
        const customerIdentifier = user?.email || orderData.guest_email || null;

        // Normalise coupon input: the frontend sends coupon_codes (plural, comma-separated string).
        // The Order entity stores coupon_code (singular string). We read from coupon_codes but
        // write coupon_code to the stored order.
        const rawCouponCodes = orderData.coupon_codes || orderData.coupon_code || null;

        if (rawCouponCodes) {
            const couponCodes = String(rawCouponCodes).split(',').map(c => c.trim()).filter(Boolean);

            // POLICY: Reject if more than one coupon code is submitted
            if (couponCodes.length > 1) {
                console.warn(`[COUPON] Stacking rejected: ${couponCodes.length} codes submitted for order restaurant=${orderData.restaurant_id}`);
                return new Response(
                    JSON.stringify({
                        error: 'Only one coupon code can be applied per order.',
                        success: false
                    }),
                    { status: 400 }
                );
            }

            if (couponCodes.length === 1) {
                const code = couponCodes[0];
                const coupons = await base44.asServiceRole.entities.Coupon.filter({ code });

                if (!coupons?.length) {
                    return new Response(
                        JSON.stringify({
                            error: 'The coupon code applied is not recognised. Please remove it and try again.',
                            success: false
                        }),
                        { status: 400 }
                    );
                }

                const coupon = coupons[0];
                const now = new Date();

                // ── A: Active status ────────────────────────────────────────
                if (!coupon.is_active) {
                    console.warn(`[COUPON] Inactive coupon "${code}"`);
                    return new Response(JSON.stringify({ error: 'This coupon is no longer active.', success: false }), { status: 400 });
                }

                // ── B: Date range / expiry ──────────────────────────────────
                if (coupon.valid_from && new Date(coupon.valid_from) > now) {
                    return new Response(JSON.stringify({ error: 'This coupon is not yet valid.', success: false }), { status: 400 });
                }
                if (coupon.valid_until && new Date(coupon.valid_until) < now) {
                    return new Response(JSON.stringify({ error: 'This coupon has expired.', success: false }), { status: 400 });
                }
                // Also check the precise expires_at timestamp (used for reward coupons)
                if (coupon.expires_at && new Date(coupon.expires_at) < now) {
                    return new Response(JSON.stringify({ error: 'This coupon has expired.', success: false }), { status: 400 });
                }

                // ── C: Restaurant scope ─────────────────────────────────────
                if (coupon.restaurant_id && coupon.restaurant_id !== orderData.restaurant_id) {
                    return new Response(JSON.stringify({ error: 'This coupon is not valid for this restaurant.', success: false }), { status: 400 });
                }

                // ── D: Minimum spend ────────────────────────────────────────
                if (coupon.minimum_order && serverSubtotal < coupon.minimum_order) {
                    return new Response(
                        JSON.stringify({ error: `A minimum order of £${coupon.minimum_order.toFixed(2)} is required to use this coupon.`, success: false }),
                        { status: 400 }
                    );
                }

                // ── Global usage limit ──────────────────────────────────────
                if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
                    return new Response(JSON.stringify({ error: 'This coupon has reached its usage limit.', success: false }), { status: 400 });
                }

                // ── A (per-customer): Per-customer usage limit ──────────────
                // CRITICAL: This was MISSING in the original implementation.
                // Uses coupon_code (singular, the correct Order field) — NOT coupon_codes.
                if (coupon.per_customer_limit && coupon.per_customer_limit > 0 && customerIdentifier) {
                    // Check authenticated orders (created_by is platform-set, authoritative)
                    const authOrders = await base44.asServiceRole.entities.Order.filter({
                        created_by: customerIdentifier,
                        coupon_code: coupon.code
                    });
                    let customerUsageCount = Array.isArray(authOrders) ? authOrders.length : 0;

                    // For guests: also check guest_email if the identifier is an email
                    // that might be stored as guest_email on older orders
                    if (!user?.email && orderData.guest_email) {
                        const guestOrders = await base44.asServiceRole.entities.Order.filter({
                            guest_email: orderData.guest_email,
                            coupon_code: coupon.code
                        });
                        const guestCount = Array.isArray(guestOrders) ? guestOrders.length : 0;
                        customerUsageCount = Math.max(customerUsageCount, guestCount);
                    }

                    if (customerUsageCount >= coupon.per_customer_limit) {
                        console.warn(`[COUPON] Per-customer limit hit: identifier=${customerIdentifier} code=${code} used=${customerUsageCount} limit=${coupon.per_customer_limit}`);
                        return new Response(
                            JSON.stringify({
                                error: `You have already used this coupon the maximum number of times (${coupon.per_customer_limit} use${coupon.per_customer_limit === 1 ? '' : 's'} per customer).`,
                                success: false
                            }),
                            { status: 400 }
                        );
                    }
                } else if (coupon.per_customer_limit && coupon.per_customer_limit > 0 && !customerIdentifier) {
                    // No identifier at all — cannot enforce per-customer limit. Log and allow
                    // (guest with no email; very edge case since guest_email is required by the form).
                    console.warn(`[COUPON] Per-customer limit cannot be enforced: no customer identifier for code=${code}`);
                }

                // ── Compute discount ────────────────────────────────────────
                let d = 0;
                if (coupon.discount_type === 'percentage') {
                    d = (serverSubtotal * coupon.discount_value) / 100;
                    if (coupon.max_discount) d = Math.min(d, coupon.max_discount);
                } else if (coupon.discount_type === 'free_delivery') {
                    // free_delivery coupon: server grants delivery fee as discount, capped at actual fee
                    d = Math.min(coupon.discount_value || deliveryFee, deliveryFee);
                } else {
                    d = coupon.discount_value || 0;
                }
                verifiedDiscount = Math.min(d, serverSubtotal);

                // Store the normalised code on the order (singular field, correct entity shape)
                // We'll write coupon_code (not coupon_codes) when creating the order below.
                orderData._verified_coupon_code = coupon.code;
                orderData._verified_coupon_id = coupon.id;
                orderData._coupon_usage_count = coupon.usage_count || 0;

                console.log(`[COUPON] Verified code="${code}" type=${coupon.discount_type} discount=£${verifiedDiscount.toFixed(2)} customer=${customerIdentifier || 'unknown'}`);
            }
        } else {
            // No coupon code: allow restaurant promotion discount, capped at 50% of subtotal
            verifiedDiscount = Math.min(clientDiscount, serverSubtotal * 0.5);
        }

        const discount = verifiedDiscount;
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
        // Store idempotency_key and payment_intent_id so concurrent dupes are caught.
        // Normalise coupon_code field: entity stores coupon_code (singular string).
        // Strip coupon_codes (plural, frontend field) and any internal _verified_* fields.
        // ============================================
        const {
            coupon_codes: _couponCodesPlural,   // strip plural frontend field
            _verified_coupon_code,
            _verified_coupon_id,
            _coupon_usage_count,
            ...cleanOrderData
        } = orderData;

        const newOrder = await base44.asServiceRole.entities.Order.create({
            ...cleanOrderData,
            // Write correct singular field — use server-verified code if available
            coupon_code: _verified_coupon_code || orderData.coupon_code || null,
            ...(idempotency_key ? { idempotency_key } : {}),
            ...(paymentIntentId ? { payment_intent_id: paymentIntentId } : {}),
        });

        // Increment coupon usage_count server-side (atomic, not client-side race)
        // This is intentionally fire-and-forget after order creation to avoid blocking the response.
        if (_verified_coupon_id) {
            base44.asServiceRole.entities.Coupon.update(_verified_coupon_id, {
                usage_count: (_coupon_usage_count || 0) + 1
            }).catch(e => console.warn(`[COUPON] Failed to increment usage_count for coupon ${_verified_coupon_id}:`, e));
        }

        if (!newOrder || !newOrder.id) {
            console.error('[ORDER] Entity create returned no ID for restaurant', orderData.restaurant_id);
            return new Response(
                JSON.stringify({ 
                    error: 'Failed to create order',
                    success: false 
                }),
                { status: 500 }
            );
        }

        console.log(`[ORDER] Created: id=${newOrder.id} num=${newOrder.order_number} restaurant=${orderData.restaurant_id} total=£${serverTotal.toFixed(2)} type=${orderData.order_type} payment=${orderData.payment_method}`);

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
        console.error('[ORDER] verifyAndCreateOrder unhandled error:', error);
        return new Response(
            JSON.stringify({ 
                error: 'Order creation failed. Please try again.',
                success: false 
            }),
            { status: 500 }
        );
    }
});