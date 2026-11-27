/**
 * money.js — show an amount in the restaurant's currency (src/lib/region.js).
 *
 * UK SHOPS ARE UNCHANGED, ON PURPOSE
 *   GB text is exactly what the screens built by hand before: "£" followed by
 *   amount.toFixed(2) — no thousands separator ("£1065.57"), and a negative
 *   amount keeps its "-" after the "£", as `£${x.toFixed(2)}` did. A missing
 *   amount (null / undefined) gives just "£", as `£{x?.toFixed(2)}` rendered.
 *   Tests compare this against the old expression.
 *
 * OTHER COUNTRIES use the region's symbol, a space and grouped digits:
 *   Sri Lanka → "Rs 1,250.00".
 *
 * Amounts are not converted — a restaurant's prices are in its own currency.
 */
import { getRegion } from './region.js';

/**
 * formatMoney(12.5)            -> "£12.50"
 * formatMoney(12.5, 'LK')      -> "Rs 12.50"
 * formatMoney(1250, restaurant) -> "Rs 1,250.00" for a Sri Lankan restaurant
 */
export function formatMoney(amount, restaurantOrCountry) {
    const region = getRegion(restaurantOrCountry);
    if (region.country === 'GB') {
        if (amount === null || amount === undefined) return '£';
        return `£${amount.toFixed(2)}`;
    }
    if (amount === null || amount === undefined) return region.currencySymbol;
    const n = Number(amount);
    const text = Number.isFinite(n)
        ? n.toLocaleString(region.locale, {
            minimumFractionDigits: region.currencyDecimals,
            maximumFractionDigits: region.currencyDecimals,
        })
        : String(amount);
    return `${region.currencySymbol} ${text}`;
}

/** The symbol on its own, for labels like "Delivery Fee (£)". */
export function currencySymbol(restaurantOrCountry) {
    return getRegion(restaurantOrCountry).currencySymbol;
}

/** ISO code for payment providers and structured data ("GBP", "LKR"). */
export function currencyCode(restaurantOrCountry) {
    return getRegion(restaurantOrCountry).currency;
}
