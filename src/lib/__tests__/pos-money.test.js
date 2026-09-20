/**
 * POS money-path tests
 * ====================
 * Every case below is a REGRESSION TEST for a bug that was live in the system.
 * None of them threw an error in production — each produced a plausible wrong
 * number, which is why they survived a passing build and manual use.
 *
 * If one of these fails, money is being lost or misreported. Treat a failure
 * here as more serious than a broken screen.
 */

import { describe, it, expect } from 'vitest';
import {
    derivePaymentStatus,
    resolvePaymentMethod,
    REVENUE_STATUSES,
    countsAsRevenue,
    sumRevenue,
    quickCashOptions,
    changeDue,
    approveDiscount,
    canCompleteOrder,
    tableReleasePatch,
} from '../pos-money-logic.js';

// ─────────────────────────────────────────────────────────────────────────────
describe('payment status', () => {
    it('marks a cash sale as confirmed', () => {
        expect(derivePaymentStatus({ payment_method: 'cash' })).toBe('payment_confirmed');
    });

    it('marks a card sale as paid_card', () => {
        expect(derivePaymentStatus({ payment_method: 'card' })).toBe('paid_card');
    });

    it('REGRESSION: a cart sent to a table stays unpaid', () => {
        // Was: every order defaulted to pending_payment because nothing set it,
        // so a paid takeaway looked identical to an open table tab.
        expect(derivePaymentStatus({ payment_method: null })).toBe('pending_payment');
        expect(derivePaymentStatus({})).toBe('pending_payment');
    });

    it('respects an explicitly supplied status', () => {
        expect(derivePaymentStatus({ payment_status: 'refunded', payment_method: 'cash' }))
            .toBe('refunded');
    });
});

