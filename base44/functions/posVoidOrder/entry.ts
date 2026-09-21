/**
 * POS Order Void / Cancellation — server-side enforcement
 *
 * Policy:
 *   - Only managers or admins may void a POS order.
 *   - A structured reason code is required.
 *   - Cash orders: void is always permitted by a manager.
 *   - Card orders already charged (payment_method === 'card'): void is permitted by manager,
 *     but a refund_requested_amount is set automatically and flagged for admin review.
 *   - Every void is written to the audit log with before/after status.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const VALID_REASON_CODES = [
    'customer_changed_mind',
    'item_unavailable',
    'duplicate_order',
    'payment_issue',
    'operator_error',
    'restaurant_closed',
    'manager_discretion',
    'other',
];

const VOIDABLE_STATUSES = ['pending', 'confirmed', 'preparing'];

// Mirrors src/lib/posPermissions.js. Functions are self-contained on this
// platform, so this is duplicated rather than imported - keep the two in step.
const DEFAULT_ROLE_PERMISSIONS = {
    waiter: ['order.create', 'table.move'],
    cashier: ['order.create', 'payment.take', 'order.edit', 'discount.apply', 'coupon.apply', 'drawer.no_sale', 'table.move'],
    kitchen_staff: [],
    manager: [
        'order.create', 'order.edit', 'order.void', 'payment.take', 'payment.refund',
        'discount.apply', 'discount.over_limit', 'coupon.apply', 'drawer.no_sale',
        'table.move', 'table.merge', 'reports.view', 'eod.run', 'staff.manage', 'settings.manage',
    ],
};

/**
 * Verify an HMAC-signed token from posVerifyStaffPin or posAuthorizeAction.
 *
 * The UI hides actions a role lacks, but hiding is not enforcement - anyone can
 * call this function directly. This is where the decision is actually made.
 */
async function verifySignedToken(token) {
    try {
        if (!token || typeof token !== 'string') return null;
        const secret = Deno.env.get('STAFF_SESSION_SECRET');
        if (!secret) return null;

        const [body, sig] = token.split('.');
        if (!body || !sig) return null;

        const key = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
        );
        const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
        const expectedHex = Array.from(new Uint8Array(expected))
            .map(b => b.toString(16).padStart(2, '0')).join('');

        if (expectedHex.length !== sig.length) return null;
        let diff = 0;
        for (let i = 0; i < expectedHex.length; i++) diff |= expectedHex.charCodeAt(i) ^ sig.charCodeAt(i);
        if (diff !== 0) return null;

        const payload = JSON.parse(atob(body));
        if (payload.exp && new Date(payload.exp) < new Date()) return null;
        return payload;
    } catch {
        return null;
    }
}

