/**
 * Audit log for sensitive operational actions — authenticated writes only.
 *
 * Unlike the generic auditLog function (which accepts anonymous writes for UI events),
 * this endpoint requires an authenticated user and is used for:
 *   - Coupon create / edit / delete
 *   - Staff role changes / deactivation / removal
 *   - Restaurant setting changes that affect pricing or orders
 *   - Loyalty balance adjustments
 *
 * The actor's identity and role are resolved server-side and cannot be spoofed.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const VALID_ACTIONS = [
    'COUPON_CREATED',
    'COUPON_UPDATED',
    'COUPON_DELETED',
    'STAFF_ADDED',
    'STAFF_ROLE_CHANGED',
    'STAFF_DEACTIVATED',
    'STAFF_REMOVED',
    'LOYALTY_POINTS_ADJUSTED',
    'RESTAURANT_SETTINGS_CHANGED',
    'REFUND_REJECTED',
    'REFUND_APPROVED',
    'POS_DISCOUNT_APPLIED',
    'POS_ORDER_VOIDED',
    'PLATFORM_REFUND_OVERRIDE',
    'ORDER_CANCELLED',
];

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

        const {
            action,
            resource_type,
            resource_id,
            restaurant_id,
            before_value,
            after_value,
            reason_code,
            reason_note,
            severity = 'info',
        } = await req.json();

        if (!action || !resource_type) {
            return Response.json({ error: 'action and resource_type are required' }, { status: 400 });
        }

        if (!VALID_ACTIONS.includes(action)) {
            return Response.json({
                error: 'Unrecognised action',
                valid_actions: VALID_ACTIONS,
            }, { status: 400 });
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            actor_email: user.email,
            actor_role: user.role || 'user',
            action,
            resource_type,
            resource_id: resource_id || null,
            restaurant_id: restaurant_id || null,
            before_value: before_value || null,
            after_value: after_value || null,
            reason_code: reason_code || null,
            reason_note: reason_note || null,
            severity,
            ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        };

        console.log(`[AUDIT-SENSITIVE] ${severity.toUpperCase()}: actor=${user.email}(${user.role}) action=${action} on ${resource_type}${resource_id ? `(${resource_id})` : ''} restaurant=${restaurant_id || 'n/a'} reason=${reason_code || 'n/a'}`);

        try {
            await base44.asServiceRole.entities.DashboardActivity.create({
                user_email: user.email,
                action,
                resource_type,
                resource_id,
                details: JSON.stringify(logEntry),
                severity,
            });
        } catch (dbErr) {
            // Never fail the caller because the audit write failed — log to console at minimum
            console.error('[AUDIT-SENSITIVE] DB write failed:', dbErr.message);
        }

        return Response.json({ success: true });

    } catch (error) {
        console.error('[AUDIT-SENSITIVE] auditSensitiveAction error:', error);
        return Response.json({ error: 'Audit log failed' }, { status: 500 });
    }
});