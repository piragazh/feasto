/**
 * D) ORDER ABUSE CONTROLS
 *
 * Tests the orderVelocityThrottle logic:
 * - per-user burst limit (5 orders/60s)
 * - platform circuit breaker (30 orders/60s)
 * - duplicate basket fingerprint guard
 * - idempotency key behaviour (verified via logic, not HTTP)
 */

import { describe, it, expect } from 'vitest';
import { basketFingerprint, checkPerUserBurst, checkPlatformBurst } from '../order-logic.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeOrder = (menu_item_id, quantity, restaurant_id = 'rest-1', secondsAgo = 10) => {
    const created_date = new Date(Date.now() - secondsAgo * 1000).toISOString();
    return { restaurant_id, items: [{ menu_item_id, quantity }], created_date };
};

// ─── basketFingerprint ────────────────────────────────────────────────────────

describe('basketFingerprint', () => {
    it('returns null for empty or missing items', () => {
        expect(basketFingerprint({ restaurant_id: 'r1', items: [] })).toBeNull();
        expect(basketFingerprint({ restaurant_id: 'r1' })).toBeNull();
        expect(basketFingerprint(null)).toBeNull();
    });

    it('produces the same fingerprint for identical baskets', () => {
        const a = { restaurant_id: 'r1', items: [{ menu_item_id: 'item-a', quantity: 2 }] };
        const b = { restaurant_id: 'r1', items: [{ menu_item_id: 'item-a', quantity: 2 }] };
        expect(basketFingerprint(a)).toBe(basketFingerprint(b));
    });

    it('produces different fingerprints for different quantities', () => {
        const a = { restaurant_id: 'r1', items: [{ menu_item_id: 'item-a', quantity: 1 }] };
        const b = { restaurant_id: 'r1', items: [{ menu_item_id: 'item-a', quantity: 2 }] };
        expect(basketFingerprint(a)).not.toBe(basketFingerprint(b));
    });

    it('produces different fingerprints for different restaurants', () => {
        const a = { restaurant_id: 'r1', items: [{ menu_item_id: 'item-a', quantity: 1 }] };
        const b = { restaurant_id: 'r2', items: [{ menu_item_id: 'item-a', quantity: 1 }] };
        expect(basketFingerprint(a)).not.toBe(basketFingerprint(b));
    });

    it('is order-independent — item order in array does not matter', () => {
        const a = {
            restaurant_id: 'r1',
            items: [
                { menu_item_id: 'item-b', quantity: 1 },
                { menu_item_id: 'item-a', quantity: 2 },
            ],
        };
        const b = {
            restaurant_id: 'r1',
            items: [
                { menu_item_id: 'item-a', quantity: 2 },
                { menu_item_id: 'item-b', quantity: 1 },
            ],
        };
        expect(basketFingerprint(a)).toBe(basketFingerprint(b));
    });

    it('produces different fingerprints when one extra item is added', () => {
        const a = { restaurant_id: 'r1', items: [{ menu_item_id: 'item-a', quantity: 1 }] };
        const b = {
            restaurant_id: 'r1',
            items: [
                { menu_item_id: 'item-a', quantity: 1 },
                { menu_item_id: 'item-b', quantity: 1 },
            ],
        };
        expect(basketFingerprint(a)).not.toBe(basketFingerprint(b));
    });

    it('defaults quantity to 1 when quantity is missing', () => {
        const a = { restaurant_id: 'r1', items: [{ menu_item_id: 'item-a', quantity: 1 }] };
        const b = { restaurant_id: 'r1', items: [{ menu_item_id: 'item-a' }] };
        expect(basketFingerprint(a)).toBe(basketFingerprint(b));
    });
});

// ─── checkPerUserBurst ────────────────────────────────────────────────────────