function roleHasPermission(rolePermissions, role, permission) {
    const map = (rolePermissions && Object.keys(rolePermissions).length > 0)
        ? rolePermissions : DEFAULT_ROLE_PERMISSIONS;
    const granted = map[role];
    return Array.isArray(granted) && granted.includes(permission);
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { order_id, reason_code, reason_note, staff_session, override } = await req.json();

        if (!order_id) {
            return Response.json({ error: 'order_id required' }, { status: 400 });
        }

        if (!reason_code || !VALID_REASON_CODES.includes(reason_code)) {
            return Response.json({
                error: 'A valid reason_code is required',
                valid_codes: VALID_REASON_CODES,
            }, { status: 400 });
        }

        // ── Fetch order ───────────────────────────────────────────────────────────
        let orders;
        try {
            orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
        } catch {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }
        if (!orders?.length) {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }
        const order = orders[0];

        // ── Already-terminal guard ────────────────────────────────────────────────
        //
        // There was no check for this, so an order could be voided repeatedly.
        // On a card order each void re-set refund_request_type/amount, producing
        // duplicate refund requests for the same money; on any order it wrote
        // repeated audit entries and could re-cancel an order that had already
        // been settled or refunded.
        if (order.status === 'cancelled') {
            return Response.json({
                error: 'This order has already been voided.',
                already_voided: true,
            }, { status: 409 });
        }
        if (['refunded', 'refund_requested'].includes(order.status)) {
            return Response.json({
                error: 'This order is already in the refund process and cannot be voided.',
            }, { status: 409 });
        }

        // ── Staff permission check ────────────────────────────────────────────────
        //
        // Enforced HERE, not in the UI. usePermissionGate hides the Void button
        // from a role that lacks the permission, but anyone can call this endpoint
        // directly - so the decision has to be made server-side or it isn't made
        // at all.
        //
        // Two ways through:
        //   1. The acting staff member's role holds order.void, or
        //   2. A manager authorised it and posAuthorizeAction issued an override
        //      token bound to this permission and this order.
        //
        // If no session token is present at all the check is skipped: the till is
        // still authenticated as the restaurant, and refusing every void because
        // a staff session expired would stop the restaurant trading. The action is
        // recorded as unattributed instead.
        const session = await verifySignedToken(staff_session);
        if (session) {
            const restaurantsForPerm = await base44.asServiceRole.entities.Restaurant.filter({
                id: order.restaurant_id,
            });
            const rolePermissions = restaurantsForPerm?.[0]?.role_permissions;
            const permitted = roleHasPermission(rolePermissions, session.role, 'order.void');

            if (!permitted) {
                const ovr = await verifySignedToken(override);
                const validOverride = ovr
                    && ovr.kind === 'override'
                    && ovr.permission === 'order.void'
                    && ovr.restaurant_id === order.restaurant_id
                    && (!ovr.order_id || ovr.order_id === order_id);

                if (!validOverride) {
                    console.warn(`[POS-VOID] denied: ${session.staff_name} (${session.role}) lacks order.void, no valid override. order=${order_id}`);
                    try {
                        await base44.asServiceRole.entities.PosAuditLog.create({
                            restaurant_id: order.restaurant_id,
                            action: 'order.void',
                            outcome: 'denied',
                            staff_id: session.staff_id,
                            staff_name: session.staff_name,
                            staff_role: session.role,
                            order_id,
                            amount: order.total,
                            detail: 'Attempted void without permission or a valid manager override',
                        });
                    } catch { /* audit failure must not change the decision */ }

                    return Response.json({
                        error: 'You are not permitted to void orders. Ask a manager to authorise it.',
                        requires_override: true,
                        permission: 'order.void',
                    }, { status: 403 });
                }
            }
        }

        // ── Tenant check ──────────────────────────────────────────────────────────
        const isAdmin = user.role === 'admin';

        if (!isAdmin) {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true,
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(order.restaurant_id));
            if (!hasAccess) {
                console.error(`[SECURITY] ${user.email} attempted void on order ${order_id} (restaurant ${order.restaurant_id})`);
                return Response.json({ error: 'Access denied to this order' }, { status: 403 });
            }
        }

        // ── Status guard ──────────────────────────────────────────────────────────
        if (!VOIDABLE_STATUSES.includes(order.status)) {
            return Response.json({
                error: `Cannot void an order with status "${order.status}". Only ${VOIDABLE_STATUSES.join(', ')} orders can be voided.`,
            }, { status: 400 });
        }

        // ── Build update ──────────────────────────────────────────────────────────
        const previousStatus = order.status;

        const updatePayload = {
            status: 'cancelled',
            rejection_reason: `[VOID] ${reason_code}${reason_note ? `: ${reason_note}` : ''}`,
            status_history: [
                ...(order.status_history || []),
                {
                    status: 'cancelled',
                    timestamp: new Date().toISOString(),
                    note: `Voided by ${user.email} — reason: ${reason_code}${reason_note ? ` (${reason_note})` : ''}`,
                },
            ],
        };

        // If card order, flag for potential refund review
        const cardPaid = order.payment_method === 'card' && order.total > 0;
        if (cardPaid) {
            updatePayload.refund_request_type = 'full';
            updatePayload.refund_requested_amount = order.total;
            updatePayload.refund_request_reason = reason_code;
            updatePayload.refund_request_description = `Auto-flagged: order voided at POS by ${user.email}. ${reason_note || ''}`;
            updatePayload.refund_request_date = new Date().toISOString();
        }

        await base44.asServiceRole.entities.Order.update(order_id, updatePayload);

        // ── Audit log ─────────────────────────────────────────────────────────────
        const auditDetails = {
            order_id,
            restaurant_id: order.restaurant_id,
            previous_status: previousStatus,
            new_status: 'cancelled',
            reason_code,
            reason_note: reason_note || null,
            payment_method: order.payment_method,
            order_total: order.total,
            card_paid: cardPaid,
            flagged_for_refund_review: cardPaid,
            actor_role: isAdmin ? 'admin' : 'manager',
        };

        console.log(`[AUDIT] POS_ORDER_VOIDED: actor=${user.email} order=${order_id} restaurant=${order.restaurant_id} prev_status=${previousStatus} reason=${reason_code} card_paid=${cardPaid}`);

        try {
            await base44.asServiceRole.entities.DashboardActivity.create({
                user_email: user.email,
                action: 'POS_ORDER_VOIDED',
                resource_type: 'Order',
                resource_id: order_id,
                details: JSON.stringify(auditDetails),
                severity: cardPaid ? 'high' : 'warning',
            });
        } catch (dbErr) {
            console.warn('[AUDIT] Could not persist void audit log:', dbErr.message);
        }

        // ── PosAuditLog: the record the exceptions report reads ─────────────────
        //
        // The DashboardActivity entry above is attributed to user.email - the
        // TILL's account - so it records that "the till" voided an order, never
        // which person did. And it lived in a different entity from every other
        // POS audit event, so no single report could show voids alongside the
        // overrides and failed logins that explain them.
        //
        // This records the actual staff member from the verified session, plus
        // whether a manager override was involved. DashboardActivity is kept for
        // any existing consumer.
        try {
            const ovrPayload = override ? await verifySignedToken(override) : null;
            await base44.asServiceRole.entities.PosAuditLog.create({
                restaurant_id: order.restaurant_id,
                action: 'order.void',
                outcome: ovrPayload ? 'overridden' : 'allowed',
                staff_id: session?.staff_id,
                staff_name: session?.staff_name,
                staff_role: session?.role,
                authorised_by_staff_id: ovrPayload?.approver_id,
                authorised_by_name: ovrPayload?.approver_name,
                order_id,
                amount: Number(order.total || 0),
                reason: reason_code,
                detail: [
                    reason_note ? `Note: ${reason_note}` : null,
                    `Previous status: ${previousStatus}`,
                    cardPaid ? 'Card-paid - flagged for refund review' : null,
                    !session ? 'No staff session - unattributed' : null,
                ].filter(Boolean).join(' · '),
            });
        } catch (auditErr) {
            // Never fail a completed void because the audit write failed.
            console.warn('[AUDIT] Could not persist PosAuditLog void entry:', auditErr?.message);
        }

        return Response.json({
            success: true,
            order_id,
            new_status: 'cancelled',
            card_paid_flagged_for_review: cardPaid,
        });

    } catch (error) {
        console.error('[POS-VOID] posVoidOrder error:', error);
        return Response.json({ error: 'Order void failed. Please try again.' }, { status: 500 });
    }
});