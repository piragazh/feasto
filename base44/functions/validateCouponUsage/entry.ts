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
        const user = await base44.auth.me();

        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
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

        // CRITICAL: Check per-user coupon usage limit
        // Prevents single user from draining entire coupon budget.
        //
        // FIX: The Order entity stores coupon as coupon_code (singular string),
        // NOT coupon_codes (array). The previous filter used $includes on a non-existent
        // array field, silently returning 0 results every time and making per-customer
        // limits entirely unenforced. Fixed to filter on the correct field.
        if (coupon.per_customer_limit && coupon.per_customer_limit > 0) {
            const userOrders = await base44.asServiceRole.entities.Order.filter({
                created_by: user.email,
                coupon_code: coupon.code
            });

            const userUsageCount = Array.isArray(userOrders) ? userOrders.length : 0;
            
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

        // Check if coupon is expired
        if (!coupon.is_active) {
            return new Response(
                JSON.stringify({ 
                    valid: false,
                    error: 'This coupon is no longer active'
                }),
                { status: 400 }
            );
        }

        // Check usage limit (CRITICAL)
        if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
            return new Response(
                JSON.stringify({ 
                    valid: false,
                    error: 'This coupon has reached its usage limit'
                }),
                { status: 400 }
            );
        }

        // Check expiry dates
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