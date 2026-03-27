/**
 * Server-side promotion validation and discount computation
 * 
 * SECURITY: Validates active promotion exists and computes discount server-side.
 * Client-supplied promotion_code and discount_amount are NEVER trusted.
 * 
 * Returns: { valid: true, discount, promotion } or { valid: false, error }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const { promotion_id, restaurant_id, server_subtotal, delivery_fee } = await req.json();

        // ── INPUT VALIDATION ─────────────────────────────────────────────────────
        if (!promotion_id || typeof promotion_id !== 'string') {
            return new Response(
                JSON.stringify({ valid: false, error: 'Invalid promotion ID' }),
                { status: 400 }
            );
        }

        if (!restaurant_id || typeof restaurant_id !== 'string') {
            return new Response(
                JSON.stringify({ valid: false, error: 'Invalid restaurant ID' }),
                { status: 400 }
            );
        }

        if (typeof server_subtotal !== 'number' || server_subtotal < 0) {
            return new Response(
                JSON.stringify({ valid: false, error: 'Invalid subtotal' }),
                { status: 400 }
            );
        }

        // ── FETCH PROMOTION RECORD ────────────────────────────────────────────────
        const promotions = await base44.asServiceRole.entities.Promotion.filter({ id: promotion_id });
        if (!promotions || promotions.length === 0) {
            console.warn(`[PROMO] Promotion not found: id=${promotion_id}`);
            return new Response(
                JSON.stringify({ valid: false, error: 'Promotion not found' }),
                { status: 400 }
            );
        }

        const promotion = promotions[0];

        // ── ACTIVE STATUS CHECK ──────────────────────────────────────────────────
        if (!promotion.is_active) {
            console.warn(`[PROMO] Promotion inactive: id=${promotion_id} name=${promotion.name}`);
            return new Response(
                JSON.stringify({ valid: false, error: 'Promotion is no longer active' }),
                { status: 400 }
            );
        }

        // ── RESTAURANT SCOPE CHECK ───────────────────────────────────────────────
        if (promotion.restaurant_id && promotion.restaurant_id !== restaurant_id) {
            console.warn(`[PROMO] Restaurant mismatch: promo=${promotion.restaurant_id} requested=${restaurant_id}`);
            return new Response(
                JSON.stringify({ valid: false, error: 'Promotion not valid for this restaurant' }),
                { status: 400 }
            );
        }

        // ── DATE RANGE CHECK ─────────────────────────────────────────────────────
        const now = new Date();
        if (promotion.start_date && new Date(promotion.start_date) > now) {
            console.warn(`[PROMO] Promotion not yet valid: id=${promotion_id}`);
            return new Response(
                JSON.stringify({ valid: false, error: 'Promotion is not yet available' }),
                { status: 400 }
            );
        }

        if (promotion.end_date && new Date(promotion.end_date) < now) {
            console.warn(`[PROMO] Promotion expired: id=${promotion_id}`);
            return new Response(
                JSON.stringify({ valid: false, error: 'Promotion has expired' }),
                { status: 400 }
            );
        }

        // ── USAGE LIMIT CHECK ────────────────────────────────────────────────────
        if (promotion.usage_limit && (promotion.usage_count || 0) >= promotion.usage_limit) {
            console.warn(`[PROMO] Usage limit reached: id=${promotion_id} count=${promotion.usage_count}`);
            return new Response(
                JSON.stringify({ valid: false, error: 'Promotion usage limit reached' }),
                { status: 400 }
            );
        }

        // ── MINIMUM ORDER CHECK ──────────────────────────────────────────────────
        if (promotion.condition_type === 'minimum_order' && promotion.minimum_order > 0) {
            if (server_subtotal < promotion.minimum_order) {
                console.warn(`[PROMO] Below minimum: id=${promotion_id} min=${promotion.minimum_order} subtotal=${server_subtotal}`);
                return new Response(
                    JSON.stringify({
                        valid: false,
                        error: `Minimum order of £${promotion.minimum_order.toFixed(2)} required for this promotion`
                    }),
                    { status: 400 }
                );
            }
        }

        // ── COMPUTE DISCOUNT SERVER-SIDE ─────────────────────────────────────────
        // CRITICAL: Never trust client-supplied discount amounts
        let discount = 0;
        const dFee = typeof delivery_fee === 'number' ? delivery_fee : 0;

        switch (promotion.promotion_type) {
            case 'percentage_off':
                discount = (server_subtotal * promotion.discount_value) / 100;
                if (promotion.max_discount) {
                    discount = Math.min(discount, promotion.max_discount);
                }
                break;

            case 'fixed_amount_off':
                discount = promotion.discount_value || 0;
                break;

            case 'free_delivery':
                discount = Math.min(promotion.discount_value || dFee, dFee);
                break;

            case 'buy_one_get_one':
            case 'buy_two_get_one':
            case 'combo_deal':
                // These are item-level promotions; not handled here
                // Return 0 discount (handled differently in order creation)
                discount = 0;
                break;

            case 'tiered_discount':
                // Find applicable tier
                if (promotion.tiered_discounts && Array.isArray(promotion.tiered_discounts)) {
                    for (const tier of promotion.tiered_discounts) {
                        if (server_subtotal >= (tier.min_order_value || 0)) {
                            if (tier.discount_type === 'percentage') {
                                discount = (server_subtotal * tier.discount_value) / 100;
                            } else {
                                discount = tier.discount_value || 0;
                            }
                        }
                    }
                }
                break;

            default:
                discount = 0;
        }

        // Cap discount at 50% of subtotal (max allowable discount)
        const maxDiscount = server_subtotal * 0.5;
        discount = Math.min(Math.max(0, discount), maxDiscount);

        // Never discount below 0
        discount = Math.max(0, discount);

        console.log(`[PROMO] Validated: id=${promotion_id} name=${promotion.name} type=${promotion.promotion_type} discount=£${discount.toFixed(2)} subtotal=£${server_subtotal.toFixed(2)}`);

        return new Response(
            JSON.stringify({
                valid: true,
                discount: Number(discount.toFixed(2)),
                promotion: {
                    id: promotion.id,
                    name: promotion.name,
                    type: promotion.promotion_type,
                    description: promotion.description
                }
            }),
            { status: 200 }
        );

    } catch (error) {
        console.error('[PROMO] Validation error:', error);
        return new Response(
            JSON.stringify({ valid: false, error: 'Promotion validation failed' }),
            { status: 500 }
        );
    }
});