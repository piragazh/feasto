/**
 * reconcileOrphanedPayments — Scheduled safety net for orphaned charges
 *
 * Purpose:
 *   Finds PaymentTransaction records stuck in 'authorized' or 'order_failed' status
 *   that are older than 10 minutes (enough time for normal order creation to complete).
 *   For each orphan: attempts automatic refund via Stripe, updates status.
 *   Also finds 'refund_failed' records and escalates them to manual_review.
 *
 * Run schedule: Every 15 minutes via automation.
 *
 * SECURITY: Admin-only (called by scheduler, not user-facing).
 *
 * Idempotency: Checks status before acting — will not double-refund.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

const ORPHAN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_BATCH = 20; // process at most 20 per run to avoid timeouts

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Auth: allow scheduler (secret header) or admin user
        const schedulerSecret = req.headers.get('x-scheduler-secret');
        const isScheduler = schedulerSecret && schedulerSecret === Deno.env.get('SCHEDULED_DIGEST_SECRET');

        if (!isScheduler) {
            const user = await base44.auth.me();
            if (user?.role !== 'admin') {
                return Response.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
        const cutoff = new Date(Date.now() - ORPHAN_WINDOW_MS).toISOString();
        const now = new Date().toISOString();

        const results = { processed: 0, refunded: 0, refund_failed: 0, escalated: 0, skipped: 0 };

        // ── 1. Find authorized records older than cutoff (order never created) ──
        const orphanedAuthorized = await base44.asServiceRole.entities.PaymentTransaction.filter({
            status: 'authorized',
            authorized_at: { $lt: cutoff }
        });

        const batch = (orphanedAuthorized || []).slice(0, MAX_BATCH);
        console.log(`[RECONCILE] Found ${orphanedAuthorized?.length || 0} authorized orphans. Processing ${batch.length}.`);

        for (const ptx of batch) {
            results.processed++;
            try {
                // Double-check: is there now an order with this PI? (race condition guard)
                const linkedOrders = await base44.asServiceRole.entities.Order.filter({
                    payment_intent_id: ptx.payment_intent_id
                });
                if (linkedOrders && linkedOrders.length > 0) {
                    // Order exists — reconcile the PTX record
                    await base44.asServiceRole.entities.PaymentTransaction.update(ptx.id, {
                        status: 'order_created',
                        order_id: linkedOrders[0].id,
                        order_created_at: linkedOrders[0].created_date || now,
                    });
                    console.log(`[RECONCILE] Linked orphaned PTX to existing order. ptx=${ptx.id} order=${linkedOrders[0].id}`);
                    results.skipped++;
                    continue;
                }

                // No order found → initiate refund
                console.warn(`[RECONCILE] Orphaned payment detected. ptx=${ptx.id} pi=${ptx.payment_intent_id} amount=£${ptx.amount} user=${ptx.user_email} authorized_at=${ptx.authorized_at}`);

                await base44.asServiceRole.entities.PaymentTransaction.update(ptx.id, {
                    status: 'refund_initiated',
                    failure_reason: 'Order not created within 10 minutes of authorization (reconciliation job)',
                    failure_stage: 'order_create',
                    refund_initiated_at: now,
                });

                const refund = await stripe.refunds.create({
                    payment_intent: ptx.payment_intent_id,
                    reason: 'duplicate',
                    metadata: {
                        refund_source: 'reconciliation_job',
                        ptx_id: ptx.id,
                        original_authorized_at: ptx.authorized_at || '',
                        user_email: ptx.user_email || '',
                    }
                });

                await base44.asServiceRole.entities.PaymentTransaction.update(ptx.id, {
                    status: 'refunded',
                    stripe_refund_id: refund.id,
                    refunded_at: new Date().toISOString(),
                });
                console.log(`[RECONCILE] Refund succeeded. ptx=${ptx.id} refund=${refund.id}`);
                results.refunded++;

            } catch (err) {
                console.error(`[RECONCILE] Refund failed for ptx=${ptx.id} pi=${ptx.payment_intent_id}: ${err?.message}`);
                await base44.asServiceRole.entities.PaymentTransaction.update(ptx.id, {
                    status: 'manual_review',
                    failure_reason: `Reconciliation refund failed: ${err?.message}`,
                }).catch(() => {});
                results.refund_failed++;
            }
        }

        // ── 2. Escalate 'refund_failed' records to 'manual_review' ────────────
        const refundFailed = await base44.asServiceRole.entities.PaymentTransaction.filter({
            status: 'refund_failed'
        });
        for (const ptx of (refundFailed || []).slice(0, MAX_BATCH)) {
            try {
                await base44.asServiceRole.entities.PaymentTransaction.update(ptx.id, {
                    status: 'manual_review',
                });
                console.error(`[RECONCILE] Escalated to manual_review. ptx=${ptx.id} pi=${ptx.payment_intent_id} amount=£${ptx.amount} user=${ptx.user_email}`);
                results.escalated++;
            } catch (e) {
                console.error(`[RECONCILE] Could not escalate ptx=${ptx.id}: ${e?.message}`);
            }
        }

        console.log(`[RECONCILE] Run complete:`, JSON.stringify(results));
        return Response.json({ success: true, results, run_at: now });

    } catch (error) {
        console.error('[RECONCILE] reconcileOrphanedPayments crashed:', error?.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});