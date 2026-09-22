/**
 * Menu schedule tests.
 *
 * The cases that matter most are the ones nobody notices in testing: British
 * Summer Time, and windows that cross midnight. A schedule that is right in
 * January and an hour wrong in July will pass every manual check done in winter.
 *
 * All instants below are written in UTC ('Z') on purpose - that is what the
 * backend clock reports - and the assertions are about UK LOCAL time.
 */
import { describe, it, expect } from 'vitest';
import {
    localClock, toMinutes, isWithinWindow, isItemAvailableNow, scheduledPrice,
} from '../pos-schedule-logic.js';

// 2026 UK clocks go forward Sun 29 March, back Sun 25 October.
const WINTER_5PM = new Date('2026-01-14T17:00:00Z');   // Wed, GMT: 17:00 local
const SUMMER_4PM_UTC = new Date('2026-07-15T16:00:00Z'); // Wed, BST: 17:00 local
const SUMMER_6PM_UTC = new Date('2026-07-15T18:00:00Z'); // Wed, BST: 19:00 local

const HAPPY_HOUR = { days: [1, 2, 3, 4, 5], start: '17:00', end: '19:00' };

describe('local clock', () => {
    it('reads GMT in winter', () => {
        expect(localClock(WINTER_5PM)).toEqual({ day: 3, minutes: 17 * 60 });
    });

    it('REGRESSION GUARD: applies BST in summer - 16:00 UTC is 17:00 in London', () => {
        // A naive UTC comparison would read this as 16:00 and start every
        // summer window an hour late.
        expect(localClock(SUMMER_4PM_UTC)).toEqual({ day: 3, minutes: 17 * 60 });
    });

    it('rolls the DAY over correctly near midnight in BST', () => {
        // 23:30 UTC on Saturday is 00:30 Sunday in London in summer.
        expect(localClock(new Date('2026-07-18T23:30:00Z')).day).toBe(0);
    });
});

describe('time parsing', () => {
    it('parses HH:MM', () => {
        expect(toMinutes('17:30')).toBe(1050);
        expect(toMinutes('00:00')).toBe(0);
        expect(toMinutes('9:05')).toBe(545);
    });

    it('rejects malformed times rather than guessing', () => {
        for (const bad of ['25:00', '12:60', 'noon', '', null, '1730']) {
            expect(toMinutes(bad), String(bad)).toBeNull();
        }
    });
});

describe('happy hour across the clock change', () => {
    it('is ON at 17:00 local in winter', () => {
        expect(isWithinWindow(HAPPY_HOUR, WINTER_5PM)).toBe(true);
    });

    it('REGRESSION GUARD: is ON at 17:00 local in SUMMER (16:00 UTC)', () => {
        // The bug this prevents: full price charged for the first hour of
        // every summer happy hour.
        expect(isWithinWindow(HAPPY_HOUR, SUMMER_4PM_UTC)).toBe(true);
    });

    it('REGRESSION GUARD: is OFF at 19:00 local in SUMMER (18:00 UTC)', () => {
        // The mirror-image bug: the discount keeps running an hour after it
        // should have ended.
        expect(isWithinWindow(HAPPY_HOUR, SUMMER_6PM_UTC)).toBe(false);
    });

    it('end time is exclusive - 19:00 exactly is outside a 17:00-19:00 window', () => {
        expect(isWithinWindow(HAPPY_HOUR, new Date('2026-01-14T19:00:00Z'))).toBe(false);
    });

    it('respects the day list - no weekday happy hour on a Saturday', () => {
        expect(isWithinWindow(HAPPY_HOUR, new Date('2026-01-17T17:30:00Z'))).toBe(false);
    });
});

describe('overnight windows', () => {
    // Friday-only late menu, 22:00 to 02:00
    const LATE = { days: [5], start: '22:00', end: '02:00' };

    it('is ON at 23:00 Friday', () => {
        expect(isWithinWindow(LATE, new Date('2026-01-16T23:00:00Z'))).toBe(true);
    });

    it('REGRESSION GUARD: is still ON at 01:00 Saturday - it is Friday\'s window', () => {
        // Getting this wrong makes a late menu vanish at midnight on its
        // busiest night.
        expect(isWithinWindow(LATE, new Date('2026-01-17T01:00:00Z'))).toBe(true);
    });

    it('is OFF at 01:00 Friday - that belongs to Thursday, which is not listed', () => {
        expect(isWithinWindow(LATE, new Date('2026-01-16T01:00:00Z'))).toBe(false);
    });

    it('is OFF at 02:00 Saturday - the end is exclusive', () => {
        expect(isWithinWindow(LATE, new Date('2026-01-17T02:00:00Z'))).toBe(false);
    });
});

