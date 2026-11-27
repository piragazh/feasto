import { describe, it, expect } from 'vitest';
import { milesToDisplay, displayToMiles, distanceUnit, distanceLabels, KM_PER_MILE } from '../distance.js';

describe('distance — UK shops unchanged', () => {
    const uk = { country: null };
    it('miles in, miles out, values untouched (same type too)', () => {
        for (const v of [0, 1, 2.5, '3', '', null, undefined, 'abc']) {
            expect(milesToDisplay(v, uk)).toBe(v);
            expect(displayToMiles(v, uk)).toBe(v);
        }
        expect(distanceUnit(uk)).toBe('mi');
        expect(distanceLabels(uk)).toEqual({ short: 'mi', long: 'miles' });
    });
});

describe('distance — Sri Lanka in kilometres, stored as miles', () => {
    const lk = { country: 'LK' };
    it('shows km', () => {
        expect(distanceUnit(lk)).toBe('km');
        expect(milesToDisplay(1, lk)).toBe(1.61);
        expect(milesToDisplay(3.10686, lk)).toBe(5);
    });
    it('stores miles from typed km, and round-trips', () => {
        expect(displayToMiles(5, lk)).toBeCloseTo(5 / KM_PER_MILE, 10);
        expect(displayToMiles('8', lk)).toBeCloseTo(8 / KM_PER_MILE, 10);
        for (const km of [1, 2.5, 5, 10, 12.75]) expect(milesToDisplay(displayToMiles(km, lk), lk)).toBe(km);
    });
    it('blank or bad input is passed through for the form to reject', () => {
        for (const v of ['', null, undefined, 'abc']) {
            expect(milesToDisplay(v, lk)).toBe(v);
            expect(displayToMiles(v, lk)).toBe(v);
        }
    });
});
