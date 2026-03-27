/**
 * STRIPE WEBHOOK ENDPOINT - Production-Safe Order Reconciliation
 * 
 * Source of truth for payment success.
 * Responsible for creating orders when frontend fails after charge.
 * Handles idempotent processing using event deduplication.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

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
// PAYMENT INTENT SUCCEEDED — Reconcile or create order
// ─────────────────────────────────────────────────────────────────────
async function handlePaymentIntentSucceeded(base44, paymentIntent) {
    const piId = paymentIntent.id;
    const metadata = paymentIntent.metadata || {};
    
    console.log(`[WEBHOOK] payment_intent.succeeded event: ${piId} metadata:`, metadata);
    
    // CRITICAL: Check if order already exists for this payment intent
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
        return { success: false, error: 'Failed to check for existing order', recoverable: true };
    }
    
    // Order does not exist — attempt to create it from webhook payload
    console.log(`[WEBHOOK] No existing order for intent=${piId}. Creating from webhook payload...`);
    
    try {
        const result = await base44.asServiceRole.functions.invoke('createIdempotentOrder', {
            paymentIntentId: piId,
            paymentIntentMetadata: metadata,
            sourceType: 'webhook_recovery'
        });
        
        if (result?.data?.success) {
            console.log(`[WEBHOOK] ✅ Order created from webhook: ${result.data.order_id}`);
            return { success: true, status: 'created_from_webhook', order_id: result.data.order_id };
        } else {
            console.error(`[WEBHOOK] Failed to create order from webhook:`, result?.data?.error);
            
            // Attempt refund for payment that couldn't be reconciled
            console.log(`[WEBHOOK] Attempting compensation refund for intent=${piId}...`);
            await base44.asServiceRole.functions.invoke('refundWithRetry', {
                paymentIntentId: piId,
                reason: 'webhook_recovery_failed'
            }).catch(e => console.error('[WEBHOOK] Refund invocation failed:', e.message));
            
            return { success: false, error: result?.data?.error || 'Order creation failed', recoverable: true };
        }
    } catch (e) {
        console.error(`[WEBHOOK] Exception during webhook reconciliation:`, e.message);
        // Queue for manual review
        return { success: false, error: e.message, recoverable: true };
    }
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