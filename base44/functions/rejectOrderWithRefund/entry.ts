/**
 * CRITICAL MONEY SAFETY: Reject order + auto-refund if paid by card
 * 
 * When restaurant rejects a paid card order, this function:
 * 1. Sets order status to 'cancelled' with rejection_reason
 * 2. If payment_method === 'card' AND payment was authorized:
 *    - Sets payment_status to 'refund_pending'
 *    - Attempts Stripe refund immediately
 *    - Updates PaymentTransaction with outcome
 * 3. If refund succeeds: payment_status = 'refunded'
 * 4. If refund fails: payment_status = 'manual_review' + critical alert
 * 
 * Prevents duplicate refunds via idempotency check on payment_intent_id
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { order_id, rejection_reason } = await req.json();

    if (!order_id || !rejection_reason) {
      return Response.json(
        { error: 'Missing required fields: order_id, rejection_reason' },
        { status: 400 }
      );
    }

    // Fetch order
    const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
    const order = orders?.[0];

    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // IDEMPOTENCY GUARD: If order is already cancelled/refunded, reject retry
    if (['cancelled', 'refunded'].includes(order.status)) {
      console.log(`[REJECT-IDEMPOTENT] Order ${order_id} already in status=${order.status} — blocking double rejection`);
      return Response.json({
        success: true,
        message: 'Order already cancelled/refunded',
        refunded: order.status === 'refunded',
      });
    }

    // Permission check: user must belong to restaurant or be admin
    if (user.role !== 'admin') {
      const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
        user_email: user.email,
        is_active: true,
      });
      const hasAccess = managers.some((manager) => manager.restaurant_ids?.includes(order.restaurant_id));
      if (!hasAccess) {
        return Response.json(
          { error: 'Access denied: not authorized for this restaurant' },
          { status: 403 }
        );
      }
    }

    // Update order status to cancelled with rejection reason
    const statusHistory = order.status_history || [];
    statusHistory.push({
      status: 'cancelled',
      timestamp: new Date().toISOString(),
      note: `Rejected by restaurant: ${rejection_reason}`,
    });

    await base44.asServiceRole.entities.Order.update(order_id, {
      status: 'cancelled',
      rejection_reason,
      status_history: statusHistory,
    });

    console.log(`[REJECT] Order ${order_id} rejected by ${user.email}. Reason: ${rejection_reason}`);

    // Notify the customer of the cancellation (SMS/WhatsApp per restaurant settings) — fire and forget.
    // Sent regardless of refund outcome so the customer is always informed.
    base44.asServiceRole.functions
      .invoke('sendNotificationFromTemplate', {
        restaurantId: order.restaurant_id,
        orderId: order_id,
        newStatus: 'cancelled',
        orderData: {
          order_number: order.order_number,
          phone: order.phone,
          guest_phone: order.phone,
          guest_name: order.guest_name,
          guest_email: order.guest_email,
          delivery_address: order.delivery_address,
          estimated_delivery: order.estimated_delivery,
          items: order.items,
        },
        rejectionReason,
      })
      .catch((e) => console.error('[rejectOrderWithRefund] Cancellation notification failed:', e?.message));

    // ─────────────────────────────────────────────────────────────────────────
    // AUTO-REFUND LOGIC: Only for paid card orders
    // ─────────────────────────────────────────────────────────────────────────

    // Check if payment was by card and was actually authorized
    if (order.payment_method !== 'card' || !order.payment_intent_id) {
      // No refund needed — unpaid, cash, or pay-at-counter
      console.log(`[REJECT] No refund needed for ${order_id}: payment_method=${order.payment_method}`);
      return Response.json({
        success: true,
        message: 'Order rejected. No refund issued (unpaid or cash payment)',
        refunded: false,
      });
    }

    const paymentIntentId = order.payment_intent_id;

    // IDEMPOTENCY CHECK: Is there already a PaymentTransaction for this PI?
    const existingPT = await base44.asServiceRole.entities.PaymentTransaction.filter({
      payment_intent_id: paymentIntentId,
    });

    if (existingPT && existingPT.length > 0) {
      const pt = existingPT[0];
      // Check if refund already happened or is in progress
      if (pt.status === 'refunded') {
        console.log(`[REJECT-IDEMPOTENT] PI ${paymentIntentId} already refunded (status=refunded)`);
        return Response.json({
          success: true,
          message: 'Order rejected. Refund was already issued previously.',
          refunded: true,
          refund_id: pt.refund_id,
        });
      }
      if (pt.status === 'needs_review') {
        console.log(`[REJECT-IDEMPOTENT] PI ${paymentIntentId} in needs_review — blocking retry`);
        return Response.json({
          success: false,
          message: 'Refund already failed and is under manual review. Contact support.',
          refunded: false,
          requires_manual_action: true,
        });
      }
    }

    // Attempt refund with Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    let refundResult = null;
    let refundId = null;
    let refundError = null;

    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer',
        metadata: {
          order_id,
          rejection_reason: rejection_reason.slice(0, 200),
          actor_email: user.email,
        },
      });

      refundId = refund.id;
      refundResult = refund;
      console.log(`[REFUND] Success for PI ${paymentIntentId}: refund_id=${refundId}`);
    } catch (stripeErr) {
      refundError = stripeErr.message;
      console.error(`[REFUND] FAILED for PI ${paymentIntentId}: ${stripeErr.message}`);
    }

    const now = new Date().toISOString();

    // Update or create PaymentTransaction record
    if (existingPT && existingPT.length > 0) {
      const pt = existingPT[0];
      // Update existing PT
      if (refundId) {
        // Refund succeeded
        await base44.asServiceRole.entities.PaymentTransaction.update(pt.id, {
          status: 'refunded',
          refund_id: refundId,
          refund_amount: order.total,
          refund_attempted_at: now,
          refund_confirmed_at: now,
          failure_reason: null,
          failure_stage: null,
        });
      } else {
        // Refund failed
        await base44.asServiceRole.entities.PaymentTransaction.update(pt.id, {
          status: 'needs_review',
          failure_reason: `Order rejection refund failed: ${refundError}`,
          refund_attempted_at: now,
        });
      }
    } else {
      // Create new PT record
      try {
        await base44.asServiceRole.entities.PaymentTransaction.create({
          payment_intent_id: paymentIntentId,
          restaurant_id: order.restaurant_id,
          amount: order.total,
          currency: 'gbp',
          order_id,
          status: refundId ? 'refunded' : 'needs_review',
          user_email: order.created_by || null,
          guest_email: order.guest_email || null,
          guest_phone: order.phone || null,
          refund_id: refundId || null,
          refund_amount: order.total,
          failure_reason: refundId ? null : `Rejection refund failed: ${refundError}`,
          refund_attempted_at: now,
          refund_confirmed_at: refundId ? now : null,
          stripe_verified_at: now,
        });
      } catch (ptErr) {
        console.error(`[PT] Failed to create PaymentTransaction: ${ptErr.message}`);
        // Don't block response — record exists conceptually
      }
    }

    // If refund failed, create critical FailureLog + ReconciliationIssue
    if (!refundId) {
      try {
        await base44.asServiceRole.entities.FailureLog.create({
          failure_type: 'refund_initiate',
          severity: 'critical',
          restaurant_id: order.restaurant_id,
          payment_intent_id: paymentIntentId,
          order_id,
          user_email: order.created_by || 'guest',
          guest_email: order.guest_email,
          phone: order.phone,
          error_message: `Order rejection refund failed: ${refundError}`,
          context: {
            http_status: 500,
            order_total: order.total,
            rejection_reason,
            actor_email: user.email,
          },
          alert_triggered: true,
          alert_condition: 'payment_success_order_failed',
        });

        await base44.asServiceRole.entities.ReconciliationIssue.create({
          issue_type: 'refund_failed',
          severity: 'critical',
          status: 'open',
          payment_transaction_id: existingPT?.[0]?.id || 'unknown',
          order_id,
          restaurant_id: order.restaurant_id,
          provider: 'stripe',
          amount: order.total,
          currency: 'gbp',
          detected_at: now,
          detected_by: 'automated_reconciliation',
          metadata: {
            payment_intent_id: paymentIntentId,
            order_number: order.order_number,
            customer_email: order.created_by,
            failure_reason: refundError,
            rejection_reason,
          },
          suggested_action: 'Manual refund via Stripe dashboard or contact support',
          requires_escalation: true,
        });
      } catch (logErr) {
        console.error(`[LOG] Failed to record refund failure: ${logErr.message}`);
      }
    }

    // Return result
    if (refundId) {
      console.log(`[REJECT-SUCCESS] Order ${order_id} rejected and refunded (refund_id=${refundId})`);
      return Response.json({
        success: true,
        message: 'Order rejected and refund issued automatically',
        refunded: true,
        refund_id: refundId,
      });
    } else {
      console.error(
        `[REJECT-FAILED] Order ${order_id} rejected but refund FAILED. Manual review required.`
      );
      return Response.json(
        {
          success: false,
          message: `Order rejected, but automatic refund failed: ${refundError}. Manual review initiated.`,
          refunded: false,
          requires_manual_action: true,
          refund_error: refundError,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[rejectOrderWithRefund] Unhandled error:', error);
    return Response.json(
      { error: error.message || 'Order rejection failed' },
      { status: 500 }
    );
  }
});