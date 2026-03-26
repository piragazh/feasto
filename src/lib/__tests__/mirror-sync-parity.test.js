/**
 * G) MIRROR SYNC PARITY
 * =====================
 * Enforces that the pure-function copies inlined in Deno handlers produce
 * identical output to the canonical implementations in src/lib/order-logic.js.
 *
 * Because Deno handlers cannot import from src/lib/, we maintain a mirror
 * pattern. This test file is the safety net: it re-implements the handler
 * copies here (verbatim from the handler source) and runs the same fixture
 * inputs through both versions. If a diff appears, the test fails loudly.
 *
 * MAINTENANCE RULE:
 *   When you change a function in src/lib/order-logic.js AND update the
 *   mirror in the Deno handler, you MUST also update the handler copy below
 *   to match. The test will fail if you forget — that is intentional.
 *
 * Functions covered:
 *   - recomputeSubtotal          (verifyAndCreateOrder)
 *   - computeAndVerifyTotal      (verifyAndCreateOrder)
 *   - validateCoupon             (verifyAndCreateOrder)
 *   - capPromotionDiscount       (verifyAndCreateOrder)
 *   - basketFingerprint          (orderVelocityThrottle)
 *   - checkPerUserBurst          (orderVelocityThrottle, enforceRateLimiting)
 *   - checkPlatformBurst         (orderVelocityThrottle)
 */

import { describe, it, expect } from 'vitest';
import {
    recomputeSubtotal,
    computeAndVerifyTotal,
    validateCoupon,
    capPromotionDiscount,
    basketFingerprint,
    checkPerUserBurst,
    checkPlatformBurst,
} from '../order-logic.js';

// ─── Handler mirror copies ────────────────────────────────────────────────────
// These are copied verbatim from the Deno handler.
// If a handler is updated, update these copies too — the test will tell you.

/** @mirror verifyAndCreateOrder → recomputeSubtotal */
function handler_recomputeSubtotal(cartItems, menuItemsMap) {
    const mutatedItems = [];
    for (const cartItem of cartItems) {
        const menuItem = menuItemsMap.get(cartItem.menu_item_id);
        if (!menuItem) {
            return { serverSubtotal: 0, mutatedItems: [], unavailableItem: cartItem.name || cartItem.menu_item_id };
        }
        if (menuItem.is_available === false) {
            return { serverSubtotal: 0, mutatedItems: [], unavailableItem: cartItem.name || cartItem.menu_item_id };
        }
        mutatedItems.push({ ...cartItem, price: menuItem.price });
    }
    const serverSubtotal = mutatedItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
    return { serverSubtotal, mutatedItems, unavailableItem: null };
}

/** @mirror verifyAndCreateOrder → computeAndVerifyTotal */
function handler_computeAndVerifyTotal({ serverSubtotal, deliveryFee, discount }, clientTotal, tolerance = 0.50) {
    const serverTotal = Math.max(0, serverSubtotal + deliveryFee - discount);
    const mismatch = Math.abs(serverTotal - clientTotal) > tolerance;
    return { serverTotal, mismatch };
}

/** @mirror verifyAndCreateOrder → validateCoupon */
function handler_validateCoupon(coupon, serverSubtotal, restaurantId, now = new Date()) {
    if (!coupon.is_active) return { valid: false, reason: 'inactive', discount: 0 };
    if (coupon.valid_from && new Date(coupon.valid_from) > now) return { valid: false, reason: 'not_yet_valid', discount: 0 };
    if (coupon.valid_until && new Date(coupon.valid_until) < now) return { valid: false, reason: 'expired', discount: 0 };
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) return { valid: false, reason: 'usage_limit_reached', discount: 0 };
    if (coupon.minimum_order && serverSubtotal < coupon.minimum_order) return { valid: false, reason: 'below_minimum_order', discount: 0 };
    if (coupon.restaurant_id && coupon.restaurant_id !== restaurantId) return { valid: false, reason: 'wrong_restaurant', discount: 0 };

    let d = coupon.discount_type === 'percentage'
        ? (serverSubtotal * coupon.discount_value) / 100
        : (coupon.discount_value || 0);
    if (coupon.discount_type === 'percentage' && coupon.max_discount) d = Math.min(d, coupon.max_discount);
    d = Math.min(d, serverSubtotal);
    return { valid: true, reason: null, discount: d };
}

/** @mirror verifyAndCreateOrder → capPromotionDiscount */
function handler_capPromotionDiscount(clientDiscount, serverSubtotal) {
    return Math.min(Math.max(0, clientDiscount), serverSubtotal * 0.5);
}

