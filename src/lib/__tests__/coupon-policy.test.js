/**
 * B) COUPON POLICY
 *
 * Tests the one-coupon-per-order policy, expiry, minimum spend,
 * restaurant scoping, discount cap rules, per-customer limits,
 * and the expires_at field used by reward coupons.
 *
 * SYNC NOTE: These tests cover the pure-function mirror of the logic
 * in functions/verifyAndCreateOrder. Any change to the Deno handler's
 * coupon block MUST be reflected here and vice versa.
 */

import { describe, it, expect, vi } from 'vitest';
import { validateCoupon, checkPerCustomerLimit, resolveCouponDiscount } from '../order-logic.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const RESTAURANT_A = 'rest-aaa';
const RESTAURANT_B = 'rest-bbb';
const SUBTOTAL = 40.00;

const baseCoupon = (overrides = {}) => ({
    id: 'coupon-1',
    code: 'SAVE10',
    is_active: true,
    discount_type: 'percentage',
    discount_value: 10,
    max_discount: null,
    minimum_order: null,
    usage_limit: null,
    usage_count: 0,
    valid_from: null,
    valid_until: null,
    restaurant_id: null, // platform-wide by default
    ...overrides,
});

const past = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
};

const future = (daysAhead) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString();
};

// Inject helper: sync getCoupon for resolveCouponDiscount tests
const makeCouponStore = (coupon) => async (code) => {
    if (coupon && coupon.code === code) return coupon;
    return null;
};

// ─── validateCoupon ───────────────────────────────────────────────────────────

describe('validateCoupon', () => {
    it('accepts a valid platform-wide percentage coupon', () => {
        const result = validateCoupon(baseCoupon(), SUBTOTAL, RESTAURANT_A);
        expect(result.valid).toBe(true);
        expect(result.discount).toBeCloseTo(4.00); // 10% of £40
    });

    it('rejects an inactive coupon', () => {
        const result = validateCoupon(baseCoupon({ is_active: false }), SUBTOTAL, RESTAURANT_A);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('inactive');
        expect(result.discount).toBe(0);
    });

    it('rejects a coupon that has not started yet', () => {
        const result = validateCoupon(baseCoupon({ valid_from: future(2) }), SUBTOTAL, RESTAURANT_A);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('not_yet_valid');
    });

    it('rejects an expired coupon', () => {
        const result = validateCoupon(baseCoupon({ valid_until: past(1) }), SUBTOTAL, RESTAURANT_A);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('expired');
    });

    it('rejects when global usage_limit is reached', () => {
        const result = validateCoupon(
            baseCoupon({ usage_limit: 100, usage_count: 100 }),
            SUBTOTAL, RESTAURANT_A
        );
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('usage_limit_reached');
    });

    it('accepts when usage_count is exactly one below the limit', () => {
        const result = validateCoupon(
            baseCoupon({ usage_limit: 100, usage_count: 99 }),
            SUBTOTAL, RESTAURANT_A
        );
        expect(result.valid).toBe(true);
    });

    it('rejects when order subtotal is below minimum_order', () => {
        const result = validateCoupon(
            baseCoupon({ minimum_order: 50.00 }),
            SUBTOTAL, // £40 < £50
            RESTAURANT_A
        );
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('below_minimum_order');
    });

    it('accepts when subtotal equals minimum_order exactly', () => {
        const result = validateCoupon(
            baseCoupon({ minimum_order: 40.00 }),
            40.00,
            RESTAURANT_A
        );
        expect(result.valid).toBe(true);
    });

    it('rejects a restaurant-scoped coupon when used on a different restaurant', () => {
        const result = validateCoupon(
            baseCoupon({ restaurant_id: RESTAURANT_A }),
            SUBTOTAL,
            RESTAURANT_B
        );
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('wrong_restaurant');
    });

    it('accepts a restaurant-scoped coupon on the correct restaurant', () => {
        const result = validateCoupon(
            baseCoupon({ restaurant_id: RESTAURANT_A }),
            SUBTOTAL,
            RESTAURANT_A
        );
        expect(result.valid).toBe(true);
    });

    it('caps percentage discount at max_discount', () => {
        // 50% of £40 = £20, but cap is £8
        const result = validateCoupon(
            baseCoupon({ discount_type: 'percentage', discount_value: 50, max_discount: 8 }),
            SUBTOTAL, RESTAURANT_A
        );
        expect(result.valid).toBe(true);
        expect(result.discount).toBeCloseTo(8.00);
    });

    it('discount cannot exceed the subtotal (fixed coupon larger than order)', () => {
        // £100 fixed discount on a £40 order → capped at £40
        const result = validateCoupon(
            baseCoupon({ discount_type: 'fixed', discount_value: 100 }),
            SUBTOTAL, RESTAURANT_A
        );
        expect(result.valid).toBe(true);
        expect(result.discount).toBe(SUBTOTAL);
    });

    it('calculates fixed discount correctly', () => {
        const result = validateCoupon(
            baseCoupon({ discount_type: 'fixed', discount_value: 5.00 }),
            SUBTOTAL, RESTAURANT_A
        );
        expect(result.valid).toBe(true);
        expect(result.discount).toBe(5.00);
    });

    it('rejects when expires_at (reward coupon) timestamp has passed', () => {
        const result = validateCoupon(
            baseCoupon({ expires_at: past(1) }),
            SUBTOTAL, RESTAURANT_A
        );
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('expired');
    });

    it('accepts when expires_at is in the future', () => {
        const result = validateCoupon(
            baseCoupon({ expires_at: future(2) }),
            SUBTOTAL, RESTAURANT_A
        );
        expect(result.valid).toBe(true);
    });

    it('rejects when valid_until is in the past even if expires_at is null', () => {
        const result = validateCoupon(
            baseCoupon({ valid_until: past(1), expires_at: null }),
            SUBTOTAL, RESTAURANT_A
        );
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('expired');
    });
});

