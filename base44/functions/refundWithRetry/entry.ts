/**
 * REFUND WITH RETRY — Automatic refund for failed order creation
 * 
 * Implements exponential backoff retry for failed refunds.
 * If refund fails after max retries, escalates to manual review.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

// ── Stripe environment validation (inline) ────────────────────────────────
function getStripeMode(key = '') {
    if (key.startsWith('sk_live_') || key.startsWith('pk_live_')) return 'live';
    if (key.startsWith('sk_test_') || key.startsWith('pk_test_')) return 'test';
    return 'unknown';
}
function validateStripeKeys() {
    const sk = Deno.env.get('STRIPE_SECRET_KEY') || '';
    const skMode = getStripeMode(sk);
    console.log(`[STRIPE_ENV] refundWithRetry | secret=${skMode}`);
    if (!sk) throw new Error('[STRIPE_ENV] FATAL: STRIPE_SECRET_KEY is not set');
    if (skMode === 'unknown') throw new Error(`[STRIPE_ENV] FATAL: STRIPE_SECRET_KEY has unrecognised format (prefix: ${sk.slice(0, 8)}...)`);
    return skMode;
}

const _stripeMode = validateStripeKeys();
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
// MAX_RETRIES=2 keeps total backoff at 1s+2s=3s, safely within serverless timeout.
// 3 retries (1s+2s+4s=7s) risked timeout mid-refund leaving PT in ambiguous state.
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000; // 1 second

async function attemptRefund(paymentIntentId, attempt = 1) {
    try {
        console.log(`[REFUND] Attempt ${attempt}/${MAX_RETRIES} for intent=${paymentIntentId}`);
        
        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            metadata: { recovery_attempt: String(attempt), failure_reason: 'order_creation_failed' }
        });
        
        console.log(`[REFUND] ✅ Refund successful: ${refund.id} status=${refund.status}`);
        return { success: true, refund_id: refund.id, attempt };
        
    } catch (error) {
        console.error(`[REFUND] Attempt ${attempt} failed:`, error.message);
        
        // Don't retry permanent Stripe errors — no such PI, already refunded, etc.
        const isPermanent = error?.code === 'resource_missing' || 
            error?.code === 'charge_already_refunded' ||
            error?.message?.includes('No such payment_intent') ||
            error?.message?.includes('already been refunded');
        
        if (!isPermanent && attempt < MAX_RETRIES) {
            const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1); // exponential
            console.log(`[REFUND] Retrying in ${backoffMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            return attemptRefund(paymentIntentId, attempt + 1);
        } else {
            if (isPermanent) {
                console.error(`[REFUND] Permanent error for intent=${paymentIntentId} — not retrying:`, error.message);
            } else {
                console.error(`[REFUND] Max retries exhausted for intent=${paymentIntentId}`);
            }
            return { success: false, error: error.message, attempt, permanent: isPermanent };
        }
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { paymentIntentId, reason } = await req.json();
        
        if (!paymentIntentId) {
            return Response.json({ error: 'Missing paymentIntentId', success: false }, { status: 400 });
        }
        
        console.log(`[REFUND] Starting refund attempt for intent=${paymentIntentId} reason=${reason}`);
        
        // Attempt refund with retries
        const refundResult = await attemptRefund(paymentIntentId);
        
        if (refundResult.success) {
            // Update PaymentTransaction record
            const pts = await base44.asServiceRole.entities.PaymentTransaction.filter({
                payment_intent_id: paymentIntentId
            });
            
            if (pts?.[0]) {
                await base44.asServiceRole.entities.PaymentTransaction.update(pts[0].id, {
                    status: 'refunded',
                    refund_id: refundResult.refund_id,
                    refund_attempted_at: new Date().toISOString(),
                    refund_confirmed_at: new Date().toISOString()
                }).catch(e => console.warn('[REFUND] Failed to update PT:', e.message));
            }
            
            return Response.json({
                success: true,
                refund_id: refundResult.refund_id,
                status: 'refunded'
            }, { status: 200 });
            
        } else {
            // CRITICAL: Log for manual review
            console.error(`[REFUND] Refund failed after ${MAX_RETRIES} attempts`);
            
            const pts = await base44.asServiceRole.entities.PaymentTransaction.filter({
                payment_intent_id: paymentIntentId
            });
            
            if (pts?.[0]) {
                await base44.asServiceRole.entities.PaymentTransaction.update(pts[0].id, {
                    status: 'needs_review',
                    failure_reason: `Refund failed: ${refundResult.error}`,
                    refund_attempted_at: new Date().toISOString()
                }).catch(e => console.warn('[REFUND] Failed to update PT:', e.message));
            }
            
            // Create critical alert with typed fields for support visibility
            const pts2 = await base44.asServiceRole.entities.PaymentTransaction.filter({ payment_intent_id: paymentIntentId }).catch(() => []);
            const pt2 = pts2?.[0];
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'refund_initiate',
                severity: 'critical',
                failure_code: 'REFUND_MAX_RETRIES_EXHAUSTED',
                compensation_status: 'manual_review_required',
                payment_intent_id: paymentIntentId,
                customer_email: pt2?.user_email || pt2?.guest_email || null,
                restaurant_id: pt2?.restaurant_id || null,
                error_message: `Refund failed after ${MAX_RETRIES} attempts: ${refundResult.error}`,
                context: { reason, last_attempt: refundResult.attempt },
                logged_at: new Date().toISOString(),
                alert_triggered: true,
                alert_condition: 'payment_success_order_failed'
            }).catch(e => console.warn('[LOG] Failed to record critical alert:', e.message));
            
            return Response.json({
                success: false,
                error: `Refund failed after ${MAX_RETRIES} retries. Manual review required.`,
                recoverable: false,
                payment_intent_id: paymentIntentId
            }, { status: 500 });
        }
        
    } catch (error) {
        console.error('[REFUND] Unhandled error:', error.message);
        return Response.json({ error: error.message, success: false }, { status: 500 });
    }
});