describe('item availability', () => {
    it('an item with no schedule is ALWAYS available - scheduling is opt-in', () => {
        // An existing menu must not vanish because the field is new.
        expect(isItemAvailableNow({}, WINTER_5PM)).toBe(true);
        expect(isItemAvailableNow({ availability_windows: [] }, WINTER_5PM)).toBe(true);
    });

    it('a breakfast item is hidden in the evening', () => {
        const breakfast = { availability_windows: [{ start: '07:00', end: '11:30' }] };
        expect(isItemAvailableNow(breakfast, WINTER_5PM)).toBe(false);
        expect(isItemAvailableNow(breakfast, new Date('2026-01-14T09:00:00Z'))).toBe(true);
    });

    it('is available if ANY of several windows matches', () => {
        const item = { availability_windows: [
            { start: '07:00', end: '11:00' },
            { start: '16:00', end: '18:00' },
        ] };
        expect(isItemAvailableNow(item, WINTER_5PM)).toBe(true);
    });
});

describe('timed pricing', () => {
    it('applies the happy hour price inside the window', () => {
        const item = { price_windows: [{ ...HAPPY_HOUR, price: 3 }] };
        expect(scheduledPrice(5, item, WINTER_5PM)).toBe(3);
    });

    it('charges the normal price outside it', () => {
        const item = { price_windows: [{ ...HAPPY_HOUR, price: 3 }] };
        expect(scheduledPrice(5, item, SUMMER_6PM_UTC)).toBe(5);
    });

    it('when offers overlap, the customer gets the LOWER price', () => {
        const item = { price_windows: [
            { start: '12:00', end: '18:00', price: 4 },
            { start: '17:00', end: '19:00', price: 3 },
        ] };
        expect(scheduledPrice(5, item, WINTER_5PM)).toBe(3);
    });

    it('SAFETY: a timed price can never RAISE the price', () => {
        // A typo in the menu editor must not silently overcharge.
        const item = { price_windows: [{ ...HAPPY_HOUR, price: 50 }] };
        expect(scheduledPrice(5, item, WINTER_5PM)).toBe(5);
    });

    it('ignores a malformed window rather than charging £NaN', () => {
        const item = { price_windows: [{ ...HAPPY_HOUR, price: 'free' }] };
        expect(scheduledPrice(5, item, WINTER_5PM)).toBe(5);
    });

    it('an item with no price windows is untouched', () => {
        expect(scheduledPrice(5, {}, WINTER_5PM)).toBe(5);
    });
});

describe('REGRESSION: an unfinished price window must never make an item free', () => {
    // Number('') and Number(null) are both 0 in JavaScript. A happy-hour window
    // saved before the owner typed a price was read as £0 and gave the item
    // away for the whole window. The original tests used 'free' (NaN) and
    // missed this, because that is not what a half-filled form produces.
    const INSIDE = new Date('2026-01-14T17:30:00Z');
    const W = { days: [1, 2, 3, 4, 5], start: '17:00', end: '19:00' };

    for (const blank of ['', null, undefined, '   ']) {
        it(`price = ${JSON.stringify(blank)} leaves the normal price`, () => {
            expect(scheduledPrice(5, { price_windows: [{ ...W, price: blank }] }, INSIDE)).toBe(5);
        });
    }

    it('a real zero IS honoured - a deliberate free item is allowed', () => {
        // Distinguishes "nothing entered" from "owner chose £0".
        expect(scheduledPrice(5, { price_windows: [{ ...W, price: 0 }] }, INSIDE)).toBe(0);
    });

    it('accepts a numeric string from a form input', () => {
        expect(scheduledPrice(5, { price_windows: [{ ...W, price: '3.50' }] }, INSIDE)).toBe(3.5);
    });
});
