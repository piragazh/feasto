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

// ── Stripe environment validation (inline) ────────────────────────────────
function getStripeMode(key = '') {
    if (key.startsWith('sk_live_') || key.startsWith('pk_live_')) return 'live';
    if (key.startsWith('sk_test_') || key.startsWith('pk_test_')) return 'test';
    return 'unknown';
}
function validateStripeKeys() {
    const sk = Deno.env.get('STRIPE_SECRET_KEY') || '';
    const skMode = getStripeMode(sk);
    console.log(`[STRIPE_ENV] reconcileOrphanedPayments | secret=${skMode}`);
    if (!sk) throw new Error('[STRIPE_ENV] FATAL: STRIPE_SECRET_KEY is not set');
    if (skMode === 'unknown') throw new Error(`[STRIPE_ENV] FATAL: STRIPE_SECRET_KEY has unrecognised format (prefix: ${sk.slice(0, 8)}...)`);
    return skMode;
}

const ORPHAN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_BATCH = 20; // process at most 20 per run to avoid timeouts

Deno.serve(async (req) => {
    const runStart = Date.now();
    const runId = `reconcile_${runStart}`;
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

        // Validate Stripe key mode at runtime (catches mis-config immediately)
        const stripeMode = validateStripeKeys();
        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
        const cutoff = new Date(Date.now() - ORPHAN_WINDOW_MS).toISOString();
        const now = new Date().toISOString();

        console.log(`[RECONCILE] ▶ STARTED run_id=${runId} stripe_mode=${stripeMode} cutoff=${cutoff}`);

        const results = { processed: 0, refunded: 0, refund_failed: 0, escalated: 0, skipped: 0, scanned: 0 };

        // ── 1. Find authorized records older than cutoff (order never created) ──
        // NOTE: PaymentTransaction has no 'authorized_at' field.
        // Fetch all 'authorized' records and filter by created_date in-process.
        // The SDK does not support $lt on built-in date fields — must filter client-side.
        const allAuthorized = await base44.asServiceRole.entities.PaymentTransaction.filter({
            status: 'authorized'
        }, '-created_date', 100);
        const orphanedAuthorized = (allAuthorized || []).filter(pt =>
            new Date(pt.created_date) < new Date(cutoff)
        );

        results.scanned = allAuthorized?.length || 0;
        const batch = (orphanedAuthorized || []).slice(0, MAX_BATCH);

        console.log(`[RECONCILE] scanned=${results.scanned} authorized_total | matched_orphans=${orphanedAuthorized?.length || 0} | processing_batch=${batch.length}`);

        // ── Spike alert: >10 orphans in one run is unexpected ─────────────
        if (orphanedAuthorized?.length > 10) {
            console.error(`[RECONCILE] 🚨 SPIKE ALERT: ${orphanedAuthorized.length} orphaned payments detected in single run. Possible webhook outage or order creation failure cascade.`);
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'order_create',
                severity: 'critical',
                failure_code: 'RECONCILER_SPIKE',
                compensation_status: 'pending',
                customer_email: null,
                error_message: `Reconciler spike: ${orphanedAuthorized.length} orphaned PTs detected in one run (run_id=${runId})`,
                context: { orphan_count: orphanedAuthorized.length, run_id: runId, stripe_mode: stripeMode },
                logged_at: now,
                alert_triggered: true,
                alert_condition: 'payment_success_order_failed'
            }).catch(e => console.warn('[RECONCILE] Could not log spike alert:', e.message));
        }

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
                const customerEmail = ptx.user_email || ptx.guest_email || null;
                console.warn(`[RECONCILE] Orphaned payment: ptx=${ptx.id} pi=${ptx.payment_intent_id} amount=£${ptx.amount} customer=${customerEmail} created=${ptx.created_date}`);

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
                    refund_id: refund.id,
                    refund_amount: ptx.amount,
                    refund_attempted_at: new Date().toISOString(),
                    refund_confirmed_at: new Date().toISOString(),
                    failure_reason: 'Order not created within 10 minutes of authorization (reconciliation job)',
                });
                // Log refund issuance to FailureLog for audit trail
                await base44.asServiceRole.entities.FailureLog.create({
                    failure_type: 'order_create',
                    severity: 'critical',
                    failure_code: 'RECONCILER_REFUND_ISSUED',
                    compensation_status: 'refund_issued',
                    payment_intent_id: ptx.payment_intent_id,
                    refund_id: refund.id,
                    customer_email: ptx.user_email || ptx.guest_email || null,
                    restaurant_id: ptx.restaurant_id || null,
                    error_message: `Reconciler issued automatic refund for orphaned payment: pi=${ptx.payment_intent_id} refund=${refund.id}`,
                    context: { amount: ptx.amount, run_id: runId, stripe_mode: stripeMode },
                    logged_at: new Date().toISOString(),
                    alert_triggered: true,
                    alert_condition: 'payment_success_order_failed'
                }).catch(e => console.warn('[RECONCILE] Could not log refund FailureLog:', e.message));
                console.log(`[RECONCILE] ✅ refund_succeeded ptx=${ptx.id} refund_id=${refund.id} amount=£${ptx.amount}`);
                results.refunded++;

            } catch (err) {
                const customerEmail = ptx.user_email || ptx.guest_email || null;
                const failureCode = err?.message?.includes('does not have a successful charge') ? 'PI_NEVER_CHARGED' : 'REFUND_API_ERROR';
                console.error(`[RECONCILE] ❌ refund_failed ptx=${ptx.id} pi=${ptx.payment_intent_id} code=${failureCode}: ${err?.message}`);

                await base44.asServiceRole.entities.PaymentTransaction.update(ptx.id, {
                    status: 'manual_review',
                    failure_reason: `[${failureCode}] Reconciliation refund failed: ${err?.message}`,
                    refund_attempted_at: new Date().toISOString(),
                }).catch(() => {});

                // Log to FailureLog with typed fields for support
                await base44.asServiceRole.entities.FailureLog.create({
                    failure_type: 'refund_initiate',
                    severity: failureCode === 'PI_NEVER_CHARGED' ? 'warning' : 'critical',
                    failure_code: failureCode,
                    compensation_status: 'manual_review_required',
                    payment_intent_id: ptx.payment_intent_id,
                    customer_email: customerEmail,
                    restaurant_id: ptx.restaurant_id || null,
                    error_message: `[${failureCode}] Reconciler refund failed: ${err?.message}`,
                    context: { amount: ptx.amount, run_id: runId, stripe_mode: stripeMode, ptx_id: ptx.id },
                    logged_at: new Date().toISOString()
                }).catch(e => console.warn('[RECONCILE] Could not log refund_failed FailureLog:', e.message));

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

        const durationMs = Date.now() - runStart;
        console.log(`[RECONCILE] ■ COMPLETE run_id=${runId} stripe_mode=${stripeMode} duration=${durationMs}ms | scanned=${results.scanned} processed=${results.processed} refunded=${results.refunded} refund_failed=${results.refund_failed} skipped=${results.skipped} escalated=${results.escalated}`);

        // Alert if the run itself resulted in zero processing but we know there are active orphans
        // (catches cases where the query silently changes behaviour)
        if (results.scanned > 0 && results.processed === 0 && orphanedAuthorized?.length === 0) {
            console.warn(`[RECONCILE] ⚠️  POSSIBLE FILTER MISS: ${results.scanned} authorized PTs scanned but 0 matched orphan window (${ORPHAN_WINDOW_MS / 60000} min). If this persists, check cutoff logic.`);
        }

        return Response.json({ success: true, results, run_id: runId, stripe_mode: stripeMode, duration_ms: durationMs, run_at: now });

    } catch (error) {
        console.error('[RECONCILE] reconcileOrphanedPayments crashed:', error?.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});