describe('payment method', () => {
    it('REGRESSION: null must NOT become cash', () => {
        // Was: `payment_method || 'cash'`, so an unpaid table order was recorded
        // as money already taken.
        expect(resolvePaymentMethod(null)).toBeUndefined();
        expect(resolvePaymentMethod(undefined)).toBeUndefined();
    });

    it('preserves a real tender', () => {
        expect(resolvePaymentMethod('cash')).toBe('cash');
        expect(resolvePaymentMethod('card')).toBe('card');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('revenue', () => {
    it('REGRESSION: cancelled and refunded orders are not takings', () => {
        // Was: Reports summed every order in range, so a cancelled £50 order
        // still counted. End of Day filtered correctly, so the two screens
        // disagreed on the same day.
        expect(countsAsRevenue({ status: 'cancelled' })).toBe(false);
        expect(countsAsRevenue({ status: 'refunded' })).toBe(false);
        expect(countsAsRevenue({ status: 'refund_requested' })).toBe(false);
    });

    it('counts a delivery in flight — it has been paid for', () => {
        expect(countsAsRevenue({ status: 'out_for_delivery' })).toBe(true);
    });

    it('counts completed and in-progress sales', () => {
        for (const status of ['confirmed', 'preparing', 'ready_for_collection', 'delivered', 'collected']) {
            expect(countsAsRevenue({ status })).toBe(true);
        }
    });

    it('sums only real takings', () => {
        const orders = [
            { status: 'collected', total: 10 },
            { status: 'cancelled', total: 50 },   // must be excluded
            { status: 'delivered', total: 15.5 },
            { status: 'refunded', total: 20 },    // must be excluded
        ];
        expect(sumRevenue(orders)).toBe(25.5);
    });

    it('Reports and End of Day use the same status list', () => {
        // These screens previously disagreed. Keeping one exported constant is
        // what stops them drifting apart again.
        expect(REVENUE_STATUSES).toContain('out_for_delivery');
        expect(REVENUE_STATUSES).not.toContain('cancelled');
        expect(REVENUE_STATUSES).not.toContain('pending');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('quick cash', () => {
    const CASES = [3.20, 8.99, 10.00, 12.50, 26.46, 32.99, 47.00, 62.00, 85.50, 120.00, 0.01, 999.99];

    it('INVARIANT: never offers less than the amount owed', () => {
        // Was: a fixed [5,10,20,50] list, so on an £8.99 bill the £5 button
        // could not cover it. A button that produces a short payment is worse
        // than no button at all.
        for (const owed of CASES) {
            for (const opt of quickCashOptions(owed)) {
                expect(opt, `£${opt} offered for a £${owed} bill`).toBeGreaterThan(owed);
            }
        }
    });

    it('always fills four slots', () => {
        for (const owed of CASES) {
            expect(quickCashOptions(owed).length, `owed £${owed}`).toBe(4);
        }
    });

    it('returns ascending, de-duplicated values', () => {
        for (const owed of CASES) {
            const opts = quickCashOptions(owed);
            expect(new Set(opts).size).toBe(opts.length);
            expect([...opts].sort((a, b) => a - b)).toEqual(opts);
        }
    });

    it('offers the next round pound first — the commonest hand-over', () => {
        expect(quickCashOptions(8.99)[0]).toBe(9);
        expect(quickCashOptions(12.50)[0]).toBe(13);
    });

    it('handles a zero or negative balance without crashing', () => {
        expect(quickCashOptions(0)).toEqual([5, 10, 20, 50]);
        expect(quickCashOptions(-5)).toEqual([5, 10, 20, 50]);
    });
});

describe('change', () => {
    it('calculates change to the penny', () => {
        expect(changeDue(20, 13.49)).toBe(6.51);
        expect(changeDue(10, 6.99)).toBe(3.01);
    });

    it('never returns negative change on a short payment', () => {
        expect(changeDue(5, 10)).toBe(0);
    });

    it('avoids floating point drift', () => {
        // 0.1 + 0.2 territory - a penny out on every transaction compounds.
        expect(changeDue(20, 19.99)).toBe(0.01);
        expect(changeDue(50, 33.33)).toBe(16.67);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('discounts', () => {
    it('allows a discount within the manager limit', () => {
        const r = approveDiscount({ clientDiscount: 5, subtotal: 100, reasonCode: 'staff_meal' });
        expect(r.approved).toBe(5);
    });

    it('REGRESSION: an over-limit discount is REJECTED, not silently zeroed', () => {
        // Was: zeroed and the order proceeded - so the cashier quoted a
        // discounted price and the customer was charged full price, with
        // nothing on screen to show it.
        const r = approveDiscount({ clientDiscount: 50, subtotal: 100, reasonCode: 'staff_meal' });
        expect(r.approved).toBeNull();
        expect(r.reason).toBe('exceeds_manager_limit');
    });

    it('REGRESSION: a discount with no reason code is rejected', () => {
        const r = approveDiscount({ clientDiscount: 5, subtotal: 100, reasonCode: null });
        expect(r.approved).toBeNull();
        expect(r.reason).toBe('no_reason_code');
    });

    it('caps on percentage AND on absolute value', () => {
        // 10% of £1000 is £100 - under the percentage cap but far over the
        // fixed cap. Both limits have to bite.
        const r = approveDiscount({ clientDiscount: 100, subtotal: 1000, reasonCode: 'goodwill' });
        expect(r.approved).toBeNull();
    });

    it('lets an admin exceed the manager limit', () => {
        const r = approveDiscount({ clientDiscount: 50, subtotal: 100, reasonCode: 'goodwill', isAdmin: true });
        expect(r.approved).toBe(50);
    });

    it('treats no discount as a no-op', () => {
        expect(approveDiscount({ clientDiscount: 0, subtotal: 100 }).approved).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('table lifecycle', () => {
    it('REGRESSION: an unpaid dine-in order cannot be completed', () => {
        // Was: the Queue and KDS Complete buttons closed a table order with no
        // payment, freeing the table and leaving the food paid for by nobody.
        const order = { order_type: 'dine_in', payment_status: 'pending_payment' };
        expect(canCompleteOrder(order, 'collected').allowed).toBe(false);
        expect(canCompleteOrder(order, 'delivered').reason).toBe('unpaid_dine_in');
    });

    it('allows completing a PAID dine-in order', () => {
        const order = { order_type: 'dine_in', payment_status: 'payment_confirmed' };
        expect(canCompleteOrder(order, 'collected').allowed).toBe(true);
    });

    it('does not block takeaway orders — they are paid at creation', () => {
        const order = { order_type: 'takeaway', payment_status: 'pending_payment' };
        expect(canCompleteOrder(order, 'collected').allowed).toBe(true);
    });

    it('allows non-terminal transitions regardless', () => {
        const order = { order_type: 'dine_in', payment_status: 'pending_payment' };
        expect(canCompleteOrder(order, 'preparing').allowed).toBe(true);
    });

    it('releases a table when its own order finishes', () => {
        const order = { id: 'o1', order_type: 'dine_in', table_id: 't1' };
        const table = { id: 't1', current_order_id: 'o1' };
        expect(tableReleasePatch(order, table)).toEqual({
            status: 'needs_cleaning', current_order_id: null,
        });
    });

    it('does NOT release a table a different order now owns', () => {
        // Completing an old order must not free a table that has since been
        // re-seated.
        const order = { id: 'o1', order_type: 'dine_in', table_id: 't1' };
        const table = { id: 't1', current_order_id: 'o2' };
        expect(tableReleasePatch(order, table)).toBeNull();
    });

    it('ignores non-dine-in orders', () => {
        const order = { id: 'o1', order_type: 'takeaway', table_id: 't1' };
        expect(tableReleasePatch(order, { id: 't1' })).toBeNull();
    });
});
