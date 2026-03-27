/**
 * REFUND WITH RETRY — Automatic refund for failed order creation
 * 
 * Implements exponential backoff retry for failed refunds.
 * If refund fails after max retries, escalates to manual review.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000; // 1 second

async function attemptRefund(paymentIntentId, attempt = 1) {
    try {
        console.log(`[REFUND] Attempt ${attempt}/${MAX_RETRIES} for intent=${paymentIntentId}`);
        
        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason: 'order_creation_failed',
            metadata: { recovery_attempt: attempt }
        });
        
        console.log(`[REFUND] ✅ Refund successful: ${refund.id} status=${refund.status}`);
        return { success: true, refund_id: refund.id, attempt };
        
    } catch (error) {
        console.error(`[REFUND] Attempt ${attempt} failed:`, error.message);
        
        if (attempt < MAX_RETRIES) {
            const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1); // exponential
            console.log(`[REFUND] Retrying in ${backoffMs}ms...`);
            
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            return attemptRefund(paymentIntentId, attempt + 1);
        } else {
            console.error(`[REFUND] Max retries exhausted for intent=${paymentIntentId}`);
            return { success: false, error: error.message, attempt };
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
            
            // Create critical alert
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'refund_failed_requires_manual_review',
                severity: 'critical',
                payment_intent_id: paymentIntentId,
                error_message: `Refund failed after ${MAX_RETRIES} attempts: ${refundResult.error}`,
                context: { reason, last_attempt: refundResult.attempt }
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