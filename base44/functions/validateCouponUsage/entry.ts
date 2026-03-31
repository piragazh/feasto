/**
 * Validate coupon hasn't exceeded usage limit
 * CRITICAL: Prevents unlimited coupon usage
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        let user = null;
        try {
            user = await base44.auth.me();
        } catch (_) {
            // Allow unauthenticated (guest) requests — per-customer limit checks skipped
        }

        const { couponId } = await req.json();

        if (!couponId) {
            return new Response(
                JSON.stringify({ error: 'Coupon ID required' }),
                { status: 400 }
            );
        }

        // Reject non-string IDs before hitting the database
        if (typeof couponId !== 'string') {
            return new Response(JSON.stringify({ error: 'Coupon not found' }), { status: 404 });
        }

        // Fetch coupon
        let coupons;
        try {
            coupons = await base44.asServiceRole.entities.Coupon.filter({ id: couponId });
        } catch (e) {
            // Invalid ID format from the DB layer
            return new Response(JSON.stringify({ error: 'Coupon not found' }), { status: 404 });
        }

        if (!coupons || coupons.length === 0) {
            return new Response(
                JSON.stringify({ error: 'Coupon not found' }),
                { status: 404 }
            );
        }

        const coupon = coupons[0];

        // Check if coupon is active FIRST — prevents unnecessary DB queries for inactive coupons
        // and provides correct error message priority
        if (!coupon.is_active) {
            return new Response(
                JSON.stringify({ 
                    valid: false,
                    error: 'This coupon is no longer active'
                }),
                { status: 400 }
            );
        }

        // Check expiry dates early
        const now = new Date();
        if (coupon.valid_from && new Date(coupon.valid_from) > now) {
            return new Response(
                JSON.stringify({ 
                    valid: false,
                    error: 'This coupon is not yet valid'
                }),
                { status: 400 }
            );
        }

        if (coupon.valid_until && new Date(coupon.valid_until) < now) {
            return new Response(
                JSON.stringify({ 
                    valid: false,
                    error: 'This coupon has expired'
                }),
                { status: 400 }
            );
        }

        // Check global usage limit
        if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
            return new Response(
                JSON.stringify({ 
                    valid: false,
                    error: 'This coupon has reached its usage limit'
                }),
                { status: 400 }
            );
        }

        // CRITICAL: Check per-user coupon usage limit (only for authenticated users).
        // Prevents single user from draining entire coupon budget.
        // Guests skip this check — per_customer_limit enforced server-side at order creation.
        //
        // COMPATIBILITY: Orders may be stored with either or both of:
        //   - coupon_code (string): legacy single-code orders AND first code of new stacked orders
        //   - coupon_codes (array): new multi-coupon orders (all applied codes)
        //
        // We query both fields and deduplicate by order ID to avoid double-counting
        // orders that have both fields set (all orders created by the new stacking
        // implementation set both). Without deduplication, a customer who used a
        // code once would appear to have used it twice and be incorrectly blocked.
        if (user && coupon.per_customer_limit && coupon.per_customer_limit > 0) {
            // $all with a single-element array is the correct Base44 operator for
            // "array field contains this value". $contains is NOT supported.
            const [legacyOrders, arrayOrders] = await Promise.all([
                base44.asServiceRole.entities.Order.filter({
                    created_by: user.email,
                    coupon_code: coupon.code,
                }),
                base44.asServiceRole.entities.Order.filter({
                    created_by: user.email,
                    coupon_codes: { $all: [coupon.code] },
                }),
            ]);

            // Deduplicate by order ID — new orders have both fields, legacy only have coupon_code
            const uniqueOrderIds = new Set();
            for (const o of (legacyOrders || [])) uniqueOrderIds.add(o.id);
            for (const o of (arrayOrders || [])) uniqueOrderIds.add(o.id);
            const userUsageCount = uniqueOrderIds.size;
            
            if (userUsageCount >= coupon.per_customer_limit) {
                return new Response(
                    JSON.stringify({ 
                        valid: false,
                        error: `You have reached the usage limit for this coupon (${coupon.per_customer_limit} use${coupon.per_customer_limit === 1 ? '' : 's'} per customer)`
                    }),
                    { status: 400 }
                );
            }
        }



        return new Response(
            JSON.stringify({ 
                valid: true,
                coupon: {
                    id: coupon.id,
                    code: coupon.code,
                    discount_type: coupon.discount_type,
                    discount_value: coupon.discount_value,
                    maximum_discount: coupon.max_discount,
                    minimum_order: coupon.minimum_order
                }
            }),
            { status: 200 }
        );

    } catch (error) {
        console.error('Coupon validation error:', error);
        return new Response(
            JSON.stringify({ error: 'Coupon validation failed. Please try again.' }),
            { status: 500 }
        );
    }
});