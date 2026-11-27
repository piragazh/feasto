/**
 * region.js — everything that changes with the country a restaurant is in.
 *
 * ONE place decides a restaurant's currency, clock, phone format, address
 * lookup, distance unit and card provider. Screens and server functions ask
 * this table instead of hard-coding UK values, so adding a country is adding
 * one entry here (and its mirror in the server functions that need it).
 *
 * RULES THAT KEEP THE LIVE UK SHOPS UNCHANGED
 *   - A restaurant with no country (every restaurant created before this file)
 *     is treated as GB.
 *   - Restaurant.timezone defaults to "UTC" in the schema, and every existing
 *     record holds that default. "UTC" or blank therefore means "not set" and
 *     the country's clock is used (Europe/London for GB, which handles BST).
 *     Only a real, deliberate zone overrides it.
 *   - An unknown country code also falls back to GB rather than failing.
 *
 * SYNC RULE: server functions cannot import from src/. Any function that needs
 * these values carries a copy of the entries it uses; scripts/check-region.mjs
 * fails the build if a copy drifts from this table.
 */

export const DEFAULT_COUNTRY = 'GB';

export const REGIONS = Object.freeze({
    GB: Object.freeze({
        country: 'GB',
        name: 'United Kingdom',
        currency: 'GBP',
        currencySymbol: '£',
        currencyDecimals: 2,
        locale: 'en-GB',
        timezone: 'Europe/London',
        // Phone: +44, national numbers start with a 0 trunk prefix.
        dialCode: '44',
        trunkPrefix: '0',
        // Mobile numbers without the trunk 0: 7 followed by 9 digits.
        mobileNational: /^7\d{9}$/,
        phoneExample: '07123 456789',
        distanceUnit: 'mi',
        // How the delivery address is found.
        addressLookup: 'uk_postcode',
        // Country filter for map searches (OpenStreetMap / Google).
        geocodeCountry: 'gb',
        // Card payments: provider name, or null where none is set up yet.
        cardProvider: 'stripe',
        // Money limits, in this currency. The 20% manager cap applies everywhere.
        //   managerDiscountMax  manual discount a manager may give without admin
        //   largeRefundFlag     refunds at or above this are flagged high severity
        //   offlineDiscountMax  not used today: the till blocks manual discounts
        //                       while offline. Recorded for if that is ever allowed.
        managerDiscountMax: 20,
        largeRefundFlag: 30,
        offlineDiscountMax: 10,
        //   aiCashLimit           AI chat/phone orders above this can't be cash
        //   loyaltySpendPerPoint  spend that earns 1 point (before multipliers)
        //   cashSignOffTolerance  till count off by more than this needs a manager
        //   cashMaxFloat          sanity bound on a float or paid in/out (count: x4)
        //   cashDenominations     notes and coins in the till count, largest first
        aiCashLimit: 50,
        loyaltySpendPerPoint: 1,
        cashSignOffTolerance: 5,
        cashMaxFloat: 5000,
        cashDenominations: Object.freeze([50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]),
    }),
    LK: Object.freeze({
        country: 'LK',
        name: 'Sri Lanka',
        currency: 'LKR',
        currencySymbol: 'Rs',
        currencyDecimals: 2,
        locale: 'en-LK',
        timezone: 'Asia/Colombo',
        dialCode: '94',
        trunkPrefix: '0',
        // Mobile numbers without the trunk 0: 7 followed by 8 digits (07X XXX XXXX).
        mobileNational: /^7\d{8}$/,
        phoneExample: '071 234 5678',
        distanceUnit: 'km',
        addressLookup: 'free_text',
        geocodeCountry: 'lk',
        // Stripe does not serve Sri Lankan merchants. Cash / pay at the shop
        // until a local gateway is added here.
        cardProvider: null,
        // Set by MealDrop on 27 Nov 2026.
        managerDiscountMax: 5000,
        largeRefundFlag: 10000,
        offlineDiscountMax: 2000,
        aiCashLimit: 10000,
        loyaltySpendPerPoint: 100,
        cashSignOffTolerance: 500,
        // Not set by MealDrop: the UK bound scaled like the tolerance (x100).
        cashMaxFloat: 500000,
        cashDenominations: Object.freeze([5000, 2000, 1000, 500, 100, 50, 20, 10, 5, 2, 1]),
    }),
});

