/**
 * Server-Side Promotion Validation & Discount Calculation
 * =========================================================
 * Validates promotion eligibility and calculates discount server-side.
 * Rejects all client-supplied discount amounts.
 *
 * Security model:
 * - Client sends: { promotion_id, restaurant_id, subtotal }
 * - Server validates: promotion exists, is active, restaurant matches, minimum met
 * - Server calculates: discount amount based on promotion rules
 * - Server returns: { discount_amount, validation_ok }
 * - Server rejects: fake promotions, expired, inactive, or non-existent
 *
 * Invariant: All promotional discounts originate from validated DB records.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Universal cap: no single promotional discount can exceed 50% of subtotal
const MAX_PROMOTIONAL_DISCOUNT_PERCENTAGE = 50;

Deno.serve(async (req) => {
    try {
        if (req.method !== 'POST') {
            return Response.json({ error: 'POST only' }, { status: 405 });
        }

        const base44 = createClientFromRequest(req);
        const body = await req.json();

        const { promotion_id, restaurant_id, subtotal } = body;

        // ── Input Validation ──────────────────────────────────────────────────
        if (!promotion_id || typeof promotion_id !== 'string') {
            return Response.json({ error: 'promotion_id required' }, { status: 400 });
        }
        if (!restaurant_id || typeof restaurant_id !== 'string') {
            return Response.json({ error: 'restaurant_id required' }, { status: 400 });
        }
        if (typeof subtotal !== 'number' || subtotal < 0) {
            return Response.json({ error: 'subtotal must be non-negative number' }, { status: 400 });
        }

        // ── Fetch Promotion from Database ─────────────────────────────────────
        const promotions = await base44.asServiceRole.entities.Promotion.filter({
            id: promotion_id
        });

        if (!promotions || promotions.length === 0) {
            return Response.json({
                discount_amount: 0,
                validation_ok: false,
                reason: 'Promotion not found'
            }, { status: 200 });
        }

        const promotion = promotions[0];

        // ── Scope Validation: Restaurant Match ────────────────────────────────
        if (promotion.restaurant_id && promotion.restaurant_id !== restaurant_id) {
            return Response.json({
                discount_amount: 0,
                validation_ok: false,
                reason: 'Promotion not valid for this restaurant'
            }, { status: 200 });
        }

        // ── Active Status Check ───────────────────────────────────────────────
        if (!promotion.is_active) {
            return Response.json({
                discount_amount: 0,
                validation_ok: false,
                reason: 'Promotion is inactive'
            }, { status: 200 });
        }

        // ── Date Range Validation ─────────────────────────────────────────────
        const now = new Date();
        if (promotion.start_date) {
            const startDate = new Date(promotion.start_date);
            if (now < startDate) {
                return Response.json({
                    discount_amount: 0,
                    validation_ok: false,
                    reason: 'Promotion has not started'
                }, { status: 200 });
            }
        }
        if (promotion.end_date) {
            const endDate = new Date(promotion.end_date);
            if (now > endDate) {
                return Response.json({
                    discount_amount: 0,
                    validation_ok: false,
                    reason: 'Promotion has expired'
                }, { status: 200 });
            }
        }

        // ── Minimum Order Requirement ─────────────────────────────────────────
        if (promotion.minimum_order && subtotal < promotion.minimum_order) {
            return Response.json({
                discount_amount: 0,
                validation_ok: false,
                reason: `Minimum order ${promotion.minimum_order} not met`
            }, { status: 200 });
        }

        // ── Usage Limit Check (Global) ────────────────────────────────────────
        if (promotion.usage_limit) {
            const usage_count = promotion.usage_count || 0;
            if (usage_count >= promotion.usage_limit) {
                return Response.json({
                    discount_amount: 0,
                    validation_ok: false,
                    reason: 'Promotion usage limit reached'
                }, { status: 200 });
            }
        }

        // ── Calculate Discount Based on Promotion Type ────────────────────────
        let discountAmount = 0;

        switch (promotion.promotion_type) {
            case 'percentage_off':
                discountAmount = (subtotal * (promotion.discount_value || 0)) / 100;
                // Apply max_discount cap if set
                if (promotion.max_discount && discountAmount > promotion.max_discount) {
                    discountAmount = promotion.max_discount;
                }
                break;

            case 'fixed_amount_off':
                discountAmount = promotion.discount_value || 0;
                break;

            case 'free_delivery':
                // Client will pass delivery_fee separately; server doesn't calculate
                // Just return success; order creation will apply free delivery
                discountAmount = 0;
                break;

            case 'buy_one_get_one':
            case 'buy_two_get_one':
                // Complex BOGO logic handled by caller (UI should already calculate)
                // Server just validates promotion exists
                discountAmount = 0;
                break;

            case 'tiered_discount':
                if (promotion.tiered_discounts && Array.isArray(promotion.tiered_discounts)) {
                    // Find applicable tier
                    const applicableTier = promotion.tiered_discounts
                        .sort((a, b) => (b.min_order_value || 0) - (a.min_order_value || 0))
                        .find(tier => subtotal >= (tier.min_order_value || 0));

                    if (applicableTier) {
                        if (applicableTier.discount_type === 'percentage') {
                            discountAmount = (subtotal * (applicableTier.discount_value || 0)) / 100;
                        } else {
                            discountAmount = applicableTier.discount_value || 0;
                        }
                    }
                }
                break;

            case 'combo_deal':
                // Combo pricing handled by order creation logic
                discountAmount = 0;
                break;

            default:
                return Response.json({
                    discount_amount: 0,
                    validation_ok: false,
                    reason: 'Unknown promotion type'
                }, { status: 200 });
        }

        // ── Apply Universal Safety Cap ────────────────────────────────────────
        const maxAllowedDiscount = (subtotal * MAX_PROMOTIONAL_DISCOUNT_PERCENTAGE) / 100;
        if (discountAmount > maxAllowedDiscount) {
            discountAmount = maxAllowedDiscount;
        }

        // Ensure non-negative
        discountAmount = Math.max(0, discountAmount);

        // Round to 2 decimal places
        discountAmount = Math.round(discountAmount * 100) / 100;

        // ── Return Success ────────────────────────────────────────────────────
        return Response.json({
            discount_amount: discountAmount,
            validation_ok: true,
            promotion_id: promotion.id,
            promotion_name: promotion.name,
            reason: 'Promotion applied'
        }, { status: 200 });

    } catch (error) {
        console.error('[validateAndApplyPromotion] Error:', error);
        return Response.json(
            { error: error.message, validation_ok: false },
            { status: 500 }
        );
    }
});