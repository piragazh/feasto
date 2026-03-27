/**
 * CRITICAL SECURITY: Verify and create orders server-side
 *
 * PAYMENT SAFETY MODEL (orphan prevention):
 *   1. Payment intent verified FIRST (Stripe confirms charge)
 *   2. PaymentTransaction record written immediately with status='authorized'
 *      → This is the persistent ledger entry. If anything fails after this,
 *        the record exists for reconciliation and automatic refund.
 *   3. Order creation attempted inside a guarded block
 *   4. If Order.create SUCCEEDS → PaymentTransaction updated to 'order_created'
 *   5. If Order.create FAILS  → automatic Stripe refund triggered immediately
 *      → PaymentTransaction updated to 'refund_initiated' or 'refund_failed'
 *      → 'refund_failed' status triggers manual_review flag for ops
 *
 * IDEMPOTENCY:
 *   - idempotency_key: client-supplied, checked against Order table (prevents duplicate orders)
 *   - payment_intent_id: checked against PaymentTransaction table (prevents double-charge on retry)
 *   - If PaymentTransaction already exists for this PI → return cached result, no Stripe call
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
const MAX_COUPON_DISCOUNT_RATIO = 0.50;

// ── Helper: validate a single coupon object against order context ─────────────
function validateSingleCoupon(coupon, code, now, serverSubtotal, deliveryFee, restaurantId) {
    if (!coupon.is_active) return { valid: false, error: `Coupon "${code}" is no longer active.` };
    if (coupon.valid_from && new Date(coupon.valid_from) > now) return { valid: false, error: `Coupon "${code}" is not yet valid.` };
    if (coupon.valid_until && new Date(coupon.valid_until) < now) return { valid: false, error: `Coupon "${code}" has expired.` };
    if (coupon.expires_at && new Date(coupon.expires_at) < now) return { valid: false, error: `Coupon "${code}" has expired.` };
    if (coupon.restaurant_id && coupon.restaurant_id !== restaurantId) return { valid: false, error: `Coupon "${code}" is not valid for this restaurant.` };
    if (coupon.minimum_order && serverSubtotal < coupon.minimum_order) return { valid: false, error: `A minimum order of £${coupon.minimum_order.toFixed(2)} is required to use coupon "${code}".` };
    if (coupon.usage_limit && (coupon.usage_count || 0) >= coupon.usage_limit) return { valid: false, error: `Coupon "${code}" has reached its usage limit.` };

    let d = 0;
    if (coupon.discount_type === 'percentage') {
        d = (serverSubtotal * coupon.discount_value) / 100;
        if (coupon.max_discount) d = Math.min(d, coupon.max_discount);
    } else if (coupon.discount_type === 'free_delivery') {
        d = Math.min(coupon.discount_value || deliveryFee, deliveryFee);
    } else {
        d = coupon.discount_value || 0;
    }
    return { valid: true, discount: Math.max(0, d) };
}

// ── Helper: check per-customer limit for a single coupon ─────────────────────
async function checkPerCustomerLimit(base44, coupon, user, normalizedGuestEmail, normalizedPhone) {
    if (!coupon.per_customer_limit || coupon.per_customer_limit <= 0) return null;

    const code = coupon.code;
    const limitMsg = `You have already used coupon "${code}" the maximum number of times (${coupon.per_customer_limit} use${coupon.per_customer_limit === 1 ? '' : 's'} per customer).`;

    async function countUniqueBothFields(identityFilter) {
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

// ── Compensation: attempt automatic Stripe refund ────────────────────────────
// Called when order creation fails AFTER payment has been captured.
// Updates PaymentTransaction to 'refund_initiated', 'refunded', or 'refund_failed'.
// Never throws — failure is recorded for manual ops review.
async function attemptRefund(stripe, base44, paymentIntentId, ptxId, failureReason, userContext) {
    const timestamp = new Date().toISOString();
    console.error(
        `[ORPHAN-PREVENTION] Order creation failed after payment. ` +
        `Initiating automatic refund. pi=${paymentIntentId} ptx=${ptxId} ` +
        `reason="${failureReason}" user=${userContext} ts=${timestamp}`
    );

    try {
        // Mark as refund_initiated immediately so reconciliation job won't double-refund
        await base44.asServiceRole.entities.PaymentTransaction.update(ptxId, {
            status: 'refund_initiated',
            failure_reason: failureReason,
            failure_stage: 'order_create',
            refund_initiated_at: timestamp,
        });

        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason: 'duplicate', // closest Stripe reason for "order failed to create"
            metadata: {
                failure_reason: failureReason.slice(0, 500),
                user_context: userContext,
                initiated_by: 'auto_compensation',
                initiated_at: timestamp,
            }
        });

        await base44.asServiceRole.entities.PaymentTransaction.update(ptxId, {
            status: 'refunded',
            stripe_refund_id: refund.id,
            refunded_at: new Date().toISOString(),
        });

        console.log(`[ORPHAN-PREVENTION] Refund succeeded. refund_id=${refund.id} pi=${paymentIntentId}`);
        return { refunded: true, refund_id: refund.id };

    } catch (refundErr) {
        const refundFailMsg = refundErr?.message || 'Unknown refund error';
        console.error(
            `[ORPHAN-PREVENTION] REFUND FAILED — MANUAL REVIEW REQUIRED. ` +
            `pi=${paymentIntentId} ptx=${ptxId} error="${refundFailMsg}" ts=${timestamp}`
        );
        // Mark for manual ops review — this is the worst case
        await base44.asServiceRole.entities.PaymentTransaction.update(ptxId, {
            status: 'refund_failed',
            failure_reason: `Order: ${failureReason} | Refund: ${refundFailMsg}`,
            failure_stage: 'order_create',
        }).catch(e => console.error('[ORPHAN-PREVENTION] Could not update PTX to refund_failed:', e.message));

        return { refunded: false, error: refundFailMsg };
    }
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

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
        // IDEMPOTENCY CHECK (Order table)
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
        // IDEMPOTENCY CHECK (PaymentTransaction table)
        // Prevents double-charge if client retries after a partial failure.
        // If PaymentTransaction exists and order_created → return cached order.
        // If PaymentTransaction exists and refunded → tell client to restart.
        // ============================================
        let existingPtx = null;
        if (paymentIntentId) {
            const ptxList = await base44.asServiceRole.entities.PaymentTransaction.filter({
                payment_intent_id: paymentIntentId
            });
            if (ptxList && ptxList.length > 0) {
                existingPtx = ptxList[0];
                if (existingPtx.status === 'order_created' && existingPtx.order_id) {
                    console.log(`[IDEMPOTENCY-PTX] PI already has order. pi=${paymentIntentId} order=${existingPtx.order_id}`);
                    return new Response(
                        JSON.stringify({ success: true, order_id: existingPtx.order_id, message: 'Order already created', duplicate: true }),
                        { status: 200 }
                    );
                }
                if (['refunded', 'refund_initiated', 'refund_failed', 'manual_review'].includes(existingPtx.status)) {
                    console.warn(`[IDEMPOTENCY-PTX] PI is in terminal/refund state. pi=${paymentIntentId} status=${existingPtx.status}`);
                    return new Response(
                        JSON.stringify({ error: 'This payment has already been processed. If you were charged, a refund has been initiated. Please start a new order.', success: false }),
                        { status: 409 }
                    );
                }
                // status='authorized' means previous attempt wrote PTX but crashed before order — allow retry
                console.log(`[IDEMPOTENCY-PTX] PI in authorized state, retrying order creation. pi=${paymentIntentId}`);
            }
        }

        // ============================================
        // PAYMENT VERIFICATION
        // ============================================
        let stripe = null;
        let verifiedPaymentIntent = null;

        if (orderData.payment_method === 'card') {
            if (!paymentIntentId) {
                return new Response(JSON.stringify({ error: 'Card payment selected but no payment intent found', success: false }), { status: 400 });
            }
            if (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
                return new Response(JSON.stringify({ error: 'Invalid payment intent format', success: false }), { status: 400 });
            }

            stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

            try {
                verifiedPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                if (verifiedPaymentIntent.status !== 'succeeded') {
                    console.error(`[PAYMENT] Intent not succeeded: pi=${paymentIntentId} status=${verifiedPaymentIntent.status}`);
                    return new Response(JSON.stringify({ error: 'Payment not confirmed. Status: ' + verifiedPaymentIntent.status, success: false }), { status: 400 });
                }
                const expectedAmountCents = Math.round(orderData.total * 100);
                if (verifiedPaymentIntent.amount !== expectedAmountCents) {
                    console.error(`[PAYMENT] Amount mismatch: expected=${expectedAmountCents} got=${verifiedPaymentIntent.amount} pi=${paymentIntentId}`);
                    return new Response(JSON.stringify({ error: 'Payment amount does not match order total', success: false }), { status: 400 });
                }
                // Check if this PI is already linked to an order (last-resort dedup)
                const piOrders = await base44.asServiceRole.entities.Order.filter({ payment_intent_id: paymentIntentId });
                if (piOrders && piOrders.length > 0) {
                    console.log(`[IDEMPOTENCY] PI already used for order ${piOrders[0].id}`);
                    return new Response(
                        JSON.stringify({ success: true, order_id: piOrders[0].id, order_number: piOrders[0].order_number, message: 'Order already created', duplicate: true }),
                        { status: 200 }
                    );
                }
                console.log(`[PAYMENT] Verified: pi=${paymentIntentId} amount=${verifiedPaymentIntent.amount}`);
            } catch (stripeError) {
                console.error(`[PAYMENT] Stripe verification failed: pi=${paymentIntentId} error="${stripeError?.message}"`);
                return new Response(JSON.stringify({ error: 'Unable to verify payment. Please try again.', success: false }), { status: 500 });
            }
        }

        // ============================================
        // WRITE PaymentTransaction (status=authorized)
        // This is the FIRST persistent record after charge confirmation.
        // Must be written BEFORE order creation so any subsequent failure
        // is visible to the reconciliation job and refund logic.
        // ============================================
        let ptxId = existingPtx?.id || null;
        const userContext = user?.email || orderData.guest_email || orderData.phone || 'unknown';

        if (paymentIntentId && verifiedPaymentIntent && !existingPtx) {
            try {
                const ptxRecord = await base44.asServiceRole.entities.PaymentTransaction.create({
                    payment_intent_id: paymentIntentId,
                    idempotency_key: idempotency_key || null,
                    amount: orderData.total,
                    amount_pence: verifiedPaymentIntent.amount,
                    currency: verifiedPaymentIntent.currency || 'gbp',
                    status: 'authorized',
                    restaurant_id: orderData.restaurant_id,
                    user_email: user?.email || 'guest',
                    guest_email: orderData.guest_email || null,
                    phone: orderData.phone || null,
                    authorized_at: new Date().toISOString(),
                    metadata: verifiedPaymentIntent.metadata || {},
                });
                ptxId = ptxRecord.id;
                console.log(`[PTX] Created authorized record: ptx=${ptxId} pi=${paymentIntentId} amount=£${orderData.total.toFixed(2)}`);
            } catch (ptxCreateErr) {
                // PTX write failed — safe to proceed (order will still be created).
                // Reconciliation job will detect missing PTX for this PI later.
                console.error(`[PTX] Failed to write initial record: pi=${paymentIntentId} error="${ptxCreateErr?.message}"`);
            }
        }

        // ============================================
        // Verify Restaurant
        // ============================================
        let restaurants;
        try {
            restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: orderData.restaurant_id });
        } catch (e) {
            // If payment was taken, attempt refund before returning error
            if (ptxId && stripe) {
                await attemptRefund(stripe, base44, paymentIntentId, ptxId, 'Restaurant lookup failed', userContext);
                return new Response(JSON.stringify({ error: 'Restaurant unavailable. Your payment has been refunded automatically.', success: false, refunded: true }), { status: 404 });
            }
            return new Response(JSON.stringify({ error: 'Restaurant not found or unavailable', success: false }), { status: 404 });
        }
        if (!restaurants || restaurants.length === 0) {
            if (ptxId && stripe) {
                await attemptRefund(stripe, base44, paymentIntentId, ptxId, 'Restaurant not found', userContext);
                return new Response(JSON.stringify({ error: 'Restaurant not found. Your payment has been refunded automatically.', success: false, refunded: true }), { status: 404 });
            }
            return new Response(JSON.stringify({ error: 'Restaurant not found or unavailable', success: false }), { status: 404 });
        }
        const restaurant = restaurants[0];
        if (restaurant.is_open === false) {
            if (ptxId && stripe) {
                await attemptRefund(stripe, base44, paymentIntentId, ptxId, 'Restaurant is closed', userContext);
                return new Response(JSON.stringify({ error: 'Restaurant is currently closed. Your payment has been refunded automatically.', success: false, refunded: true }), { status: 400 });
            }
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
                if (ptxId && stripe) {
                    await attemptRefund(stripe, base44, paymentIntentId, ptxId, 'Restaurant not accepting orders today', userContext);
                    return new Response(JSON.stringify({ error: 'Restaurant is not accepting orders today. Your payment has been refunded automatically.', success: false, refunded: true }), { status: 400 });
                }
                return new Response(JSON.stringify({ error: 'Restaurant is not accepting orders today', success: false }), { status: 400 });
            }
            if (todayHours && todayHours.open && todayHours.close) {
                const [openH, openM] = todayHours.open.split(':').map(Number);
                const [closeH, closeM] = todayHours.close.split(':').map(Number);
                const openMinutes = openH * 60 + openM;
                const closeMinutes = closeH * 60 + closeM;
                if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
                    if (ptxId && stripe) {
                        await attemptRefund(stripe, base44, paymentIntentId, ptxId, `Restaurant closed (hours: ${todayHours.open}-${todayHours.close})`, userContext);
                        return new Response(JSON.stringify({ error: `Restaurant is currently closed. Hours: ${todayHours.open} - ${todayHours.close}. Your payment has been refunded automatically.`, success: false, refunded: true }), { status: 400 });
                    }
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
                if (ptxId && stripe) {
                    await attemptRefund(stripe, base44, paymentIntentId, ptxId, 'Delivery address outside zone', userContext);
                    return new Response(JSON.stringify({ error: 'Delivery not available to selected location. Your payment has been refunded automatically.', success: false, refunded: true }), { status: 400 });
                }
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
                                if (ptxId && stripe) {
                                    await attemptRefund(stripe, base44, paymentIntentId, ptxId, `Below zone minimum order (£${zone.min_order_value})`, userContext);
                                    return new Response(JSON.stringify({ error: `Minimum order for delivery to your area is £${zone.min_order_value.toFixed(2)}. Your payment has been refunded.`, success: false, refunded: true }), { status: 400 });
                                }
                                return new Response(JSON.stringify({ error: `Minimum order for delivery to your area is £${zone.min_order_value.toFixed(2)}`, success: false }), { status: 400 });
                            }
                            break;
                        }
                    }
                }
            }
            if (restaurant.minimum_order > 0 && clientSubtotal < restaurant.minimum_order) {
                if (ptxId && stripe) {
                    await attemptRefund(stripe, base44, paymentIntentId, ptxId, `Below restaurant minimum order (£${restaurant.minimum_order})`, userContext);
                    return new Response(JSON.stringify({ error: `Minimum order is £${restaurant.minimum_order.toFixed(2)}. Your payment has been refunded.`, success: false, refunded: true }), { status: 400 });
                }
                return new Response(JSON.stringify({ error: `Minimum order is £${restaurant.minimum_order.toFixed(2)}`, success: false }), { status: 400 });
            }
        }

        // ============================================
        // Verify Cart Items
        // ============================================
        if (!orderData.items || orderData.items.length === 0) {
            if (ptxId && stripe) {
                await attemptRefund(stripe, base44, paymentIntentId, ptxId, 'Empty cart at order creation', userContext);
                return new Response(JSON.stringify({ error: 'Order contains no items. Your payment has been refunded.', success: false, refunded: true }), { status: 400 });
            }
            return new Response(JSON.stringify({ error: 'Order contains no items', success: false }), { status: 400 });
        }
        const menuItems = await base44.asServiceRole.entities.MenuItem.filter({ restaurant_id: orderData.restaurant_id });
        const menuItemsMap = new Map(menuItems.map(item => [item.id, item]));
        for (const cartItem of orderData.items) {
            if (!menuItemsMap.has(cartItem.menu_item_id)) {
                if (ptxId && stripe) {
                    await attemptRefund(stripe, base44, paymentIntentId, ptxId, `Item unavailable: ${cartItem.name}`, userContext);
                    return new Response(JSON.stringify({ error: `${cartItem.name} is no longer available. Your payment has been refunded.`, success: false, refunded: true }), { status: 400 });
                }
                return new Response(JSON.stringify({ error: `Item ${cartItem.name} is no longer available`, success: false }), { status: 400 });
            }
            const menuItem = menuItemsMap.get(cartItem.menu_item_id);
            if (menuItem.is_available === false) {
                if (ptxId && stripe) {
                    await attemptRefund(stripe, base44, paymentIntentId, ptxId, `Item out of stock: ${cartItem.name}`, userContext);
                    return new Response(JSON.stringify({ error: `${cartItem.name} is no longer available. Your payment has been refunded.`, success: false, refunded: true }), { status: 400 });
                }
                return new Response(JSON.stringify({ error: `${cartItem.name} is no longer available`, success: false }), { status: 400 });
            }
            // SECURITY: Overwrite with server-side price
            cartItem.price = menuItem.price;
        }

        const serverSubtotal = orderData.items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
        const deliveryFee = orderData.delivery_fee || 0;

        // ============================================
        // COUPON STACKING POLICY
        // ============================================
        const normalizedGuestEmail = _normalizeEmail(orderData.guest_email);
        const normalizedPhone = _normalizePhone(orderData.phone);

        let verifiedDiscount = 0;
        let inputCodes = [];
        if (Array.isArray(orderData.coupon_codes)) {
            inputCodes = orderData.coupon_codes.map(c => String(c).trim().toUpperCase()).filter(Boolean);
        } else if (orderData.coupon_codes) {
            inputCodes = String(orderData.coupon_codes).split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
        } else if (orderData.coupon_code) {
            inputCodes = [String(orderData.coupon_code).trim().toUpperCase()];
        }

        const verifiedCouponCodes = [];
        const verifiedCouponIds = [];
        const couponUsageCounts = [];

        if (inputCodes.length > 0) {
            if (inputCodes.length > MAX_COUPONS_PER_ORDER) {
                return new Response(JSON.stringify({ error: `A maximum of ${MAX_COUPONS_PER_ORDER} coupon codes can be applied per order.`, success: false }), { status: 400 });
            }
            const uniqueCodes = new Set(inputCodes);
            if (uniqueCodes.size !== inputCodes.length) {
                return new Response(JSON.stringify({ error: 'Duplicate coupon codes are not allowed.', success: false }), { status: 400 });
            }

            const now = new Date();
            const validatedCoupons = [];
            for (const code of inputCodes) {
                const coupons = await base44.asServiceRole.entities.Coupon.filter({ code });
                if (!coupons?.length) {
                    return new Response(JSON.stringify({ error: `Coupon code "${code}" is not recognised. Please remove it and try again.`, success: false }), { status: 400 });
                }
                const coupon = coupons[0];
                const singleResult = validateSingleCoupon(coupon, code, now, serverSubtotal, deliveryFee, orderData.restaurant_id);
                if (!singleResult.valid) {
                    return new Response(JSON.stringify({ error: singleResult.error, success: false }), { status: 400 });
                }
                const limitError = await checkPerCustomerLimit(base44, coupon, user, normalizedGuestEmail, normalizedPhone);
                if (limitError) {
                    console.warn(`[COUPON] Per-customer limit hit: code=${code} customer=${user?.email || normalizedGuestEmail}`);
                    return new Response(JSON.stringify({ error: limitError, success: false }), { status: 400 });
                }
                validatedCoupons.push({ coupon, rawDiscount: singleResult.discount });
            }

            if (validatedCoupons.length > 1) {
                const nonStackable = validatedCoupons.filter(vc => !vc.coupon.stackable);
                if (nonStackable.length > 0) {
                    const codes = nonStackable.map(vc => vc.coupon.code).join(', ');
                    return new Response(JSON.stringify({ error: `The following coupon(s) cannot be combined with other coupons: ${codes}. Only coupons marked as stackable may be used together.`, success: false }), { status: 400 });
                }
            }

            const percentageCoupons = validatedCoupons.filter(vc => vc.coupon.discount_type === 'percentage').sort((a, b) => a.coupon.code.localeCompare(b.coupon.code));
            const otherCoupons = validatedCoupons.filter(vc => vc.coupon.discount_type !== 'percentage').sort((a, b) => a.coupon.code.localeCompare(b.coupon.code));
            const orderedCoupons = [...percentageCoupons, ...otherCoupons];

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

        } else if (orderData.applied_promotion_id) {
            try {
                const promRes = await base44.functions.invoke('validateAndApplyPromotion', {
                    promotion_id: orderData.applied_promotion_id,
                    restaurant_id: orderData.restaurant_id,
                    server_subtotal: serverSubtotal,
                    delivery_fee: deliveryFee
                });
                if (promRes?.data?.valid && typeof promRes.data.discount === 'number') {
                    verifiedDiscount = promRes.data.discount;
                    console.log(`[PROMOTION] Validated: id=${orderData.applied_promotion_id} discount=£${verifiedDiscount.toFixed(2)}`);
                } else {
                    const promError = promRes?.data?.error || 'Promotion validation failed';
                    console.warn(`[PROMOTION] Validation failed: id=${orderData.applied_promotion_id} error=${promError}`);
                    return new Response(JSON.stringify({ error: `Promotion: ${promError}`, success: false }), { status: 400 });
                }
            } catch (promErr) {
                console.error('[PROMOTION] Validation error:', promErr.message);
                return new Response(JSON.stringify({ error: 'Promotion validation failed. Please try again.', success: false }), { status: 500 });
            }
        }

        const discount = verifiedDiscount;
        const serverTotal = Math.max(0, serverSubtotal + deliveryFee - discount);

        if (Math.abs(serverTotal - orderData.total) > 0.50) {
            console.error(`[SECURITY] Total mismatch: server=${serverTotal} client=${orderData.total} pi=${paymentIntentId || 'none'}`);
            if (ptxId && stripe) {
                await attemptRefund(stripe, base44, paymentIntentId, ptxId, `Server/client total mismatch: server=£${serverTotal.toFixed(2)} client=£${orderData.total.toFixed(2)}`, userContext);
                return new Response(JSON.stringify({ error: 'Order total does not match current menu prices. Your payment has been refunded automatically. Please refresh and try again.', success: false, refunded: true }), { status: 400 });
            }
            return new Response(JSON.stringify({ error: 'Order total does not match current menu prices. Please refresh and try again.', success: false }), { status: 400 });
        }

        orderData.total = serverTotal;
        orderData.subtotal = serverSubtotal;

        // ============================================
        // CREATE ORDER — guarded with compensation
        // This is the critical section: if Order.create fails after payment
        // has been captured (ptxId exists), trigger automatic refund.
        // ============================================
        const {
            coupon_codes: _couponCodesPlural,
            coupon_code: _couponCodeSingular,
            ...cleanOrderData
        } = orderData;

        let newOrder;
        try {
            newOrder = await base44.asServiceRole.entities.Order.create({
                ...cleanOrderData,
                order_source: cleanOrderData.order_source || 'online',
                coupon_codes: verifiedCouponCodes.length > 0 ? verifiedCouponCodes : undefined,
                coupon_code: verifiedCouponCodes.length > 0 ? verifiedCouponCodes[0] : undefined,
                ...(idempotency_key ? { idempotency_key } : {}),
                ...(paymentIntentId ? { payment_intent_id: paymentIntentId } : {}),
            });
        } catch (orderCreateErr) {
            // ── COMPENSATION PATH ──────────────────────────────────────────────
            // Order.create threw. Payment has already been captured.
            // Trigger automatic refund if this was a card payment.
            const reason = orderCreateErr?.message || 'Order entity creation threw an exception';
            console.error(`[COMPENSATION] Order.create threw after payment captured. pi=${paymentIntentId || 'none'} ptx=${ptxId || 'none'} error="${reason}"`);

            if (ptxId && stripe) {
                const refundResult = await attemptRefund(stripe, base44, paymentIntentId, ptxId, reason, userContext);
                const refundMsg = refundResult.refunded
                    ? 'Your payment has been refunded automatically. Please try again in a few minutes.'
                    : 'We were unable to automatically refund your payment. Our team has been notified and will process a manual refund within 24 hours.';
                return new Response(
                    JSON.stringify({ error: `Order creation failed. ${refundMsg}`, success: false, refunded: refundResult.refunded }),
                    { status: 500 }
                );
            }
            return new Response(JSON.stringify({ error: 'Order creation failed. Please try again.', success: false }), { status: 500 });
        }

        if (!newOrder || !newOrder.id) {
            // Order.create returned but with no ID (shouldn't happen, but guard it)
            const reason = 'Order entity create returned no ID';
            console.error(`[COMPENSATION] ${reason}. pi=${paymentIntentId || 'none'} ptx=${ptxId || 'none'} restaurant=${orderData.restaurant_id}`);

            if (ptxId && stripe) {
                const refundResult = await attemptRefund(stripe, base44, paymentIntentId, ptxId, reason, userContext);
                const refundMsg = refundResult.refunded
                    ? 'Your payment has been refunded automatically. Please try again.'
                    : 'We were unable to automatically refund your payment. Our team has been notified and will process a manual refund within 24 hours.';
                return new Response(
                    JSON.stringify({ error: `Order creation failed. ${refundMsg}`, success: false, refunded: refundResult.refunded }),
                    { status: 500 }
                );
            }
            return new Response(JSON.stringify({ error: 'Failed to create order', success: false }), { status: 500 });
        }

        // ── UPDATE PaymentTransaction to order_created ─────────────────────────
        if (ptxId) {
            base44.asServiceRole.entities.PaymentTransaction.update(ptxId, {
                status: 'order_created',
                order_id: newOrder.id,
                order_created_at: new Date().toISOString(),
            }).catch(e => console.error(`[PTX] Failed to update to order_created: ptx=${ptxId} error="${e?.message}"`));
        }

        // Increment usage_count for each validated coupon (fire-and-forget)
        for (let i = 0; i < verifiedCouponIds.length; i++) {
            const couponId = verifiedCouponIds[i];
            const snapshotCount = couponUsageCounts[i];
            base44.asServiceRole.entities.Coupon.update(couponId, {
                usage_count: snapshotCount + 1
            }).catch(e => console.warn(`[COUPON] Failed to increment usage_count for coupon ${couponId}:`, e));
        }

        console.log(`[ORDER] Created: id=${newOrder.id} num=${newOrder.order_number} restaurant=${orderData.restaurant_id} total=£${serverTotal.toFixed(2)} coupons=[${verifiedCouponCodes.join(',')}] type=${orderData.order_type} payment=${orderData.payment_method} ptx=${ptxId || 'none'}`);

        return new Response(
            JSON.stringify({ success: true, order_id: newOrder.id, order_number: newOrder.order_number, message: 'Order created successfully' }),
            { status: 201 }
        );

    } catch (error) {
        console.error('[ORDER] verifyAndCreateOrder unhandled error:', error?.message);
        return new Response(JSON.stringify({ error: 'Order creation failed. Please try again.', success: false }), { status: 500 });
    }
});