/** Countries in the order the admin picker shows them. */
export const COUNTRY_OPTIONS = Object.freeze(
    Object.values(REGIONS).map((r) => ({ value: r.country, label: r.name }))
);

/** Upper-cased known country code, or the default (GB). */
export function normaliseCountry(code) {
    const c = typeof code === 'string' ? code.trim().toUpperCase() : '';
    return REGIONS[c] ? c : DEFAULT_COUNTRY;
}

/**
 * The region for a restaurant record, a country code, or nothing.
 *   getRegion(restaurant)  getRegion('LK')  getRegion()  -> region entry
 */
export function getRegion(restaurantOrCountry) {
    const code = typeof restaurantOrCountry === 'string'
        ? restaurantOrCountry
        : restaurantOrCountry?.country;
    return REGIONS[normaliseCountry(code)];
}

/**
 * The IANA timezone a restaurant's clock runs on.
 * A real zone on the record wins; blank or the schema default "UTC" means
 * "not set", so the country's zone is used.
 */
export function getRestaurantTimeZone(restaurant) {
    const tz = typeof restaurant?.timezone === 'string' ? restaurant.timezone.trim() : '';
    if (tz && tz.toUpperCase() !== 'UTC' && isValidTimeZone(tz)) return tz;
    return getRegion(restaurant).timezone;
}

/** A zone this runtime can use. A typo on a record must not crash ordering. */
function isValidTimeZone(tz) {
    try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch (_) { return false; }
}

/**
 * Money limits for this restaurant: { managerDiscountMax, largeRefundFlag, offlineDiscountMax,
 * aiCashLimit, loyaltySpendPerPoint, cashSignOffTolerance, cashMaxFloat }.
 */
export function getMoneyLimits(restaurantOrCountry) {
    const r = getRegion(restaurantOrCountry);
    return {
        managerDiscountMax: r.managerDiscountMax, largeRefundFlag: r.largeRefundFlag, offlineDiscountMax: r.offlineDiscountMax,
        aiCashLimit: r.aiCashLimit, loyaltySpendPerPoint: r.loyaltySpendPerPoint,
        cashSignOffTolerance: r.cashSignOffTolerance, cashMaxFloat: r.cashMaxFloat,
    };
}

/** Notes and coins for a till count, largest first. */
export function getCashDenominations(restaurantOrCountry) {
    return getRegion(restaurantOrCountry).cashDenominations;
}

/** True when card payments can be taken for this restaurant today. */
export function hasCardPayments(restaurant) {
    return Boolean(getRegion(restaurant).cardProvider);
}

/**
 * The country a customer is browsing from, judged by their device's time zone
 * (Asia/Colombo → LK). Anything else, or no answer, is GB - so UK customers,
 * including those abroad, see exactly what they did before. No location prompt.
 */
export function visitorCountry(timeZone) {
    let tz = timeZone;
    if (tz === undefined) {
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { tz = ''; }
    }
    const hit = Object.values(REGIONS).find((r) => r.timezone === tz);
    return hit ? hit.country : DEFAULT_COUNTRY;
}

/**
 * Should this restaurant be listed on the home page / search for this visitor?
 * Only restaurants in the visitor's own country (owner decision, 27 Nov 2026):
 * Sri Lankan shops are hidden from UK customers and the other way round.
 * Their own pages, links and QR codes still work.
 */
export function isListedForVisitor(restaurant, visitor = visitorCountry()) {
    return normaliseCountry(restaurant?.country) === visitor;
}
