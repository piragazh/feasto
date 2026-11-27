import { describe, it, expect } from 'vitest';
import {
    REGIONS, DEFAULT_COUNTRY, COUNTRY_OPTIONS,
    normaliseCountry, getRegion, getRestaurantTimeZone, hasCardPayments,
} from '../region.js';

describe('region — existing UK restaurants are unchanged', () => {
    // Every live record today: country null, timezone "UTC" (schema default).
    const liveUk = { name: 'Tilbury Chicken', country: null, timezone: 'UTC' };

    it('no country means GB', () => {
        expect(DEFAULT_COUNTRY).toBe('GB');
        expect(getRegion(liveUk).country).toBe('GB');
        expect(getRegion({}).country).toBe('GB');
        expect(getRegion(undefined).country).toBe('GB');
        expect(getRegion(null).country).toBe('GB');
    });

    it('GB keeps pounds, UK clock, +44, miles, postcode lookup, Stripe', () => {
        const r = getRegion(liveUk);
        expect(r.currency).toBe('GBP');
        expect(r.currencySymbol).toBe('£');
        expect(r.timezone).toBe('Europe/London');
        expect(r.dialCode).toBe('44');
        expect(r.distanceUnit).toBe('mi');
        expect(r.addressLookup).toBe('uk_postcode');
        expect(r.cardProvider).toBe('stripe');
        expect(hasCardPayments(liveUk)).toBe(true);
    });

    it('stored "UTC" or blank timezone means the country clock', () => {
        expect(getRestaurantTimeZone(liveUk)).toBe('Europe/London');
        expect(getRestaurantTimeZone({ timezone: '' })).toBe('Europe/London');
        expect(getRestaurantTimeZone({ timezone: 'utc' })).toBe('Europe/London');
        expect(getRestaurantTimeZone({})).toBe('Europe/London');
        expect(getRestaurantTimeZone(null)).toBe('Europe/London');
    });

    it('unknown or badly typed country falls back to GB', () => {
        expect(normaliseCountry('XX')).toBe('GB');
        expect(normaliseCountry(44)).toBe('GB');
        expect(normaliseCountry('')).toBe('GB');
        expect(getRegion('United Kingdom').country).toBe('GB');
    });
});

describe('region — Sri Lanka', () => {
    const lk = { name: 'Veg shop', country: 'LK', timezone: 'UTC' };

    it('rupees, Colombo clock, +94, km, free-text address, no card provider', () => {
        const r = getRegion(lk);
        expect(r.currency).toBe('LKR');
        expect(r.timezone).toBe('Asia/Colombo');
        expect(r.dialCode).toBe('94');
        expect(r.distanceUnit).toBe('km');
        expect(r.addressLookup).toBe('free_text');
        expect(r.cardProvider).toBeNull();
        expect(hasCardPayments(lk)).toBe(false);
        expect(getRestaurantTimeZone(lk)).toBe('Asia/Colombo');
    });

    it('lower-case and padded codes work', () => {
        expect(getRegion(' lk ').country).toBe('LK');
        expect(getRegion({ country: 'lk' }).currency).toBe('LKR');
    });

    it('a deliberately set zone overrides the country default', () => {
        expect(getRestaurantTimeZone({ country: 'LK', timezone: 'Asia/Dubai' })).toBe('Asia/Dubai');
    });
});

describe('region — table shape', () => {
    const REQUIRED = ['country', 'name', 'currency', 'currencySymbol', 'currencyDecimals', 'locale',
        'timezone', 'dialCode', 'trunkPrefix', 'mobileNational', 'phoneExample', 'distanceUnit',
        'addressLookup', 'geocodeCountry', 'cardProvider'];

    it('every region has every field and a valid timezone and currency', () => {
        for (const [code, r] of Object.entries(REGIONS)) {
            expect(r.country).toBe(code);
            for (const k of REQUIRED) expect(r, `${code}.${k}`).toHaveProperty(k);
            expect(() => new Intl.DateTimeFormat('en-GB', { timeZone: r.timezone })).not.toThrow();
            expect(() => new Intl.NumberFormat(r.locale, { style: 'currency', currency: r.currency })).not.toThrow();
            expect(['mi', 'km']).toContain(r.distanceUnit);
        }
    });

    it('picker lists every region, GB first', () => {
        expect(COUNTRY_OPTIONS[0].value).toBe('GB');
        expect(COUNTRY_OPTIONS.map((o) => o.value).sort()).toEqual(Object.keys(REGIONS).sort());
    });

    it('the table cannot be changed at runtime', () => {
        expect(Object.isFrozen(REGIONS)).toBe(true);
        expect(Object.isFrozen(REGIONS.GB)).toBe(true);
    });
});

describe('region — money limits', () => {
    it('UK keeps £20 discount cap and £30 refund flag', async () => {
        const { getMoneyLimits } = await import('../region.js');
        expect(getMoneyLimits({ country: null })).toEqual({ managerDiscountMax: 20, largeRefundFlag: 30, offlineDiscountMax: 10, aiCashLimit: 50, loyaltySpendPerPoint: 1, cashSignOffTolerance: 5, cashMaxFloat: 5000 });
    });
    it('Sri Lanka: Rs 5,000 cap, Rs 10,000 refund flag, Rs 2,000 offline (recorded)', async () => {
        const { getMoneyLimits } = await import('../region.js');
        expect(getMoneyLimits('LK')).toEqual({ managerDiscountMax: 5000, largeRefundFlag: 10000, offlineDiscountMax: 2000, aiCashLimit: 10000, loyaltySpendPerPoint: 100, cashSignOffTolerance: 500, cashMaxFloat: 500000 });
    });
});

describe('region — till notes and coins', () => {
    it('UK keeps the 12 UK denominations; Sri Lanka has rupee notes and coins', async () => {
        const { getCashDenominations } = await import('../region.js');
        const { UK_DENOMINATIONS, countTotal } = await import('../pos-cash-logic.js');
        for (const c of [null, undefined, '', 'GB', 'XX']) expect(getCashDenominations({ country: c })).toEqual(UK_DENOMINATIONS);
        const lk = getCashDenominations('LK');
        expect(lk).toEqual([5000, 2000, 1000, 500, 100, 50, 20, 10, 5, 2, 1]);
        expect(countTotal({ '5000': 2, '1000': 3, '100': 7, '1': 4 }, lk)).toBe(13704);
        expect(countTotal({ '0.05': 7, '20': 1 })).toBe(20.35);
    });
});

describe('region — which shops a visitor sees listed', () => {
    it('UK visitors (and anyone not in Sri Lanka) see every UK shop, as before', async () => {
        const { visitorCountry, isListedForVisitor } = await import('../region.js');
        for (const tz of ['Europe/London', 'Europe/Paris', 'America/New_York', 'UTC', '', 'Nonsense/Zone']) {
            expect(visitorCountry(tz)).toBe('GB');
            for (const c of [null, undefined, '', 'GB', 'gb']) expect(isListedForVisitor({ country: c }, visitorCountry(tz))).toBe(true);
            expect(isListedForVisitor({ country: 'LK' }, visitorCountry(tz))).toBe(false);
        }
    });
    it('visitors in Sri Lanka see Sri Lankan shops only', async () => {
        const { visitorCountry, isListedForVisitor } = await import('../region.js');
        expect(visitorCountry('Asia/Colombo')).toBe('LK');
        expect(isListedForVisitor({ country: 'LK' }, 'LK')).toBe(true);
        expect(isListedForVisitor({ country: null }, 'LK')).toBe(false);
    });
});
