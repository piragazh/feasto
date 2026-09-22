/**
 * Labour and timesheet tests.
 *
 * Pay is where rounding becomes a legal problem. The clock-change cases matter
 * most because they are right all year except two nights - which is precisely
 * why nobody catches them in testing.
 */
import { describe, it, expect } from 'vitest';
import {
    workedMinutes, isForgottenClockOut, breakShortfall, entryPay, labourSummary,
} from '../pos-labour-logic.js';

describe('worked minutes', () => {
    it('a normal shift', () => {
        expect(workedMinutes({ clock_in: '2026-01-14T09:00:00Z', clock_out: '2026-01-14T17:00:00Z' })).toBe(480);
    });

    it('breaks are deducted', () => {
        expect(workedMinutes({ clock_in: '2026-01-14T09:00:00Z', clock_out: '2026-01-14T17:00:00Z', break_minutes: 30 })).toBe(450);
    });

    it('a shift crossing midnight', () => {
        expect(workedMinutes({ clock_in: '2026-01-14T22:00:00Z', clock_out: '2026-01-15T06:00:00Z' })).toBe(480);
    });

    it('REGRESSION GUARD: clocks go BACK - 22:00 to 06:00 local is 9 real hours', () => {
        // 25 Oct 2026: 22:00 BST = 21:00 UTC, 06:00 GMT = 06:00 UTC. Nine
        // hours. Subtracting wall-clock times says eight, and underpays by one.
        expect(workedMinutes({ clock_in: '2026-10-24T21:00:00Z', clock_out: '2026-10-25T06:00:00Z' })).toBe(540);
    });

    it('REGRESSION GUARD: clocks go FORWARD - 22:00 to 06:00 local is 7 real hours', () => {
        // 29 Mar 2026: 22:00 GMT = 22:00 UTC, 06:00 BST = 05:00 UTC.
        expect(workedMinutes({ clock_in: '2026-03-28T22:00:00Z', clock_out: '2026-03-29T05:00:00Z' })).toBe(420);
    });

    it('an open shift is null - unfinished, not zero', () => {
        expect(workedMinutes({ clock_in: '2026-01-14T09:00:00Z' })).toBeNull();
    });

    it('reversed or missing times are null, never negative pay', () => {
        expect(workedMinutes({ clock_in: '2026-01-14T17:00:00Z', clock_out: '2026-01-14T09:00:00Z' })).toBeNull();
        expect(workedMinutes({ clock_out: '2026-01-14T09:00:00Z' })).toBeNull();
    });

    it('a break longer than the shift clamps to zero', () => {
        expect(workedMinutes({ clock_in: '2026-01-14T09:00:00Z', clock_out: '2026-01-14T09:30:00Z', break_minutes: 60 })).toBe(0);
    });
});

describe('forgotten clock-outs', () => {
    const now = new Date('2026-01-15T12:00:00Z');

    it('flags an open shift older than 16 hours', () => {
        expect(isForgottenClockOut({ clock_in: '2026-01-14T09:00:00Z' }, now)).toBe(true);
    });

    it('does not flag a normal open shift', () => {
        expect(isForgottenClockOut({ clock_in: '2026-01-15T09:00:00Z' }, now)).toBe(false);
    });

    it('never flags a closed shift', () => {
        expect(isForgottenClockOut({ clock_in: '2026-01-10T09:00:00Z', clock_out: '2026-01-10T17:00:00Z' }, now)).toBe(false);
    });
});

describe('statutory breaks', () => {
    it('over 6 hours with no break falls short', () => {
        expect(breakShortfall({ clock_in: '2026-01-14T09:00:00Z', clock_out: '2026-01-14T16:00:00Z' })).toBe(true);
    });

    it('over 6 hours with a 20 minute break is fine', () => {
        expect(breakShortfall({ clock_in: '2026-01-14T09:00:00Z', clock_out: '2026-01-14T16:00:00Z', break_minutes: 20 })).toBe(false);
    });

    it('a short shift needs no break', () => {
        expect(breakShortfall({ clock_in: '2026-01-14T09:00:00Z', clock_out: '2026-01-14T13:00:00Z' })).toBe(false);
    });
});

