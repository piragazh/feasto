/**
 * posGetCoupons — Returns eligible coupons for a POS session
 *
 * Filters out:
 *   - Inactive coupons (is_active=false)
 *   - Coupons out of their date range (valid_from, valid_until, expires_at)
 *   - Coupons that have hit their global usage_limit
 *
 * Note: per-customer limit checking is NOT done here — it requires a specific
 * customer identity and order context. That check is performed at apply-time
 * in posValidateCoupon / posCreateOrder.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { restaurant_id } = await req.json();

        if (!restaurant_id) {
            return Response.json({ error: 'restaurant_id required' }, { status: 400 });
        }

        // TENANT CHECK: verify caller has access to this restaurant
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(restaurant_id));
            if (!hasAccess) {
                return Response.json({ error: 'Access denied to this restaurant' }, { status: 403 });
            }
        }

        const now = new Date();

        // Return restaurant-specific coupons plus platform-wide coupons (no restaurant_id)
        const allCoupons = await base44.asServiceRole.entities.Coupon.list();

        const eligibleCoupons = allCoupons.filter(c => {
            // Must be active
            if (!c.is_active) return false;

            // Must be scoped to this restaurant or be platform-wide
            if (c.restaurant_id && c.restaurant_id !== restaurant_id) return false;

            // Date range: valid_from
            if (c.valid_from && new Date(c.valid_from) > now) return false;

            // Date range: valid_until
            if (c.valid_until && new Date(c.valid_until) < now) return false;

            // Exact expiry: expires_at (reward coupons)
            if (c.expires_at && new Date(c.expires_at) < now) return false;

            // Global usage limit
            if (c.usage_limit && (c.usage_count || 0) >= c.usage_limit) return false;

            return true;
        });

        return Response.json({ coupons: eligibleCoupons });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});