/**
 * Tip handling tests.
 *
 * The core invariant: a tip is never revenue. It is charged to the customer and
 * owed to staff; it must not appear in the restaurant's takings.
 */
import { describe, it, expect } from 'vitest';
import {
    tipFromPercent, validateTip, amountToCharge, sumTips, sumRevenue, TIP_PRESETS,
} from '../pos-money-logic.js';

describe('tip calculation', () => {
    it('calculates a percentage tip to the penny', () => {
        expect(tipFromPercent(40, 12.5)).toBe(5);
        expect(tipFromPercent(33.33, 10)).toBe(3.33);
    });

    it('returns zero for no tip or an empty bill', () => {
        expect(tipFromPercent(40, 0)).toBe(0);
        expect(tipFromPercent(0, 12.5)).toBe(0);
    });

    it('offers a no-tip preset - tipping must never be forced', () => {
        expect(TIP_PRESETS).toContain(0);
    });
});

describe('tip validation', () => {
    it('accepts a normal tip', () => {
        expect(validateTip(5, 40)).toEqual({ tip: 5, error: null });
    });

    it('treats an empty tip as zero', () => {
        expect(validateTip('', 40).tip).toBe(0);
        expect(validateTip(undefined, 40).tip).toBe(0);
    });

    it('rejects a negative tip - it would act as a hidden discount', () => {
        expect(validateTip(-5, 40).error).toBe('negative');
    });

    it('REJECTS rather than clamps a tip larger than the bill', () => {
        // £50 on a £10 bill is almost certainly a keying error. Silently
        // reducing it would charge the customer an amount they never agreed to.
        const r = validateTip(50, 10);
        expect(r.tip).toBeNull();
        expect(r.error).toBe('exceeds_bill');
    });

    it('rejects nonsense input', () => {
        expect(validateTip('abc', 40).error).toBe('invalid');
    });
});

describe('INVARIANT: a tip is never revenue', () => {
    it('charges the customer total + tip', () => {
        expect(amountToCharge(40, 5)).toBe(45);
    });

    it('revenue excludes tips entirely', () => {
        // If tips were folded into `total`, every report would overstate the
        // restaurant's takings by money it is legally obliged to pay to staff
        // (Employment (Allocation of Tips) Act 2023).
        const orders = [
            { status: 'collected', total: 40, tip_amount: 5 },
            { status: 'collected', total: 20, tip_amount: 3 },
        ];
        expect(sumRevenue(orders)).toBe(60);   // NOT 68
        expect(sumTips(orders)).toBe(8);
    });

    it('sums tips separately for distribution', () => {
        expect(sumTips([{ tip_amount: 1.1 }, { tip_amount: 2.2 }])).toBe(3.3);
    });
});
