/**
 * Cash drawer tests.
 *
 * A variance report is an accusation. Each case below is a way the naive
 * calculation blames staff for money that was never missing, or hides money
 * that was.
 */
import { describe, it, expect } from 'vitest';
import {
    cashTakenForOrder, expectedCash, cashVariance, countTotal, needsSignOff,
} from '../pos-cash-logic.js';

const sale = (o) => ({ status: 'collected', ...o });

describe('cash taken per order', () => {
    it('a plain cash sale', () => {
        expect(cashTakenForOrder(sale({ cash_amount: 13.49 })).cash).toBe(13.49);
    });

    it('CHANGE never counts - cash_amount is net of change', () => {
        // Customer hands over £20 for £13.49. The drawer keeps £13.49; the
        // £6.51 change goes back out. Counting the £20 would invent a £6.51
        // shortfall on every cash sale that gets change.
        expect(cashTakenForOrder(sale({ cash_amount: 13.49, cash_tendered: 20 })).cash).toBe(13.49);
    });

    it('a card sale puts nothing in the drawer', () => {
        expect(cashTakenForOrder(sale({ cash_amount: 0, card_amount: 30 })).cash).toBe(0);
    });

    it('SPLIT payment: only the cash portion counts', () => {
        // £30 bill, £10 cash + £20 card. The old data model recorded the whole
        // £30 as cash, which would show the drawer £20 short and blame staff for
        // money that went on a card.
        expect(cashTakenForOrder(sale({ cash_amount: 10, card_amount: 20, total: 30 })).cash).toBe(10);
    });

    it('a cash tip is in the drawer until it is paid out', () => {
        expect(cashTakenForOrder(sale({ cash_amount: 45 })).cash).toBe(45);
    });

    it('voided and refunded orders contribute nothing', () => {
        expect(cashTakenForOrder({ status: 'cancelled', cash_amount: 20 }).cash).toBe(0);
        expect(cashTakenForOrder({ status: 'refunded', cash_amount: 20 }).cash).toBe(0);
    });

    it('legacy plain cash order (no cash_amount) uses total + tip', () => {
        expect(cashTakenForOrder(sale({ payment_method: 'cash', total: 12, tip_amount: 1 })).cash).toBe(13);
    });

    it('legacy SPLIT order is flagged, never guessed', () => {
        // Its cash portion only exists in free text. Guessing would either
        // invent a shortfall or hide one, so it is reported instead.
        const r = cashTakenForOrder(sale({ payment_method: 'cash', total: 30, notes: 'cash: £10.00, card: £20.00' }));
        expect(r.cash).toBe(0);
        expect(r.legacy_split).toBe(true);
    });

    it('legacy card order contributes nothing', () => {
        expect(cashTakenForOrder(sale({ payment_method: 'card', total: 30 })).cash).toBe(0);
    });
});

describe('expected drawer', () => {
    it('float + cash sales + paid in − paid out', () => {
        const r = expectedCash({
            openingFloat: 100,
            orders: [sale({ cash_amount: 13.49 }), sale({ cash_amount: 10, card_amount: 20 }), sale({ card_amount: 25 })],
            movements: [{ type: 'paid_in', amount: 50 }, { type: 'paid_out', amount: 8 }],
        });
        expect(r.cashSales).toBe(23.49);
        expect(r.expected).toBe(165.49);   // 100 + 23.49 + 50 − 8
    });

    it('a void mid-shift does not inflate the expected figure', () => {
        const r = expectedCash({
            openingFloat: 100,
            orders: [sale({ cash_amount: 20 }), { status: 'cancelled', cash_amount: 20 }],
        });
        expect(r.expected).toBe(120);
    });

    it('a paid-out amount is subtracted even if entered as negative', () => {
        expect(expectedCash({ openingFloat: 100, movements: [{ type: 'paid_out', amount: -10 }] }).expected).toBe(90);
    });

    it('reports how many legacy splits could not be counted', () => {
        const r = expectedCash({ orders: [sale({ payment_method: 'cash', total: 30, notes: 'cash: £10.00, card: £20.00' })] });
        expect(r.legacySplitCount).toBe(1);
    });

    it('an empty shift expects exactly the float', () => {
        expect(expectedCash({ openingFloat: 150 }).expected).toBe(150);
    });
});

describe('variance', () => {
    it('negative is SHORT', () => {
        expect(cashVariance(95, 100)).toBe(-5);
    });

    it('positive is OVER', () => {
        expect(cashVariance(102.5, 100)).toBe(2.5);
    });

    it('an exact drawer is exactly zero - never a phantom penny', () => {
        expect(cashVariance(165.49, 165.49)).toBe(0);
        expect(cashVariance(0.1 + 0.2, 0.3)).toBe(0);
    });
});

describe('counting by denomination', () => {
    it('totals a mixed drawer', () => {
        expect(countTotal({ 20: 3, 10: 2, 1: 5, 0.5: 1 })).toBe(85.5);
    });

    it('REGRESSION GUARD: seven 5p coins are exactly 35p', () => {
        // 0.05 added seven times in floating point is 0.35000000000000003 -
        // enough to turn an exact drawer into a reported 1p variance.
        expect(countTotal({ 0.05: 7 })).toBe(0.35);
    });

    it('ignores negative or fractional counts', () => {
        expect(countTotal({ 10: -3, 5: 2.7 })).toBe(10);
    });
});

describe('manager sign-off', () => {
    it('within £5 does not need sign-off', () => {
        expect(needsSignOff(-4.99)).toBe(false);
    });

    it('over £5 either way does', () => {
        expect(needsSignOff(-5.01)).toBe(true);
        expect(needsSignOff(12)).toBe(true);
    });

    it('being OVER needs sign-off too - unexplained cash is also a problem', () => {
        // An over drawer often means a sale was not rung in.
        expect(needsSignOff(20)).toBe(true);
    });
});
