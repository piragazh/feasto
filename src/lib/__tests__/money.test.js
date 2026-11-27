import { describe, it, expect } from 'vitest';
import { formatMoney, currencySymbol, currencyCode } from '../money.js';

// What the screens did by hand before region support.
const OLD = (x) => `£${x.toFixed(2)}`;
const OLD_OPTIONAL = (x) => `£${x?.toFixed(2) ?? ''}`;   // JSX renders undefined as nothing

const AMOUNTS = [0, 1, 2.5, 12.499, 12.5, 12.505, 0.1 + 0.2, 99.995, 1065.57, 1234567.891, -3.2, -0.004, 1e-7, 7, 15.44, 54.03];

describe('money — UK shops show exactly what they did before', () => {
    const uk = { country: null, timezone: 'UTC' };
    it('every amount matches `£${x.toFixed(2)}`', () => {
        for (const x of AMOUNTS) {
            expect(formatMoney(x)).toBe(OLD(x));
            expect(formatMoney(x, uk)).toBe(OLD(x));
            expect(formatMoney(x, 'GB')).toBe(OLD(x));
        }
    });
    it('a missing amount shows "£", as `£{x?.toFixed(2)}` did', () => {
        expect(formatMoney(undefined, uk)).toBe(OLD_OPTIONAL(undefined));
        expect(formatMoney(null, uk)).toBe(OLD_OPTIONAL(null));
    });
    it('no thousands separator in the UK (unchanged)', () => {
        expect(formatMoney(1065.57)).toBe('£1065.57');
    });
    it('symbol and code', () => {
        expect(currencySymbol(uk)).toBe('£');
        expect(currencyCode(uk)).toBe('GBP');
    });
});

describe('money — Sri Lankan shops', () => {
    const lk = { country: 'LK' };
    it('rupees with grouped digits', () => {
        expect(formatMoney(1250, lk)).toBe('Rs 1,250.00');
        expect(formatMoney(12.5, lk)).toBe('Rs 12.50');
        expect(formatMoney(0, lk)).toBe('Rs 0.00');
        expect(formatMoney(1234567.891, lk)).toBe('Rs 1,234,567.89');
    });
    it('strings that are numbers still format; missing shows the symbol', () => {
        expect(formatMoney('950', lk)).toBe('Rs 950.00');
        expect(formatMoney(undefined, lk)).toBe('Rs');
    });
    it('symbol and code', () => {
        expect(currencySymbol(lk)).toBe('Rs');
        expect(currencyCode(lk)).toBe('LKR');
    });
});
