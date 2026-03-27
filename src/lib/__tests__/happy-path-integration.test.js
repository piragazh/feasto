/**
 * F) NON-BREAKAGE — Happy-path integration-style tests
 *
 * Simulates the full server-side price/discount pipeline for the most common
 * order scenarios end-to-end, using the extracted pure functions composed
 * together as they are in the Deno handler.
 */

import { describe, it, expect } from 'vitest';
import {
    recomputeSubtotal,
    computeAndVerifyTotal,
    resolveCouponDiscount,
    capPromotionDiscount,
} from '../order-logic.js';

// ─── Shared test data ─────────────────────────────────────────────────────────

const RESTAURANT_ID = 'rest-test-001';
const DELIVERY_FEE = 2.99;

const menuItemsMap = new Map([
    ['burger-01', { id: 'burger-01', name: 'Classic Burger', price: 10.99, is_available: true }],
    ['fries-01',  { id: 'fries-01',  name: 'Large Fries',   price: 3.49,  is_available: true }],
    ['drink-01',  { id: 'drink-01',  name: 'Cola',          price: 2.49,  is_available: true }],
]);

const cart = (items) => items.map(([id, qty, clientPrice = 0]) => ({
    menu_item_id: id,
    name: menuItemsMap.get(id)?.name ?? id,
    quantity: qty,
    price: clientPrice, // will be overwritten by server
}));

const couponDB = {
    'SAVE20PCT': {
        id: 'c-1', code: 'SAVE20PCT', is_active: true,
        discount_type: 'percentage', discount_value: 20,
        max_discount: null, minimum_order: null, usage_limit: null,
        usage_count: 0, valid_from: null, valid_until: null, restaurant_id: null,
    },
    'FLAT3OFF': {
        id: 'c-2', code: 'FLAT3OFF', is_active: true,
        discount_type: 'fixed', discount_value: 3.00,
        max_discount: null, minimum_order: null, usage_limit: null,
        usage_count: 0, valid_from: null, valid_until: null, restaurant_id: null,
    },
};
const getCoupon = async (code) => couponDB[code] ?? null;

// ─── Pipeline helper (mirrors verifyAndCreateOrder logic) ─────────────────────

async function runServerPipeline({ cartItems, couponCodesString, couponCodesInput, promotionDiscount = 0, clientTotal }) {
    // 1. Recompute subtotal from menu prices
    const { serverSubtotal, unavailableItem } = recomputeSubtotal(cartItems, menuItemsMap);
    if (unavailableItem) return { error: `${unavailableItem} is unavailable`, serverTotal: null };

    // 2. Resolve discount — accept either old couponCodesString or new couponCodesInput
    const couponInput = couponCodesInput ?? couponCodesString;
    let discount = 0;
    if (couponInput) {
        const couponResult = await resolveCouponDiscount(
            couponInput, serverSubtotal, RESTAURANT_ID, getCoupon
        );
        if (couponResult.error) return { error: couponResult.error, serverTotal: null };
        discount = couponResult.discount;
    } else {
        discount = capPromotionDiscount(promotionDiscount, serverSubtotal);
    }

    // 3. Verify total
    const { serverTotal, mismatch } = computeAndVerifyTotal(
        { serverSubtotal, deliveryFee: DELIVERY_FEE, discount },
        clientTotal
    );
    if (mismatch) return { error: 'TOTAL_MISMATCH', serverTotal };

    return { error: null, serverTotal, discount, serverSubtotal };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Happy path: no discount', () => {
    it('order with three items and no discount completes cleanly', async () => {
        const items = cart([['burger-01', 1, 99], ['fries-01', 1, 99], ['drink-01', 1, 99]]);
        // Server prices: £10.99 + £3.49 + £2.49 = £16.97 + £2.99 delivery = £19.96
        const serverSubtotal = 10.99 + 3.49 + 2.49;
        const expectedTotal = serverSubtotal + DELIVERY_FEE;

        const result = await runServerPipeline({
            cartItems: items,
            couponCodesString: undefined,
            promotionDiscount: 0,
            clientTotal: expectedTotal,
        });

        expect(result.error).toBeNull();
        expect(result.serverTotal).toBeCloseTo(expectedTotal);
        expect(result.discount).toBe(0);
    });
});

