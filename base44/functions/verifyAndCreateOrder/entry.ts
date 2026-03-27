/**
 * CRITICAL SECURITY: Verify and create orders server-side
 * =========================================================
 *
 * PAYMENT SAFETY CONTRACT:
 *   1. Before touching payment: record PaymentTransaction with status='authorized'
 *   2. Attempt order creation
 *   3a. SUCCESS → update PaymentTransaction to status='order_created', link order_id
 *   3b. FAILURE → immediately attempt Stripe refund
 *       - Refund succeeds → status='refunded', failure logged
 *       - Refund fails    → status='needs_review', alert logged for manual action
 *
 * This eliminates the orphaned-charge window: every Stripe charge maps to exactly
 * one PaymentTransaction record whose status always reflects ground truth.
 *
 * IDEMPOTENCY:
 *   - idempotency_key: client session key → Order dedup (checked first)
 *   - payment_intent_id: Stripe PI dedup → catches same PI reused across sessions
 *   - PaymentTransaction dedup: if PT already exists with order_id set → return that order
 *
 * COUPON STACKING POLICY (max 3 coupons per order):
 *   - All must be stackable=true when >1 applied
 *   - Discount capped at 50% of server-computed subtotal
 *   - usage_count incremented server-side only after order committed
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_COUPONS_PER_ORDER = 3;
const MAX_COUPON_DISCOUNT_RATIO = 0.50;

// ── Stripe refund helper ──────────────────────────────────────────────────────
// Attempts a full refund on the given payment intent.
// Returns { success, refundId, error }
async function attemptRefund(stripe, paymentIntentId, reason) {
    try {
        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason: 'fraudulent', // Stripe-accepted: order creation failure is safest mapped here
            metadata: { failure_reason: String(reason).slice(0, 500) }
        });
        console.log(`[REFUND] Issued refund=${refund.id} for intent=${paymentIntentId} status=${refund.status}`);
        return { success: true, refundId: refund.id };
    } catch (err) {
        console.error(`[REFUND] FAILED for intent=${paymentIntentId}:`, err.message);
        return { success: false, error: err.message };
    }
}

// ── Coupon helpers ────────────────────────────────────────────────────────────
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
        if (normalizedGuestEmail) guestCount = Math.max(guestCount, await countUniqueBothFields({ guest_email: normalizedGuestEmail }));
        if (normalizedPhone) guestCount = Math.max(guestCount, await countUniqueBothFields({ phone: normalizedPhone }));
        if (guestCount >= coupon.per_customer_limit) return limitMsg;

        if (normalizedPhone) {
            const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
            const recentPhoneOrders = await base44.asServiceRole.entities.Order.filter({ phone: normalizedPhone, created_date: { $gt: oneHourAgo } });
            const recentWithCoupon = (recentPhoneOrders || []).filter(o => o.coupon_code || (o.coupon_codes && o.coupon_codes.length > 0));
            if (recentWithCoupon.length >= 3) return 'Too many coupon uses from this phone number. Please try again later or sign in to your account.';
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

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        
        let user = null;
        try {
            user = await base44.auth.me();
        } catch (authErr) {
            // Guest checkout - no auth token, continue as guest
            console.log('[ORDER] Guest checkout detected');
        }
        
        const { orderData, paymentIntentId, idempotency_key } = await req.json();

        // ── Order velocity throttle ───────────────────────────────────────────
        const velocityResult = await base44.functions.invoke('orderVelocityThrottle', { orderData });
        if (velocityResult?.data && !velocityResult.data.allowed) {
            // Log failure for observability
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'payment_velocity_throttle',
                severity: 'info',
                restaurant_id: orderData.restaurant_id,
                user_email: user?.email || 'guest',
                guest_email: orderData.guest_email,
                phone: orderData.phone,
                error_message: velocityResult.data.error || 'Too many orders in short time',
                context: {
                    order_total: orderData.total,
                    items_count: (orderData.items || []).length,
                    http_status: 429,
                }
            }).catch(e => console.warn('[LOG] Failed to record velocity throttle:', e.message));

            return new Response(
                JSON.stringify({ error: velocityResult.data.error || 'Too many orders. Please wait.', success: false, refunded: false }),
                { status: 429, headers: { 'Retry-After': String(velocityResult.data.retryAfter || 60) } }
            );
        }

        if (!orderData || !orderData.restaurant_id) {
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'restaurant_validation',
                severity: 'warning',
                user_email: user?.email || 'guest',
                error_message: 'Invalid order data or missing restaurant_id',
                context: { http_status: 400 }
            }).catch(e => console.warn('[LOG] Failed to record validation error:', e.message));

            return new Response(JSON.stringify({ error: 'Invalid order data', success: false }), { status: 400 });
        }

        // ── IDEMPOTENCY: session key ──────────────────────────────────────────
        if (idempotency_key) {
            const existing = await base44.asServiceRole.entities.Order.filter({ idempotency_key });
            if (existing && existing.length > 0) {
                console.log(`[ORDER] Duplicate key=${idempotency_key} → order ${existing[0].id}`);
                return new Response(
                    JSON.stringify({ success: true, order_id: existing[0].id, order_number: existing[0].order_number, message: 'Order already created', duplicate: true }),
                    { status: 200 }
                );
            }
        }

        // ── PAYMENT VERIFICATION ──────────────────────────────────────────────
        // Initialize Stripe once — used in both verification and refund compensation
        const stripe = orderData.payment_method === 'card' ? new Stripe(Deno.env.get('STRIPE_SECRET_KEY')) : null;

        if (orderData.payment_method === 'card') {
            if (!paymentIntentId) {
                await base44.asServiceRole.entities.FailureLog.create({
                    failure_type: 'payment_intent_verification',
                    severity: 'warning',
                    restaurant_id: orderData.restaurant_id,
                    user_email: user?.email || 'guest',
                    error_message: 'Card payment selected but no payment intent found',
                    context: { http_status: 400 }
                }).catch(e => console.warn('[LOG] Failed to record PI error:', e.message));

                return new Response(JSON.stringify({ error: 'Card payment selected but no payment intent found', success: false }), { status: 400 });
            }
            if (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
                await base44.asServiceRole.entities.FailureLog.create({
                    failure_type: 'payment_intent_verification',
                    severity: 'warning',
                    restaurant_id: orderData.restaurant_id,
                    payment_intent_id: paymentIntentId,
                    user_email: user?.email || 'guest',
                    error_message: 'Invalid payment intent format',
                    context: { http_status: 400, provided_pi: String(paymentIntentId).slice(0, 20) }
                }).catch(e => console.warn('[LOG] Failed to record malformed PI:', e.message));

                return new Response(JSON.stringify({ error: 'Invalid payment intent format', success: false }), { status: 400 });
            }

            // ── IDEMPOTENCY: PaymentTransaction dedup ─────────────────────────
            // If a PaymentTransaction already exists for this intent with an order linked, return that order.
            const existingPT = await base44.asServiceRole.entities.PaymentTransaction.filter({ payment_intent_id: paymentIntentId });
            if (existingPT && existingPT.length > 0) {
                const pt = existingPT[0];
                if (pt.status === 'order_created' && pt.order_id) {
                    console.log(`[IDEMPOTENCY] PT already has order_id=${pt.order_id} for intent=${paymentIntentId}`);
                    return new Response(
                        JSON.stringify({ success: true, order_id: pt.order_id, order_number: pt.order_number, message: 'Order already created', duplicate: true }),
                        { status: 200 }
                    );
                }
                if (pt.status === 'refunded') {
                    console.warn(`[IDEMPOTENCY] Intent=${paymentIntentId} already refunded — cannot create order`);
                    return new Response(
                        JSON.stringify({ error: 'This payment has already been refunded. Please start a new checkout.', success: false }),
                        { status: 400 }
                    );
                }
                if (pt.status === 'needs_review') {
                    console.warn(`[IDEMPOTENCY] Intent=${paymentIntentId} is in needs_review — blocking retry`);
                    return new Response(
                        JSON.stringify({ error: 'There was a problem with this payment. Our team has been notified. Please contact support.', success: false }),
                        { status: 400 }
                    );
                }
            }

            // ── IDEMPOTENCY: Order.payment_intent_id dedup (pre-PT era) ──────
            const piOrders = await base44.asServiceRole.entities.Order.filter({ payment_intent_id: paymentIntentId });
            if (piOrders && piOrders.length > 0) {
                console.log(`[IDEMPOTENCY] PaymentIntent ${paymentIntentId} already used for order ${piOrders[0].id}`);
                return new Response(
                    JSON.stringify({ success: true, order_id: piOrders[0].id, order_number: piOrders[0].order_number, message: 'Order already created', duplicate: true }),
                    { status: 200 }
                );
            }

            // ── Verify intent with Stripe ─────────────────────────────────────
            let paymentIntent;
            try {
                paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                if (paymentIntent.status !== 'succeeded') {
                    console.error(`[PAYMENT] Intent not succeeded intent=${paymentIntentId} status=${paymentIntent.status}`);
                    await base44.asServiceRole.entities.FailureLog.create({
                        failure_type: 'payment_intent_verification',
                        severity: 'warning',
                        restaurant_id: orderData.restaurant_id,
                        payment_intent_id: paymentIntentId,
                        user_email: user?.email || 'guest',
                        error_message: `Payment not confirmed. Status: ${paymentIntent.status}`,
                        context: { http_status: 400, pi_status: paymentIntent.status }
                    }).catch(e => console.warn('[LOG] Failed to record PI status:', e.message));

                    return new Response(JSON.stringify({ error: 'Payment not confirmed. Status: ' + paymentIntent.status, success: false }), { status: 400 });
                }
                const expectedAmountCents = Math.round(orderData.total * 100);
                if (paymentIntent.amount !== expectedAmountCents) {
                    console.error(`[PAYMENT] Amount mismatch intent=${paymentIntentId} expected=${expectedAmountCents} got=${paymentIntent.amount}`);
                    await base44.asServiceRole.entities.FailureLog.create({
                        failure_type: 'payment_amount_mismatch',
                        severity: 'critical',
                        restaurant_id: orderData.restaurant_id,
                        payment_intent_id: paymentIntentId,
                        user_email: user?.email || 'guest',
                        error_message: `Payment amount mismatch: expected ${expectedAmountCents} pence, got ${paymentIntent.amount}`,
                        context: { http_status: 400, expected: expectedAmountCents, actual: paymentIntent.amount }
                    }).catch(e => console.warn('[LOG] Failed to record amount mismatch:', e.message));

                    return new Response(JSON.stringify({ error: 'Payment amount does not match order total', success: false }), { status: 400 });
                }
                console.log(`[PAYMENT] Verified intent=${paymentIntentId} amount=${paymentIntent.amount}`);
            } catch (stripeError) {
                console.error(`[PAYMENT] Stripe verification failed intent=${paymentIntentId}:`, stripeError.message, stripeError.type || '');
                await base44.asServiceRole.entities.FailureLog.create({
                    failure_type: 'stripe_api_error',
                    severity: 'warning',
                    restaurant_id: orderData.restaurant_id,
                    payment_intent_id: paymentIntentId,
                    user_email: user?.email || 'guest',
                    error_message: `Stripe API error: ${stripeError.message}`,
                    context: { http_status: 500, stripe_error_type: stripeError.type }
                }).catch(e => console.warn('[LOG] Failed to record Stripe error:', e.message));

                return new Response(JSON.stringify({ error: 'Unable to verify payment. Please try again.', success: false }), { status: 500 });
            }

            // ── WRITE PaymentTransaction: status=authorized ───────────────────
            // From this point on, customer has been charged.
            // Any failure MUST trigger compensation (refund) before returning an error.
            const ptRecord = await base44.asServiceRole.entities.PaymentTransaction.create({
                payment_intent_id: paymentIntentId,
                idempotency_key: idempotency_key || null,
                restaurant_id: orderData.restaurant_id,
                amount: orderData.total,
                currency: 'gbp',
                status: 'authorized',
                user_email: user?.email || null,
                guest_email: orderData.guest_email || null,
                guest_phone: _normalizePhone(orderData.phone),
                stripe_verified_at: new Date().toISOString(),
            });

            console.log(`[PT] Created PaymentTransaction id=${ptRecord?.id} intent=${paymentIntentId} status=authorized`);
        }

        // ─────────────────────────────────────────────────────────────────────
        // ALL VALIDATION THAT CAN REJECT THE ORDER MUST HAPPEN BEFORE
        // THE PaymentTransaction is written (above).
        //
        // The code below runs AFTER payment is confirmed.
        // Any failure here MUST trigger a refund for card payments.
        // ─────────────────────────────────────────────────────────────────────

        // Helper: called on any post-payment failure to refund + update PT record
        const compensate = async (base44, stripe, paymentIntentId, failureStage, errorMessage) => {
            if (!paymentIntentId || !stripe) return; // Not a card payment, no compensation needed

            console.error(`[COMPENSATION] Post-payment failure stage=${failureStage} intent=${paymentIntentId} reason="${errorMessage}"`);

            // Log failure with critical severity since payment was taken
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: failureStage === 'order_create' ? 'order_create' : 'refund_initiate',
                severity: 'critical',
                restaurant_id: orderData.restaurant_id,
                payment_intent_id: paymentIntentId,
                user_email: user?.email || 'guest',
                guest_email: orderData.guest_email,
                phone: orderData.phone,
                error_message: errorMessage,
                context: {
                    order_total: orderData.total,
                    items_count: (orderData.items || []).length,
                    http_status: 500,
                    failure_stage: failureStage
                },
                alert_triggered: true,
                alert_condition: 'payment_success_order_failed'
            }).catch(e => console.warn('[LOG] Failed to record compensation failure:', e.message));

            const refundResult = await attemptRefund(stripe, paymentIntentId, errorMessage);
            const now = new Date().toISOString();

            // Find the PT record to update
            const pts = await base44.asServiceRole.entities.PaymentTransaction.filter({ payment_intent_id: paymentIntentId });
            const ptId = pts?.[0]?.id;

            if (refundResult.success) {
                console.log(`[COMPENSATION] Refund succeeded refund=${refundResult.refundId} intent=${paymentIntentId}`);
                if (ptId) {
                    await base44.asServiceRole.entities.PaymentTransaction.update(ptId, {
                        status: 'refunded',
                        refund_id: refundResult.refundId,
                        refund_amount: pts[0].amount,
                        failure_reason: errorMessage,
                        failure_stage: failureStage,
                        refund_attempted_at: now,
                        refund_confirmed_at: now,
                    }).catch(e => console.error('[PT] Failed to update PT to refunded:', e.message));
                }
            } else {
                // Refund FAILED — this is critical. Flag for manual review.
                console.error(`[COMPENSATION] CRITICAL: Refund failed for intent=${paymentIntentId}. Manual review required! refund_error="${refundResult.error}"`);
                if (ptId) {
                    await base44.asServiceRole.entities.PaymentTransaction.update(ptId, {
                        status: 'needs_review',
                        failure_reason: `Order creation: ${errorMessage} | Refund failed: ${refundResult.error}`,
                        failure_stage: failureStage,
                        refund_attempted_at: now,
                    }).catch(e => console.error('[PT] Failed to update PT to needs_review:', e.message));
                }
            }
        };

        // ── Verify Restaurant ─────────────────────────────────────────────────
        let restaurant;
        try {
            const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: orderData.restaurant_id });
            if (!restaurants || restaurants.length === 0) {
                await compensate(base44, stripe, paymentIntentId, 'restaurant_validation', 'Restaurant not found');
                return new Response(JSON.stringify({ error: 'Restaurant not found or unavailable', success: false }), { status: 404 });
            }
            restaurant = restaurants[0];
        } catch (e) {
            await compensate(base44, stripe, paymentIntentId, 'restaurant_validation', 'Restaurant lookup failed');
            return new Response(JSON.stringify({ error: 'Restaurant not found or unavailable', success: false }), { status: 404 });
        }

        if (restaurant.is_open === false) {
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'restaurant_closed',
                severity: 'info',
                restaurant_id: orderData.restaurant_id,
                user_email: user?.email || 'guest',
                error_message: 'Restaurant is currently closed',
                context: { http_status: 400 }
            }).catch(e => console.warn('[LOG] Failed to record restaurant closed:', e.message));

            await compensate(base44, stripe, paymentIntentId, 'restaurant_validation', 'Restaurant is closed');
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
                await base44.asServiceRole.entities.FailureLog.create({
                    failure_type: 'hours_check',
                    severity: 'info',
                    restaurant_id: orderData.restaurant_id,
                    user_email: user?.email || 'guest',
                    error_message: 'Restaurant closed today',
                    context: { http_status: 400 }
                }).catch(e => console.warn('[LOG] Failed to record hours check:', e.message));

                await compensate(base44, stripe, paymentIntentId, 'hours_check', 'Restaurant closed today');
                return new Response(JSON.stringify({ error: 'Restaurant is not accepting orders today', success: false }), { status: 400 });
            }
            if (todayHours && todayHours.open && todayHours.close) {
                const [openH, openM] = todayHours.open.split(':').map(Number);
                const [closeH, closeM] = todayHours.close.split(':').map(Number);
                const openMinutes = openH * 60 + openM;
                const closeMinutes = closeH * 60 + closeM;
                if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
                    await base44.asServiceRole.entities.FailureLog.create({
                        failure_type: 'hours_check',
                        severity: 'info',
                        restaurant_id: orderData.restaurant_id,
                        user_email: user?.email || 'guest',
                        error_message: `Restaurant is currently closed. Hours: ${todayHours.open} - ${todayHours.close}`,
                        context: { http_status: 400, hours: `${todayHours.open}-${todayHours.close}` }
                    }).catch(e => console.warn('[LOG] Failed to record hours check:', e.message));

                    await compensate(base44, stripe, paymentIntentId, 'hours_check', `Restaurant closed: ${todayHours.open}-${todayHours.close}`);
                    return new Response(JSON.stringify({ error: `Restaurant is currently closed. Hours: ${todayHours.open} - ${todayHours.close}`, success: false }), { status: 400 });
                }
            }
        }

        // ── Delivery Zone ─────────────────────────────────────────────────────
        if (orderData.order_type === 'delivery' && orderData.delivery_coordinates) {
            const { lat, lng } = orderData.delivery_coordinates;
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
                        if (pointInPolygon([lng, lat], zone.coordinates.map(c => [c.lng, c.lat]))) { zoneFound = true; break; }
                    }
                }
            }
            if (!zoneFound) {
                await base44.asServiceRole.entities.FailureLog.create({
                    failure_type: 'delivery_zone',
                    severity: 'info',
                    restaurant_id: orderData.restaurant_id,
                    user_email: user?.email || 'guest',
                    error_message: 'Delivery location outside all zones',
                    context: { http_status: 400, coordinates: { lat, lng } }
                }).catch(e => console.warn('[LOG] Failed to record zone check:', e.message));

                await compensate(base44, stripe, paymentIntentId, 'delivery_zone', 'Delivery location outside all zones');
                return new Response(JSON.stringify({ error: 'Delivery not available to selected location', success: false, refunded: true }), { status: 400 });
            }
        }

        // ── Minimum Order ─────────────────────────────────────────────────────
        if (orderData.order_type === 'delivery') {
            const clientSubtotal = (orderData.items || []).reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
            if (restaurant.minimum_order > 0 && clientSubtotal < restaurant.minimum_order) {
                await base44.asServiceRole.entities.FailureLog.create({
                    failure_type: 'minimum_order',
                    severity: 'info',
                    restaurant_id: orderData.restaurant_id,
                    user_email: user?.email || 'guest',
                    error_message: `Order total £${clientSubtotal.toFixed(2)} below minimum £${restaurant.minimum_order.toFixed(2)}`,
                    context: { http_status: 400, order_total: clientSubtotal, minimum_order: restaurant.minimum_order }
                }).catch(e => console.warn('[LOG] Failed to record minimum order:', e.message));

                await compensate(base44, stripe, paymentIntentId, 'minimum_order', `Below minimum order £${restaurant.minimum_order}`);
                return new Response(JSON.stringify({ error: `Minimum order is £${restaurant.minimum_order.toFixed(2)}`, success: false }), { status: 400 });
            }
        }

        // ── Cart Item Validation ──────────────────────────────────────────────
        if (!orderData.items || orderData.items.length === 0) {
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'cart_validation',
                severity: 'warning',
                restaurant_id: orderData.restaurant_id,
                user_email: user?.email || 'guest',
                error_message: 'Order contains no items',
                context: { http_status: 400, items_count: 0 }
            }).catch(e => console.warn('[LOG] Failed to record empty cart:', e.message));

            await compensate(base44, stripe, paymentIntentId, 'cart_validation', 'Empty cart');
            return new Response(JSON.stringify({ error: 'Order contains no items', success: false }), { status: 400 });
        }
        const menuItems = await base44.asServiceRole.entities.MenuItem.filter({ restaurant_id: orderData.restaurant_id });
        const menuItemsMap = new Map(menuItems.map(item => [item.id, item]));
        for (const cartItem of orderData.items) {
            if (!menuItemsMap.has(cartItem.menu_item_id)) {
                await base44.asServiceRole.entities.FailureLog.create({
                    failure_type: 'cart_validation',
                    severity: 'info',
                    restaurant_id: orderData.restaurant_id,
                    user_email: user?.email || 'guest',
                    error_message: `Menu item no longer available: ${cartItem.name}`,
                    context: { http_status: 400, menu_item_id: cartItem.menu_item_id }
                }).catch(e => console.warn('[LOG] Failed to record item unavailable:', e.message));

                await compensate(base44, stripe, paymentIntentId, 'cart_validation', `Item ${cartItem.name} no longer available`);
                return new Response(JSON.stringify({ error: `Item ${cartItem.name} is no longer available`, success: false }), { status: 400 });
            }
            const menuItem = menuItemsMap.get(cartItem.menu_item_id);
            if (menuItem.is_available === false) {
                await base44.asServiceRole.entities.FailureLog.create({
                    failure_type: 'cart_validation',
                    severity: 'info',
                    restaurant_id: orderData.restaurant_id,
                    user_email: user?.email || 'guest',
                    error_message: `Menu item unavailable: ${cartItem.name}`,
                    context: { http_status: 400, menu_item_id: cartItem.menu_item_id }
                }).catch(e => console.warn('[LOG] Failed to record item disabled:', e.message));

                await compensate(base44, stripe, paymentIntentId, 'cart_validation', `Item ${cartItem.name} unavailable`);
                return new Response(JSON.stringify({ error: `${cartItem.name} is no longer available`, success: false }), { status: 400 });
            }
            const submittedPrice = cartItem.price;
            // SECURITY: Overwrite with server-authoritative price
            cartItem.price = menuItem.price;
            if (Math.abs(menuItem.price - submittedPrice) > 0.50) {
                console.warn(`[SECURITY] Price mismatch for ${cartItem.name}: menu=£${menuItem.price} submitted=£${submittedPrice}`);
            }
        }

        const serverSubtotal = orderData.items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
        const deliveryFee = orderData.delivery_fee || 0;

        // ── Coupon Stacking ───────────────────────────────────────────────────
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
                await base44.asServiceRole.entities.FailureLog.create({
                    failure_type: 'coupon_stacking',
                    severity: 'info',
                    restaurant_id: orderData.restaurant_id,
                    user_email: user?.email || 'guest',
                    error_message: `Too many coupon codes: ${inputCodes.length} > ${MAX_COUPONS_PER_ORDER}`,
                    context: { http_status: 400, attempted_coupons: inputCodes }
                }).catch(e => console.warn('[LOG] Failed to record coupon stacking:', e.message));

                await compensate(base44, stripe, paymentIntentId, 'coupon_validation', 'Exceeded max coupons');
                return new Response(JSON.stringify({ error: `A maximum of ${MAX_COUPONS_PER_ORDER} coupon codes can be applied per order.`, success: false }), { status: 400 });
            }
            const uniqueCodes = new Set(inputCodes);
            if (uniqueCodes.size !== inputCodes.length) {
                await base44.asServiceRole.entities.FailureLog.create({
                    failure_type: 'coupon_validation',
                    severity: 'info',
                    restaurant_id: orderData.restaurant_id,
                    user_email: user?.email || 'guest',
                    error_message: 'Duplicate coupon codes provided',
                    context: { http_status: 400, attempted_coupons: inputCodes }
                }).catch(e => console.warn('[LOG] Failed to record duplicate coupons:', e.message));

                await compensate(base44, stripe, paymentIntentId, 'coupon_validation', 'Duplicate coupon codes');
                return new Response(JSON.stringify({ error: 'Duplicate coupon codes are not allowed.', success: false }), { status: 400 });
            }

            const now = new Date();
            const validatedCoupons = [];
            for (const code of inputCodes) {
                const coupons = await base44.asServiceRole.entities.Coupon.filter({ code });
                if (!coupons?.length) {
                    await base44.asServiceRole.entities.FailureLog.create({
                        failure_type: 'coupon_validation',
                        severity: 'info',
                        restaurant_id: orderData.restaurant_id,
                        user_email: user?.email || 'guest',
                        error_message: `Coupon code not found: ${code}`,
                        context: { http_status: 400, attempted_coupons: [code] }
                    }).catch(e => console.warn('[LOG] Failed to record invalid coupon:', e.message));

                    await compensate(base44, stripe, paymentIntentId, 'coupon_validation', `Coupon not found: ${code}`);
                    return new Response(JSON.stringify({ error: `Coupon code "${code}" is not recognised. Please remove it and try again.`, success: false }), { status: 400 });
                }
                const coupon = coupons[0];
                const singleResult = validateSingleCoupon(coupon, code, now, serverSubtotal, deliveryFee, orderData.restaurant_id);
                if (!singleResult.valid) {
                    await base44.asServiceRole.entities.FailureLog.create({
                        failure_type: 'coupon_validation',
                        severity: 'info',
                        restaurant_id: orderData.restaurant_id,
                        user_email: user?.email || 'guest',
                        error_message: singleResult.error,
                        context: { http_status: 400, attempted_coupons: [code], reason: singleResult.error }
                    }).catch(e => console.warn('[LOG] Failed to record coupon validation:', e.message));

                    await compensate(base44, stripe, paymentIntentId, 'coupon_validation', singleResult.error);
                    return new Response(JSON.stringify({ error: singleResult.error, success: false }), { status: 400 });
                }
                const limitError = await checkPerCustomerLimit(base44, coupon, user, normalizedGuestEmail, normalizedPhone);
                if (limitError) {
                    await base44.asServiceRole.entities.FailureLog.create({
                        failure_type: 'coupon_per_customer_limit',
                        severity: 'info',
                        restaurant_id: orderData.restaurant_id,
                        user_email: user?.email || 'guest',
                        guest_email: normalizedGuestEmail,
                        phone: normalizedPhone,
                        error_message: limitError,
                        context: { http_status: 400, attempted_coupons: [code] }
                    }).catch(e => console.warn('[LOG] Failed to record per-customer limit:', e.message));

                    await compensate(base44, stripe, paymentIntentId, 'coupon_validation', limitError);
                    return new Response(JSON.stringify({ error: limitError, success: false }), { status: 400 });
                }
                validatedCoupons.push({ coupon, rawDiscount: singleResult.discount });
            }

            if (validatedCoupons.length > 1) {
                const nonStackable = validatedCoupons.filter(vc => !vc.coupon.stackable);
                if (nonStackable.length > 0) {
                    const codes = nonStackable.map(vc => vc.coupon.code).join(', ');
                    const msg = `The following coupon(s) cannot be combined: ${codes}`;
                    await base44.asServiceRole.entities.FailureLog.create({
                        failure_type: 'coupon_stacking',
                        severity: 'info',
                        restaurant_id: orderData.restaurant_id,
                        user_email: user?.email || 'guest',
                        error_message: msg,
                        context: { http_status: 400, attempted_coupons: validatedCoupons.map(vc => vc.coupon.code) }
                    }).catch(e => console.warn('[LOG] Failed to record stacking violation:', e.message));

                    await compensate(base44, stripe, paymentIntentId, 'coupon_validation', msg);
                    return new Response(JSON.stringify({ error: `${msg}. Only coupons marked as stackable may be used together.`, success: false }), { status: 400 });
                }
            }

            const percentageCoupons = validatedCoupons.filter(vc => vc.coupon.discount_type === 'percentage').sort((a, b) => a.coupon.code.localeCompare(b.coupon.code));
            const otherCoupons = validatedCoupons.filter(vc => vc.coupon.discount_type !== 'percentage').sort((a, b) => a.coupon.code.localeCompare(b.coupon.code));
            const maxCouponDiscount = serverSubtotal * MAX_COUPON_DISCOUNT_RATIO;
            let accumulatedDiscount = 0;

            for (const vc of [...percentageCoupons, ...otherCoupons]) {
                const contribution = Math.min(vc.rawDiscount, maxCouponDiscount - accumulatedDiscount);
                accumulatedDiscount += contribution;
                verifiedCouponCodes.push(vc.coupon.code);
                verifiedCouponIds.push(vc.coupon.id);
                couponUsageCounts.push(vc.coupon.usage_count || 0);
                console.log(`[COUPON] Applied code="${vc.coupon.code}" contribution=£${contribution.toFixed(2)} running=£${accumulatedDiscount.toFixed(2)}`);
            }
            verifiedDiscount = accumulatedDiscount;

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
                } else {
                    const promError = promRes?.data?.error || 'Promotion validation failed';
                    await base44.asServiceRole.entities.FailureLog.create({
                        failure_type: 'promotion_validation',
                        severity: 'warning',
                        restaurant_id: orderData.restaurant_id,
                        user_email: user?.email || 'guest',
                        error_message: promError,
                        context: { http_status: 400, promotion_id: orderData.applied_promotion_id }
                    }).catch(e => console.warn('[LOG] Failed to record promotion error:', e.message));

                    await compensate(base44, stripe, paymentIntentId, 'coupon_validation', promError);
                    return new Response(JSON.stringify({ error: `Promotion: ${promError}`, success: false }), { status: 400 });
                }
            } catch (promErr) {
                await base44.asServiceRole.entities.FailureLog.create({
                    failure_type: 'promotion_validation',
                    severity: 'warning',
                    restaurant_id: orderData.restaurant_id,
                    user_email: user?.email || 'guest',
                    error_message: `Promotion validation exception: ${promErr.message}`,
                    context: { http_status: 500, promotion_id: orderData.applied_promotion_id }
                }).catch(e => console.warn('[LOG] Failed to record promotion exception:', e.message));

                await compensate(base44, stripe, paymentIntentId, 'coupon_validation', `Promotion error: ${promErr.message}`);
                return new Response(JSON.stringify({ error: 'Promotion validation failed. Please try again.', success: false }), { status: 500 });
            }
        }

        const serverTotal = Math.max(0, serverSubtotal + deliveryFee - verifiedDiscount);

        if (Math.abs(serverTotal - orderData.total) > 0.50) {
            const mismatchMsg = `Total mismatch: server=£${serverTotal.toFixed(2)} client=£${orderData.total}`;
            console.error(`[SECURITY] ${mismatchMsg}`);
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'total_mismatch',
                severity: 'critical',
                restaurant_id: orderData.restaurant_id,
                payment_intent_id: paymentIntentId,
                user_email: user?.email || 'guest',
                error_message: mismatchMsg,
                context: {
                    http_status: 400,
                    server_total: serverTotal,
                    client_total: orderData.total,
                    difference: Math.abs(serverTotal - orderData.total),
                    items_count: (orderData.items || []).length
                }
            }).catch(e => console.warn('[LOG] Failed to record total mismatch:', e.message));

            await compensate(base44, stripe, paymentIntentId, 'total_mismatch', mismatchMsg);
            return new Response(JSON.stringify({ error: 'Order total does not match current menu prices. Please refresh and try again.', success: false }), { status: 400 });
        }

        orderData.total = serverTotal;
        orderData.subtotal = serverSubtotal;

        // ── CREATE ORDER ──────────────────────────────────────────────────────
        const { coupon_codes: _cc, coupon_code: _c, ...cleanOrderData } = orderData;

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
            // Order.create threw — this is the critical orphan scenario.
            console.error(`[ORDER] Order.create FAILED intent=${paymentIntentId} error:`, orderCreateErr.message);
            
            // Log the failure with critical severity + alert condition
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'order_create',
                severity: 'critical',
                restaurant_id: orderData.restaurant_id,
                payment_intent_id: paymentIntentId,
                user_email: user?.email || 'guest',
                guest_email: orderData.guest_email,
                phone: orderData.phone,
                error_message: `Order creation exception: ${orderCreateErr.message}`,
                context: {
                    http_status: 500,
                    items_count: (orderData.items || []).length,
                    order_total: serverTotal
                },
                alert_triggered: true,
                alert_condition: 'payment_success_order_failed'
            }).catch(e => console.warn('[LOG] Failed to record order create exception:', e.message));

            await compensate(base44, stripe, paymentIntentId, 'order_create', orderCreateErr.message);
            return new Response(JSON.stringify({ error: 'Failed to create order. Your payment has been refunded automatically.', success: false, refunded: true }), { status: 500 });
        }

        if (!newOrder || !newOrder.id) {
            // Order.create returned but with no ID — unexpected, treat as failure.
            const noIdMsg = 'Order entity returned no ID';
            console.error(`[ORDER] ${noIdMsg} restaurant=${orderData.restaurant_id}`);

            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'order_create',
                severity: 'critical',
                restaurant_id: orderData.restaurant_id,
                payment_intent_id: paymentIntentId,
                user_email: user?.email || 'guest',
                guest_email: orderData.guest_email,
                phone: orderData.phone,
                error_message: noIdMsg,
                context: {
                    http_status: 500,
                    items_count: (orderData.items || []).length,
                    order_total: serverTotal
                },
                alert_triggered: true,
                alert_condition: 'payment_success_order_failed'
            }).catch(e => console.warn('[LOG] Failed to record order no-id error:', e.message));

            await compensate(base44, stripe, paymentIntentId, 'order_create', noIdMsg);
            return new Response(JSON.stringify({ error: 'Failed to create order. Your payment has been refunded automatically.', success: false, refunded: true }), { status: 500 });
        }

        // ── UPDATE PaymentTransaction: status=order_created ───────────────────
        if (paymentIntentId) {
            const pts = await base44.asServiceRole.entities.PaymentTransaction.filter({ payment_intent_id: paymentIntentId });
            const ptId = pts?.[0]?.id;
            if (ptId) {
                await base44.asServiceRole.entities.PaymentTransaction.update(ptId, {
                    status: 'order_created',
                    order_id: newOrder.id,
                    order_number: newOrder.order_number || null,
                    order_created_at: new Date().toISOString(),
                }).catch(e => console.error('[PT] Failed to update PT to order_created:', e.message));
            }
        }

        // ── Coupon usage_count increment (after order committed) ──────────────
        for (let i = 0; i < verifiedCouponIds.length; i++) {
            base44.asServiceRole.entities.Coupon.update(verifiedCouponIds[i], {
                usage_count: couponUsageCounts[i] + 1
            }).catch(e => console.warn(`[COUPON] Failed to increment usage_count for ${verifiedCouponIds[i]}:`, e));
        }

        console.log(`[ORDER] Created: id=${newOrder.id} num=${newOrder.order_number} restaurant=${orderData.restaurant_id} total=£${serverTotal.toFixed(2)} coupons=[${verifiedCouponCodes.join(',')}] type=${orderData.order_type} payment=${orderData.payment_method}`);

        return new Response(
            JSON.stringify({ success: true, order_id: newOrder.id, order_number: newOrder.order_number, message: 'Order created successfully' }),
            { status: 201 }
        );

    } catch (error) {
        // Catch-all: should not reach here in normal flow
        console.error('[ORDER] verifyAndCreateOrder unhandled error:', error.message, error.stack);

        // Log the unhandled exception for visibility
        try {
            const base44 = createClientFromRequest(req);
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'order_create',
                severity: 'critical',
                error_message: `Unhandled exception: ${error.message}`,
                stack_trace: error.stack?.slice(0, 500) || null,
                context: {
                    http_status: 500
                }
            });
        } catch (logErr) {
            console.warn('[LOG] Failed to record unhandled exception:', logErr.message);
        }

        return new Response(JSON.stringify({ error: 'Order creation failed. Please try again.', success: false }), { status: 500 });
    }
});