/**
 * CRITICAL SECURITY: Verify and create orders server-side
 * - Validates Stripe payment intent if card payment
 * - Verifies restaurant is open and accepting orders
 * - Prevents order creation without valid payment
 * - Prevents data tampering from frontend
 * - Idempotency: client must supply idempotency_key to prevent duplicate orders
 *
 * COUPON STACKING POLICY (max 3 coupons per order):
 *   - Up to 3 coupon codes accepted per order
 *   - All coupons must have stackable=true when more than 1 is applied
 *   - Duplicate codes rejected
 *   - Each coupon independently validated (active, dates, scope, spend, limits)
 *   - Discount application order: percentage coupons first, then fixed-amount coupons
 *   - Total coupon discount capped at 50% of server-computed subtotal
 *   - Final total never goes below 0
 *   - usage_count incremented server-side per coupon after successful order creation
 *   - Stored in Order.coupon_codes (array) + Order.coupon_code (first code, legacy compat)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

// ── Coupon stacking constants ─────────────────────────────────────────────────
const MAX_COUPONS_PER_ORDER = 3;
const MAX_COUPON_DISCOUNT_RATIO = 0.50; // coupon stack cannot exceed 50% of subtotal

// ── Helper: validate a single coupon object against order context ─────────────
// Returns { valid: true, discount } or { valid: false, error }
function validateSingleCoupon(coupon, code, now, serverSubtotal, deliveryFee, restaurantId) {
    if (!coupon.is_active) {
        return { valid: false, error: `Coupon "${code}" is no longer active.` };
    }
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
        return { valid: false, error: `Coupon "${code}" is not yet valid.` };
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
        return { valid: false, error: `Coupon "${code}" has expired.` };
    }
    if (coupon.expires_at && new Date(coupon.expires_at) < now) {
        return { valid: false, error: `Coupon "${code}" has expired.` };
    }
    if (coupon.restaurant_id && coupon.restaurant_id !== restaurantId) {
        return { valid: false, error: `Coupon "${code}" is not valid for this restaurant.` };
    }
    if (coupon.minimum_order && serverSubtotal < coupon.minimum_order) {
        return { valid: false, error: `A minimum order of £${coupon.minimum_order.toFixed(2)} is required to use coupon "${code}".` };
    }
    if (coupon.usage_limit && (coupon.usage_count || 0) >= coupon.usage_limit) {
        return { valid: false, error: `Coupon "${code}" has reached its usage limit.` };
    }

    // Compute raw discount (before stack cap)
    let d = 0;
    if (coupon.discount_type === 'percentage') {
        d = (serverSubtotal * coupon.discount_value) / 100;
        if (coupon.max_discount) d = Math.min(d, coupon.max_discount);
    } else if (coupon.discount_type === 'free_delivery') {
        d = Math.min(coupon.discount_value || deliveryFee, deliveryFee);
    } else if (coupon.discount_type === 'fixed') {
        d = coupon.discount_value || 0;
    } else {
        d = coupon.discount_value || 0;
    }
    d = Math.max(0, d);
    return { valid: true, discount: d };
}

// ── Helper: check per-customer limit for a single coupon ─────────────────────
// Returns null (ok) or an error string.
//
// COMPATIBILITY: Orders can be stored with either:
//   - coupon_code (string): legacy single-code orders AND the "first code" for new stacked orders
//   - coupon_codes (array): new multi-coupon orders (all codes)
//
// To correctly count usage across mixed datasets we must query BOTH fields and
// deduplicate by order ID to avoid double-counting orders that have both fields set
// (all new orders written by posCreateOrder/verifyAndCreateOrder set both).
//
async function checkPerCustomerLimit(base44, coupon, user, normalizedGuestEmail, normalizedPhone) {
    if (!coupon.per_customer_limit || coupon.per_customer_limit <= 0) return null;

    const code = coupon.code;
    const limitMsg = `You have already used coupon "${code}" the maximum number of times (${coupon.per_customer_limit} use${coupon.per_customer_limit === 1 ? '' : 's'} per customer).`;

    // Helper: count unique orders across legacy + array fields, deduplicating by order ID
    async function countUniqueBothFields(identityFilter) {
        // NOTE: Base44 SDK does NOT support $contains on array fields.
        // The correct operator is $all (matches arrays containing all specified elements).
        // Using $all with a single-element array [code] correctly finds orders where
        // coupon_codes contains `code` at any position (position 1, 2, or 3).
        const [legacyOrders, arrayOrders] = await Promise.all([
            base44.asServiceRole.entities.Order.filter({ ...identityFilter, coupon_code: code }),
            base44.asServiceRole.entities.Order.filter({ ...identityFilter, coupon_codes: { $all: [code] } }),
        ]);
        const ids = new Set();
        for (const o of (legacyOrders || [])) ids.add(o.id);
        for (const o of (arrayOrders || [])) ids.add(o.id);
        return ids.size;
    }

    if (user?.email) {
        const count = await countUniqueBothFields({ created_by: user.email });
        if (count >= coupon.per_customer_limit) return limitMsg;
    } else {
        // Guest — check by phone and email separately, take the higher count
        let guestCount = 0;
        if (normalizedGuestEmail) {
            const c = await countUniqueBothFields({ guest_email: normalizedGuestEmail });
            guestCount = Math.max(guestCount, c);
        }
        if (normalizedPhone) {
            const c = await countUniqueBothFields({ phone: normalizedPhone });
            guestCount = Math.max(guestCount, c);
        }
        if (guestCount >= coupon.per_customer_limit) return limitMsg;

        // Guest phone abuse throttle (unchanged)
        if (normalizedPhone) {
            const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
            const recentPhoneOrders = await base44.asServiceRole.entities.Order.filter({
                phone: normalizedPhone,
                created_date: { $gt: oneHourAgo }
            });
            const recentWithCoupon = (recentPhoneOrders || []).filter(o => o.coupon_code || (o.coupon_codes && o.coupon_codes.length > 0));
            if (recentWithCoupon.length >= 3) {
                return 'Too many coupon uses from this phone number. Please try again later or sign in to your account.';
            }
        }
    }
    return null;
}

const _normalizeEmail = (email) => {
    if (!email || typeof email !== 'string') return null;
    return email.trim().toLowerCase() || null;
};
const _normalizePhone = (phone) => {
    if (!phone || typeof phone !== 'string') return null;
    let digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('07') && digits.length === 11) digits = '44' + digits.slice(1);
    return digits.length >= 10 ? digits : null;
};

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // Allow guest orders
        const { orderData, paymentIntentId, idempotency_key } = await req.json();

        // Order velocity throttle
        const velocityResult = await base44.functions.invoke('orderVelocityThrottle', { orderData });
        if (velocityResult?.data && !velocityResult.data.allowed) {
            return new Response(
                JSON.stringify({ error: velocityResult.data.error || 'Too many orders. Please wait.', success: false }),
                { status: 429, headers: { 'Retry-After': String(velocityResult.data.retryAfter || 60) } }
            );
        }

        if (!orderData || !orderData.restaurant_id) {
            return new Response(JSON.stringify({ error: 'Invalid order data', success: false }), { status: 400 });
        }

        // ============================================
        // IDEMPOTENCY CHECK
        // ============================================
        if (idempotency_key) {
            const existing = await base44.asServiceRole.entities.Order.filter({ idempotency_key });
            if (existing && existing.length > 0) {
                console.log(`[ORDER] Duplicate request key=${idempotency_key} → existing order ${existing[0].id}`);
                return new Response(
                    JSON.stringify({ success: true, order_id: existing[0].id, order_number: existing[0].order_number, message: 'Order already created', duplicate: true }),
                    { status: 200 }
                );
            }
        }

        // ============================================
        // CRITICAL: Payment Verification
        // ============================================
        if (orderData.payment_method === 'card') {
            if (!paymentIntentId) {
                return new Response(JSON.stringify({ error: 'Card payment selected but no payment intent found', success: false }), { status: 400 });
            }
            if (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
                return new Response(JSON.stringify({ error: 'Invalid payment intent format', success: false }), { status: 400 });
            }
            const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                if (paymentIntent.status !== 'succeeded') {
                    console.error(`Payment not succeeded for intent ${paymentIntentId}: status=${paymentIntent.status}`);
                    return new Response(JSON.stringify({ error: 'Payment not confirmed. Status: ' + paymentIntent.status, success: false }), { status: 400 });
                }
                const expectedAmountCents = Math.round(orderData.total * 100);
                if (paymentIntent.amount !== expectedAmountCents) {
                    console.error(`Payment amount mismatch: expected ${expectedAmountCents}, got ${paymentIntent.amount}`);
                    return new Response(JSON.stringify({ error: 'Payment amount does not match order total', success: false }), { status: 400 });
                }
                const piOrders = await base44.asServiceRole.entities.Order.filter({ payment_intent_id: paymentIntentId });
                if (piOrders && piOrders.length > 0) {
                    console.log(`[IDEMPOTENCY] PaymentIntent ${paymentIntentId} already used for order ${piOrders[0].id}`);
                    return new Response(
                        JSON.stringify({ success: true, order_id: piOrders[0].id, order_number: piOrders[0].order_number, message: 'Order already created', duplicate: true }),
                        { status: 200 }
                    );
                }
                console.log(`[PAYMENT] Verified intent=${paymentIntentId} amount=${paymentIntent.amount}`);
            } catch (stripeError) {
                console.error('Stripe verification failed:', stripeError);
                return new Response(JSON.stringify({ error: 'Unable to verify payment. Please try again.', success: false }), { status: 500 });
            }
        }

        // ============================================
        // Verify Restaurant
        // ============================================
        let restaurants;
        try {
            restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: orderData.restaurant_id });
        } catch (e) {
            return new Response(JSON.stringify({ error: 'Restaurant not found or unavailable', success: false }), { status: 404 });
        }
        if (!restaurants || restaurants.length === 0) {
            return new Response(JSON.stringify({ error: 'Restaurant not found or unavailable', success: false }), { status: 404 });
        }
        const restaurant = restaurants[0];
        if (restaurant.is_open === false) {
            return new Response(JSON.stringify({ error: 'Restaurant is currently closed', success: false }), { status: 400 });
        }

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
                return new Response(JSON.stringify({ error: 'Restaurant is not accepting orders today', success: false }), { status: 400 });
            }
            if (todayHours && todayHours.open && todayHours.close) {
                const [openH, openM] = todayHours.open.split(':').map(Number);
                const [closeH, closeM] = todayHours.close.split(':').map(Number);
                const openMinutes = openH * 60 + openM;
                const closeMinutes = closeH * 60 + closeM;
                if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
                    return new Response(JSON.stringify({ error: `Restaurant is currently closed. Hours: ${todayHours.open} - ${todayHours.close}`, success: false }), { status: 400 });
                }
            }
        }

        // ============================================
        // Delivery Zone
        // ============================================
        if (orderData.order_type === 'delivery' && orderData.delivery_coordinates) {
            const lat = orderData.delivery_coordinates.lat;
            const lng = orderData.delivery_coordinates.lng;
            const zones = await base44.asServiceRole.entities.DeliveryZone.filter({ restaurant_id: orderData.restaurant_id, is_active: true });
            const pointInPolygon = (point, polygon) => {
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
            let zoneFound = false;
            if (zones && zones.length > 0) {
                for (const zone of zones) {
                    if (zone.coordinates && Array.isArray(zone.coordinates) && zone.coordinates.length >= 3) {
                        const polygon = zone.coordinates.map(c => [c.lng, c.lat]);
                        if (pointInPolygon([lng, lat], polygon)) { zoneFound = true; break; }
                    }
                }
            }
            if (!zoneFound) {
                return new Response(JSON.stringify({ error: 'Delivery not available to selected location', success: false }), { status: 400 });
            }
        }

        // ============================================
        // Minimum Order
        // ============================================
        if (orderData.order_type === 'delivery') {
            const clientSubtotal = (orderData.items || []).reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
            if (orderData.delivery_coordinates) {
                const zones = await base44.asServiceRole.entities.DeliveryZone.filter({ restaurant_id: orderData.restaurant_id, is_active: true });
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
                                return new Response(JSON.stringify({ error: `Minimum order for delivery to your area is £${zone.min_order_value.toFixed(2)}`, success: false }), { status: 400 });
                            }
                            break;
                        }
                    }
                }
            }
            if (restaurant.minimum_order > 0 && clientSubtotal < restaurant.minimum_order) {
                return new Response(JSON.stringify({ error: `Minimum order is £${restaurant.minimum_order.toFixed(2)}`, success: false }), { status: 400 });
            }
        }

        // ============================================
        // Verify Cart Items
        // ============================================
        if (!orderData.items || orderData.items.length === 0) {
            return new Response(JSON.stringify({ error: 'Order contains no items', success: false }), { status: 400 });
        }
        const menuItems = await base44.asServiceRole.entities.MenuItem.filter({ restaurant_id: orderData.restaurant_id });
        const menuItemsMap = new Map(menuItems.map(item => [item.id, item]));
        for (const cartItem of orderData.items) {
            if (!menuItemsMap.has(cartItem.menu_item_id)) {
                return new Response(JSON.stringify({ error: `Item ${cartItem.name} is no longer available`, success: false }), { status: 400 });
            }
            const menuItem = menuItemsMap.get(cartItem.menu_item_id);
            if (menuItem.is_available === false) {
                return new Response(JSON.stringify({ error: `${cartItem.name} is no longer available`, success: false }), { status: 400 });
            }
            // SECURITY: Use server-side price
            cartItem.price = menuItem.price;
            const priceDiff = Math.abs(menuItem.price - (orderData.items.find(i => i.menu_item_id === cartItem.menu_item_id)?.price || 0));
            if (priceDiff > 0.50) {
                console.warn(`[SECURITY] Price mismatch for ${cartItem.name}: menu=${menuItem.price}, submitted=${cartItem.price}`);
            }
        }

        const serverSubtotal = orderData.items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
        const deliveryFee = orderData.delivery_fee || 0;

        // ============================================
        // COUPON STACKING POLICY
        //
        // Allows up to 3 stackable coupon codes per order.
        // Each coupon must have stackable=true when more than 1 code is applied.
        // Discount application order (deterministic, order-independent):
        //   1. percentage coupons (sorted by code ascending)
        //   2. fixed-amount / free_delivery / other coupons (sorted by code ascending)
        // Combined coupon discount capped at MAX_COUPON_DISCOUNT_RATIO (50%) of subtotal.
        // Final total never below 0.
        //
        // Identity policy (unchanged from single-coupon):
        //   Authenticated: platform-set created_by (authoritative)
        //   Guest: guest_email + phone (weak, best-effort)
        // ============================================
        const normalizedGuestEmail = _normalizeEmail(orderData.guest_email);
        const normalizedPhone = _normalizePhone(orderData.phone);

        let verifiedDiscount = 0;
        const clientDiscount = orderData.discount || 0;

        // Collect raw coupon input from frontend (coupon_codes array or comma-separated string)
        let inputCodes = [];
        if (Array.isArray(orderData.coupon_codes)) {
            inputCodes = orderData.coupon_codes.map(c => String(c).trim().toUpperCase()).filter(Boolean);
        } else if (orderData.coupon_codes) {
            inputCodes = String(orderData.coupon_codes).split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
        } else if (orderData.coupon_code) {
            inputCodes = [String(orderData.coupon_code).trim().toUpperCase()];
        }

        const verifiedCouponCodes = []; // final list stored on order
        const verifiedCouponIds = [];   // for usage_count increment
        const couponUsageCounts = [];   // snapshot at validation time

        if (inputCodes.length > 0) {
            // A) Max 3 coupons
            if (inputCodes.length > MAX_COUPONS_PER_ORDER) {
                return new Response(
                    JSON.stringify({ error: `A maximum of ${MAX_COUPONS_PER_ORDER} coupon codes can be applied per order.`, success: false }),
                    { status: 400 }
                );
            }

            // B) No duplicates
            const uniqueCodes = new Set(inputCodes);
            if (uniqueCodes.size !== inputCodes.length) {
                return new Response(
                    JSON.stringify({ error: 'Duplicate coupon codes are not allowed.', success: false }),
                    { status: 400 }
                );
            }

            const now = new Date();

            // C) Fetch and validate each coupon
            const validatedCoupons = [];
            for (const code of inputCodes) {
                const coupons = await base44.asServiceRole.entities.Coupon.filter({ code });
                if (!coupons?.length) {
                    return new Response(
                        JSON.stringify({ error: `Coupon code "${code}" is not recognised. Please remove it and try again.`, success: false }),
                        { status: 400 }
                    );
                }
                const coupon = coupons[0];

                // Per-coupon validation
                const singleResult = validateSingleCoupon(coupon, code, now, serverSubtotal, deliveryFee, orderData.restaurant_id);
                if (!singleResult.valid) {
                    return new Response(JSON.stringify({ error: singleResult.error, success: false }), { status: 400 });
                }

                // Per-customer limit
                const limitError = await checkPerCustomerLimit(base44, coupon, user, normalizedGuestEmail, normalizedPhone);
                if (limitError) {
                    console.warn(`[COUPON] Per-customer limit hit: code=${code} customer=${user?.email || normalizedGuestEmail}`);
                    return new Response(
                        JSON.stringify({ error: limitError, success: false }),
                        { status: 400 }
                    );
                }

                validatedCoupons.push({ coupon, rawDiscount: singleResult.discount });
            }

            // D) Stacking compatibility check
            // If more than 1 coupon, ALL must have stackable=true
            if (validatedCoupons.length > 1) {
                const nonStackable = validatedCoupons.filter(vc => !vc.coupon.stackable);
                if (nonStackable.length > 0) {
                    const codes = nonStackable.map(vc => vc.coupon.code).join(', ');
                    return new Response(
                        JSON.stringify({
                            error: `The following coupon(s) cannot be combined with other coupons: ${codes}. Only coupons marked as stackable may be used together.`,
                            success: false
                        }),
                        { status: 400 }
                    );
                }
            }

            // E) Deterministic discount application order:
            //    percentage coupons first (sorted by code asc), then fixed/other (sorted by code asc)
            const percentageCoupons = validatedCoupons
                .filter(vc => vc.coupon.discount_type === 'percentage')
                .sort((a, b) => a.coupon.code.localeCompare(b.coupon.code));
            const otherCoupons = validatedCoupons
                .filter(vc => vc.coupon.discount_type !== 'percentage')
                .sort((a, b) => a.coupon.code.localeCompare(b.coupon.code));
            const orderedCoupons = [...percentageCoupons, ...otherCoupons];

            // Apply each coupon in order, accumulating discount
            const maxCouponDiscount = serverSubtotal * MAX_COUPON_DISCOUNT_RATIO;
            let accumulatedDiscount = 0;

            for (const vc of orderedCoupons) {
                const remaining = maxCouponDiscount - accumulatedDiscount;
                const contribution = Math.min(vc.rawDiscount, remaining);
                accumulatedDiscount += contribution;
                verifiedCouponCodes.push(vc.coupon.code);
                verifiedCouponIds.push(vc.coupon.id);
                couponUsageCounts.push(vc.coupon.usage_count || 0);
                console.log(`[COUPON] Applied code="${vc.coupon.code}" type=${vc.coupon.discount_type} contribution=£${contribution.toFixed(2)} total_so_far=£${accumulatedDiscount.toFixed(2)}`);
            }

            verifiedDiscount = accumulatedDiscount;
            console.log(`[COUPON] Stack validated: codes=[${verifiedCouponCodes.join(',')}] totalDiscount=£${verifiedDiscount.toFixed(2)} cap=£${maxCouponDiscount.toFixed(2)}`);

        } else {
            // No coupon codes: allow restaurant promotion discount, capped at 50% of subtotal
            verifiedDiscount = Math.min(clientDiscount, serverSubtotal * 0.5);
        }

        const discount = verifiedDiscount;
        const serverTotal = Math.max(0, serverSubtotal + deliveryFee - discount);

        // Reject if client total deviates by more than £0.50
        if (Math.abs(serverTotal - orderData.total) > 0.50) {
            console.error(`[SECURITY] Total mismatch: server=${serverTotal}, client=${orderData.total}`);
            return new Response(
                JSON.stringify({ error: 'Order total does not match current menu prices. Please refresh and try again.', success: false }),
                { status: 400 }
            );
        }

        orderData.total = serverTotal;
        orderData.subtotal = serverSubtotal;

        // ============================================
        // Create Order — strip client fields, write server-verified ones
        // ============================================
        const {
            coupon_codes: _couponCodesPlural,
            coupon_code: _couponCodeSingular,
            ...cleanOrderData
        } = orderData;

        const newOrder = await base44.asServiceRole.entities.Order.create({
            ...cleanOrderData,
            // Store array (new field) + first code in legacy singular field for backward compat queries
            coupon_codes: verifiedCouponCodes.length > 0 ? verifiedCouponCodes : undefined,
            coupon_code: verifiedCouponCodes.length > 0 ? verifiedCouponCodes[0] : undefined,
            ...(idempotency_key ? { idempotency_key } : {}),
            ...(paymentIntentId ? { payment_intent_id: paymentIntentId } : {}),
        });

        if (!newOrder || !newOrder.id) {
            console.error('[ORDER] Entity create returned no ID for restaurant', orderData.restaurant_id);
            return new Response(JSON.stringify({ error: 'Failed to create order', success: false }), { status: 500 });
        }

        // Increment usage_count for each validated coupon server-side (fire-and-forget)
        for (let i = 0; i < verifiedCouponIds.length; i++) {
            const couponId = verifiedCouponIds[i];
            const snapshotCount = couponUsageCounts[i];
            base44.asServiceRole.entities.Coupon.update(couponId, {
                usage_count: snapshotCount + 1
            }).catch(e => console.warn(`[COUPON] Failed to increment usage_count for coupon ${couponId}:`, e));
        }

        console.log(`[ORDER] Created: id=${newOrder.id} num=${newOrder.order_number} restaurant=${orderData.restaurant_id} total=£${serverTotal.toFixed(2)} coupons=[${verifiedCouponCodes.join(',')}] type=${orderData.order_type} payment=${orderData.payment_method}`);

        return new Response(
            JSON.stringify({ success: true, order_id: newOrder.id, order_number: newOrder.order_number, message: 'Order created successfully' }),
            { status: 201 }
        );

    } catch (error) {
        console.error('[ORDER] verifyAndCreateOrder unhandled error:', error);
        return new Response(JSON.stringify({ error: 'Order creation failed. Please try again.', success: false }), { status: 500 });
    }
});