describe('Happy path: one coupon applied', () => {
    it('20% percentage coupon applied to burger + fries order', async () => {
        const items = cart([['burger-01', 2, 1], ['fries-01', 1, 1]]);
        // Server: (2 × £10.99) + £3.49 = £25.47, 20% off = £5.094, total = £25.47 + £2.99 - £5.094 = £23.366
        const serverSubtotal = 10.99 * 2 + 3.49;
        const couponDiscount = serverSubtotal * 0.20;
        const expectedTotal = serverSubtotal + DELIVERY_FEE - couponDiscount;

        const result = await runServerPipeline({
            cartItems: items,
            couponCodesString: 'SAVE20PCT',
            clientTotal: expectedTotal,
        });

        expect(result.error).toBeNull();
        expect(result.serverTotal).toBeCloseTo(expectedTotal);
        expect(result.discount).toBeCloseTo(couponDiscount);
    });

    it('£3 flat coupon applied to a single drink order (discount capped at subtotal)', async () => {
        const items = cart([['drink-01', 1, 99]]);
        // Server subtotal: £2.49. Fixed £3 discount capped at £2.49
        const serverSubtotal = 2.49;
        const couponDiscount = Math.min(3.00, serverSubtotal); // £2.49
        const expectedTotal = Math.max(0, serverSubtotal + DELIVERY_FEE - couponDiscount);

        const result = await runServerPipeline({
            cartItems: items,
            couponCodesString: 'FLAT3OFF',
            clientTotal: expectedTotal,
        });

        expect(result.error).toBeNull();
        expect(result.discount).toBeCloseTo(2.49);
        expect(result.serverTotal).toBeCloseTo(DELIVERY_FEE); // only delivery remains
    });
});

describe('Happy path: promotion only (no coupon)', () => {
    it('restaurant-controlled £2 promotion applied safely', async () => {
        const items = cart([['burger-01', 1, 99], ['fries-01', 1, 99]]);
        const serverSubtotal = 10.99 + 3.49;
        const promoDiscount = capPromotionDiscount(2.00, serverSubtotal);
        const expectedTotal = serverSubtotal + DELIVERY_FEE - promoDiscount;

        const result = await runServerPipeline({
            cartItems: items,
            couponCodesString: undefined,
            promotionDiscount: 2.00,
            clientTotal: expectedTotal,
        });

        expect(result.error).toBeNull();
        expect(result.discount).toBe(2.00);
        expect(result.serverTotal).toBeCloseTo(expectedTotal);
    });

    it('extreme promotion (exceeding 50% cap) is safely reduced', async () => {
        const items = cart([['burger-01', 1, 99]]);
        const serverSubtotal = 10.99;
        // Client claims a £9 promo — server caps it at 50% = £5.495
        const cappedDiscount = capPromotionDiscount(9.00, serverSubtotal);
        const expectedTotal = serverSubtotal + DELIVERY_FEE - cappedDiscount;

        const result = await runServerPipeline({
            cartItems: items,
            couponCodesString: undefined,
            promotionDiscount: 9.00,
            clientTotal: expectedTotal,
        });

        expect(result.error).toBeNull();
        expect(result.discount).toBeCloseTo(5.495);
    });
});

describe('Regression: client price tampering is ignored', () => {
    it('client submitting £0.01 prices does not reduce the server total', async () => {
        const items = cart([['burger-01', 1, 0.01], ['fries-01', 1, 0.01]]);
        const realSubtotal = 10.99 + 3.49;
        const realTotal = realSubtotal + DELIVERY_FEE;

        // Client submits tampered total matching tampered prices
        const result = await runServerPipeline({
            cartItems: items,
            couponCodesString: undefined,
            promotionDiscount: 0,
            clientTotal: 0.01 + 0.01 + DELIVERY_FEE, // tampered
        });

        // Server should detect a mismatch because server recomputed total ≠ client tampered total
        expect(result.error).toBe('TOTAL_MISMATCH');
    });

    it('client submitting correct total after server recomputes prices passes', async () => {
        const items = cart([['burger-01', 1, 0.01]]); // tampered price
        const realSubtotal = 10.99;
        const realTotal = realSubtotal + DELIVERY_FEE;

        const result = await runServerPipeline({
            cartItems: items,
            couponCodesString: undefined,
            promotionDiscount: 0,
            clientTotal: realTotal, // honest total
        });

        expect(result.error).toBeNull();
        expect(result.serverTotal).toBeCloseTo(realTotal);
    });
});

describe('Stacking: two non-stackable coupons blocked in pipeline', () => {
    it('two non-stackable codes returns a STACKING error', async () => {
        // SAVE20PCT and FLAT3OFF are defined in couponDB without stackable=true
        const items = cart([['burger-01', 1, 10.99]]);
        const result = await runServerPipeline({
            cartItems: items,
            couponCodesInput: ['SAVE20PCT', 'FLAT3OFF'],
            clientTotal: 10.00,
        });
        expect(result.error).toBe('STACKING');
        expect(result.serverTotal).toBeNull();
    });
});

