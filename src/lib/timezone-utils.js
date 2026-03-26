/**
 * Timezone Utilities for Temporal Analytics
 * 
 * Handles timezone conversion, inference, and validation.
 * Uses UTC server timestamps, converts to restaurant's local time.
 */

/**
 * Country → Primary timezone mapping (single timezone per country)
 * Used when restaurant.timezone is not set but country is known
 */
const COUNTRY_TO_TIMEZONE = {
  'GB': 'Europe/London',
  'IE': 'Europe/Dublin',
  'US': 'America/New_York', // Default to East Coast (most populous)
  'CA': 'America/Toronto',
  'AU': 'Australia/Sydney',
  'NZ': 'Pacific/Auckland',
  'FR': 'Europe/Paris',
  'DE': 'Europe/Berlin',
  'IT': 'Europe/Rome',
  'ES': 'Europe/Madrid',
  'NL': 'Europe/Amsterdam',
  'SE': 'Europe/Stockholm',
  'NO': 'Europe/Oslo',
  'DK': 'Europe/Copenhagen',
  'CH': 'Europe/Zurich',
  'AT': 'Europe/Vienna',
  'BE': 'Europe/Brussels',
  'CZ': 'Europe/Prague',
  'PL': 'Europe/Warsaw',
  'JP': 'Asia/Tokyo',
  'CN': 'Asia/Shanghai',
  'IN': 'Asia/Kolkata',
  'SG': 'Asia/Singapore',
  'HK': 'Asia/Hong_Kong',
  'TH': 'Asia/Bangkok',
  'MY': 'Asia/Kuala_Lumpur',
  'PH': 'Asia/Manila',
  'KR': 'Asia/Seoul',
  'VN': 'Asia/Ho_Chi_Minh',
  'ID': 'Asia/Jakarta',
  'BR': 'America/Sao_Paulo',
  'MX': 'America/Mexico_City',
  'ZA': 'Africa/Johannesburg',
  'AE': 'Asia/Dubai',
  'SA': 'Asia/Riyadh',
  'IL': 'Asia/Jerusalem',
  'TR': 'Europe/Istanbul'
};

/**
 * Get timezone for a restaurant
 * Falls back to country inference if timezone not set
 * 
 * @param {object} restaurant - {timezone, country}
 * @returns {string} IANA timezone identifier
 */
export function getRestaurantTimezone(restaurant) {
  if (restaurant?.timezone && restaurant.timezone !== 'UTC') {
    return restaurant.timezone;
  }
  
  // Fallback: infer from country
  if (restaurant?.country && COUNTRY_TO_TIMEZONE[restaurant.country]) {
    return COUNTRY_TO_TIMEZONE[restaurant.country];
  }
  
  return 'UTC'; // Default
}

/**
 * Convert UTC timestamp to restaurant's local time
 * Returns object with local hour, day, etc.
 * 
 * @param {string|Date} utcTimestamp - ISO or Date object
 * @param {string} timezone - IANA timezone identifier
 * @returns {object} {hour, day, date, dateObj}
 */
export function convertUtcToLocal(utcTimestamp, timezone) {
  try {
    const date = new Date(utcTimestamp);
    
    // Use Intl API for timezone-aware conversion
    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: timezone
    });
    
    const parts = formatter.formatToParts(date);
    const map = {};
    parts.forEach(({type, value}) => {
      map[type] = value;
    });
    
    const hour = parseInt(map.hour, 10);
    const day = parseInt(map.day, 10);
    const month = parseInt(map.month, 10);
    const year = parseInt(map.year, 10);
    
    // Day of week (0=Sunday, 6=Saturday) in local time
    // We need to construct a Date in the local timezone
    // Since JS doesn't provide day-of-week directly via Intl, we calculate offset
    const utcDate = new Date(utcTimestamp);
    const utcDay = utcDate.getUTCDay();
    
    // Calculate offset from UTC to get approximate local day
    // This is a simplification; more precise method uses timezone library
    // For most use cases, this is accurate enough
    const offsetMinutes = getTimezoneOffset(utcTimestamp, timezone);
    const offsetHours = Math.round(offsetMinutes / 60);
    const localHour = (hour + 24) % 24; // Ensure 0-23
    const dayOffset = Math.floor((localHour + offsetHours) / 24);
    const localDayOfWeek = (utcDay + dayOffset + 7) % 7;
    
    return {
      hour: localHour,
      day,
      month,
      year,
      dayOfWeek: localDayOfWeek,
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      dateObj: new Date(utcTimestamp)
    };
  } catch (e) {
    console.error('[TIMEZONE] Conversion failed:', e);
    // Fallback to UTC
    const d = new Date(utcTimestamp);
    return {
      hour: d.getUTCHours(),
      day: d.getUTCDate(),
      month: d.getUTCMonth() + 1,
      year: d.getUTCFullYear(),
      dayOfWeek: d.getUTCDay(),
      date: d.toISOString().split('T')[0],
      dateObj: d
    };
  }
}

/**
 * Get timezone offset in minutes from UTC
 * 
 * @param {string|Date} timestamp
 * @param {string} timezone - IANA identifier
 * @returns {number} offset in minutes
 */
export function getTimezoneOffset(timestamp, timezone) {
  try {
    const date = new Date(timestamp);
    
    // UTC timestamp
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    
    // Local timestamp
    const localDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    
    // Difference in milliseconds
    const diffMs = localDate.getTime() - utcDate.getTime();
    
    // Convert to minutes
    return diffMs / (1000 * 60);
  } catch (e) {
    console.error('[TIMEZONE] Offset calculation failed:', e);
    return 0; // UTC offset
  }
}

/**
 * Get day name in English
 * @param {number} dayNum - 0=Sunday, 6=Saturday
 * @returns {string}
 */
export function dayNumToName(dayNum) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayNum % 7];
}

/**
 * Classify day as weekend or weekday
 * @param {number} dayNum
 * @returns {string} 'weekend' | 'weekday'
 */
export function classifyDay(dayNum) {
  return (dayNum === 0 || dayNum === 6) ? 'weekend' : 'weekday';
}

/**
 * Available timezones list (subset of common IANA zones)
 */
export const SUPPORTED_TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Stockholm',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland'
];

/**
 * Validate timezone identifier
 * @param {string} tz
 * @returns {boolean}
 */
export function isValidTimezone(tz) {
  if (!tz) return false;
  
  // Check if it's in supported list
  if (SUPPORTED_TIMEZONES.includes(tz)) return true;
  
  // Try to format a date with it (throws if invalid)
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Validate country code (2-letter ISO 3166-1)
 * @param {string} countryCode
 * @returns {boolean}
 */
export function isValidCountryCode(countryCode) {
  return typeof countryCode === 'string' && countryCode.length === 2 && /^[A-Z]{2}$/.test(countryCode);
}