// ─── checkPerCustomerLimit ────────────────────────────────────────────────────

describe('checkPerCustomerLimit', () => {
    const couponWithLimit = (limit) => ({
        id: 'coupon-1',
        code: 'SAVE10',
        per_customer_limit: limit,
    });

    it('is not blocked when customer has used 0 times (limit=1)', async () => {
        const getOrderCount = async () => 0;
        const result = await checkPerCustomerLimit(couponWithLimit(1), 'user@test.com', getOrderCount);
        expect(result.blocked).toBe(false);
    });

    it('is blocked when customer has already used the coupon once (limit=1)', async () => {
        const getOrderCount = async () => 1;
        const result = await checkPerCustomerLimit(couponWithLimit(1), 'user@test.com', getOrderCount);
        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('per_customer_limit_reached');
    });

    it('is not blocked when customer used 1 of 2 allowed uses', async () => {
        const getOrderCount = async () => 1;
        const result = await checkPerCustomerLimit(couponWithLimit(2), 'user@test.com', getOrderCount);
        expect(result.blocked).toBe(false);
    });

    it('is blocked at exactly the limit (used=2, limit=2)', async () => {
        const getOrderCount = async () => 2;
        const result = await checkPerCustomerLimit(couponWithLimit(2), 'user@test.com', getOrderCount);
        expect(result.blocked).toBe(true);
    });

    it('returns no_identifier reason when customerEmail is null', async () => {
        const getOrderCount = async () => 0;
        const result = await checkPerCustomerLimit(couponWithLimit(1), null, getOrderCount);
        expect(result.blocked).toBe(false);
        expect(result.reason).toBe('no_identifier');
    });

    it('is not blocked when per_customer_limit is 0 (unlimited)', async () => {
        const getOrderCount = async () => 99;
        const result = await checkPerCustomerLimit(couponWithLimit(0), 'user@test.com', getOrderCount);
        expect(result.blocked).toBe(false);
    });

    it('is not blocked when per_customer_limit is null', async () => {
        const coupon = { ...couponWithLimit(null) };
        const getOrderCount = async () => 99;
        const result = await checkPerCustomerLimit(coupon, 'user@test.com', getOrderCount);
        expect(result.blocked).toBe(false);
    });

    it('a second customer with 0 uses is NOT blocked by first customer hitting limit', async () => {
        // getOrderCount is scoped to one customer, so returns 0 for a new customer
        const getOrderCount = async () => 0;
        const result = await checkPerCustomerLimit(couponWithLimit(1), 'other@test.com', getOrderCount);
        expect(result.blocked).toBe(false);
    });
});

// ─── resolveCouponDiscount (policy layer) ────────────────────────────────────

describe('resolveCouponDiscount — coupon stacking policy', () => {
    it('accepts a single valid coupon code', async () => {
        const coupon = baseCoupon();
        const result = await resolveCouponDiscount(
            'SAVE10', SUBTOTAL, RESTAURANT_A, makeCouponStore(coupon)
        );
        expect(result.error).toBeNull();
        expect(result.discount).toBeCloseTo(4.00);
    });

    it('rejects two coupon codes (stacking policy)', async () => {
        const coupon = baseCoupon();
        const result = await resolveCouponDiscount(
            'SAVE10,EXTRA5', SUBTOTAL, RESTAURANT_A, makeCouponStore(coupon)
        );
        expect(result.error).toBe('STACKING');
        expect(result.discount).toBe(0);
    });

    it('rejects three coupon codes', async () => {
        const result = await resolveCouponDiscount(
            'A,B,C', SUBTOTAL, RESTAURANT_A, makeCouponStore(null)
        );
        expect(result.error).toBe('STACKING');
    });

    it('returns NOT_FOUND when code does not exist in DB', async () => {
        const result = await resolveCouponDiscount(
            'GHOST', SUBTOTAL, RESTAURANT_A, async () => null
        );
        expect(result.error).toBe('NOT_FOUND');
        expect(result.discount).toBe(0);
    });

    it('returns error code when coupon is expired', async () => {
        const expired = baseCoupon({ valid_until: past(1) });
        const result = await resolveCouponDiscount(
            'SAVE10', SUBTOTAL, RESTAURANT_A, makeCouponStore(expired)
        );
        expect(result.error).toBe('EXPIRED');
    });

    it('returns skipped=true and discount=0 when no coupon_codes at all', async () => {
        const result = await resolveCouponDiscount(
            undefined, SUBTOTAL, RESTAURANT_A, async () => null
        );
        expect(result.error).toBeNull();
        expect(result.discount).toBe(0);
        expect(result.skipped).toBe(true);
    });

    it('returns skipped=true for empty string coupon_codes', async () => {
        const result = await resolveCouponDiscount(
            '', SUBTOTAL, RESTAURANT_A, async () => null
        );
        expect(result.error).toBeNull();
        expect(result.skipped).toBe(true);
    });
});