describe('pay', () => {
    it('pays by the minute, not rounded hours', () => {
        // 7h 50m at £12.21. Rounding to 7h45 would underpay.
        expect(entryPay({ clock_in: '2026-01-14T09:00:00Z', clock_out: '2026-01-14T16:50:00Z' }, 12.21)).toBe(95.65);
    });

    it('no penny lost to floating point', () => {
        // 1 minute at £12.21 = 20.35p → 20p. Multiply-first keeps it exact.
        expect(entryPay({ clock_in: '2026-01-14T09:00:00Z', clock_out: '2026-01-14T09:01:00Z' }, 12.21)).toBe(0.2);
    });

    it('pays the extra hour on clocks-back night', () => {
        expect(entryPay({ clock_in: '2026-10-24T21:00:00Z', clock_out: '2026-10-25T06:00:00Z' }, 12)).toBe(108);
    });

    it('returns null rather than guessing when there is no rate', () => {
        expect(entryPay({ clock_in: '2026-01-14T09:00:00Z', clock_out: '2026-01-14T17:00:00Z' }, undefined)).toBeNull();
    });

    it('returns null for an unfinished shift', () => {
        expect(entryPay({ clock_in: '2026-01-14T09:00:00Z' }, 12)).toBeNull();
    });
});

describe('labour summary', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    const entries = [
        { staff_id: 'a', clock_in: '2026-01-14T09:00:00Z', clock_out: '2026-01-14T17:00:00Z', break_minutes: 30 },
        { staff_id: 'b', clock_in: '2026-01-14T12:00:00Z', clock_out: '2026-01-14T16:00:00Z' },
        { staff_id: 'c', clock_in: '2026-01-14T09:00:00Z', clock_out: '2026-01-14T17:00:00Z' },  // no rate
        { staff_id: 'a', clock_in: '2026-01-13T09:00:00Z' },                                    // forgotten
    ];
    const rates = { a: 12, b: 11 };

    it('totals hours and cost from finished shifts only', () => {
        const s = labourSummary(entries, rates, 1000, now);
        expect(s.hours).toBe(19.5);            // 7.5 + 4 + 8
        expect(s.labourCost).toBe(134);        // 90 + 44 (c has no rate)
    });

    it('labour % of sales', () => {
        expect(labourSummary(entries, rates, 1000, now).labourPercent).toBe(13.4);
    });

    it('labour % is null, not 0% or Infinity, with no sales', () => {
        expect(labourSummary(entries, rates, 0, now).labourPercent).toBeNull();
    });

    it('counts what it could NOT include, so the total is not trusted blindly', () => {
        const s = labourSummary(entries, rates, 1000, now);
        expect(s.unfinished).toBe(1);
        expect(s.forgotten).toBe(1);
        expect(s.missingRate).toBe(1);
    });

    it('counts break shortfalls', () => {
        expect(labourSummary(entries, rates, 1000, now).breakIssues).toBe(1);  // c: 8h, no break
    });
});

import { rateInForce } from '../pos-labour-logic.js';

describe('rate in force on the day', () => {
    const rates = [
        { staff_id: 'a', hourly_rate: 11.44, effective_from: '2025-04-01' },
        { staff_id: 'a', hourly_rate: 12.21, effective_from: '2026-04-01' },
        { staff_id: 'b', hourly_rate: 13.00, effective_from: '2025-01-01' },
    ];

    it('REGRESSION GUARD: a March shift is costed at the March rate, not after the April rise', () => {
        // Using today's rate for historic shifts misstates every period before
        // the last minimum-wage rise.
        expect(rateInForce(rates, 'a', '2026-03-20T10:00:00Z')).toBe(11.44);
    });

    it('a shift after the rise uses the new rate', () => {
        expect(rateInForce(rates, 'a', '2026-04-02T10:00:00Z')).toBe(12.21);
    });

    it('the rise applies from its effective date itself', () => {
        expect(rateInForce(rates, 'a', '2026-04-01T09:00:00Z')).toBe(12.21);
    });

    it('undefined before any rate started - reported missing, never guessed', () => {
        expect(rateInForce(rates, 'a', '2024-06-01T10:00:00Z')).toBeUndefined();
    });

    it('never borrows another staff member\'s rate', () => {
        expect(rateInForce(rates, 'c', '2026-05-01T10:00:00Z')).toBeUndefined();
    });

    it('labourSummary costs each shift at its own day\'s rate', () => {
        const entries = [
            { staff_id: 'a', clock_in: '2026-03-20T09:00:00Z', clock_out: '2026-03-20T17:00:00Z' },  // 8h @ 11.44
            { staff_id: 'a', clock_in: '2026-04-20T09:00:00Z', clock_out: '2026-04-20T17:00:00Z' },  // 8h @ 12.21
        ];
        expect(labourSummary(entries, rates, 0).labourCost).toBe(189.2);   // 91.52 + 97.68
    });
});
