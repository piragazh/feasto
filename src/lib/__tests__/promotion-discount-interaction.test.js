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