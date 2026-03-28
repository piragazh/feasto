/**
 * VERIFY AND CREATE ORDER — Production-hardened with explicit stage tracing
 * =========================================================================
 *
 * PAYMENT SAFETY CONTRACT:
 *   1. Before touching payment: record PaymentTransaction status='authorized'
 *   2. Attempt order creation through explicit traced stages
 *   3a. SUCCESS → update PaymentTransaction to status='order_created'
 *   3b. FAILURE → immediately attempt Stripe refund via compensate()
 *       - Refund succeeds → PT status='refunded', FailureLog written
 *       - Refund fails    → PT status='needs_review', critical alert logged
 *
 * STAGE TRACE IDs thread through every log line so any 500 can be root-caused
 * in FailureLog without reading code.
 *
 * ERROR CONTRACT (returned to Checkout.jsx):
 *   Success:  { success: true, order_id, order_number }
 *   Failure:  { success: false, error: string, code: string, stage: string, refunded?: boolean }
 *
 * IDEMPOTENCY:
 *   - idempotency_key: client session key → Order dedup (checked first)
 *   - payment_intent_id: Stripe PI → Order.payment_intent_id dedup
 *   - PaymentTransaction dedup: if PT already has order_id → return that order
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_COUPONS_PER_ORDER = 3;
const MAX_COUPON_DISCOUNT_RATIO = 0.50;
const LOG = '[verifyAndCreateOrder]';

// ── Stripe refund helper ──────────────────────────────────────────────────────
async function attemptRefund(stripe, paymentIntentId, reason) {
    try {
        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason: 'fraudulent',
            metadata: { failure_reason: String(reason).slice(0, 500) }
        });
        console.log(`${LOG} [REFUND] issued refund=${refund.id} intent=${paymentIntentId} status=${refund.status}`);
        return { success: true, refundId: refund.id };
    } catch (err) {
        console.error(`${LOG} [REFUND] FAILED intent=${paymentIntentId}:`, err.message);
        return { success: false, error: err.message };
    }
}

// ── Structured error response builder ────────────────────────────────────────
function stageError(code, stage, message, httpStatus = 400, extra = {}) {
    return { ok: false, httpStatus, body: { success: false, error: message, code, stage, ...extra } };
}

// ── FailureLog writer (never throws) ─────────────────────────────────────────
async function writeFailureLog(base44, fields) {
    try {
        await base44.asServiceRole.entities.FailureLog.create({
            logged_at: new Date().toISOString(),
            ...fields,
        });
    } catch (e) {
        console.warn(`${LOG} [FAILURELOG] write failed:`, e.message);
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

// ── pointInPolygon (used twice — hoisted to avoid duplication) ────────────────
function pointInPolygon(point, polygon) {
    const [px, py] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only', success: false }, { status: 405 });
    }

    // ── Generate a trace ID that threads through every log line ───────────────
    const traceId = `vco_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    console.log(`${LOG} [START] trace=${traceId}`);

    // ── Parse body ONCE — req.text() can only be called once ──────────────────
    let body;
    try {
        body = await req.json();
    } catch (parseErr) {
        console.error(`${LOG} [trace=${traceId}] body parse failed:`, parseErr.message);
        return Response.json({ error: 'Invalid request body', success: false, code: 'PARSE_ERROR', stage: 'init' }, { status: 400 });
    }

    const { orderData, paymentIntentId, idempotency_key } = body;

    // ── SDK client — initialized once, available to all stages ────────────────
    const base44 = createClientFromRequest(req);

    // ── Auth (guests allowed) ──────────────────────────────────────────────────
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { /* guest */ }

    const userLabel = user?.email || orderData?.guest_email || 'guest';
    console.log(`${LOG} [trace=${traceId}] user=${userLabel} pi=${paymentIntentId || 'cash'} key=${idempotency_key || 'none'}`);

    // ── Input guard ────────────────────────────────────────────────────────────
    if (!orderData || !orderData.restaurant_id) {
        await writeFailureLog(base44, {
            failure_type: 'restaurant_validation', severity: 'warning',
            user_email: userLabel, error_message: 'Invalid order data or missing restaurant_id',
            context: { trace_id: traceId, http_status: 400 }
        });
        return Response.json({ error: 'Invalid order data', success: false, code: 'MISSING_ORDER_DATA', stage: 'init' }, { status: 400 });
    }

    // ── STAGE: Velocity throttle (non-fatal) ───────────────────────────────────
    console.log(`${LOG} [trace=${traceId}] stage=velocity_throttle`);
    try {
        const velocityResult = await base44.functions.invoke('orderVelocityThrottle', { orderData });
        if (velocityResult?.data && !velocityResult.data.allowed) {
            await writeFailureLog(base44, {
                failure_type: 'payment_velocity_throttle', severity: 'info',
                restaurant_id: orderData.restaurant_id, user_email: userLabel,
                guest_email: orderData.guest_email, phone: orderData.phone,
                error_message: velocityResult.data.error || 'Too many orders in short time',
                context: { trace_id: traceId, order_total: orderData.total, items_count: (orderData.items || []).length, http_status: 429 }
            });
            return Response.json(
                { error: velocityResult.data.error || 'Too many orders. Please wait.', success: false, code: 'VELOCITY_THROTTLE', stage: 'velocity_throttle', refunded: false },
                { status: 429, headers: { 'Retry-After': String(velocityResult.data.retryAfter || 60) } }
            );
        }
    } catch (velocityErr) {
        // Non-fatal: velocity check failure must never block a legitimate order
        console.warn(`${LOG} [trace=${traceId}] velocity check non-fatal error:`, velocityErr.message);
    }

    // ── STAGE: Idempotency — session key ───────────────────────────────────────
    console.log(`${LOG} [trace=${traceId}] stage=idempotency_key_check`);
    if (idempotency_key) {
        try {
            const existing = await base44.asServiceRole.entities.Order.filter({ idempotency_key });
            if (existing?.length > 0) {
                console.log(`${LOG} [trace=${traceId}] duplicate idempotency_key=${idempotency_key} → order ${existing[0].id}`);
                return Response.json({ success: true, order_id: existing[0].id, order_number: existing[0].order_number, duplicate: true }, { status: 200 });
            }
        } catch (idempErr) {
            // Non-fatal: idempotency check failure shouldn't block order
            console.warn(`${LOG} [trace=${traceId}] idempotency check failed (non-fatal):`, idempErr.message);
        }
    }

    // ── Stripe client (only for card payments) ─────────────────────────────────
    const stripe = orderData.payment_method === 'card' ? new Stripe(Deno.env.get('STRIPE_SECRET_KEY')) : null;

    // ── STAGE: Payment Intent verification ────────────────────────────────────
    console.log(`${LOG} [trace=${traceId}] stage=payment_intent_verification method=${orderData.payment_method}`);
    if (orderData.payment_method === 'card') {
        if (!paymentIntentId) {
            await writeFailureLog(base44, {
                failure_type: 'payment_intent_verification', severity: 'warning',
                restaurant_id: orderData.restaurant_id, user_email: userLabel,
                error_message: 'Card payment selected but no payment intent provided',
                context: { trace_id: traceId, http_status: 400 }
            });
            return Response.json({ error: 'Card payment selected but no payment intent found', success: false, code: 'MISSING_PAYMENT_INTENT', stage: 'payment_intent_verification' }, { status: 400 });
        }
        if (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
            await writeFailureLog(base44, {
                failure_type: 'payment_intent_verification', severity: 'warning',
                restaurant_id: orderData.restaurant_id, payment_intent_id: String(paymentIntentId).slice(0, 20), user_email: userLabel,
                error_message: 'Invalid payment intent format',
                context: { trace_id: traceId, http_status: 400 }
            });
            return Response.json({ error: 'Invalid payment intent format', success: false, code: 'INVALID_PAYMENT_INTENT', stage: 'payment_intent_verification' }, { status: 400 });
        }

        // PT dedup: already linked to order?
        try {
            const existingPT = await base44.asServiceRole.entities.PaymentTransaction.filter({ payment_intent_id: paymentIntentId });
            if (existingPT?.length > 0) {
                const pt = existingPT[0];
                if (pt.status === 'order_created' && pt.order_id) {
                    console.log(`${LOG} [trace=${traceId}] PT already has order_id=${pt.order_id}`);
                    return Response.json({ success: true, order_id: pt.order_id, order_number: pt.order_number, duplicate: true }, { status: 200 });
                }
                if (pt.status === 'refunded') {
                    console.warn(`${LOG} [trace=${traceId}] intent=${paymentIntentId} already refunded`);
                    return Response.json({ error: 'This payment has already been refunded. Please start a new checkout.', success: false, code: 'ALREADY_REFUNDED', stage: 'payment_intent_verification' }, { status: 400 });
                }
                if (pt.status === 'needs_review') {
                    console.warn(`${LOG} [trace=${traceId}] intent=${paymentIntentId} in needs_review`);
                    return Response.json({ error: 'There was a problem with this payment. Our team has been notified. Please contact support.', success: false, code: 'NEEDS_REVIEW', stage: 'payment_intent_verification' }, { status: 400 });
                }
            }
        } catch (ptDedupErr) {
            console.warn(`${LOG} [trace=${traceId}] PT dedup check failed (non-fatal):`, ptDedupErr.message);
        }

        // Order.payment_intent_id dedup (pre-PT era)
        try {
            const piOrders = await base44.asServiceRole.entities.Order.filter({ payment_intent_id: paymentIntentId });
            if (piOrders?.length > 0) {
                console.log(`${LOG} [trace=${traceId}] PI already used for order ${piOrders[0].id}`);
                return Response.json({ success: true, order_id: piOrders[0].id, order_number: piOrders[0].order_number, duplicate: true }, { status: 200 });
            }
        } catch (piDedupErr) {
            console.warn(`${LOG} [trace=${traceId}] PI order dedup check failed (non-fatal):`, piDedupErr.message);
        }

        // Verify with Stripe
        let paymentIntent;
        try {
            paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            console.log(`${LOG} [trace=${traceId}] PI retrieved status=${paymentIntent.status} amount=${paymentIntent.amount}p`);
        } catch (stripeErr) {
            console.error(`${LOG} [trace=${traceId}] Stripe retrieve failed:`, stripeErr.message);
            await writeFailureLog(base44, {
                failure_type: 'stripe_api_error', severity: 'warning',
                restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId, user_email: userLabel,
                error_message: `Stripe API error during PI retrieval: ${stripeErr.message}`,
                context: { trace_id: traceId, stripe_error_type: stripeErr.type, http_status: 502 }
            });
            return Response.json({ error: 'Unable to verify payment. Please try again.', success: false, code: 'STRIPE_RETRIEVE_FAILED', stage: 'payment_intent_verification' }, { status: 502 });
        }

        if (paymentIntent.status !== 'succeeded') {
            await writeFailureLog(base44, {
                failure_type: 'payment_intent_verification', severity: 'warning',
                restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId, user_email: userLabel,
                error_message: `Payment not confirmed. PI status: ${paymentIntent.status}`,
                context: { trace_id: traceId, pi_status: paymentIntent.status, http_status: 400 }
            });
            return Response.json({ error: `Payment not confirmed. Status: ${paymentIntent.status}`, success: false, code: 'PAYMENT_NOT_SUCCEEDED', stage: 'payment_intent_verification' }, { status: 400 });
        }

        const expectedAmountPence = Math.round(orderData.total * 100);
        const actualAmountPence = paymentIntent.amount;
        const penceDeviation = Math.abs(expectedAmountPence - actualAmountPence);
        if (penceDeviation > 1) {
            console.error(`${LOG} [trace=${traceId}] amount mismatch expected=${expectedAmountPence}p got=${actualAmountPence}p delta=${penceDeviation}p`);
            await writeFailureLog(base44, {
                failure_type: 'payment_amount_mismatch', severity: 'critical',
                restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId, user_email: userLabel,
                error_message: `Amount mismatch: expected ${expectedAmountPence}p got ${actualAmountPence}p (delta ${penceDeviation}p)`,
                context: { trace_id: traceId, expected_pence: expectedAmountPence, actual_pence: actualAmountPence, deviation_pence: penceDeviation, http_status: 400 }
            });
            return Response.json({ error: 'Payment amount does not match order total', success: false, code: 'AMOUNT_MISMATCH', stage: 'payment_intent_verification' }, { status: 400 });
        }
        console.log(`${LOG} [trace=${traceId}] PI verified amount=${actualAmountPence}p delta=${penceDeviation}p ✓`);
    }

    // ── STAGE: Write PaymentTransaction (authorized) ───────────────────────────
    // From this point on, the customer has been charged.
    // Every failure MUST call compensate() before returning.
    console.log(`${LOG} [trace=${traceId}] stage=payment_transaction_create`);
    let ptRecord = null;
    if (orderData.payment_method === 'card') {
        try {
            ptRecord = await base44.asServiceRole.entities.PaymentTransaction.create({
                payment_intent_id: paymentIntentId,
                idempotency_key: idempotency_key || null,
                restaurant_id: orderData.restaurant_id,
                amount: orderData.total,
                currency: 'gbp',
                status: 'authorized',
                user_email: user?.email || null,
                guest_email: _normalizeEmail(orderData.guest_email),
                guest_phone: _normalizePhone(orderData.phone),
                stripe_verified_at: new Date().toISOString(),
            });
            console.log(`${LOG} [trace=${traceId}] PT created id=${ptRecord?.id} status=authorized`);
        } catch (ptCreateErr) {
            console.error(`${LOG} [trace=${traceId}] CRITICAL: PT.create failed:`, ptCreateErr.message);
            await writeFailureLog(base44, {
                failure_type: 'payment_transaction_create', severity: 'critical',
                restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId, user_email: userLabel,
                error_message: `PaymentTransaction.create failed: ${ptCreateErr.message}`,
                context: { trace_id: traceId, http_status: 500, alert_triggered: true }
            });
            // Refund immediately — no PT means we can't track this charge
            await attemptRefund(stripe, paymentIntentId, `PT create failed: ${ptCreateErr.message}`);
            return Response.json({ error: 'Payment processing error. Your card has been refunded. Please contact support.', success: false, code: 'PT_CREATE_FAILED', stage: 'payment_transaction_create', refunded: true }, { status: 500 });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COMPENSATION HELPER
    // Called on any post-payment failure. Writes FailureLog, attempts refund,
    // updates PT status. Never throws — any error inside is absorbed.
    // ─────────────────────────────────────────────────────────────────────────
    const compensate = async (stage, errorCode, errorMessage) => {
        if (!paymentIntentId || !stripe) return { refunded: false }; // cash order — no compensation needed

        console.error(`${LOG} [trace=${traceId}] [COMPENSATE] stage=${stage} code=${errorCode} reason="${errorMessage}"`);

        await writeFailureLog(base44, {
            failure_type: stage === 'order_persistence' ? 'order_create' : 'refund_initiate',
            severity: 'critical',
            restaurant_id: orderData.restaurant_id,
            payment_intent_id: paymentIntentId,
            user_email: userLabel,
            guest_email: orderData.guest_email,
            phone: orderData.phone,
            error_message: errorMessage,
            context: {
                trace_id: traceId, order_total: orderData.total,
                items_count: (orderData.items || []).length,
                failure_stage: stage, failure_code: errorCode, http_status: 500
            },
            alert_triggered: true,
            alert_condition: 'payment_success_order_failed'
        });

        const refundResult = await attemptRefund(stripe, paymentIntentId, errorMessage);
        const now = new Date().toISOString();

        // Update PT record
        try {
            const pts = await base44.asServiceRole.entities.PaymentTransaction.filter({ payment_intent_id: paymentIntentId });
            const ptId = pts?.[0]?.id;
            if (ptId) {
                if (refundResult.success) {
                    await base44.asServiceRole.entities.PaymentTransaction.update(ptId, {
                        status: 'refunded', refund_id: refundResult.refundId,
                        refund_amount: pts[0].amount, failure_reason: errorMessage,
                        refund_attempted_at: now, refund_confirmed_at: now,
                    });
                } else {
                    await base44.asServiceRole.entities.PaymentTransaction.update(ptId, {
                        status: 'needs_review',
                        failure_reason: `Order failed: ${errorMessage} | Refund failed: ${refundResult.error}`,
                        refund_attempted_at: now,
                    });
                    console.error(`${LOG} [trace=${traceId}] CRITICAL: refund failed for ${paymentIntentId} — needs_review. refund_error="${refundResult.error}"`);
                }
            }
        } catch (ptUpdateErr) {
            console.error(`${LOG} [trace=${traceId}] PT compensation update failed:`, ptUpdateErr.message);
        }

        return { refunded: refundResult.success };
    };

    // ── STAGE: Restaurant validation ───────────────────────────────────────────
    console.log(`${LOG} [trace=${traceId}] stage=restaurant_validation`);
    let restaurant;
    try {
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: orderData.restaurant_id });
        if (!restaurants?.length) {
            const msg = `Restaurant not found: ${orderData.restaurant_id}`;
            console.error(`${LOG} [trace=${traceId}] ${msg}`);
            await writeFailureLog(base44, { failure_type: 'restaurant_validation', severity: 'warning', restaurant_id: orderData.restaurant_id, user_email: userLabel, error_message: msg, context: { trace_id: traceId, http_status: 404 } });
            const c = await compensate('restaurant_validation', 'RESTAURANT_NOT_FOUND', msg);
            return Response.json({ error: 'Restaurant not found or unavailable', success: false, code: 'RESTAURANT_NOT_FOUND', stage: 'restaurant_validation', ...c }, { status: 404 });
        }
        restaurant = restaurants[0];
    } catch (restaurantErr) {
        const msg = `Restaurant lookup exception: ${restaurantErr.message}`;
        console.error(`${LOG} [trace=${traceId}] ${msg}`);
        await writeFailureLog(base44, { failure_type: 'restaurant_validation', severity: 'warning', restaurant_id: orderData.restaurant_id, user_email: userLabel, error_message: msg, context: { trace_id: traceId, http_status: 500 } });
        const c = await compensate('restaurant_validation', 'RESTAURANT_LOOKUP_FAILED', msg);
        return Response.json({ error: 'Restaurant not found or unavailable', success: false, code: 'RESTAURANT_LOOKUP_FAILED', stage: 'restaurant_validation', ...c }, { status: 500 });
    }

    if (restaurant.is_open === false) {
        const msg = 'Restaurant is currently closed (is_open=false)';
        await writeFailureLog(base44, { failure_type: 'restaurant_closed', severity: 'info', restaurant_id: orderData.restaurant_id, user_email: userLabel, error_message: msg, context: { trace_id: traceId, http_status: 400 } });
        const c = await compensate('restaurant_validation', 'RESTAURANT_CLOSED', msg);
        return Response.json({ error: 'Restaurant is currently closed', success: false, code: 'RESTAURANT_CLOSED', stage: 'restaurant_validation', ...c }, { status: 400 });
    }

    // ── STAGE: Hours / ordering validation ────────────────────────────────────
    console.log(`${LOG} [trace=${traceId}] stage=hours_validation`);
    if (!orderData.is_scheduled) {
        try {
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

            if (todayHours?.closed) {
                const msg = `Restaurant closed today (day=${dayName})`;
                await writeFailureLog(base44, { failure_type: 'hours_check', severity: 'info', restaurant_id: orderData.restaurant_id, user_email: userLabel, error_message: msg, context: { trace_id: traceId, day: dayName, http_status: 400 } });
                const c = await compensate('hours_validation', 'RESTAURANT_CLOSED_TODAY', msg);
                return Response.json({ error: 'Restaurant is not accepting orders today', success: false, code: 'RESTAURANT_CLOSED_TODAY', stage: 'hours_validation', ...c }, { status: 400 });
            }
            if (todayHours?.open && todayHours?.close) {
                const [openH, openM] = todayHours.open.split(':').map(Number);
                const [closeH, closeM] = todayHours.close.split(':').map(Number);
                const openMinutes = openH * 60 + openM;
                const closeMinutes = closeH * 60 + closeM;
                if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
                    const msg = `Restaurant currently closed. Hours: ${todayHours.open}-${todayHours.close} currentMinutes=${currentMinutes}`;
                    await writeFailureLog(base44, { failure_type: 'hours_check', severity: 'info', restaurant_id: orderData.restaurant_id, user_email: userLabel, error_message: msg, context: { trace_id: traceId, hours: `${todayHours.open}-${todayHours.close}`, http_status: 400 } });
                    const c = await compensate('hours_validation', 'OUTSIDE_OPENING_HOURS', msg);
                    return Response.json({ error: `Restaurant is currently closed. Hours: ${todayHours.open} - ${todayHours.close}`, success: false, code: 'OUTSIDE_OPENING_HOURS', stage: 'hours_validation', ...c }, { status: 400 });
                }
            }
        } catch (hoursErr) {
            // Hours check exception — log but don't block (better to let the order through than deadlock on hours parse)
            console.warn(`${LOG} [trace=${traceId}] hours check exception (non-fatal):`, hoursErr.message);
        }
    }

    // ── STAGE: Delivery / collection validation ───────────────────────────────
    console.log(`${LOG} [trace=${traceId}] stage=delivery_validation`);
    if (orderData.order_type === 'delivery' && orderData.delivery_coordinates) {
        try {
            const { lat, lng } = orderData.delivery_coordinates;
            const zones = await base44.asServiceRole.entities.DeliveryZone.filter({ restaurant_id: orderData.restaurant_id, is_active: true });
            let zoneFound = false;
            if (zones?.length > 0) {
                for (const zone of zones) {
                    if (zone.coordinates?.length >= 3 && pointInPolygon([lng, lat], zone.coordinates.map(c => [c.lng, c.lat]))) {
                        zoneFound = true; break;
                    }
                }
            }
            if (!zoneFound) {
                const msg = `Delivery coordinates outside all active zones lat=${lat} lng=${lng}`;
                await writeFailureLog(base44, { failure_type: 'delivery_zone', severity: 'info', restaurant_id: orderData.restaurant_id, user_email: userLabel, error_message: msg, context: { trace_id: traceId, coordinates: { lat, lng }, http_status: 400 } });
                const c = await compensate('delivery_validation', 'OUTSIDE_DELIVERY_ZONE', msg);
                return Response.json({ error: 'Delivery not available to selected location', success: false, code: 'OUTSIDE_DELIVERY_ZONE', stage: 'delivery_validation', ...c }, { status: 400 });
            }
        } catch (zoneErr) {
            // Zone check exception — non-fatal, let order through
            console.warn(`${LOG} [trace=${traceId}] zone check exception (non-fatal):`, zoneErr.message);
        }
    }

    // ── STAGE: Minimum order (pre-check using client prices — authoritative re-check done after price correction) ──
    // This is an early rejection for obviously-below-minimum carts. The authoritative check
    // runs again below after server-side price correction using serverSubtotal.

    // ── STAGE: Item / modifier validation ─────────────────────────────────────
    console.log(`${LOG} [trace=${traceId}] stage=item_validation`);
    if (!orderData.items?.length) {
        const msg = 'Order contains no items';
        await writeFailureLog(base44, { failure_type: 'cart_validation', severity: 'warning', restaurant_id: orderData.restaurant_id, user_email: userLabel, error_message: msg, context: { trace_id: traceId, http_status: 400 } });
        const c = await compensate('item_validation', 'EMPTY_CART', msg);
        return Response.json({ error: msg, success: false, code: 'EMPTY_CART', stage: 'item_validation', ...c }, { status: 400 });
    }

    // Fetch menu items for all non-deal items — paginated, all errors explicit
    const cartItemIds = orderData.items
        .filter(i => !String(i.menu_item_id || '').startsWith('deal_'))
        .map(i => i.menu_item_id)
        .filter(Boolean);

    const menuItemsMap = new Map();
    if (cartItemIds.length > 0) {
        const uniqueIds = [...new Set(cartItemIds)];
        const PAGE_SIZE = 50;
        let skip = 0;
        let hasMore = true;
        console.log(`${LOG} [trace=${traceId}] fetching ${uniqueIds.length} unique menu items`);

        while (hasMore && menuItemsMap.size < uniqueIds.length) {
            let batch;
            try {
                batch = await base44.asServiceRole.entities.MenuItem.filter(
                    { restaurant_id: orderData.restaurant_id }, null, PAGE_SIZE, skip
                );
            } catch (fetchErr) {
                const msg = `MenuItem.filter failed at skip=${skip}: ${fetchErr.message}`;
                console.error(`${LOG} [trace=${traceId}] ${msg}`);
                await writeFailureLog(base44, { failure_type: 'cart_validation', severity: 'warning', restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId, user_email: userLabel, error_message: msg, context: { trace_id: traceId, http_status: 500 } });
                const c = await compensate('item_validation', 'MENU_FETCH_FAILED', msg);
                return Response.json({ error: 'Menu validation failed. Please refresh and try again.', success: false, code: 'MENU_FETCH_FAILED', stage: 'item_validation', ...c }, { status: 500 });
            }

            if (!Array.isArray(batch) || batch.length === 0) { hasMore = false; break; }
            for (const item of batch) {
                if (item?.id && uniqueIds.includes(item.id)) menuItemsMap.set(item.id, item);
            }
            if (menuItemsMap.size >= uniqueIds.length) break;
            if (batch.length < PAGE_SIZE) { hasMore = false; break; }
            skip += PAGE_SIZE;
        }

        const missing = uniqueIds.filter(id => !menuItemsMap.has(id));
        if (missing.length > 0) {
            const msg = `Cart items not in menu: [${missing.join(', ')}]`;
            console.error(`${LOG} [trace=${traceId}] ${msg}`);
            await writeFailureLog(base44, { failure_type: 'cart_validation', severity: 'info', restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId, user_email: userLabel, error_message: msg, context: { trace_id: traceId, missing_ids: missing, http_status: 400 } });
            const c = await compensate('item_validation', 'ITEM_NOT_FOUND', msg);
            return Response.json({ error: 'Some items are no longer available. Your payment has been refunded.', success: false, code: 'ITEM_NOT_FOUND', stage: 'item_validation', ...c }, { status: 400 });
        }

        console.log(`${LOG} [trace=${traceId}] validated ${menuItemsMap.size} menu items`);
    }

    // Per-item checks: availability, channel, price correction
    for (const cartItem of orderData.items) {
        if (String(cartItem.menu_item_id || '').startsWith('deal_')) continue; // deal items skip DB check

        const menuItem = menuItemsMap.get(cartItem.menu_item_id);
        if (!menuItem) {
            // Shouldn't happen after missing check above, but guard defensively
            const msg = `Menu item not found in map: ${cartItem.menu_item_id}`;
            console.error(`${LOG} [trace=${traceId}] ${msg}`);
            const c = await compensate('item_validation', 'ITEM_NOT_FOUND', msg);
            return Response.json({ error: `${cartItem.name || 'Item'} is no longer available`, success: false, code: 'ITEM_NOT_FOUND', stage: 'item_validation', ...c }, { status: 400 });
        }

        if (menuItem.availability_channel === 'pos_only') {
            const msg = `POS-only item ordered online: ${cartItem.name} (${cartItem.menu_item_id})`;
            await writeFailureLog(base44, { failure_type: 'cart_validation', severity: 'warning', restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId, user_email: userLabel, error_message: msg, context: { trace_id: traceId, menu_item_id: cartItem.menu_item_id, http_status: 400 } });
            const c = await compensate('item_validation', 'ITEM_POS_ONLY', msg);
            return Response.json({ error: `${cartItem.name} is not available for online ordering`, success: false, code: 'ITEM_POS_ONLY', stage: 'item_validation', ...c }, { status: 400 });
        }

        if (menuItem.is_available === false) {
            const msg = `Item marked unavailable: ${cartItem.name} (${cartItem.menu_item_id})`;
            await writeFailureLog(base44, { failure_type: 'cart_validation', severity: 'info', restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId, user_email: userLabel, error_message: msg, context: { trace_id: traceId, menu_item_id: cartItem.menu_item_id, http_status: 400 } });
            const c = await compensate('item_validation', 'ITEM_UNAVAILABLE', msg);
            return Response.json({ error: `${cartItem.name} is no longer available`, success: false, code: 'ITEM_UNAVAILABLE', stage: 'item_validation', ...c }, { status: 400 });
        }

        // Price correction (server-authoritative)
        const submittedPrice = cartItem.price;
        cartItem.price = menuItem.price;
        if (Math.abs(menuItem.price - submittedPrice) > 0.50) {
            console.warn(`${LOG} [trace=${traceId}] price drift ${cartItem.name}: submitted=£${submittedPrice} server=£${menuItem.price}`);
        }
    }

    // Server subtotal from corrected prices
    const serverSubtotal = orderData.items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);

    // ── STAGE: Minimum order (authoritative — uses server-corrected prices) ────
    if (orderData.order_type === 'delivery' && (restaurant.minimum_order || 0) > 0 && serverSubtotal < restaurant.minimum_order) {
        const msg = `Below minimum: subtotal=£${serverSubtotal.toFixed(2)} minimum=£${restaurant.minimum_order.toFixed(2)}`;
        await writeFailureLog(base44, { failure_type: 'minimum_order', severity: 'info', restaurant_id: orderData.restaurant_id, user_email: userLabel, error_message: msg, context: { trace_id: traceId, http_status: 400 } });
        const c = await compensate('delivery_validation', 'BELOW_MINIMUM_ORDER', msg);
        return Response.json({ error: `Minimum order is £${restaurant.minimum_order.toFixed(2)}`, success: false, code: 'BELOW_MINIMUM_ORDER', stage: 'delivery_validation', ...c }, { status: 400 });
    }

    // ── Server delivery fee re-derivation ──────────────────────────────────────
    let deliveryFee = 0;
    if (orderData.order_type === 'collection') {
        deliveryFee = 0;
    } else if (orderData.order_type === 'delivery') {
        try {
            const activeZones = await base44.asServiceRole.entities.DeliveryZone.filter({ restaurant_id: orderData.restaurant_id, is_active: true });
            if (activeZones?.length > 0 && orderData.delivery_coordinates?.lat) {
                const { lat, lng } = orderData.delivery_coordinates;
                for (const zone of activeZones) {
                    if (zone.coordinates?.length >= 3 && pointInPolygon([lng, lat], zone.coordinates.map(c => [c.lng, c.lat]))) {
                        deliveryFee = zone.delivery_fee ?? 0; break;
                    }
                }
            } else {
                deliveryFee = restaurant.delivery_fee ?? 0;
            }
        } catch (feeErr) {
            console.warn(`${LOG} [trace=${traceId}] delivery fee derivation failed (using restaurant default):`, feeErr.message);
            deliveryFee = restaurant.delivery_fee ?? 0;
        }
    }

    // ── STAGE: Coupon validation ───────────────────────────────────────────────
    console.log(`${LOG} [trace=${traceId}] stage=coupon_validation`);
    const normalizedGuestEmail = _normalizeEmail(orderData.guest_email);
    const normalizedPhone = _normalizePhone(orderData.phone);
    let verifiedDiscount = 0;
    const verifiedCouponCodes = [];
    const verifiedCouponIds = [];

    let inputCodes = [];
    if (Array.isArray(orderData.coupon_codes)) {
        inputCodes = orderData.coupon_codes.map(c => String(c).trim().toUpperCase()).filter(Boolean);
    } else if (orderData.coupon_codes) {
        inputCodes = String(orderData.coupon_codes).split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
    } else if (orderData.coupon_code) {
        inputCodes = [String(orderData.coupon_code).trim().toUpperCase()];
    }

    if (inputCodes.length > 0) {
        if (inputCodes.length > MAX_COUPONS_PER_ORDER) {
            await writeFailureLog(base44, { failure_type: 'coupon_stacking', severity: 'info', restaurant_id: orderData.restaurant_id, user_email: userLabel, error_message: `Too many coupons: ${inputCodes.length}`, context: { trace_id: traceId, attempted_coupons: inputCodes, http_status: 400 } });
            const c = await compensate('coupon_validation', 'TOO_MANY_COUPONS', 'Exceeded max coupons per order');
            return Response.json({ error: `A maximum of ${MAX_COUPONS_PER_ORDER} coupon codes can be applied per order.`, success: false, code: 'TOO_MANY_COUPONS', stage: 'coupon_validation', ...c }, { status: 400 });
        }

        const uniqueCodes = new Set(inputCodes);
        if (uniqueCodes.size !== inputCodes.length) {
            await writeFailureLog(base44, { failure_type: 'coupon_validation', severity: 'info', restaurant_id: orderData.restaurant_id, user_email: userLabel, error_message: 'Duplicate coupon codes', context: { trace_id: traceId, attempted_coupons: inputCodes, http_status: 400 } });
            const c = await compensate('coupon_validation', 'DUPLICATE_COUPON_CODES', 'Duplicate coupon codes');
            return Response.json({ error: 'Duplicate coupon codes are not allowed.', success: false, code: 'DUPLICATE_COUPON_CODES', stage: 'coupon_validation', ...c }, { status: 400 });
        }

        const now = new Date();
        const validatedCoupons = [];

        for (const code of inputCodes) {
            let coupons;
            try {
                coupons = await base44.asServiceRole.entities.Coupon.filter({ code });
            } catch (couponFetchErr) {
                const msg = `Coupon fetch failed for code=${code}: ${couponFetchErr.message}`;
                console.error(`${LOG} [trace=${traceId}] ${msg}`);
                await writeFailureLog(base44, { failure_type: 'coupon_validation', severity: 'warning', restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId, user_email: userLabel, error_message: msg, context: { trace_id: traceId, http_status: 500 } });
                const c = await compensate('coupon_validation', 'COUPON_FETCH_FAILED', msg);
                return Response.json({ error: 'Coupon validation failed. Please try again.', success: false, code: 'COUPON_FETCH_FAILED', stage: 'coupon_validation', ...c }, { status: 500 });
            }

            if (!coupons?.length) {
                await writeFailureLog(base44, { failure_type: 'coupon_validation', severity: 'info', restaurant_id: orderData.restaurant_id, user_email: userLabel, error_message: `Coupon not found: ${code}`, context: { trace_id: traceId, attempted_coupons: [code], http_status: 400 } });
                const c = await compensate('coupon_validation', 'COUPON_NOT_FOUND', `Coupon not found: ${code}`);
                return Response.json({ error: `Coupon code "${code}" is not recognised. Please remove it and try again.`, success: false, code: 'COUPON_NOT_FOUND', stage: 'coupon_validation', ...c }, { status: 400 });
            }

            const coupon = coupons[0];
            const singleResult = validateSingleCoupon(coupon, code, now, serverSubtotal, deliveryFee, orderData.restaurant_id);
            if (!singleResult.valid) {
                await writeFailureLog(base44, { failure_type: 'coupon_validation', severity: 'info', restaurant_id: orderData.restaurant_id, user_email: userLabel, error_message: singleResult.error, context: { trace_id: traceId, attempted_coupons: [code], http_status: 400 } });
                const c = await compensate('coupon_validation', 'COUPON_INVALID', singleResult.error);
                return Response.json({ error: singleResult.error, success: false, code: 'COUPON_INVALID', stage: 'coupon_validation', ...c }, { status: 400 });
            }

            let limitError;
            try {
                limitError = await checkPerCustomerLimit(base44, coupon, user, normalizedGuestEmail, normalizedPhone);
            } catch (limitErr) {
                console.warn(`${LOG} [trace=${traceId}] per-customer limit check failed (non-fatal):`, limitErr.message);
                limitError = null;
            }
            if (limitError) {
                await writeFailureLog(base44, { failure_type: 'coupon_per_customer_limit', severity: 'info', restaurant_id: orderData.restaurant_id, user_email: userLabel, guest_email: normalizedGuestEmail, phone: normalizedPhone, error_message: limitError, context: { trace_id: traceId, attempted_coupons: [code], http_status: 400 } });
                const c = await compensate('coupon_validation', 'COUPON_LIMIT_EXCEEDED', limitError);
                return Response.json({ error: limitError, success: false, code: 'COUPON_LIMIT_EXCEEDED', stage: 'coupon_validation', ...c }, { status: 400 });
            }
            validatedCoupons.push({ coupon, rawDiscount: singleResult.discount });
        }

        if (validatedCoupons.length > 1) {
            const nonStackable = validatedCoupons.filter(vc => !vc.coupon.stackable);
            if (nonStackable.length > 0) {
                const codes = nonStackable.map(vc => vc.coupon.code).join(', ');
                const msg = `Non-stackable coupons combined: ${codes}`;
                await writeFailureLog(base44, { failure_type: 'coupon_stacking', severity: 'info', restaurant_id: orderData.restaurant_id, user_email: userLabel, error_message: msg, context: { trace_id: traceId, attempted_coupons: validatedCoupons.map(vc => vc.coupon.code), http_status: 400 } });
                const c = await compensate('coupon_validation', 'NON_STACKABLE_COUPONS', msg);
                return Response.json({ error: `The following coupon(s) cannot be combined: ${codes}`, success: false, code: 'NON_STACKABLE_COUPONS', stage: 'coupon_validation', ...c }, { status: 400 });
            }
        }

        // Apply coupons with 50% subtotal cap
        const maxCouponDiscount = serverSubtotal * MAX_COUPON_DISCOUNT_RATIO;
        let accumulatedDiscount = 0;
        const sorted = [
            ...validatedCoupons.filter(vc => vc.coupon.discount_type === 'percentage').sort((a, b) => a.coupon.code.localeCompare(b.coupon.code)),
            ...validatedCoupons.filter(vc => vc.coupon.discount_type !== 'percentage').sort((a, b) => a.coupon.code.localeCompare(b.coupon.code)),
        ];
        for (const vc of sorted) {
            const contribution = Math.min(vc.rawDiscount, maxCouponDiscount - accumulatedDiscount);
            accumulatedDiscount += contribution;
            verifiedCouponCodes.push(vc.coupon.code);
            verifiedCouponIds.push(vc.coupon.id);
            console.log(`${LOG} [trace=${traceId}] coupon="${vc.coupon.code}" contribution=£${contribution.toFixed(2)} running=£${accumulatedDiscount.toFixed(2)}`);
        }
        verifiedDiscount = accumulatedDiscount;

    } else if (orderData.applied_promotion_id) {
        // ── STAGE: Promotion validation ───────────────────────────────────────
        console.log(`${LOG} [trace=${traceId}] stage=promotion_validation`);
        try {
            const promRes = await base44.functions.invoke('validateAndApplyPromotion', {
                promotion_id: orderData.applied_promotion_id,
                restaurant_id: orderData.restaurant_id,
                server_subtotal: serverSubtotal,
                delivery_fee: deliveryFee
            });
            if (promRes?.data?.valid && typeof promRes.data.discount === 'number') {
                verifiedDiscount = promRes.data.discount;
                console.log(`${LOG} [trace=${traceId}] promotion validated discount=£${verifiedDiscount.toFixed(2)}`);
            } else {
                const promError = promRes?.data?.error || 'Promotion validation failed';
                await writeFailureLog(base44, { failure_type: 'promotion_validation', severity: 'warning', restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId, user_email: userLabel, error_message: promError, context: { trace_id: traceId, promotion_id: orderData.applied_promotion_id, http_status: 400 } });
                const c = await compensate('promotion_validation', 'PROMOTION_INVALID', promError);
                return Response.json({ error: `Promotion: ${promError}`, success: false, code: 'PROMOTION_INVALID', stage: 'promotion_validation', ...c }, { status: 400 });
            }
        } catch (promErr) {
            const msg = `Promotion validation exception: ${promErr.message}`;
            await writeFailureLog(base44, { failure_type: 'promotion_validation', severity: 'warning', restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId, user_email: userLabel, error_message: msg, context: { trace_id: traceId, http_status: 500 } });
            const c = await compensate('promotion_validation', 'PROMOTION_FETCH_FAILED', msg);
            return Response.json({ error: 'Promotion validation failed. Please try again.', success: false, code: 'PROMOTION_FETCH_FAILED', stage: 'promotion_validation', ...c }, { status: 500 });
        }
    }

    // ── Total integrity check ─────────────────────────────────────────────────
    // Include small_order_surcharge (client-computed, trusted for now) and any
    // promotion discount that wasn't server-re-validated (promotions path above
    // sets verifiedDiscount; coupon path does NOT include promotion discounts).
    // We only re-check the coupon discount server-side; promotion discounts are
    // validated separately by validateAndApplyPromotion when applied.
    const clientPromotionDiscount = (orderData.discount || 0) - verifiedDiscount > 0
        ? (orderData.discount || 0) - verifiedDiscount
        : 0;
    const smallOrderSurcharge = typeof orderData.small_order_surcharge === 'number' ? orderData.small_order_surcharge : 0;
    const serverTotal = Math.max(0, serverSubtotal + deliveryFee + smallOrderSurcharge - verifiedDiscount - clientPromotionDiscount);
    if (Math.abs(serverTotal - orderData.total) > 0.02) {
        const mismatchMsg = `Total mismatch: server=£${serverTotal.toFixed(2)} client=£${orderData.total} (subtotal=${serverSubtotal.toFixed(2)} fee=${deliveryFee.toFixed(2)} discount=${verifiedDiscount.toFixed(2)})`;
        console.error(`${LOG} [trace=${traceId}] [SECURITY] ${mismatchMsg}`);
        await writeFailureLog(base44, {
            failure_type: 'total_mismatch', severity: 'critical',
            restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId, user_email: userLabel,
            error_message: mismatchMsg,
            context: { trace_id: traceId, server_total: serverTotal, client_total: orderData.total, difference: Math.abs(serverTotal - orderData.total), http_status: 400 }
        });
        const c = await compensate('total_integrity', 'TOTAL_MISMATCH', mismatchMsg);
        return Response.json({ error: 'Order total does not match current menu prices. Please refresh and try again.', success: false, code: 'TOTAL_MISMATCH', stage: 'total_integrity', ...c }, { status: 400 });
    }

    orderData.total = serverTotal;
    orderData.subtotal = serverSubtotal;

    // ── STAGE: Order persistence ───────────────────────────────────────────────
    console.log(`${LOG} [trace=${traceId}] stage=order_persistence total=£${serverTotal.toFixed(2)} coupons=[${verifiedCouponCodes.join(',')}]`);
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
        const msg = `Order.create exception: ${orderCreateErr.message}`;
        console.error(`${LOG} [trace=${traceId}] CRITICAL: ${msg}`);
        await writeFailureLog(base44, {
            failure_type: 'order_create', severity: 'critical',
            restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId,
            user_email: userLabel, guest_email: orderData.guest_email, phone: orderData.phone,
            error_message: msg, stack_trace: orderCreateErr.stack?.slice(0, 500) || null,
            context: { trace_id: traceId, items_count: (orderData.items || []).length, order_total: serverTotal, http_status: 500 },
            alert_triggered: true, alert_condition: 'payment_success_order_failed'
        });
        const c = await compensate('order_persistence', 'ORDER_CREATE_EXCEPTION', msg);
        return Response.json({ error: 'Failed to create order. Your payment has been refunded automatically.', success: false, code: 'ORDER_CREATE_EXCEPTION', stage: 'order_persistence', ...c }, { status: 500 });
    }

    if (!newOrder?.id) {
        const msg = 'Order.create returned no ID';
        console.error(`${LOG} [trace=${traceId}] CRITICAL: ${msg}`);
        await writeFailureLog(base44, {
            failure_type: 'order_create', severity: 'critical',
            restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId,
            user_email: userLabel, guest_email: orderData.guest_email, phone: orderData.phone,
            error_message: msg,
            context: { trace_id: traceId, items_count: (orderData.items || []).length, order_total: serverTotal, http_status: 500 },
            alert_triggered: true, alert_condition: 'payment_success_order_failed'
        });
        const c = await compensate('order_persistence', 'ORDER_NO_ID', msg);
        return Response.json({ error: 'Failed to create order. Your payment has been refunded automatically.', success: false, code: 'ORDER_NO_ID', stage: 'order_persistence', ...c }, { status: 500 });
    }

    console.log(`${LOG} [trace=${traceId}] order created id=${newOrder.id} num=${newOrder.order_number}`);

    // ── STAGE: Payment ledger update ───────────────────────────────────────────
    console.log(`${LOG} [trace=${traceId}] stage=payment_ledger_update`);
    if (paymentIntentId) {
        try {
            const pts = await base44.asServiceRole.entities.PaymentTransaction.filter({ payment_intent_id: paymentIntentId });
            const ptId = pts?.[0]?.id;
            if (ptId) {
                await base44.asServiceRole.entities.PaymentTransaction.update(ptId, {
                    status: 'order_created',
                    order_id: newOrder.id,
                    order_number: newOrder.order_number || null,
                    order_created_at: new Date().toISOString(),
                });
                console.log(`${LOG} [trace=${traceId}] PT updated to order_created ptId=${ptId}`);
            } else {
                console.warn(`${LOG} [trace=${traceId}] PT not found for intent=${paymentIntentId} — order created but PT unlinked`);
            }
        } catch (ptUpdateErr) {
            // Non-fatal: order is created. Log warning, don't roll back.
            console.error(`${LOG} [trace=${traceId}] PT update failed (non-fatal order created):`, ptUpdateErr.message);
            await writeFailureLog(base44, {
                failure_type: 'payment_transaction_update', severity: 'warning',
                restaurant_id: orderData.restaurant_id, payment_intent_id: paymentIntentId, user_email: userLabel,
                error_message: `PT status update failed, order created: ${ptUpdateErr.message}`,
                context: { trace_id: traceId, order_id: newOrder.id, http_status: 500 }
            });
        }
    }

    // ── STAGE: Post-create hooks (coupon usage_count) ──────────────────────────
    console.log(`${LOG} [trace=${traceId}] stage=post_create_hooks coupons=${verifiedCouponIds.length}`);
    if (verifiedCouponIds.length > 0) {
        await Promise.all(verifiedCouponIds.map(async (couponId) => {
            try {
                const fresh = await base44.asServiceRole.entities.Coupon.filter({ id: couponId });
                const freshCount = fresh?.[0]?.usage_count || 0;
                await base44.asServiceRole.entities.Coupon.update(couponId, { usage_count: freshCount + 1 });
            } catch (e) {
                console.warn(`${LOG} [trace=${traceId}] coupon usage_count increment failed id=${couponId}:`, e.message);
            }
        }));
    }

    // ── SUCCESS ────────────────────────────────────────────────────────────────
    console.log(`${LOG} [trace=${traceId}] [SUCCESS] order=${newOrder.id} num=${newOrder.order_number} restaurant=${orderData.restaurant_id} total=£${serverTotal.toFixed(2)} method=${orderData.payment_method} type=${orderData.order_type}`);

    return Response.json(
        { success: true, order_id: newOrder.id, order_number: newOrder.order_number },
        { status: 201 }
    );
});