describe('checkPerUserBurst', () => {
    it('allows order when user has 0 recent orders', () => {
        const { blocked } = checkPerUserBurst([]);
        expect(blocked).toBe(false);
    });

    it('allows order when user has 4 recent orders (below limit of 5)', () => {
        const orders = Array.from({ length: 4 }, (_, i) => makeOrder('item-a', 1, 'r1', 10 + i));
        const { blocked } = checkPerUserBurst(orders);
        expect(blocked).toBe(false);
    });

    it('blocks order when user has exactly 5 recent orders (at limit)', () => {
        const orders = Array.from({ length: 5 }, (_, i) => makeOrder('item-a', 1, 'r1', 10 + i));
        const { blocked } = checkPerUserBurst(orders, 5);
        expect(blocked).toBe(true);
    });

    it('blocks order when user has 10 recent orders (well over limit)', () => {
        const orders = Array.from({ length: 10 }, (_, i) => makeOrder('item-a', 1, 'r1', 5 + i));
        const { blocked } = checkPerUserBurst(orders, 5);
        expect(blocked).toBe(true);
    });

    it('retryAfter is a positive integer when blocked', () => {
        const orders = Array.from({ length: 5 }, (_, i) => makeOrder('item-a', 1, 'r1', 5 + i));
        const { blocked, retryAfter } = checkPerUserBurst(orders, 5);
        expect(blocked).toBe(true);
        expect(retryAfter).toBeGreaterThan(0);
        expect(Number.isInteger(retryAfter)).toBe(true);
    });

    it('respects a custom limit argument', () => {
        const orders = Array.from({ length: 3 }, (_, i) => makeOrder('item-a', 1, 'r1', 5 + i));
        expect(checkPerUserBurst(orders, 3).blocked).toBe(true);
        expect(checkPerUserBurst(orders, 4).blocked).toBe(false);
    });
});

// ─── checkPlatformBurst ───────────────────────────────────────────────────────

describe('checkPlatformBurst', () => {
    it('does not trip below platform threshold', () => {
        expect(checkPlatformBurst(29)).toBe(false);
        expect(checkPlatformBurst(0)).toBe(false);
    });

    it('trips circuit breaker at exactly 30 orders', () => {
        expect(checkPlatformBurst(30)).toBe(true);
    });

    it('trips circuit breaker above 30 orders', () => {
        expect(checkPlatformBurst(31)).toBe(true);
        expect(checkPlatformBurst(999)).toBe(true);
    });

    it('respects custom limit argument', () => {
        expect(checkPlatformBurst(10, 10)).toBe(true);
        expect(checkPlatformBurst(9, 10)).toBe(false);
    });
});

// ─── Idempotency key semantics (logic-level, not HTTP) ────────────────────────

describe('Idempotency key dedup logic', () => {
    /**
     * The actual DB check lives in the Deno handler, but we can verify the
     * logic: if an existing order with the same key is found, the handler
     * should return the existing order rather than creating a new one.
     * We simulate that decision here.
     */
    const simulateIdempotencyCheck = (existingOrders, idempotencyKey) => {
        if (!idempotencyKey) return { isDuplicate: false, existingOrder: null };
        const found = existingOrders.find(o => o.idempotency_key === idempotencyKey);
        return found
            ? { isDuplicate: true, existingOrder: found }
            : { isDuplicate: false, existingOrder: null };
    };

    it('detects duplicate submission with the same idempotency key', () => {
        const existing = [{ id: 'order-123', idempotency_key: 'key-abc' }];
        const { isDuplicate, existingOrder } = simulateIdempotencyCheck(existing, 'key-abc');
        expect(isDuplicate).toBe(true);
        expect(existingOrder.id).toBe('order-123');
    });

    it('allows submission when key is new', () => {
        const existing = [{ id: 'order-123', idempotency_key: 'key-abc' }];
        const { isDuplicate } = simulateIdempotencyCheck(existing, 'key-xyz');
        expect(isDuplicate).toBe(false);
    });

    it('treats missing idempotency key as non-duplicate (allows through)', () => {
        const { isDuplicate } = simulateIdempotencyCheck([], undefined);
        expect(isDuplicate).toBe(false);
    });
});