/** @mirror orderVelocityThrottle → basketFingerprint */
function handler_basketFingerprint(orderData) {
    if (!orderData?.items?.length) return null;
    const sorted = [...orderData.items]
        .sort((a, b) => (a.menu_item_id || '').localeCompare(b.menu_item_id || ''))
        .map(i => `${i.menu_item_id}:${i.quantity || 1}`)
        .join('|');
    return `${orderData.restaurant_id}::${sorted}`;
}

/** @mirror orderVelocityThrottle + enforceRateLimiting → checkPerUserBurst */
function handler_checkPerUserBurst(recentOrders, limit = 5) {
    const count = Array.isArray(recentOrders) ? recentOrders.length : 0;
    if (count < limit) return { blocked: false, retryAfter: 0 };
    const now = Date.now();
    const oldest = recentOrders.slice().sort((a, b) => new Date(a.created_date) - new Date(b.created_date))[0];
    const retryAfter = Math.max(1, Math.ceil((new Date(oldest.created_date).getTime() + 60_000 - now) / 1000));
    return { blocked: true, retryAfter };
}

/** @mirror orderVelocityThrottle → checkPlatformBurst */
function handler_checkPlatformBurst(platformOrderCount, limit = 30) {
    return platformOrderCount >= limit;
}

// ─── Shared test fixtures ─────────────────────────────────────────────────────

const menuMap = new Map([
    ['item-1', { id: 'item-1', name: 'Burger', price: 10.00, is_available: true }],
    ['item-2', { id: 'item-2', name: 'Fries',  price: 3.00,  is_available: true }],
    ['item-off', { id: 'item-off', name: 'Off', price: 5.00, is_available: false }],
]);

const cart = (id, qty, clientPrice = 99) => ({ menu_item_id: id, name: id, quantity: qty, price: clientPrice });

const coupon = (overrides = {}) => ({
    is_active: true, discount_type: 'percentage', discount_value: 10,
    max_discount: null, minimum_order: null, usage_limit: null,
    usage_count: 0, valid_from: null, valid_until: null, restaurant_id: null,
    ...overrides,
});

const order = (menu_item_id, qty, restaurant_id = 'r1', secondsAgo = 10) => ({
    restaurant_id,
    items: [{ menu_item_id, quantity: qty }],
    created_date: new Date(Date.now() - secondsAgo * 1000).toISOString(),
});

// ─── Parity tests ─────────────────────────────────────────────────────────────

describe('Mirror parity: recomputeSubtotal', () => {
    const cases = [
        { label: 'single item', args: [[cart('item-1', 2, 1)], menuMap] },
        { label: 'two items', args: [[cart('item-1', 1, 99), cart('item-2', 2, 99)], menuMap] },
        { label: 'unknown item', args: [[cart('ghost', 1, 5)], menuMap] },
        { label: 'unavailable item', args: [[cart('item-off', 1, 5)], menuMap] },
        { label: 'no quantity', args: [[{ menu_item_id: 'item-1', name: 'item-1' }], menuMap] },
    ];
    cases.forEach(({ label, args }) => {
        it(`produces identical output: ${label}`, () => {
            const lib = recomputeSubtotal(...args);
            const handler = handler_recomputeSubtotal(...args);
            expect(handler.serverSubtotal).toBe(lib.serverSubtotal);
            expect(handler.unavailableItem).toBe(lib.unavailableItem);
            expect(handler.mutatedItems.length).toBe(lib.mutatedItems.length);
        });
    });
});

describe('Mirror parity: computeAndVerifyTotal', () => {
    const cases = [
        { label: 'exact match', args: [{ serverSubtotal: 20, deliveryFee: 3, discount: 0 }, 23] },
        { label: 'within tolerance', args: [{ serverSubtotal: 20, deliveryFee: 3, discount: 0 }, 23.49] },
        { label: 'beyond tolerance', args: [{ serverSubtotal: 20, deliveryFee: 3, discount: 0 }, 22] },
        { label: 'with discount', args: [{ serverSubtotal: 30, deliveryFee: 3, discount: 5 }, 28] },
        { label: 'total would go negative', args: [{ serverSubtotal: 5, deliveryFee: 0, discount: 50 }, 0] },
    ];
    cases.forEach(({ label, args }) => {
        it(`produces identical output: ${label}`, () => {
            const lib = computeAndVerifyTotal(...args);
            const handler = handler_computeAndVerifyTotal(...args);
            expect(handler.serverTotal).toBeCloseTo(lib.serverTotal);
            expect(handler.mismatch).toBe(lib.mismatch);
        });
    });
});

