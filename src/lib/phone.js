/**
 * phone.js — customer phone numbers, by the country of the restaurant.
 *
 * The customer never picks a country: the restaurant's country (region.js)
 * decides which numbers are valid and how they are stored.
 *
 * UK SHOPS ARE UNCHANGED, ON PURPOSE
 *   GB keeps the exact checkout rule that has been live (UK_CHECKOUT_MOBILE
 *   below, copied character for character) and the number is stored exactly as
 *   the customer typed it, as before. Loyalty, coupon and rate-limit keys all
 *   depend on that stored value, so changing it would split UK customers'
 *   history.
 *
 * OTHER COUNTRIES
 *   Any common way of writing a mobile number is accepted (071 234 5678,
 *   +94 71 234 5678, 0094 71…, 94 71…) and stored in ONE form: the trunk 0
 *   followed by the national number, digits only (0712345678). Every later
 *   lookup then sees the same value for the same customer.
 */

import { getRegion } from './region.js';

// The checkout rule live for UK shops before region support. Do not "tidy".
const UK_CHECKOUT_MOBILE = /^(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}$/;

/**
 * The national significant number (no trunk 0, no country code), or '' when
 * the number is written for a different country.
 */
export function nationalNumber(raw, restaurantOrCountry) {
    const region = getRegion(restaurantOrCountry);
    const text = String(raw ?? '').trim();
    let digits = text.replace(/\D/g, '');
    if (!digits) return '';

    let international = text.startsWith('+');
    if (digits.startsWith('00')) { digits = digits.slice(2); international = true; }

    if (international) {
        return digits.startsWith(region.dialCode) ? digits.slice(region.dialCode.length) : '';
    }
    // Country code typed without + or 00, e.g. 94712345678.
    if (digits.startsWith(region.dialCode) && region.mobileNational.test(digits.slice(region.dialCode.length))) {
        return digits.slice(region.dialCode.length);
    }
    if (region.trunkPrefix && digits.startsWith(region.trunkPrefix)) {
        return digits.slice(region.trunkPrefix.length);
    }
    return digits;
}

/** Is this a mobile number customers of this restaurant can use? */
export function isValidCustomerPhone(raw, restaurantOrCountry) {
    const region = getRegion(restaurantOrCountry);
    if (region.country === 'GB') {
        return UK_CHECKOUT_MOBILE.test(String(raw ?? '').replace(/\s/g, ''));
    }
    return region.mobileNational.test(nationalNumber(raw, region.country));
}

/**
 * The value to save on the order.
 * GB: exactly what was typed (unchanged behaviour).
 * Elsewhere: trunk 0 + national number, digits only, when valid; otherwise
 * the trimmed input (validation reports the problem).
 */
export function phoneForOrder(raw, restaurantOrCountry) {
    const region = getRegion(restaurantOrCountry);
    if (region.country === 'GB') return raw;
    const n = nationalNumber(raw, region.country);
    return region.mobileNational.test(n) ? `${region.trunkPrefix}${n}` : String(raw ?? '').trim();
}

/** International form (+94712345678) for sending texts, or null if invalid. */
export function toE164(raw, restaurantOrCountry) {
    const region = getRegion(restaurantOrCountry);
    const n = nationalNumber(raw, region.country);
    return region.mobileNational.test(n) ? `+${region.dialCode}${n}` : null;
}

/** Label, placeholder and error text for the phone field. */
export function phoneFieldText(restaurantOrCountry) {
    const region = getRegion(restaurantOrCountry);
    if (region.country === 'GB') {
        return {
            label: 'UK Mobile Number',
            placeholder: '07123 456789',
            error: 'Please enter a valid UK phone number',
        };
    }
    return {
        label: 'Mobile Number',
        placeholder: region.phoneExample,
        error: `Please enter a valid mobile number, e.g. ${region.phoneExample}`,
    };
}
