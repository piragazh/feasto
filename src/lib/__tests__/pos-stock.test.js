/**
 * Stock and auto-86 tests.
 */
import { describe, it, expect } from 'vitest';
import { stockDemand, applySale, applyRestore, stockState } from '../pos-stock-logic.js';

const tracked = (o) => ({ track_stock: true, is_available: true, ...o });

describe('stock demand per order', () => {
    it('REGRESSION GUARD: the same item on two lines is SUMMED', () => {
        // Two pizzas with different toppings are two lines of one item.
        // Counting only the first line under-decrements and oversells.
        const d = stockDemand({ items: [
            { menu_item_id: 'pizza', quantity: 1 },
            { menu_item_id: 'pizza', quantity: 2 },
            { menu_item_id: 'cola', quantity: 1 },
        ] });
        expect(d.get('pizza')).toBe(3);
        expect(d.get('cola')).toBe(1);
    });

    it('ignores custom hand-keyed items - they have no stock', () => {
        expect(stockDemand({ items: [{ menu_item_id: 'custom-123', quantity: 5 }] }).size).toBe(0);
    });

    it('ignores zero, negative and nonsense quantities', () => {
        const d = stockDemand({ items: [
            { menu_item_id: 'a', quantity: 0 },
            { menu_item_id: 'b', quantity: -2 },
            { menu_item_id: 'c', quantity: 'x' },
        ] });
        expect(d.size).toBe(0);
    });

    it('an order with no items demands nothing', () => {
        expect(stockDemand({}).size).toBe(0);
    });
});

describe('selling', () => {
    it('decrements tracked stock', () => {
        expect(applySale(tracked({ stock_quantity: 10 }), 3).stock_quantity).toBe(7);
    });

    it('leaves UNTRACKED items completely alone - tracking is opt-in', () => {
        expect(applySale({ stock_quantity: 10, is_available: true }, 3)).toBeNull();
    });

    it('auto-86s at zero', () => {
        const r = applySale(tracked({ stock_quantity: 2 }), 2);
        expect(r.stock_quantity).toBe(0);
        expect(r.is_available).toBe(false);
        expect(r.auto_86ed).toBe(true);
        expect(r.hitZero).toBe(true);
    });

    it('REPORTS overselling rather than hiding it', () => {
        // Two tills selling the last portion at once - the platform has no
        // atomic decrement. The kitchen needs to know it promised food it may
        // not have.
        const r = applySale(tracked({ stock_quantity: 1 }), 3);
        expect(r.stock_quantity).toBe(0);      // never negative
        expect(r.oversold).toBe(2);
    });

    it('a sale never switches an item ON', () => {
        // A manager had it off; selling one (e.g. a queued offline order) must
        // not put it back on sale.
        const r = applySale(tracked({ stock_quantity: 5, is_available: false }), 1);
        expect(r.is_available).toBe(false);
    });

    it('flags low stock at the threshold', () => {
        expect(applySale(tracked({ stock_quantity: 6, low_stock_threshold: 5 }), 1).low).toBe(true);
        expect(applySale(tracked({ stock_quantity: 10, low_stock_threshold: 5 }), 1).low).toBe(false);
    });

    it('zero is "out", not "low"', () => {
        expect(applySale(tracked({ stock_quantity: 1, low_stock_threshold: 5 }), 1).low).toBe(false);
    });
});

describe('restoring after a void or refund', () => {
    it('returns stock to the shelf', () => {
        expect(applyRestore(tracked({ stock_quantity: 2 }), 3).stock_quantity).toBe(5);
    });

    it('brings back an item that was AUTOMATICALLY 86ed', () => {
        const r = applyRestore(tracked({ stock_quantity: 0, is_available: false, auto_86ed: true }), 1);
        expect(r.is_available).toBe(true);
        expect(r.auto_86ed).toBe(false);
    });

    it('REGRESSION GUARD: never revives an item a MANAGER took off', () => {
        // The fryer is broken. A voided order must not quietly put chips
        // back on sale.
        const r = applyRestore(tracked({ stock_quantity: 0, is_available: false, auto_86ed: false }), 4);
        expect(r.stock_quantity).toBe(4);
        expect(r.is_available).toBe(false);
    });

    it('leaves untracked items alone', () => {
        expect(applyRestore({ stock_quantity: 0 }, 3)).toBeNull();
    });
});

describe('stock state', () => {
    it('untracked / in / low / out', () => {
        expect(stockState({})).toBe('untracked');
        expect(stockState(tracked({ stock_quantity: 20, low_stock_threshold: 5 }))).toBe('in');
        expect(stockState(tracked({ stock_quantity: 3, low_stock_threshold: 5 }))).toBe('low');
        expect(stockState(tracked({ stock_quantity: 0 }))).toBe('out');
    });
});

describe('round trip', () => {
    it('sell to zero, then void, returns to exactly where it started', () => {
        const start = tracked({ stock_quantity: 3 });
        const sold = { ...start, ...applySale(start, 3) };
        expect(sold.is_available).toBe(false);
        const back = { ...sold, ...applyRestore(sold, 3) };
        expect(back.stock_quantity).toBe(3);
        expect(back.is_available).toBe(true);
    });
});
