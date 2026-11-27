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
    if (tz && tz.toUpperCase() !== 'UTC') return tz;
    return getRegion(restaurant).timezone;
}

/** True when card payments can be taken for this restaurant today. */
export function hasCardPayments(restaurant) {
    return Boolean(getRegion(restaurant).cardProvider);
}
