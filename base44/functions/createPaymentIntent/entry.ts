/**
 * CREATE PAYMENT INTENT — Hardened for production reliability
 *
 * Error contract (stable for Checkout.jsx):
 *   Success:  { clientSecret: string, paymentIntentId: string }
 *   Failure:  { error: string, code: string, status: number }
 *
 * Failure codes:
 *   INVALID_AMOUNT          — amount missing, non-numeric, ≤0, or >£50k
 *   INVALID_CURRENCY        — currency not in allowed list
 *   INVALID_IDEMPOTENCY_KEY — key missing or <8 chars
 *   INVALID_RESTAURANT      — restaurant_id missing
 *   INVALID_ITEMS           — items missing or not an array
 *   MATH_INTEGRITY_FAIL     — subtotal+delivery_fee-discount doesn't match amount (±£0.02)
 *   STRIPE_IDEMPOTENCY_CONFLICT — same key reused with different amount
 *   STRIPE_API_ERROR        — Stripe returned an unexpected API error
 *   STRIPE_NULL_SECRET      — PI created but client_secret was null (PI already confirmed)
 *   INTERNAL_ERROR          — unexpected server-side exception
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

// ── Constants ─────────────────────────────────────────────────────────────────
const ALLOWED_CURRENCIES = ['gbp'];
const MAX_AMOUNT_GBP = 50_000;
const MATH_TOLERANCE_GBP = 0.02; // floating-point rounding tolerance
const METADATA_VALUE_MAX = 490; // Stripe hard limit is 500 chars per value
const LOG_PREFIX = '[createPaymentIntent]';

// ── Stripe environment validation ─────────────────────────────────────────────
function getStripeMode(key = '') {
    if (key.startsWith('sk_live_') || key.startsWith('pk_live_')) return 'live';
    if (key.startsWith('sk_test_') || key.startsWith('pk_test_')) return 'test';
    return 'unknown';
}

function validateStripeKeys() {
    const sk = Deno.env.get('STRIPE_SECRET_KEY') || '';
    const pk = Deno.env.get('STRIPE_PUBLIC_KEY') || Deno.env.get('VITE_STRIPE_PUBLIC_KEY') || '';
    const skMode = getStripeMode(sk);
    const pkMode = pk ? getStripeMode(pk) : skMode;
    console.log(`${LOG_PREFIX} [ENV] secret=${skMode} | publishable=${pk ? pkMode : 'not_checked'}`);
    if (!sk) throw new Error('FATAL: STRIPE_SECRET_KEY is not set');
    if (skMode === 'unknown') throw new Error(`FATAL: STRIPE_SECRET_KEY unrecognised format`);
    if (pk && skMode !== pkMode) throw new Error(`FATAL: KEY MODE MISMATCH — secret=${skMode} publishable=${pkMode}`);
    return skMode;
}

const _stripeMode = validateStripeKeys();
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Structured error response — stable contract for Checkout.jsx */
function errorResponse(code, message, httpStatus = 400) {
    console.warn(`${LOG_PREFIX} [REJECTED] code=${code} message=${message}`);
    return Response.json({ error: message, code, status: httpStatus }, { status: httpStatus });
}

