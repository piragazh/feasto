/**
 * confirmKioskPayment — Hardened kiosk payment confirmation
 *
 * SECURITY REQUIREMENTS:
 *   1. Only kiosk orders with payment_method='pay_at_counter' and status='pending' can be confirmed
 *   2. Card-terminal authorized orders (payment_method='card') are rejected immediately
 *   3. Actor identity (staff email) is recorded
 *   4. Timestamp is recorded
 *   5. Full audit trail is maintained
 *   6. Status transitions to 'confirmed', triggering kitchen print
 *   7. Authenticated user required (no guest confirmation)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // ── Authenticate & authorize ──────────────────────────────────────────
        if (!user) {
            return Response.json(
                { error: 'Unauthorized: Must be logged in' },
                { status: 401 }
            );
        }

        // Only staff roles can confirm payment (not customer)
        const allowedRoles = ['admin', 'manager', 'cashier', 'waiter', 'kitchen_staff'];
        if (!allowedRoles.includes(user.role)) {
            return Response.json(
                { error: `Forbidden: Role '${user.role}' cannot confirm payments` },
                { status: 403 }
            );
        }

        // ── Parse request body ────────────────────────────────────────────────
        const { order_id } = await req.json();

        if (!order_id || typeof order_id !== 'string') {
            return Response.json(
                { error: 'Invalid request: order_id required' },
                { status: 400 }
            );
        }

        // ── Fetch order & validate state ──────────────────────────────────────
        const orders = await base44.asServiceRole.entities.Order.filter({
            id: order_id
        });

        if (!orders || orders.length === 0) {
            return Response.json(
                { error: `Order not found: ${order_id}` },
                { status: 404 }
            );
        }

        const order = orders[0];

        // CRITICAL: Only kiosk orders can use this endpoint
        if (order.order_source !== 'kiosk') {
            return Response.json(
                { error: `Forbidden: Order source '${order.order_source}' is not kiosk` },
                { status: 403 }
            );
        }

        // CRITICAL: Only counter-pay orders need manual confirmation
        // Card-terminal orders are pre-authorized and should never reach this flow
        if (order.payment_method !== 'pay_at_counter') {
            return Response.json(
                { error: `Invalid state: Order payment_method is '${order.payment_method}', not 'pay_at_counter'` },
                { status: 409 }
            );
        }

        // CRITICAL: Order must be pending (not already confirmed or failed)
        if (order.status !== 'pending') {
            return Response.json(
                { error: `Invalid state: Order status is '${order.status}', not 'pending'` },
                { status: 409 }
            );
        }

        // ── Record audit entry ────────────────────────────────────────────────
        const timestamp = new Date().toISOString();
        const auditEntry = {
            action: 'payment_confirmed_at_counter',
            actor_email: user.email,
            actor_name: user.full_name || 'Unknown',
            actor_role: user.role,
            timestamp,
            note: `Kiosk counter-payment confirmed by ${user.full_name || user.email}`,
        };

        const existingAudit = order.payment_audit_trail || [];
        const newAuditTrail = [...existingAudit, auditEntry];

        // ── Update status history ─────────────────────────────────────────────
        const existingStatusHistory = order.status_history || [];
        const newStatusHistory = [
            ...existingStatusHistory,
            {
                status: 'confirmed',
                timestamp,
                note: auditEntry.note,
            },
        ];

        // ── Perform atomic update ─────────────────────────────────────────────
        const updated = await base44.asServiceRole.entities.Order.update(
            order_id,
            {
                status: 'confirmed',
                status_history: newStatusHistory,
                payment_audit_trail: newAuditTrail,
                // Optional: Update payment_confirmed_at timestamp
                // This helps with analytics and debugging
                payment_confirmed_at: timestamp,
                payment_confirmed_by: user.email,
            }
        );

        // ── Log the action for security audit ─────────────────────────────────
        // In production, integrate with auditLog function
        console.log(`[PAYMENT_CONFIRMATION] Order: ${order_id}, Actor: ${user.email}, Role: ${user.role}, Time: ${timestamp}`);

        // ── Success response ──────────────────────────────────────────────────
        return Response.json({
            success: true,
            order_id,
            order_number: order.order_number,
            previous_status: 'pending',
            new_status: 'confirmed',
            confirmed_by: user.email,
            confirmed_at: timestamp,
            message: 'Payment confirmed — order sent to kitchen',
        }, { status: 200 });

    } catch (error) {
        console.error('[confirmKioskPayment] Error:', error.message);

        // Don't expose internal error details to client
        return Response.json(
            { error: 'Failed to confirm payment. Please try again or contact support.' },
            { status: 500 }
        );
    }
});