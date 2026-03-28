/**
 * STRIPE WEBHOOK ENDPOINT - Production-Safe Order Reconciliation
 * 
 * Source of truth for payment success.
 * Responsible for creating orders when frontend fails after charge.
 * Handles idempotent processing using event deduplication.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

// ── Stripe environment validation (inline) ────────────────────────────────
function getStripeMode(key = '') {
    if (key.startsWith('sk_live_') || key.startsWith('pk_live_')) return 'live';
    if (key.startsWith('sk_test_') || key.startsWith('pk_test_')) return 'test';
    return 'unknown';
}
function validateStripeWebhookEnv() {
    const sk = Deno.env.get('STRIPE_SECRET_KEY') || '';
    const pk = Deno.env.get('STRIPE_PUBLIC_KEY') || Deno.env.get('VITE_STRIPE_PUBLIC_KEY') || '';
    const wh = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
    const skMode = getStripeMode(sk);
    const pkMode = pk ? getStripeMode(pk) : skMode;
    console.log(`[STRIPE_ENV] stripeWebhook | secret=${skMode} | publishable=${pk ? pkMode : 'not_checked'} | webhook_secret=${wh ? 'present' : 'MISSING'}`);
    if (!sk) throw new Error('[STRIPE_ENV] FATAL: STRIPE_SECRET_KEY is not set');
    if (skMode === 'unknown') throw new Error(`[STRIPE_ENV] FATAL: STRIPE_SECRET_KEY has unrecognised format (prefix: ${sk.slice(0, 8)}...)`);
    if (pk && skMode !== pkMode) throw new Error(`[STRIPE_ENV] FATAL: KEY MODE MISMATCH — secret=${skMode} but publishable=${pkMode}. Mixed live/test keys rejected.`);
    if (!wh) throw new Error('[STRIPE_ENV] FATAL: STRIPE_WEBHOOK_SECRET is not set — signature verification impossible');
    return skMode;
}

const _stripeWebhookMode = validateStripeWebhookEnv();
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');

// ─────────────────────────────────────────────────────────────────────
// EVENT DEDUPLICATION — Stripe retries webhook deliveries
// ─────────────────────────────────────────────────────────────────────
async function hasEventBeenProcessed(base44, stripeEventId) {
    try {
        const processed = await base44.asServiceRole.entities.WebhookEventLog.filter({
            stripe_event_id: stripeEventId,
            status: 'processed'
        });
        return processed && processed.length > 0;
    } catch {
        return false;
    }
}

async function logWebhookEvent(base44, eventId, eventType, status, details) {
    try {
        await base44.asServiceRole.entities.WebhookEventLog.create({
            stripe_event_id: eventId,
            event_type: eventType,
            status,
            details,
            processed_at: new Date().toISOString(),
        });
    } catch (e) {
        console.error('[WEBHOOK] Failed to log event:', e.message);
    }
}

// ─────────────────────────────────────────────────────────────────────
// COMPENSATION — Refund + log incident for post-payment order failures
// ─────────────────────────────────────────────────────────────────────
async function triggerCompensation(base44, piId, reason, failureCode, metadata) {
    const now = new Date().toISOString();
    console.error(`[WEBHOOK] 🚨 Triggering compensation for intent=${piId} reason=${reason} code=${failureCode}`);

    // Step 1: Mark PaymentTransaction as payment_succeeded_order_failed
    try {
        const pts = await base44.asServiceRole.entities.PaymentTransaction.filter({
            payment_intent_id: piId
        });
        if (pts?.[0]) {
            await base44.asServiceRole.entities.PaymentTransaction.update(pts[0].id, {
                status: 'needs_review',
                failure_reason: `[${failureCode}] ${reason}`,
                refund_attempted_at: now
            });
        }
    } catch (e) {
        console.warn(`[WEBHOOK] Could not update PT status for intent=${piId}:`, e.message);
    }

    // Step 2: Attempt automatic refund via refundWithRetry
    let refundResult = null;
    try {
        const refundResponse = await base44.asServiceRole.functions.invoke('refundWithRetry', {
            paymentIntentId: piId,
            reason: `webhook_compensation_${failureCode}`
        });
        refundResult = refundResponse?.data;
        if (refundResult?.success) {
            console.log(`[WEBHOOK] ✅ Compensation refund succeeded for intent=${piId} refund_id=${refundResult.refund_id}`);
        } else {
            console.error(`[WEBHOOK] ❌ Compensation refund failed for intent=${piId}:`, refundResult?.error);
        }
    } catch (e) {
        console.error(`[WEBHOOK] ❌ refundWithRetry invocation threw for intent=${piId}:`, e.message);
        refundResult = { success: false, error: e.message };
    }

    // Step 3: Log incident in FailureLog regardless of refund outcome
    const incidentSeverity = refundResult?.success ? 'high' : 'critical';
    const incidentDetails = {
        payment_intent_id: piId,
        failure_code: failureCode,
        failure_reason: reason,
        refund_attempted: true,
        refund_succeeded: refundResult?.success || false,
        refund_id: refundResult?.refund_id || null,
        refund_error: refundResult?.error || null,
        restaurant_id: metadata?.restaurant_id || null,
        customer_email: metadata?.user_email || metadata?.guest_email || null,
        cart_summary: metadata?.items_json ? (() => {
            try { return JSON.parse(metadata.items_json).map(i => `${i.quantity}x ${i.name}`).join(', '); }
            catch { return metadata.items_json; }
        })() : null,
        amount: metadata?.total || null,
        incident_at: now
    };

    try {
        await base44.asServiceRole.entities.FailureLog.create({
            failure_type: refundResult?.success
                ? 'payment_succeeded_order_failed_refund_issued'
                : 'payment_succeeded_order_failed_refund_failed',
            severity: incidentSeverity,
            failure_code: failureCode,
            compensation_status: refundResult?.success ? 'refund_issued' : 'manual_review_required',
            payment_intent_id: piId,
            refund_id: refundResult?.refund_id || null,
            customer_email: metadata?.user_email && metadata.user_email !== 'guest' ? metadata.user_email : (metadata?.guest_email || null),
            restaurant_id: metadata?.restaurant_id || null,
            error_message: `[${failureCode}] ${reason}`,
            context: incidentDetails,
            logged_at: now,
            alert_triggered: true,
            alert_condition: 'payment_success_order_failed'
        });
        console.log(`[WEBHOOK] Incident logged: severity=${incidentSeverity} failure_code=${failureCode} compensation=${refundResult?.success ? 'refund_issued' : 'manual_review_required'}`);
    } catch (e) {
        console.error(`[WEBHOOK] CRITICAL: Could not log incident for intent=${piId}:`, e.message);
    }

    // Step 4: If refund failed, flag PT for manual review
    if (!refundResult?.success) {
        try {
            const pts = await base44.asServiceRole.entities.PaymentTransaction.filter({ payment_intent_id: piId });
            if (pts?.[0]) {
                await base44.asServiceRole.entities.PaymentTransaction.update(pts[0].id, {
                    status: 'needs_review',
                    failure_reason: `MANUAL ACTION REQUIRED: Refund failed after retries. [${failureCode}] ${reason}. Refund error: ${refundResult?.error}`
                });
            }
        } catch (e) {
            console.warn(`[WEBHOOK] Could not set manual_review status for intent=${piId}:`, e.message);
        }
    }

    return {
        success: false,
        status: refundResult?.success ? 'compensation_refund_issued' : 'compensation_refund_failed_manual_review_required',
        refunded: refundResult?.success || false,
        failure_code: failureCode
    };
}

// ─────────────────────────────────────────────────────────────────────
// PAYMENT INTENT SUCCEEDED — Reconcile or create order
// ─────────────────────────────────────────────────────────────────────
async function handlePaymentIntentSucceeded(base44, paymentIntent) {
    const piId = paymentIntent.id;
    const metadata = paymentIntent.metadata || {};
    
    console.log(`[WEBHOOK] payment_intent.succeeded event: ${piId}`);
    
    // Check if order already exists for this payment intent (normal path / duplicate event)
    try {
        const existingOrders = await base44.asServiceRole.entities.Order.filter({
            payment_intent_id: piId
        });
        if (existingOrders && existingOrders.length > 0) {
            console.log(`[WEBHOOK] Order already exists for intent=${piId} order_id=${existingOrders[0].id}`);
            return { success: true, status: 'already_reconciled', order_id: existingOrders[0].id };
        }
    } catch (e) {
        console.error(`[WEBHOOK] Failed to check existing order for intent=${piId}:`, e.message);
        // Recoverable DB error — return non-200 so Stripe retries
        return { success: false, error: 'Failed to check for existing order', recoverable: true };
    }
    
    // Order does not exist — attempt to create it from webhook payload
    console.log(`[WEBHOOK] No existing order for intent=${piId}. Attempting webhook recovery...`);
    
    let result;
    try {
        const response = await base44.asServiceRole.functions.invoke('createIdempotentOrder', {
            paymentIntentId: piId,
            paymentIntentMetadata: metadata,
            sourceType: 'webhook_recovery'
        });
        result = response?.data;
    } catch (e) {
        console.error(`[WEBHOOK] createIdempotentOrder invocation threw for intent=${piId}:`, e.message);
        // Network/infra error — recoverable, Stripe will retry
        return { success: false, error: e.message, recoverable: true };
    }

    // ── TERMINAL OUTCOME A: Order created ────────────────────────────
    if (result?.success) {
        console.log(`[WEBHOOK] ✅ Order created from webhook recovery: ${result.order_id}`);
        return { success: true, status: 'created_from_webhook', order_id: result.order_id };
    }

    // ── CLASSIFY THE FAILURE ─────────────────────────────────────────
    const isRecoverable = result?.recoverable !== false; // default to recoverable if not specified
    const isCompensatable = result?.compensatable === true; // must be explicitly set

    console.error(`[WEBHOOK] Order creation failed intent=${piId} code=${result?.code} recoverable=${isRecoverable} compensatable=${isCompensatable} reason=${result?.reason || result?.error}`);

    // ── TERMINAL OUTCOME B: Non-recoverable — trigger compensation ───
    if (!isRecoverable && isCompensatable) {
        return await triggerCompensation(
            base44,
            piId,
            result?.reason || result?.error || 'Order creation failed non-recoverably',
            result?.code || 'UNKNOWN_NON_RECOVERABLE',
            metadata
        );
    }

    // ── RECOVERABLE FAILURE: return failure so Stripe retries ────────
    // (DB errors, timeouts, infra issues — Stripe will redeliver the event)
    console.warn(`[WEBHOOK] Recoverable failure for intent=${piId} — Stripe will retry. error=${result?.error}`);
    return { success: false, error: result?.error || 'Order creation failed', recoverable: true };
}

// ─────────────────────────────────────────────────────────────────────
// PAYMENT FAILED — Log for investigation
// ─────────────────────────────────────────────────────────────────────
async function handlePaymentIntentPaymentFailed(base44, paymentIntent) {
    const piId = paymentIntent.id;
    const lastError = paymentIntent.last_payment_error;
    
    console.warn(`[WEBHOOK] payment_intent.payment_failed: ${piId} reason=${lastError?.type || 'unknown'}`);
    
    // No order should have been created for failed payment
    // Log for monitoring
    try {
        await base44.asServiceRole.entities.FailureLog.create({
            failure_type: 'payment_failed_via_webhook',
            severity: 'info',
            payment_intent_id: piId,
            error_message: lastError?.message || 'Unknown payment error',
            context: { error_type: lastError?.type, error_code: lastError?.code }
        });
    } catch (e) {
        console.warn('[WEBHOOK] Failed to log payment failure:', e.message);
    }
    
    return { success: true, status: 'logged' };
}

// ─────────────────────────────────────────────────────────────────────
// CHARGE REFUNDED — Track refund completion
// ─────────────────────────────────────────────────────────────────────
async function handleChargeRefunded(base44, charge) {
    const chargeId = charge.id;
    const piId = charge.payment_intent;
    
    console.log(`[WEBHOOK] charge.refunded: ${chargeId} for intent=${piId}`);
    
    // Update any pending refund records
    try {
        await base44.asServiceRole.entities.PaymentTransaction.filter({ payment_intent_id: piId })
            .then(pts => {
                if (pts?.[0]) {
                    return base44.asServiceRole.entities.PaymentTransaction.update(pts[0].id, {
                        status: 'refunded',
                        refund_confirmed_at: new Date().toISOString()
                    });
                }
            });
    } catch (e) {
        console.warn('[WEBHOOK] Failed to update PaymentTransaction on refund:', e.message);
    }
    
    return { success: true, status: 'tracked' };
}

// ─────────────────────────────────────────────────────────────────────
// MAIN WEBHOOK HANDLER
// ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }
    
    try {
        const base44 = createClientFromRequest(req);
        
        // CRITICAL: Verify Stripe webhook signature
        const body = await req.text();
        const signature = req.headers.get('stripe-signature');
        
        if (!WEBHOOK_SECRET || !signature) {
            console.error('[WEBHOOK] Missing webhook secret or signature');
            return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
        }
        
        let event;
        try {
            event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET);
        } catch (err) {
            console.error('[WEBHOOK] Signature verification failed:', err.message);
            return new Response(JSON.stringify({ error: 'Signature verification failed' }), { status: 401 });
        }
        
        const eventId = event.id;
        const eventType = event.type;
        
        console.log(`[WEBHOOK] Received event: type=${eventType} id=${eventId}`);
        
        // CRITICAL: Dedup check — prevent duplicate processing
        const alreadyProcessed = await hasEventBeenProcessed(base44, eventId);
        if (alreadyProcessed) {
            console.log(`[WEBHOOK] Event ${eventId} already processed, skipping`);
            return new Response(JSON.stringify({ success: true, status: 'duplicate_ignored' }), { status: 200 });
        }
        
        // Route to handler based on event type
        let result;
        try {
            switch (eventType) {
                case 'payment_intent.succeeded':
                    result = await handlePaymentIntentSucceeded(base44, event.data.object);
                    break;
                case 'payment_intent.payment_failed':
                    result = await handlePaymentIntentPaymentFailed(base44, event.data.object);
                    break;
                case 'charge.refunded':
                    result = await handleChargeRefunded(base44, event.data.object);
                    break;
                default:
                    console.log(`[WEBHOOK] Ignoring event type: ${eventType}`);
                    result = { success: true, status: 'ignored' };
            }
        } catch (handlerError) {
            console.error(`[WEBHOOK] Handler error for ${eventType}:`, handlerError.message);
            result = { success: false, error: handlerError.message };
        }
        
        // Log the event processing
        await logWebhookEvent(base44, eventId, eventType, result.success ? 'processed' : 'failed', result);
        
        // Return 200 to acknowledge to Stripe (even on failure, we logged it)
        return new Response(JSON.stringify({ received: true, status: result.status || 'processed' }), { status: 200 });
        
    } catch (error) {
        console.error('[WEBHOOK] Unhandled error:', error.message, error.stack);
        return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
    }
});