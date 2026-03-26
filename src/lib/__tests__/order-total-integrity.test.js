/**
 * A) ORDER TOTAL INTEGRITY
 *
 * Verifies that the server-side price recomputation logic:
 *   - always uses authoritative menu prices, never client-supplied ones
 *   - detects and rejects unavailable items
 *   - rejects totals that deviate beyond tolerance
 *   - never produces a negative final total
 */

import { describe, it, expect } from 'vitest';
import { recomputeSubtotal, computeAndVerifyTotal } from '../order-logic.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const menuItem = (id, price, available = true) => ({
    id,
    name: `Item ${id}`,
    price,
    is_available: available,
});

const cartItem = (menu_item_id, quantity, clientPrice) => ({
    menu_item_id,
    name: `Item ${menu_item_id}`,
    quantity,
    price: clientPrice,
});

// ─── recomputeSubtotal ────────────────────────────────────────────────────────

describe('recomputeSubtotal', () => {
    it('uses authoritative menu price, ignoring client-supplied price', () => {
        const map = new Map([['item-1', menuItem('item-1', 10.00)]]);
        // Client claims price is £1 — should be overwritten to £10
        const { serverSubtotal, mutatedItems } = recomputeSubtotal(
            [cartItem('item-1', 2, 1.00)],
            map
        );
        expect(serverSubtotal).toBe(20.00);
        expect(mutatedItems[0].price).toBe(10.00);
    });

    it('sums multiple items correctly using server prices', () => {
        const map = new Map([
            ['item-a', menuItem('item-a', 5.00)],
            ['item-b', menuItem('item-b', 8.50)],
        ]);
        const { serverSubtotal } = recomputeSubtotal(
            [cartItem('item-a', 3, 999), cartItem('item-b', 1, 999)],
            map
        );
        expect(serverSubtotal).toBeCloseTo(23.50);
    });

    it('returns unavailableItem when a cart item is not in the menu', () => {
        const map = new Map([['item-1', menuItem('item-1', 10.00)]]);
        const { unavailableItem, serverSubtotal } = recomputeSubtotal(
            [cartItem('ghost-item', 1, 5.00)],
            map
        );
        expect(unavailableItem).toBeTruthy();
        expect(serverSubtotal).toBe(0);
    });

    it('returns unavailableItem when a menu item is marked is_available=false', () => {
        const map = new Map([['item-off', menuItem('item-off', 10.00, false)]]);
        const { unavailableItem } = recomputeSubtotal(
            [cartItem('item-off', 1, 10.00)],
            map
        );
        expect(unavailableItem).toBeTruthy();
    });

    it('handles quantity=1 correctly when quantity is omitted', () => {
        const map = new Map([['item-1', menuItem('item-1', 7.00)]]);
        const item = { menu_item_id: 'item-1', name: 'Item item-1' }; // no quantity
        const { serverSubtotal } = recomputeSubtotal([item], map);
        expect(serverSubtotal).toBe(7.00);
    });
});

// ─── computeAndVerifyTotal ────────────────────────────────────────────────────

describe('computeAndVerifyTotal', () => {
    it('accepts client total when within £0.50 tolerance', () => {
        const { serverTotal, mismatch } = computeAndVerifyTotal(
            { serverSubtotal: 20.00, deliveryFee: 2.99, discount: 0 },
            22.99
        );
        expect(serverTotal).toBeCloseTo(22.99);
        expect(mismatch).toBe(false);
    });

    it('rejects client total when deviation exceeds £0.50', () => {
        const { mismatch } = computeAndVerifyTotal(
            { serverSubtotal: 20.00, deliveryFee: 2.99, discount: 0 },
            18.00 // £4.99 short — clearly wrong
        );
        expect(mismatch).toBe(true);
    });

    it('accepts a client total that differs by exactly £0.50 (boundary)', () => {
        const { mismatch } = computeAndVerifyTotal(
            { serverSubtotal: 20.00, deliveryFee: 0, discount: 0 },
            20.50 // exactly at tolerance boundary
        );
        expect(mismatch).toBe(false);
    });

    it('rejects a client total that differs by £0.51 (just over boundary)', () => {
        const { mismatch } = computeAndVerifyTotal(
            { serverSubtotal: 20.00, deliveryFee: 0, discount: 0 },
            20.51
        );
        expect(mismatch).toBe(true);
    });

    it('total is never negative even when discount exceeds subtotal+fee', () => {
        const { serverTotal } = computeAndVerifyTotal(
            { serverSubtotal: 10.00, deliveryFee: 0, discount: 50.00 },
            0
        );
        expect(serverTotal).toBe(0);
    });

    it('correctly subtracts delivery fee and discount together', () => {
        const { serverTotal } = computeAndVerifyTotal(
            { serverSubtotal: 30.00, deliveryFee: 3.50, discount: 5.00 },
            28.50
        );
        expect(serverTotal).toBeCloseTo(28.50);
    });
});