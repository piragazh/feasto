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

async function runServerPipeline({ cartItems, couponCodesString, promotionDiscount = 0, clientTotal }) {
    // 1. Recompute subtotal from menu prices
    const { serverSubtotal, unavailableItem } = recomputeSubtotal(cartItems, menuItemsMap);
    if (unavailableItem) return { error: `${unavailableItem} is unavailable`, serverTotal: null };

    // 2. Resolve discount
    let discount = 0;
    if (couponCodesString) {
        const couponResult = await resolveCouponDiscount(
            couponCodesString, serverSubtotal, RESTAURANT_ID, getCoupon
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

describe('Regression: coupon stacking still blocked in pipeline', () => {
    it('two codes in the pipeline returns a stacking error, not a discount', async () => {
        const items = cart([['burger-01', 1, 10.99]]);
        const result = await runServerPipeline({
            cartItems: items,
            couponCodesString: 'SAVE20PCT,FLAT3OFF',
            clientTotal: 10.00,
        });
        expect(result.error).toBe('STACKING');
        expect(result.serverTotal).toBeNull();
    });
});