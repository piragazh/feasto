/**
 * POS Manual Discount — server-side enforcement
 *
 * Policy:
 *   - Any authenticated manager for this restaurant can apply discounts up to MANAGER_MAX_PCT (20%)
 *     or MANAGER_MAX_FIXED (£20) without extra approval.
 *   - Discounts above those thresholds require role === 'admin'.
 *   - A structured reason code is always required.
 *   - Every application is written to the audit log.
 *
 * Thresholds (adjust here only — do not scatter in frontend):
 *   MANAGER_MAX_PCT   = 20   (percent)
 *   MANAGER_MAX_FIXED = 20   (GBP)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const MANAGER_MAX_PCT   = 20;   // %  — above this requires admin
const MANAGER_MAX_FIXED = 20;   // £  — above this requires admin

const VALID_REASON_CODES = [
    'customer_complaint',
    'staff_meal',
    'loyalty_gesture',
    'promotional_event',
    'pricing_error_correction',
    'manager_discretion',
    'other',
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
            restaurant_id,
            order_id,       // may be null for pre-submit discount
            discount_type,  // 'percentage' | 'fixed'
            discount_value, // number
            subtotal,       // current cart subtotal (for threshold check)
            reason_code,
            reason_note,    // optional free-text
        } = await req.json();

        // ── Input validation ─────────────────────────────────────────────────────
        if (!restaurant_id) {
            return Response.json({ error: 'restaurant_id required' }, { status: 400 });
        }

        if (!['percentage', 'fixed'].includes(discount_type)) {
            return Response.json({ error: 'discount_type must be percentage or fixed' }, { status: 400 });
        }

        const value = parseFloat(discount_value);
        if (!isFinite(value) || value <= 0) {
            return Response.json({ error: 'discount_value must be a positive number' }, { status: 400 });
        }

        if (discount_type === 'percentage' && value > 100) {
            return Response.json({ error: 'Percentage discount cannot exceed 100%' }, { status: 400 });
        }

        if (!reason_code || !VALID_REASON_CODES.includes(reason_code)) {
            return Response.json({
                error: 'A valid reason_code is required',
                valid_codes: VALID_REASON_CODES,
            }, { status: 400 });
        }

        // ── Tenant check ─────────────────────────────────────────────────────────
        const isAdmin = user.role === 'admin';

        if (!isAdmin) {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true,
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(restaurant_id));
            if (!hasAccess) {
                console.error(`[SECURITY] ${user.email} attempted POS discount for restaurant ${restaurant_id}`);
                return Response.json({ error: 'Access denied to this restaurant' }, { status: 403 });
            }
        }

        // ── Threshold check ───────────────────────────────────────────────────────
        const sub = parseFloat(subtotal) || 0;
        const discountAmount = discount_type === 'percentage'
            ? (sub * value) / 100
            : value;

        const exceedsThreshold =
            (discount_type === 'percentage' && value > MANAGER_MAX_PCT) ||
            (discount_type === 'fixed'      && value > MANAGER_MAX_FIXED);

        if (exceedsThreshold && !isAdmin) {
            console.warn(`[POS-DISCOUNT] Threshold exceeded by ${user.email}: type=${discount_type} value=${value} — requires admin`);
            return Response.json({
                error: `Discounts above ${discount_type === 'percentage' ? `${MANAGER_MAX_PCT}%` : `£${MANAGER_MAX_FIXED}`} require admin approval`,
                requires_admin: true,
            }, { status: 403 });
        }

        // ── Audit log ─────────────────────────────────────────────────────────────
        const auditDetails = {
            restaurant_id,
            order_id: order_id || null,
            discount_type,
            discount_value: value,
            discount_amount: parseFloat(discountAmount.toFixed(2)),
            subtotal: sub,
            reason_code,
            reason_note: reason_note || null,
            actor_role: isAdmin ? 'admin' : 'manager',
            exceeded_threshold: exceedsThreshold,
        };

        console.log(`[AUDIT] POS_DISCOUNT_APPLIED: actor=${user.email} role=${auditDetails.actor_role} restaurant=${restaurant_id} type=${discount_type} value=${value} reason=${reason_code}`);

        try {
            await base44.asServiceRole.entities.DashboardActivity.create({
                user_email: user.email,
                action: 'POS_DISCOUNT_APPLIED',
                resource_type: 'Order',
                resource_id: order_id || null,
                details: JSON.stringify(auditDetails),
                severity: exceedsThreshold ? 'high' : 'info',
            });
        } catch (dbErr) {
            console.warn('[AUDIT] Could not persist POS discount audit log:', dbErr.message);
        }

        return Response.json({
            allowed: true,
            discount_amount: parseFloat(discountAmount.toFixed(2)),
            discount_type,
            discount_value: value,
            reason_code,
        });

    } catch (error) {
        console.error('[POS-DISCOUNT] posApplyDiscount error:', error);
        return Response.json({ error: 'Discount validation failed. Please try again.' }, { status: 500 });
    }
});