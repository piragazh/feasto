/**
 * C) PROMOTION / DISCOUNT INTERACTION
 *
 * Tests that:
 * - restaurant-controlled promotion discounts are capped safely on the server
 * - coupon + promotion are applied with correct order of operations
 * - no double-discounting occurs
 * - the final total is always consistent with the discount applied
 */

import { describe, it, expect } from 'vitest';
import {
    capPromotionDiscount,
    validateCoupon,
    resolveCouponDiscount,
    computeAndVerifyTotal,
} from '../order-logic.js';

const SUBTOTAL = 50.00;
const DELIVERY = 3.50;

const baseCoupon = (overrides = {}) => ({
    id: 'c1',
    code: 'PROMO10',
    is_active: true,
    discount_type: 'percentage',
    discount_value: 10,
    max_discount: null,
    minimum_order: null,
    usage_limit: null,
    usage_count: 0,
    valid_from: null,
    valid_until: null,
    restaurant_id: null,
    ...overrides,
});

describe('capPromotionDiscount', () => {
    it('passes through a normal promotion discount unchanged', () => {
        const safe = capPromotionDiscount(5.00, SUBTOTAL);
        expect(safe).toBe(5.00);
    });

    it('caps promotion discount at 50% of subtotal', () => {
        // £35 promotion on a £50 order would be 70% — capped to 50% = £25
        const safe = capPromotionDiscount(35.00, SUBTOTAL);
        expect(safe).toBe(25.00);
    });

    it('never returns negative discount', () => {
        const safe = capPromotionDiscount(-10.00, SUBTOTAL);
        expect(safe).toBe(0);
    });

    it('returns 0 when subtotal is 0', () => {
        const safe = capPromotionDiscount(5.00, 0);
        expect(safe).toBe(0);
    });

    it('accepts exactly 50% of subtotal without capping', () => {
        const safe = capPromotionDiscount(25.00, SUBTOTAL);
        expect(safe).toBe(25.00);
    });
});

describe('Promotion + single coupon interaction', () => {
    it('coupon discount is applied on top of subtotal independently — no double-counting', () => {
        // Promotion: £5 off (restaurant-controlled, applied to subtotal before total calc)
        const promotionDiscount = capPromotionDiscount(5.00, SUBTOTAL);
        // Coupon: 10% off subtotal (NOT off the already-discounted total)
        const couponResult = validateCoupon(baseCoupon(), SUBTOTAL, 'rest-1');

        const totalDiscount = promotionDiscount + couponResult.discount;
        const { serverTotal } = computeAndVerifyTotal(
            { serverSubtotal: SUBTOTAL, deliveryFee: DELIVERY, discount: totalDiscount },
            SUBTOTAL + DELIVERY - totalDiscount
        );

        // £50 subtotal + £3.50 delivery - £5 promo - £5 coupon (10%) = £43.50
        expect(serverTotal).toBeCloseTo(43.50);
    });

    it('combined discount cannot push total below zero', () => {
        // Extreme: 50% promo cap + 100% coupon on a tiny order
        const promotionDiscount = capPromotionDiscount(999, 10.00);   // capped at £5
        const couponResult = validateCoupon(
            baseCoupon({ discount_type: 'fixed', discount_value: 999 }),
            10.00,
            'rest-1'
        );
        // coupon discount is capped at subtotal (£10)
        const totalDiscount = promotionDiscount + couponResult.discount;
        const { serverTotal } = computeAndVerifyTotal(
            { serverSubtotal: 10.00, deliveryFee: 0, discount: totalDiscount },
            0 // client says £0
        );
        expect(serverTotal).toBe(0);
    });

    it('order of operations: discount is subtracted from subtotal+fee, not from each other', () => {
        // SUBTOTAL=£40, FEE=£3, PROMO=£4, COUPON=10% of subtotal=£4
        const subtotal = 40.00;
        const fee = 3.00;
        const promoDiscount = capPromotionDiscount(4.00, subtotal);
        const couponDiscount = validateCoupon(
            baseCoupon({ discount_value: 10 }), subtotal, 'rest-1'
        ).discount;

        // Both discounts come off (subtotal + fee), not cascaded
        const totalDiscount = promoDiscount + couponDiscount;
        const { serverTotal } = computeAndVerifyTotal(
            { serverSubtotal: subtotal, deliveryFee: fee, discount: totalDiscount },
            subtotal + fee - totalDiscount
        );
        // £40 + £3 - £4 - £4 = £35
        expect(serverTotal).toBeCloseTo(35.00);
    });

    it('server total matches expected payment when coupon + promotion applied', () => {
        const couponDiscount = validateCoupon(baseCoupon({ discount_value: 20 }), SUBTOTAL, 'rest-1').discount;
        const promoDiscount = capPromotionDiscount(3.00, SUBTOTAL);
        const expectedClientTotal = SUBTOTAL + DELIVERY - couponDiscount - promoDiscount;

        const { serverTotal, mismatch } = computeAndVerifyTotal(
            { serverSubtotal: SUBTOTAL, deliveryFee: DELIVERY, discount: couponDiscount + promoDiscount },
            expectedClientTotal
        );

        expect(mismatch).toBe(false);
        expect(serverTotal).toBeCloseTo(expectedClientTotal);
    });
});

// ─── Promotion + stacked coupons ──────────────────────────────────────────────
// Note: the server enforces that a promotion discount (client-supplied) and a coupon stack
// are mutually exclusive on the online checkout path (verifyAndCreateOrder uses one or the
// other, not both). These tests verify the individual mechanisms independently and confirm
// that combined totals are always correctly bounded.

