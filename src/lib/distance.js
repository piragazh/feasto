/**
 * distance.js — show and enter distances in the restaurant's unit.
 *
 * Delivery radii are STORED in miles (Restaurant / DeliveryZone radius_miles)
 * and every server check reads miles, so nothing on the server changes. Only
 * screens convert: UK shops see and type miles (unchanged); a country whose
 * region uses km (Sri Lanka) sees and types kilometres.
 */
import { getRegion } from './region.js';

export const KM_PER_MILE = 1.609344;

/** 'mi' or 'km' for this restaurant / country. */
export function distanceUnit(restaurantOrCountry) {
    return getRegion(restaurantOrCountry).distanceUnit;
}

/** Stored miles -> the number to show. GB: unchanged. */
export function milesToDisplay(miles, restaurantOrCountry) {
    if (distanceUnit(restaurantOrCountry) === 'mi') return miles;
    const n = Number(miles);
    if (miles === '' || miles === null || miles === undefined || !Number.isFinite(n)) return miles;
    return Math.round(n * KM_PER_MILE * 100) / 100;
}

/** A typed distance -> miles to store. GB: unchanged. */
export function displayToMiles(value, restaurantOrCountry) {
    if (distanceUnit(restaurantOrCountry) === 'mi') return value;
    const n = Number(value);
    if (value === '' || value === null || value === undefined || !Number.isFinite(n)) return value;
    return n / KM_PER_MILE;
}

/** Short and long unit names for labels. */
export function distanceLabels(restaurantOrCountry) {
    return distanceUnit(restaurantOrCountry) === 'km'
        ? { short: 'km', long: 'kilometres' }
        : { short: 'mi', long: 'miles' };
}
