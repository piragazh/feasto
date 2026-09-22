/**
 * verifyAndCreateOrder — pricing validation tests
 * ================================================
 * These EXECUTE the real validateOrderPricing, extracted from the function's
 * source, against genuine orders (must be accepted) and tampered ones (must be
 * refused).
 *
 * WHY THIS FILE WAS REWRITTEN
 *   The previous version never read the real code. Each of its ten "tests"
 *   defined a hard-coded string and asserted things about that string, so all
 *   passed regardless of what the function did - and one could never pass, as
 *   it searched for "dont block" in a string reading "don't block".
 *
 *   It described an OLDER version of the function (hours checks, zone checks,
 *   an attemptRefund helper, a PT_CREATE_FAILED path) that no longer exists.
 *   Meanwhile the current function had price validation switched off entirely,
 *   letting any online customer set their own price - and those tests, checking
 *   strings rather than behaviour, could not notice.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../base44/functions/verifyAndCreateOrder/entry.ts', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('const LOG = '), src.indexOf('Deno.serve('));
const { validateOrderPricing } = new Function(body + '\nreturn { validateOrderPricing };')();

// Real menu structures from the database.
const MENU = {
    wings: { id: 'wings', name: 'Hot Wings', price: 2.99, is_available: true, customization_options: [
        { name: 'Count', type: 'single', options: [{ label: '6 Hot Wings', price: 1 }] },
        { name: 'Upgarade?', type: 'meal_upgrade', options: [{ label: 'On its Own', price: 0 }, { label: 'Meal', price: 3 }],
          meal_customizations: [{ name: 'Side', type: 'single', options: [{ label: 'Chips', price: 0 }, { label: 'Peri Peri Chips', price: 0.2 }] }] }] },
    burger: { id: 'burger', name: 'Classic burger', price: 6.49, is_available: true, customization_options: [
        { name: '', type: 'meal_upgrade', options: [{ label: 'On its Own', price: 0 }, { label: 'Meal', price: 2.5 }], meal_customizations: [] }] },
    gone: { id: 'gone', name: 'Sold out pie', price: 4, is_available: false, customization_options: [] },
};
const COUPONS = { SAVE10: { code: 'SAVE10', is_active: true, discount_type: 'percentage', discount_value: 10, stackable: false, restaurant_id: 'r1' } };
const PROMOS = [{ restaurant_id: 'r1', name: 'Tuesday Deal', promotion_code: 'TUE', is_active: true }];
const base44 = { asServiceRole: { entities: {
    MenuItem: { filter: async () => Object.values(MENU) },
    MealDeal: { filter: async () => [] },
    Coupon: { filter: async ({ code }) => (COUPONS[code] ? [COUPONS[code]] : []) },
    Promotion: { filter: async () => PROMOS },
} } };

const WINGS_MEAL_PERI = { 'Count': '6 Hot Wings', 'Upgarade?': 'Meal', 'Upgarade?_meal_customizations': { Side: 'Peri Peri Chips' } };
const line = (id, price, customizations = {}) => ({ menu_item_id: id, name: id, price, quantity: 1, customizations });
const run = (items, { discount = 0, coupons = [], promos = [], fee = 2.99 } = {}) => {
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    return validateOrderPricing(base44, {
        items, restaurantId: 'r1', clientSubtotal: subtotal, clientTotal: subtotal + fee - discount,
        deliveryFee: fee, smallOrderSurcharge: 0, discount, isPOS: false, couponCodes: coupons, promotionCodes: promos,
    });
};

describe('genuine orders are accepted', () => {
    it('ROOT CAUSE 1: a meal with a priced meal extra (extras live on the option GROUP)', async () => {
        expect((await run([line('wings', 7.19, WINGS_MEAL_PERI)])).valid).toBe(true);
    });
    it('ROOT CAUSE 2: a meal whose option group has a blank name', async () => {
        expect((await run([line('burger', 8.99, { '': 'Meal' })])).valid).toBe(true);
    });
    it('a customer paying MORE than the server computes is never turned away (floor)', async () => {
        expect((await run([line('burger', 9.99, { '': 'Meal' })])).valid).toBe(true);
    });
    it('a real coupon', async () => {
        expect((await run([line('burger', 8.99, { '': 'Meal' })], { discount: 0.9, coupons: ['SAVE10'] })).valid).toBe(true);
    });
    it('a real active promotion', async () => {
        expect((await run([line('burger', 8.99, { '': 'Meal' })], { discount: 2, promos: ['TUE'] })).valid).toBe(true);
    });
});

describe('tampered orders are refused', () => {
    it('an item priced at 1p', async () => {
        expect((await run([line('burger', 0.01, { '': 'Meal' })])).code).toBe('PRICE_MISMATCH');
    });
    it('a meal extra that was not paid for', async () => {
        // Under a floor, an under-counting bug can only be seen this way.
        expect((await run([line('wings', 6.99, WINGS_MEAL_PERI)])).valid).toBe(false);
    });
    it('a meal upgrade that was not paid for', async () => {
        expect((await run([line('burger', 6.49, { '': 'Meal' })])).valid).toBe(false);
    });
    it('a discount with no coupon or promotion behind it', async () => {
        expect((await run([line('burger', 8.99, { '': 'Meal' })], { discount: 4 })).code).toBe('DISCOUNT_UNSUPPORTED');
    });
    it('an invented promotion code', async () => {
        expect((await run([line('burger', 8.99, { '': 'Meal' })], { discount: 4, promos: ['FAKE'] })).code).toBe('DISCOUNT_UNSUPPORTED');
    });
    it('a coupon that does not exist', async () => {
        expect((await run([line('burger', 8.99, { '': 'Meal' })], { discount: 1, coupons: ['NOPE'] })).code).toBe('COUPON_NOT_FOUND');
    });
    it('an item that is sold out', async () => {
        expect((await run([line('gone', 4)])).code).toBe('ITEM_UNAVAILABLE');
    });
});
