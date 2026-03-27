/**
 * ORPHANED PAYMENT DETECTION
 * ===========================
 * Scheduled function to find payments taken by Stripe but not linked to orders.
 * These indicate payment → order creation failures.
 * 
 * TRIGGERS:
 * - Every 5 minutes (automated)
 * - Can also be called on-demand
 * 
 * DETECTION LOGIC:
 * A PaymentTransaction is "orphaned" if:
 *   1. status = 'authorized' (payment confirmed, no order linked)
 *   2. stripe_verified_at is within last hour (fresh orphan)
 *   3. No linked Order exists via payment_intent_id
 * 
 * ACTION:
 * - Flag orphaned payments in ReconciliationIssue as 'orphan_payment'
 * - Alert admin dashboard
 * - Suggest immediate manual refund
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        // Only admins or scheduled tasks can run this
        if (user && user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 3_600_000);

        // Get all 'authorized' payments (payment confirmed, no order)
        const allAuthorized = await base44.asServiceRole.entities.PaymentTransaction.filter({
            status: 'authorized'
        });

        if (!allAuthorized || allAuthorized.length === 0) {
            console.log('[ORPHAN DETECT] No orphaned payments found');
            return Response.json({ orphaned: 0, message: 'No orphaned payments detected' });
        }

        const orphans = [];
        for (const pt of allAuthorized) {
            const verifiedAt = pt.stripe_verified_at ? new Date(pt.stripe_verified_at) : null;
            
            // Only flag payments from the last hour (assume older ones are stuck by design)
            if (verifiedAt && verifiedAt < oneHourAgo) {
                console.log(`[ORPHAN DETECT] Skipping old authorized payment: ${pt.payment_intent_id} (${verifiedAt.toISOString()})`);
                continue;
            }

            // Check if an order exists for this payment
            const linkedOrders = await base44.asServiceRole.entities.Order.filter({
                payment_intent_id: pt.payment_intent_id
            });

            if (!linkedOrders || linkedOrders.length === 0) {
                // This is an orphan!
                orphans.push(pt);
                
                console.error(`[ORPHAN DETECT] FOUND ORPHAN: payment_intent=${pt.payment_intent_id} amount=£${pt.amount} verified=${pt.stripe_verified_at}`);

                // Check if reconciliation issue already exists for this payment
                const existingIssue = await base44.asServiceRole.entities.ReconciliationIssue.filter({
                    payment_transaction_id: pt.id,
                    issue_type: 'orphan_payment'
                });

                if (!existingIssue || existingIssue.length === 0) {
                    // Create a new reconciliation issue
                    try {
                        await base44.asServiceRole.entities.ReconciliationIssue.create({
                            issue_type: 'orphan_payment',
                            severity: 'critical',
                            status: 'open',
                            payment_transaction_id: pt.id,
                            restaurant_id: pt.restaurant_id,
                            provider: 'stripe',
                            amount: pt.amount,
                            currency: 'gbp',
                            detected_at: now.toISOString(),
                            detected_by: 'automated_reconciliation',
                            metadata: {
                                payment_intent_id: pt.payment_intent_id,
                                customer_email: pt.user_email || pt.guest_email,
                                customer_phone: pt.guest_phone,
                                order_creation_failed: true
                            },
                            suggested_action: `Manual refund recommended. Customer charged £${pt.amount} but order was never created. Recommend reaching out to customer at ${pt.user_email || pt.guest_email || pt.guest_phone}.`,
                            requires_escalation: true
                        });
                        console.log(`[ORPHAN DETECT] Created ReconciliationIssue for orphan: ${pt.payment_intent_id}`);
                    } catch (issueErr) {
                        console.error(`[ORPHAN DETECT] Failed to create reconciliation issue:`, issueErr.message);
                    }
                }
            }
        }

        console.log(`[ORPHAN DETECT] Scan complete: found ${orphans.length} orphaned payment(s)`);
        return Response.json({
            orphaned: orphans.length,
            payments: orphans.map(p => ({
                payment_intent_id: p.payment_intent_id,
                amount: p.amount,
                verified_at: p.stripe_verified_at,
                customer: p.user_email || p.guest_email || p.guest_phone
            }))
        });

    } catch (error) {
        console.error('[ORPHAN DETECT] Error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});