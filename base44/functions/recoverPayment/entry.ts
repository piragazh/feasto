/**
 * RECOVER PAYMENT — Safe post-payment interruption recovery
 * ==========================================================
 *
 * Called on checkout reload when a successful PI is detected in sessionStorage
 * but no order confirmation was received by the browser.
 *
 * Safety guarantees:
 *   1. Queries Order by payment_intent_id — if found, returns it (idempotent)
 *   2. Queries PaymentTransaction — checks status before any action
 *   3. If order does not exist and PT is 'authorized', replays verifyAndCreateOrder
 *      using the ORIGINAL idempotency_key (dedup key prevents duplicate order)
 *   4. If PT is 'refunded' or 'needs_review', reports terminal state — no action
 *   5. If PI is not 'succeeded' on Stripe, reports payment_not_succeeded — no action
 *
 * Never charges the card again. Never issues a duplicate refund.
 *
 * Error contract:
 *   { status: 'order_found' | 'order_created' | 'already_refunded' | 'needs_review' |
 *             'payment_not_succeeded' | 'no_pending_payment' | 'recovery_failed',
 *     order_id?: string, order_number?: string, error?: string }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

const LOG = '[recoverPayment]';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    const traceId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    console.log(`${LOG} [START] trace=${traceId}`);

    let body;
    try {
        body = await req.json();
    } catch (_) {
        return Response.json({ status: 'recovery_failed', error: 'Invalid request body' }, { status: 400 });
    }

    const { paymentIntentId, idempotencyKey, orderData } = body;

    if (!paymentIntentId || typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
        console.warn(`${LOG} [trace=${traceId}] invalid paymentIntentId: ${paymentIntentId}`);
        return Response.json({ status: 'no_pending_payment', error: 'No valid payment intent provided' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { /* guest */ }

    console.log(`${LOG} [trace=${traceId}] pi=${paymentIntentId} key=${idempotencyKey || 'none'} user=${user?.email || 'guest'}`);

    // ── Step 1: Check if order already exists for this PI ─────────────────────
    try {
        const existingOrders = await base44.asServiceRole.entities.Order.filter({ payment_intent_id: paymentIntentId });
        if (existingOrders?.length > 0) {
            const order = existingOrders[0];
            console.log(`${LOG} [trace=${traceId}] order already exists id=${order.id} — returning`);
            return Response.json({
                status: 'order_found',
                order_id: order.id,
                order_number: order.order_number,
            });
        }
    } catch (e) {
        console.error(`${LOG} [trace=${traceId}] order lookup failed:`, e.message);
        // Fall through to PT check
    }

    // ── Step 2: Check idempotency_key dedup ───────────────────────────────────
    if (idempotencyKey) {
        try {
            const keyOrders = await base44.asServiceRole.entities.Order.filter({ idempotency_key: idempotencyKey });
            if (keyOrders?.length > 0) {
                const order = keyOrders[0];
                console.log(`${LOG} [trace=${traceId}] order found by idempotency_key=${idempotencyKey} id=${order.id}`);
                return Response.json({
                    status: 'order_found',
                    order_id: order.id,
                    order_number: order.order_number,
                });
            }
        } catch (e) {
            console.warn(`${LOG} [trace=${traceId}] idempotency_key lookup failed (non-fatal):`, e.message);
        }
    }

    // ── Step 3: Check PaymentTransaction status ───────────────────────────────
    try {
        const pts = await base44.asServiceRole.entities.PaymentTransaction.filter({ payment_intent_id: paymentIntentId });
        if (pts?.length > 0) {
            const pt = pts[0];
            console.log(`${LOG} [trace=${traceId}] PT found status=${pt.status}`);

            if (pt.status === 'order_created' && pt.order_id) {
                // Race: PT updated but order lookup above missed it — return via PT
                console.log(`${LOG} [trace=${traceId}] PT has order_id=${pt.order_id} — returning`);
                return Response.json({ status: 'order_found', order_id: pt.order_id, order_number: pt.order_number });
            }
            if (pt.status === 'refunded') {
                console.log(`${LOG} [trace=${traceId}] PT already refunded`);
                return Response.json({ status: 'already_refunded' });
            }
            if (pt.status === 'needs_review') {
                console.log(`${LOG} [trace=${traceId}] PT needs_review`);
                return Response.json({ status: 'needs_review' });
            }
            // status=authorized: PI confirmed, order not yet created — proceed to Step 4
        }
    } catch (e) {
        console.warn(`${LOG} [trace=${traceId}] PT lookup failed (non-fatal):`, e.message);
    }

    // ── Step 4: Verify PI directly with Stripe ────────────────────────────────
    let paymentIntent;
    try {
        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        console.log(`${LOG} [trace=${traceId}] Stripe PI status=${paymentIntent.status} amount=${paymentIntent.amount}p`);
    } catch (stripeErr) {
        console.error(`${LOG} [trace=${traceId}] Stripe retrieve failed:`, stripeErr.message);
        return Response.json({ status: 'recovery_failed', error: 'Could not verify payment with Stripe. Please contact support.' }, { status: 502 });
    }

    if (paymentIntent.status !== 'succeeded') {
        console.log(`${LOG} [trace=${traceId}] PI not succeeded status=${paymentIntent.status} — no recovery needed`);
        return Response.json({ status: 'payment_not_succeeded', pi_status: paymentIntent.status });
    }

    // ── Step 5: PI succeeded but no order — validate orderData & check recovery limits ─
    // Only possible if orderData was persisted in the pending-payment record
    if (!orderData) {
        console.error(`${LOG} [trace=${traceId}] PI succeeded but no orderData to replay — manual review needed`);
        try {
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'webhook_order_creation_failed',
                severity: 'critical',
                payment_intent_id: paymentIntentId,
                user_email: user?.email || 'guest',
                error_message: 'Recovery attempted but no orderData available — PI succeeded without order. Webhook should have handled this.',
                context: { trace_id: traceId, recovery_source: 'frontend_reload' },
                alert_triggered: true,
                alert_condition: 'payment_success_order_failed',
                logged_at: new Date().toISOString(),
            });
        } catch (_) {}
        return Response.json({
            status: 'needs_review',
            recovery_status: 'terminal_invalid_payload',
            error: 'Payment was successful but order data is unavailable. Our team has been notified and will process your order. Please contact support with your payment reference.',
            payment_intent_id: paymentIntentId,
        }, { status: 500 });
    }

    // ── Validate & normalize orderData before replay ──────────────────────────────
    // Ensure required fields exist and have correct types
    const validateOrderData = (data) => {
        const errors = [];
        if (!data || typeof data !== 'object') errors.push('orderData must be an object');
        if (!data?.restaurant_id || typeof data.restaurant_id !== 'string') errors.push('missing/invalid restaurant_id');
        if (!data?.items || !Array.isArray(data.items) || data.items.length === 0) errors.push('missing/invalid items array');
        if (typeof data?.total !== 'number' || data.total <= 0) errors.push('missing/invalid total amount');
        if (!data?.payment_method || typeof data.payment_method !== 'string') errors.push('missing/invalid payment_method');
        if (!data?.order_type || typeof data.order_type !== 'string') errors.push('missing/invalid order_type');
        return errors.length === 0 ? { valid: true } : { valid: false, errors };
    };

    const validation = validateOrderData(orderData);
    if (!validation.valid) {
        console.error(`${LOG} [trace=${traceId}] orderData validation failed:`, validation.errors.join(', '));
        return Response.json({
            status: 'needs_review',
            recovery_status: 'terminal_invalid_payload',
            error: 'Order data is malformed and cannot be recovered. Please contact support.',
            payment_intent_id: paymentIntentId,
        }, { status: 500 });
    }

    console.log(`${LOG} [trace=${traceId}] orderData validated, replaying order creation for succeeded PI`);

    // FIX #2: Write a recovery-in-flight lock so webhook handler yields to us
    let recoveryLockId = null;
    try {
        const lockRecord = await base44.asServiceRole.entities.WebhookEventLog.create({
            stripe_event_id: `recovery_lock_${paymentIntentId}`,
            event_type: 'payment_intent.succeeded',
            status: 'in_progress',
            details: { source: 'frontend_recovery', trace_id: traceId },
            processed_at: new Date().toISOString(),
        });
        recoveryLockId = lockRecord?.id;
    } catch (lockErr) {
        console.warn(`${LOG} [trace=${traceId}] recovery lock write failed (non-fatal):`, lockErr.message);
    }

    // Replay via verifyAndCreateOrder — idempotency_key ensures no duplicate
    try {
        const replayResponse = await base44.asServiceRole.functions.invoke('verifyAndCreateOrder', {
            orderData,
            paymentIntentId,
            idempotency_key: idempotencyKey,
        });

        const result = replayResponse?.data;
        if (result?.success || result?.duplicate) {
            console.log(`${LOG} [trace=${traceId}] ✅ Recovery order created/found id=${result.order_id}`);

            // FIX #7: Mark recovery lock as processed so webhook handler doesn't re-process
            if (recoveryLockId) {
                try {
                    await base44.asServiceRole.entities.WebhookEventLog.update(recoveryLockId, {
                        status: 'processed',
                        details: { source: 'frontend_recovery', order_id: result.order_id, trace_id: traceId }
                    });
                } catch (lockUpdateErr) {
                    console.warn(`${LOG} [trace=${traceId}] recovery lock update failed (non-fatal):`, lockUpdateErr.message);
                }
            }

            return Response.json({
                status: result.duplicate ? 'order_found' : 'order_created',
                recovery_status: 'terminal_success',
                order_id: result.order_id,
                order_number: result.order_number,
            });
        }

        const errMsg = result?.error || 'Order creation failed during recovery';
        const code = result?.code || 'UNKNOWN';
        const refunded = result?.refunded === true;
        console.error(`${LOG} [trace=${traceId}] Recovery replay failed: ${errMsg} code=${code} refunded=${refunded}`);

        // Determine recovery_status based on terminal vs replayable
        let recoveryStatus = 'replayable';
        const terminalCodes = ['ITEM_NOT_FOUND', 'ITEM_UNAVAILABLE', 'RESTAURANT_CLOSED', 'DELIVERY_UNAVAILABLE'];
        if (refunded || terminalCodes.includes(code)) {
            recoveryStatus = refunded ? 'terminal_refunded' : 'terminal_manual_review';
        }

        // Return failure with status hint for frontend
        return Response.json({
            status: 'recovery_failed',
            recovery_status: recoveryStatus,
            error: errMsg,
            code,
            refunded,
        }, { status: 500 });

    } catch (replayErr) {
        console.error(`${LOG} [trace=${traceId}] Recovery replay threw:`, replayErr.message);
        return Response.json({
            status: 'recovery_failed',
            recovery_status: 'replayable',
            error: 'Recovery attempt failed. The Stripe webhook will process your order automatically. Please check your orders in a few minutes.',
        }, { status: 500 });
    }
});