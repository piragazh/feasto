/**
 * B) COUPON POLICY
 *
 * Tests single coupon validation, expiry, minimum spend, restaurant scoping,
 * discount cap rules, per-customer limits, the expires_at field used by reward
 * coupons, and the multi-coupon stacking policy (max 3, stackable flag,
 * deterministic application order, 50% cap).
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

    // getUniqueOrderCount(email, code) => number  — simulates deduplicated dual-field count
    const makeCounter = (n) => async (_email, _code) => n;

    it('is not blocked when customer has used 0 times (limit=1)', async () => {
        const result = await checkPerCustomerLimit(couponWithLimit(1), 'user@test.com', makeCounter(0));
        expect(result.blocked).toBe(false);
    });

    it('is blocked when customer has already used the coupon once (limit=1)', async () => {
        const result = await checkPerCustomerLimit(couponWithLimit(1), 'user@test.com', makeCounter(1));
        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('per_customer_limit_reached');
    });

    it('is not blocked when customer used 1 of 2 allowed uses', async () => {
        const result = await checkPerCustomerLimit(couponWithLimit(2), 'user@test.com', makeCounter(1));
        expect(result.blocked).toBe(false);
    });

    it('is blocked at exactly the limit (used=2, limit=2)', async () => {
        const result = await checkPerCustomerLimit(couponWithLimit(2), 'user@test.com', makeCounter(2));
        expect(result.blocked).toBe(true);
    });

    it('returns no_identifier reason when customerEmail is null', async () => {
        const result = await checkPerCustomerLimit(couponWithLimit(1), null, makeCounter(0));
        expect(result.blocked).toBe(false);
        expect(result.reason).toBe('no_identifier');
    });

    it('is not blocked when per_customer_limit is 0 (unlimited)', async () => {
        const result = await checkPerCustomerLimit(couponWithLimit(0), 'user@test.com', makeCounter(99));
        expect(result.blocked).toBe(false);
    });

    it('is not blocked when per_customer_limit is null', async () => {
        const result = await checkPerCustomerLimit(couponWithLimit(null), 'user@test.com', makeCounter(99));
        expect(result.blocked).toBe(false);
    });

    it('a second customer with 0 uses is NOT blocked by first customer hitting limit', async () => {
        const result = await checkPerCustomerLimit(couponWithLimit(1), 'other@test.com', makeCounter(0));
        expect(result.blocked).toBe(false);
    });

    // ── Compatibility: dual-field deduplication ──────────────────────────────
    // The real DB helper counts unique order IDs across coupon_code + coupon_codes.
    // Simulate: one order has both fields set (new order). Should count as 1, not 2.

    it('does not double-count an order that has both coupon_code and coupon_codes set', async () => {
        // Simulates: 1 order with both fields = deduplicated count = 1 (not 2)
        // The counter mock represents the already-deduplicated result the real DB helper provides
        const result = await checkPerCustomerLimit(couponWithLimit(1), 'user@test.com', makeCounter(1));
        expect(result.blocked).toBe(true); // 1 use, limit 1 → blocked on second attempt
    });

    it('counts legacy order (coupon_code only) correctly toward per-customer limit', async () => {
        // Legacy order: only coupon_code field. Deduplicated count = 1.
        const result = await checkPerCustomerLimit(couponWithLimit(1), 'user@test.com', makeCounter(1));
        expect(result.blocked).toBe(true);
    });

    it('counts new stacked order (coupon_codes array, position 2+) correctly', async () => {
        // New order with code at position 2 in coupon_codes. Deduplicated count = 1.
        const result = await checkPerCustomerLimit(couponWithLimit(1), 'user@test.com', makeCounter(1));
        expect(result.blocked).toBe(true);
    });

    it('mixed history: 1 legacy + 1 new order deduplicated = 2 unique uses', async () => {
        // 2 separate orders (one old, one new), both using same code. Count = 2.
        const result = await checkPerCustomerLimit(couponWithLimit(2), 'user@test.com', makeCounter(2));
        expect(result.blocked).toBe(true); // exactly at limit
    });
});

// ─── resolveCouponDiscount (policy layer) ────────────────────────────────────

// Multi-coupon fixture store — looks up by code, allows up to 3 coupons in tests
const stackableCoupon = (code, type = 'percentage', value = 10, overrides = {}) => ({
    id: `coupon-${code}`,
    code,
    is_active: true,
    discount_type: type,
    discount_value: value,
    max_discount: null,
    minimum_order: null,
    usage_limit: null,
    usage_count: 0,
    valid_from: null,
    valid_until: null,
    restaurant_id: null,
    stackable: true,
    ...overrides,
});

const makeMultiCouponStore = (coupons) => {
    const map = new Map(coupons.map(c => [c.code, c]));
    return async (code) => map.get(code) ?? null;
};

describe('resolveCouponDiscount — coupon stacking policy', () => {
    // ── Single code paths (unchanged from before) ─────────────────────────
    it('accepts a single valid coupon code', async () => {
        const coupon = baseCoupon();
        const result = await resolveCouponDiscount(
            'SAVE10', SUBTOTAL, RESTAURANT_A, makeCouponStore(coupon)
        );
        expect(result.error).toBeNull();
        expect(result.discount).toBeCloseTo(4.00);
    });

    it('accepts a single code passed as an array', async () => {
        const coupon = baseCoupon();
        const result = await resolveCouponDiscount(
            ['SAVE10'], SUBTOTAL, RESTAURANT_A, makeCouponStore(coupon)
        );
        expect(result.error).toBeNull();
        expect(result.discount).toBeCloseTo(4.00);
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

    it('returns skipped=true for empty array coupon_codes', async () => {
        const result = await resolveCouponDiscount(
            [], SUBTOTAL, RESTAURANT_A, async () => null
        );
        expect(result.error).toBeNull();
        expect(result.skipped).toBe(true);
    });

    // ── Stacking: 2 codes ─────────────────────────────────────────────────
    it('accepts two stackable coupons: percentage applied first, then fixed', async () => {
        // SUBTOTAL=40. PCT10: 10% = £4. FIXED5: £5. Total = £9.
        const store = makeMultiCouponStore([
            stackableCoupon('PCT10', 'percentage', 10),
            stackableCoupon('FIXED5', 'fixed', 5),
        ]);
        const result = await resolveCouponDiscount(['PCT10', 'FIXED5'], SUBTOTAL, RESTAURANT_A, store);
        expect(result.error).toBeNull();
        expect(result.discount).toBeCloseTo(9.00);
        // percentage coupon applied first regardless of input order
        expect(result.appliedCodes[0]).toBe('PCT10');
        expect(result.appliedCodes[1]).toBe('FIXED5');
    });

    it('rejects two codes when one is non-stackable', async () => {
        const store = makeMultiCouponStore([
            stackableCoupon('STACKED', 'percentage', 10, { stackable: true }),
            stackableCoupon('LONE', 'fixed', 5, { stackable: false }),
        ]);
        const result = await resolveCouponDiscount(['STACKED', 'LONE'], SUBTOTAL, RESTAURANT_A, store);
        expect(result.error).toBe('STACKING');
        expect(result.discount).toBe(0);
    });

    it('rejects two codes when both are non-stackable', async () => {
        const store = makeMultiCouponStore([
            stackableCoupon('A', 'fixed', 5, { stackable: false }),
            stackableCoupon('B', 'fixed', 5, { stackable: false }),
        ]);
        const result = await resolveCouponDiscount(['A', 'B'], SUBTOTAL, RESTAURANT_A, store);
        expect(result.error).toBe('STACKING');
    });

    // ── Stacking: 3 codes ─────────────────────────────────────────────────
    it('accepts three stackable coupons and accumulates discount correctly', async () => {
        // SUBTOTAL=40. PCT10=£4, FIX3=£3, FIX2=£2. Total=£9. Cap=50% of 40=£20. Within cap.
        const store = makeMultiCouponStore([
            stackableCoupon('PCT10', 'percentage', 10),
            stackableCoupon('FIX3', 'fixed', 3),
            stackableCoupon('FIX2', 'fixed', 2),
        ]);
        const result = await resolveCouponDiscount(['PCT10', 'FIX3', 'FIX2'], SUBTOTAL, RESTAURANT_A, store);
        expect(result.error).toBeNull();
        expect(result.discount).toBeCloseTo(9.00);
        expect(result.appliedCodes).toHaveLength(3);
    });

    it('50% cap enforced: three coupons exceeding cap are truncated', async () => {
        // SUBTOTAL=10. Cap=£5. PCT30=30%=£3, FIX3=£3, FIX3B=£3. Without cap=£9, with cap=£5.
        const store = makeMultiCouponStore([
            stackableCoupon('PCT30', 'percentage', 30),
            stackableCoupon('FIX3', 'fixed', 3),
            stackableCoupon('FIX3B', 'fixed', 3),
        ]);
        const result = await resolveCouponDiscount(['PCT30', 'FIX3', 'FIX3B'], 10.00, RESTAURANT_A, store);
        expect(result.error).toBeNull();
        expect(result.discount).toBeCloseTo(5.00); // capped at 50% of 10
    });

    it('deterministic sort: two fixed coupons applied in code-alphabetical order', async () => {
        // FIX_A and FIX_B both fixed. No percentage coupons. Sorted by code asc → FIX_A first.
        const store = makeMultiCouponStore([
            stackableCoupon('FIX_B', 'fixed', 3),
            stackableCoupon('FIX_A', 'fixed', 4),
        ]);
        const result = await resolveCouponDiscount(['FIX_B', 'FIX_A'], SUBTOTAL, RESTAURANT_A, store);
        expect(result.error).toBeNull();
        expect(result.appliedCodes[0]).toBe('FIX_A'); // alphabetically first
        expect(result.appliedCodes[1]).toBe('FIX_B');
    });

    // ── Reject paths ──────────────────────────────────────────────────────
    it('rejects 4 codes (exceeds MAX_COUPONS_PER_ORDER=3)', async () => {
        const store = makeMultiCouponStore([
            stackableCoupon('A'), stackableCoupon('B'), stackableCoupon('C'), stackableCoupon('D'),
        ]);
        const result = await resolveCouponDiscount(['A', 'B', 'C', 'D'], SUBTOTAL, RESTAURANT_A, store);
        expect(result.error).toBe('MAX_EXCEEDED');
        expect(result.discount).toBe(0);
    });

    it('rejects duplicate codes', async () => {
        const store = makeMultiCouponStore([stackableCoupon('PCT10')]);
        const result = await resolveCouponDiscount(['PCT10', 'PCT10'], SUBTOTAL, RESTAURANT_A, store);
        expect(result.error).toBe('DUPLICATE');
        expect(result.discount).toBe(0);
    });
});