describe('Stacked coupons: discount cap and final total', () => {
    // stackable coupon fixture store
    const makeCouponStore = (coupons) => {
        const map = new Map(coupons.map(c => [c.code, c]));
        return async (code) => map.get(code) ?? null;
    };

    const sc = (code, type, value) => ({
        id: `c-${code}`, code, is_active: true,
        discount_type: type, discount_value: value,
        max_discount: null, minimum_order: null, usage_limit: null,
        usage_count: 0, valid_from: null, valid_until: null, restaurant_id: null,
        stackable: true,
    });

    it('promotion + 1 stackable coupon: they are applied independently (not cascaded)', async () => {
        // Promotion: £5 off (server caps it). Coupon: 10% of SUBTOTAL=£50 → £5.
        // Total discount: £10. Final: £50 + £3.50 - £10 = £43.50.
        const promoDiscount = capPromotionDiscount(5.00, SUBTOTAL);
        const couponResult = await resolveCouponDiscount(
            ['PCT10'], SUBTOTAL, 'rest-1', makeCouponStore([sc('PCT10', 'percentage', 10)])
        );
        const totalDiscount = promoDiscount + couponResult.discount;
        const { serverTotal } = computeAndVerifyTotal(
            { serverSubtotal: SUBTOTAL, deliveryFee: DELIVERY, discount: totalDiscount },
            SUBTOTAL + DELIVERY - totalDiscount
        );
        expect(serverTotal).toBeCloseTo(43.50);
    });

    it('promotion + 2 stackable coupons: all three amounts combined without cascading', async () => {
        // Promo £3, coupon PCT10=£5, coupon FIX2=£2. Total discount=£10. Final=£50+£3.50-£10=£43.50.
        const promoDiscount = capPromotionDiscount(3.00, SUBTOTAL);
        const couponResult = await resolveCouponDiscount(
            ['PCT10', 'FIX2'],
            SUBTOTAL, 'rest-1',
            makeCouponStore([sc('PCT10', 'percentage', 10), sc('FIX2', 'fixed', 2)])
        );
        const totalDiscount = promoDiscount + couponResult.discount;
        const { serverTotal } = computeAndVerifyTotal(
            { serverSubtotal: SUBTOTAL, deliveryFee: DELIVERY, discount: totalDiscount },
            SUBTOTAL + DELIVERY - totalDiscount
        );
        // £50 + £3.50 - £3 - £5 - £2 = £43.50
        expect(serverTotal).toBeCloseTo(43.50);
    });

    it('promotion + 3 stackable coupons: total discount still bounded by total order value', async () => {
        // Subtotal=£10. Promo=capPromotionDiscount(£6,£10)=£5. Coupons: PCT30=£3, FIX2=£2, FIX2B=£2.
        // Coupon cap=50% of 10=£5. PCT30 takes £3, FIX2 takes £2 → cap hit. FIX2B contributes £0.
        // Coupon discount=£5. Total discount=£10. Final=£10-£10=£0 (no delivery in this test).
        const subtotal = 10.00;
        const promoDiscount = capPromotionDiscount(6.00, subtotal); // £5
        const couponResult = await resolveCouponDiscount(
            ['PCT30', 'FIX2', 'FIX2B'],
            subtotal, 'rest-1',
            makeCouponStore([sc('PCT30', 'percentage', 30), sc('FIX2', 'fixed', 2), sc('FIX2B', 'fixed', 2)])
        );
        expect(couponResult.error).toBeNull();
        expect(couponResult.discount).toBeCloseTo(5.00); // capped at 50%

        const totalDiscount = promoDiscount + couponResult.discount;
        const { serverTotal } = computeAndVerifyTotal(
            { serverSubtotal: subtotal, deliveryFee: 0, discount: totalDiscount },
            0 // client says £0
        );
        expect(serverTotal).toBe(0); // Math.max(0, ...) prevents negative
    });

    it('50% cap on coupon stack is computed against original subtotal, not post-promo subtotal', async () => {
        // Verifies discounts are not cascaded. Coupon cap = 50% of SUBTOTAL=£50 → £25.
        const couponResult = await resolveCouponDiscount(
            ['PCT40', 'PCT30'],
            SUBTOTAL, 'rest-1',
            makeCouponStore([sc('PCT30', 'percentage', 30), sc('PCT40', 'percentage', 40)])
        );
        // Sorted alphabetically: PCT30 first. PCT30=30%=£15. PCT40: remaining cap=£25-£15=£10, so contributes £10 (not 40%=£20).
        // Total coupon discount=£25 (50% cap hit).
        expect(couponResult.error).toBeNull();
        expect(couponResult.discount).toBeCloseTo(25.00);
    });

    it('final total never negative with promo + stacked coupons on tiny order', async () => {
        const subtotal = 3.00;
        const promoDiscount = capPromotionDiscount(2.00, subtotal); // £1.50 capped
        const couponResult = await resolveCouponDiscount(
            ['BIG10'], subtotal, 'rest-1',
            makeCouponStore([sc('BIG10', 'fixed', 10)])
        );
        // BIG10 coupon: £10 off, but coupon cap=50%=£1.50. Discount=£1.50.
        expect(couponResult.discount).toBeCloseTo(1.50);

        const totalDiscount = promoDiscount + couponResult.discount;
        const { serverTotal } = computeAndVerifyTotal(
            { serverSubtotal: subtotal, deliveryFee: 0, discount: totalDiscount },
            0
        );
        expect(serverTotal).toBe(0);
    });
});