describe('Stacking: two stackable coupons accepted in pipeline', () => {
    const stackableCouponDB = {
        'SAVE20PCT': {
            id: 'c-1', code: 'SAVE20PCT', is_active: true,
            discount_type: 'percentage', discount_value: 20,
            max_discount: null, minimum_order: null, usage_limit: null,
            usage_count: 0, valid_from: null, valid_until: null, restaurant_id: null,
            stackable: true,
        },
        'FLAT3OFF': {
            id: 'c-2', code: 'FLAT3OFF', is_active: true,
            discount_type: 'fixed', discount_value: 3.00,
            max_discount: null, minimum_order: null, usage_limit: null,
            usage_count: 0, valid_from: null, valid_until: null, restaurant_id: null,
            stackable: true,
        },
        'FLAT2OFF': {
            id: 'c-3', code: 'FLAT2OFF', is_active: true,
            discount_type: 'fixed', discount_value: 2.00,
            max_discount: null, minimum_order: null, usage_limit: null,
            usage_count: 0, valid_from: null, valid_until: null, restaurant_id: null,
            stackable: true,
        },
    };
    const getStackableCoupon = async (code) => stackableCouponDB[code] ?? null;

    async function runStackablePipeline({ cartItems, couponCodesInput, promotionDiscount = 0, clientTotal }) {
        const { serverSubtotal, unavailableItem } = recomputeSubtotal(cartItems, menuItemsMap);
        if (unavailableItem) return { error: `${unavailableItem} is unavailable`, serverTotal: null };

        let discount = 0;
        if (couponCodesInput) {
            const couponResult = await resolveCouponDiscount(couponCodesInput, serverSubtotal, RESTAURANT_ID, getStackableCoupon);
            if (couponResult.error) return { error: couponResult.error, serverTotal: null };
            discount = couponResult.discount;
        } else {
            discount = capPromotionDiscount(promotionDiscount, serverSubtotal);
        }

        const { serverTotal, mismatch } = computeAndVerifyTotal(
            { serverSubtotal, deliveryFee: DELIVERY_FEE, discount }, clientTotal
        );
        if (mismatch) return { error: 'TOTAL_MISMATCH', serverTotal };
        return { error: null, serverTotal, discount, serverSubtotal };
    }

    it('percentage + fixed stackable coupons both applied (percentage first)', async () => {
        // burger x2 = £21.98. SAVE20PCT=20%=£4.396, FLAT3OFF=£3. Total discount=£7.396.
        const items = cart([['burger-01', 2, 0]]);
        const serverSubtotal = 10.99 * 2; // £21.98
        const couponDiscount = serverSubtotal * 0.20 + 3.00; // £4.396 + £3 = £7.396
        const clientTotal = serverSubtotal + DELIVERY_FEE - couponDiscount;

        const result = await runStackablePipeline({
            cartItems: items,
            couponCodesInput: ['SAVE20PCT', 'FLAT3OFF'],
            clientTotal,
        });

        expect(result.error).toBeNull();
        expect(result.discount).toBeCloseTo(7.396);
        expect(result.serverTotal).toBeCloseTo(clientTotal);
    });

    it('three stackable coupons all applied correctly', async () => {
        // burger x2 = £21.98. SAVE20PCT=20%=£4.396, FLAT3OFF=£3, FLAT2OFF=£2. Total=£9.396. Cap=50%=£10.99 → within cap.
        const items = cart([['burger-01', 2, 0]]);
        const serverSubtotal = 10.99 * 2; // £21.98
        const couponDiscount = serverSubtotal * 0.20 + 3.00 + 2.00; // £9.396
        const clientTotal = serverSubtotal + DELIVERY_FEE - couponDiscount;

        const result = await runStackablePipeline({
            cartItems: items,
            couponCodesInput: ['SAVE20PCT', 'FLAT3OFF', 'FLAT2OFF'],
            clientTotal,
        });

        expect(result.error).toBeNull();
        expect(result.discount).toBeCloseTo(9.396);
        expect(result.serverTotal).toBeCloseTo(clientTotal);
    });

    it('50% cap enforced: three coupons exceeding cap are truncated', async () => {
        // drink £2.49. Cap=50%=£1.245. SAVE20PCT=20%=£0.498. FLAT3OFF=£3 → remaining=£0.747. FLAT2OFF=£2 → remaining=0. Total=£1.245.
        const items = cart([['drink-01', 1, 0]]);
        const serverSubtotal = 2.49;
        const cappedDiscount = serverSubtotal * 0.50; // £1.245
        const clientTotal = serverSubtotal + DELIVERY_FEE - cappedDiscount;

        const result = await runStackablePipeline({
            cartItems: items,
            couponCodesInput: ['SAVE20PCT', 'FLAT3OFF', 'FLAT2OFF'],
            clientTotal,
        });

        expect(result.error).toBeNull();
        expect(result.discount).toBeCloseTo(cappedDiscount);
    });

    it('promotion + two stackable coupons: promotion is separate from coupon stack', async () => {
        // The server pipeline takes couponCodesInput OR promotionDiscount — mutually exclusive.
        // This test verifies they don't interfere: promotion path applies capPromotionDiscount.
        const items = cart([['burger-01', 1, 0]]);
        const serverSubtotal = 10.99;
        const promoDiscount = capPromotionDiscount(2.00, serverSubtotal); // £2
        const clientTotal = serverSubtotal + DELIVERY_FEE - promoDiscount;

        const result = await runStackablePipeline({
            cartItems: items,
            couponCodesInput: undefined,
            promotionDiscount: 2.00,
            clientTotal,
        });

        expect(result.error).toBeNull();
        expect(result.discount).toBeCloseTo(2.00);
    });
});