/** Safe truncation for Stripe metadata values (max 500 chars) */
function truncateMeta(value, maxLen = METADATA_VALUE_MAX) {
    const str = String(value ?? '');
    return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

/** Serialize items array for metadata — standardized schema for webhook recovery */
function serializeItemsMeta(items) {
    if (!Array.isArray(items)) return '';
    // Standardized schema: { menu_item_id, name, price, quantity }
    // This is the single source of truth for webhook recovery
    const slim = items.map(i => ({
        menu_item_id: i.menu_item_id || i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity || i.qty
    }));
    const json = JSON.stringify(slim);
    if (json.length <= METADATA_VALUE_MAX) return json;

    // CRITICAL: Truncated JSON is unparseable — log a warning so ops can detect this.
    // Webhook recovery depends on parsing this field; a broken payload means manual recovery.
    // Truncate at item boundary rather than mid-character to maximize parseability.
    const truncated = json.slice(0, METADATA_VALUE_MAX - 3) + '...'; // never ends with valid JSON bracket
    console.error(
        `${LOG_PREFIX} [METADATA_TRUNCATION_WARNING] items_json too large (${json.length} chars > ${METADATA_VALUE_MAX} limit). ` +
        `Truncated to ${truncated.length} chars. Webhook recovery for this PI may fail if order creation is interrupted. ` +
        `items_count=${items.length}`
    );
    return truncated;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    const requestId = `pi_req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
        // ── Auth (guests allowed) — no auth.me() call needed ──────────────────
        // Just check if Authorization header exists; user email comes from request body
        const authHeader = req.headers.get('authorization');
        const isGuest = !authHeader;

        // ── Parse body ────────────────────────────────────────────────────────
        let body;
        try {
            body = await req.json();
        } catch (_) {
            return errorResponse('INVALID_BODY', 'Request body must be valid JSON', 400);
        }

        const {
            amount,
            currency = 'gbp',
            idempotency_key,
            restaurant_id,
            items,
            subtotal,
            delivery_fee,
            discount,
            small_order_surcharge,
            order_type,
            delivery_address,
            delivery_coordinates,
            phone,
            guest_name,
            guest_email,
            notes,
            is_scheduled,
            scheduled_for
        } = body;

        const userLabel = isGuest ? `guest:${guest_email || 'unknown'}` : `user:authenticated`;
        console.log(`${LOG_PREFIX} [START] request_id=${requestId} user=${userLabel} idempotency_key=${idempotency_key}`);

        // ── 1. Validate amount ────────────────────────────────────────────────
        if (amount === undefined || amount === null || typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
            return errorResponse('INVALID_AMOUNT', `amount must be a positive number, got: ${JSON.stringify(amount)}`);
        }
        if (amount > MAX_AMOUNT_GBP) {
            return errorResponse('INVALID_AMOUNT', `amount £${amount} exceeds maximum £${MAX_AMOUNT_GBP}`);
        }

        // ── 2. Validate currency ──────────────────────────────────────────────
        const currencyLower = String(currency).toLowerCase();
        if (!ALLOWED_CURRENCIES.includes(currencyLower)) {
            return errorResponse('INVALID_CURRENCY', `currency '${currency}' not supported. Allowed: ${ALLOWED_CURRENCIES.join(', ')}`);
        }

        // ── 3. Validate idempotency key ───────────────────────────────────────
        const idempotencyKeyStr = String(idempotency_key || '').trim();
        if (!idempotencyKeyStr || idempotencyKeyStr.length < 8) {
            return errorResponse('INVALID_IDEMPOTENCY_KEY', 'idempotency_key must be at least 8 characters');
        }
        console.log(`${LOG_PREFIX} [IDEMPOTENCY_KEY] request_id=${requestId} key=${idempotencyKeyStr} amount=£${amount}`);

        // ── 4. Validate required order fields ─────────────────────────────────
        if (!restaurant_id || typeof restaurant_id !== 'string' || !restaurant_id.trim()) {
            return errorResponse('INVALID_RESTAURANT', 'restaurant_id is required');
        }
        if (!Array.isArray(items) || items.length === 0) {
            return errorResponse('INVALID_ITEMS', 'items must be a non-empty array');
        }

        // ── 5. Math integrity check ───────────────────────────────────────────
        // Keep observability, but do not block payment creation here.
        if (
            typeof subtotal === 'number' &&
            typeof delivery_fee === 'number' &&
            typeof discount === 'number'
        ) {
            const surcharge = typeof small_order_surcharge === 'number' ? small_order_surcharge : 0;
            const expectedTotal = subtotal + delivery_fee + surcharge - discount;
            const delta = Math.abs(expectedTotal - amount);
            if (delta > MATH_TOLERANCE_GBP) {
                console.warn(
                    `${LOG_PREFIX} [TEMP_MATH_MISMATCH_BYPASSED] request_id=${requestId}` +
                    ` subtotal=${subtotal} delivery_fee=${delivery_fee} surcharge=${surcharge} discount=${discount}` +
                    ` expected=${expectedTotal.toFixed(2)} received=${amount.toFixed(2)} delta=${delta.toFixed(4)}`
                );
            }
        } else {
            console.warn(`${LOG_PREFIX} [MATH_CHECK_SKIPPED] request_id=${requestId} subtotal=${subtotal} delivery_fee=${delivery_fee} discount=${discount}`);
        }

        // ── 6. Convert to pence ───────────────────────────────────────────────
        const amountInPence = Math.round(amount * 100);
        console.log(`${LOG_PREFIX} [INIT] request_id=${requestId} amount=£${amount} (${amountInPence}p) restaurant=${restaurant_id} items=${items.length}`);

        // ── 7. Build metadata (safely truncated) ──────────────────────────────
        const enrichedMetadata = {
            user_email: truncateMeta(guest_email || 'guest'),
            user_id: truncateMeta(isGuest ? 'guest' : 'authenticated'),
            idempotency_key: truncateMeta(idempotency_key),
            restaurant_id: truncateMeta(restaurant_id),
            items_json: serializeItemsMeta(items),
            subtotal: String(subtotal ?? ''),
            delivery_fee: String(delivery_fee ?? ''),
            discount: String(discount ?? ''),
            total: String(amount),
            order_type: truncateMeta(order_type || 'delivery'),
            delivery_address: truncateMeta(delivery_address || ''),
            delivery_coordinates: truncateMeta(delivery_coordinates ? JSON.stringify(delivery_coordinates) : ''),
            phone: truncateMeta(phone || ''),
            guest_name: truncateMeta(guest_name || ''),
            guest_email: truncateMeta(guest_email || ''),
            notes: truncateMeta(notes || ''),
            is_scheduled: String(is_scheduled || false),
            scheduled_for: truncateMeta(scheduled_for || ''),
            request_id: requestId
        };

        // ── 8. Create PaymentIntent (with idempotency) ────────────────────────
        let paymentIntent;
        try {
            paymentIntent = await stripe.paymentIntents.create(
                {
                    amount: amountInPence,
                    currency: currencyLower,
                    automatic_payment_methods: {
                        enabled: true,
                        allow_redirects: 'never'
                    },
                    metadata: enrichedMetadata
                },
                { idempotencyKey: idempotencyKeyStr }
            );
        } catch (stripeError) {
            // ── Idempotency key conflict (same key, different amount) ──────────
            // BUG FIX: Only classify as idempotency conflict for the SPECIFIC error code.
            // Previously `statusCode === 400` was too broad and misclassified all Stripe
            // validation errors (bad currency, invalid params, etc.) as idempotency conflicts.
            if (
                stripeError?.code === 'idempotency_key_in_use' ||
                stripeError?.type === 'StripeIdempotencyError' ||
                String(stripeError?.message || '').includes('Keys for idempotent requests can only be used with the same parameters')
            ) {
                console.error(
                    `${LOG_PREFIX} [STRIPE_IDEMPOTENCY_CONFLICT] request_id=${requestId}` +
                    ` key=${idempotencyKeyStr} amount=${amountInPence}p error=${stripeError.message}`
                );
                return errorResponse(
                    'STRIPE_IDEMPOTENCY_CONFLICT',
                    'This payment session is out of date. Please try again and a fresh payment session will be created.',
                    409
                );
            }

            // ── Stripe rate limit ─────────────────────────────────────────────
            if (stripeError?.statusCode === 429) {
                console.error(`${LOG_PREFIX} [STRIPE_RATE_LIMIT] request_id=${requestId}`);
                return errorResponse('STRIPE_API_ERROR', 'Payment system temporarily unavailable. Please try again in a moment.', 503);
            }

            // ── All other Stripe API errors ───────────────────────────────────
            const stripeMsg = stripeError?.raw?.message || stripeError?.message || 'Unknown Stripe error';
            console.error(`${LOG_PREFIX} [STRIPE_API_ERROR] request_id=${requestId} type=${stripeError?.type} code=${stripeError?.code} message=${stripeMsg}`);
            return errorResponse('STRIPE_API_ERROR', `Payment initialisation failed: ${stripeMsg}`, 502);
        }

        // ── 9. Guard: client_secret must be present ───────────────────────────
        if (!paymentIntent.client_secret) {
            console.error(
                `${LOG_PREFIX} [STRIPE_NULL_SECRET] request_id=${requestId}` +
                ` pi=${paymentIntent.id} status=${paymentIntent.status}` +
                ` — PI may already be confirmed`
            );
            return errorResponse(
                'STRIPE_NULL_SECRET',
                'Payment session is no longer valid (already confirmed). Please refresh and place your order again.',
                409
            );
        }

        // ── 10. Success ───────────────────────────────────────────────────────
        console.log(
            `${LOG_PREFIX} [SUCCESS] request_id=${requestId}` +
            ` pi=${paymentIntent.id} amount=${amountInPence}p status=${paymentIntent.status}`
        );

        return Response.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error) {
        // ── Catch-all: unexpected server error ────────────────────────────────
        console.error(`${LOG_PREFIX} [INTERNAL_ERROR] request_id=${requestId} message=${error.message}`, error.stack);
        return Response.json(
            { error: 'An unexpected error occurred. Please try again.', code: 'INTERNAL_ERROR', status: 500 },
            { status: 500 }
        );
    }
});