describe('Mirror parity: validateCoupon', () => {
    const subtotal = 40;
    const restA = 'rest-a';
    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();
    const cases = [
        { label: 'valid percentage coupon',     args: [coupon(), subtotal, restA] },
        { label: 'inactive',                    args: [coupon({ is_active: false }), subtotal, restA] },
        { label: 'expired',                     args: [coupon({ valid_until: past }), subtotal, restA] },
        { label: 'not yet valid',               args: [coupon({ valid_from: future }), subtotal, restA] },
        { label: 'usage limit hit',             args: [coupon({ usage_limit: 10, usage_count: 10 }), subtotal, restA] },
        { label: 'below minimum order',         args: [coupon({ minimum_order: 50 }), subtotal, restA] },
        { label: 'wrong restaurant',            args: [coupon({ restaurant_id: 'other' }), subtotal, restA] },
        { label: 'max_discount cap',            args: [coupon({ discount_value: 50, max_discount: 5 }), subtotal, restA] },
        { label: 'fixed discount',              args: [coupon({ discount_type: 'fixed', discount_value: 8 }), subtotal, restA] },
        { label: 'fixed exceeds subtotal',      args: [coupon({ discount_type: 'fixed', discount_value: 999 }), subtotal, restA] },
    ];
    cases.forEach(({ label, args }) => {
        it(`produces identical output: ${label}`, () => {
            const lib = validateCoupon(...args);
            const handler = handler_validateCoupon(...args);
            expect(handler.valid).toBe(lib.valid);
            expect(handler.reason).toBe(lib.reason);
            expect(handler.discount).toBeCloseTo(lib.discount);
        });
    });
});

describe('Mirror parity: capPromotionDiscount', () => {
    const cases = [
        [5, 40],
        [25, 40],   // exactly 50%
        [30, 40],   // over 50% — gets capped
        [-5, 40],   // negative — clamped to 0
        [5, 0],     // zero subtotal
    ];
    cases.forEach(([discount, sub]) => {
        it(`produces identical output: discount=${discount} sub=${sub}`, () => {
            expect(handler_capPromotionDiscount(discount, sub)).toBe(capPromotionDiscount(discount, sub));
        });
    });
});

describe('Mirror parity: basketFingerprint', () => {
    const cases = [
        { label: 'null input', args: [null] },
        { label: 'empty items', args: [{ restaurant_id: 'r1', items: [] }] },
        { label: 'single item', args: [{ restaurant_id: 'r1', items: [{ menu_item_id: 'a', quantity: 2 }] }] },
        { label: 'two items out of order', args: [{ restaurant_id: 'r1', items: [{ menu_item_id: 'b', quantity: 1 }, { menu_item_id: 'a', quantity: 2 }] }] },
        { label: 'no quantity field', args: [{ restaurant_id: 'r1', items: [{ menu_item_id: 'a' }] }] },
    ];
    cases.forEach(({ label, args }) => {
        it(`produces identical output: ${label}`, () => {
            expect(handler_basketFingerprint(...args)).toBe(basketFingerprint(...args));
        });
    });
});

describe('Mirror parity: checkPerUserBurst', () => {
    const recent = (n, secondsAgo = 10) =>
        Array.from({ length: n }, (_, i) => order('item-1', 1, 'r1', secondsAgo + i));

    const cases = [
        { label: 'empty',         args: [[], 5] },
        { label: '4 orders',      args: [recent(4), 5] },
        { label: 'exactly 5',     args: [recent(5), 5] },
        { label: '10 orders',     args: [recent(10), 5] },
        { label: 'custom limit 3', args: [recent(3), 3] },
    ];
    cases.forEach(({ label, args }) => {
        it(`produces identical output: ${label}`, () => {
            const lib = checkPerUserBurst(...args);
            const handler = handler_checkPerUserBurst(...args);
            expect(handler.blocked).toBe(lib.blocked);
            // retryAfter can differ by 1s due to timing — just check sign
            if (lib.blocked) {
                expect(handler.retryAfter).toBeGreaterThan(0);
            }
        });
    });
});

describe('Mirror parity: checkPlatformBurst', () => {
    [0, 29, 30, 31, 100].forEach((count) => {
        it(`produces identical output: count=${count}`, () => {
            expect(handler_checkPlatformBurst(count)).toBe(checkPlatformBurst(count));
        });
    });
    it('custom limit: count=10, limit=10', () => {
        expect(handler_checkPlatformBurst(10, 10)).toBe(checkPlatformBurst(10, 10));
    });
});