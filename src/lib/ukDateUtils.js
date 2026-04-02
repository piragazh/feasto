/**
 * UK Date/Time Utilities
 * 
 * All restaurants are UK-based. This utility always formats dates in
 * Europe/London timezone, which automatically handles:
 *   - GMT (UTC+0) in winter
 *   - BST (UTC+1) in summer (British Summer Time)
 * 
 * Use these helpers everywhere order times are displayed or printed.
 */

const UK_TIMEZONE = 'Europe/London';

/**
 * Format a date/timestamp to a UK local time string.
 * @param {string|Date} date - ISO string or Date object
 * @param {string} formatStr - 'time' | 'datetime' | 'date' | 'full'
 * @returns {string}
 */
export function formatUKTime(date, formatStr = 'time') {
    if (!date) return '--:--';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '--:--';

    const opts = { timeZone: UK_TIMEZONE };

    switch (formatStr) {
        case 'time':
            // e.g. "14:35"
            return d.toLocaleTimeString('en-GB', { ...opts, hour: '2-digit', minute: '2-digit', hour12: false });
        case 'time12':
            // e.g. "2:35 pm"
            return d.toLocaleTimeString('en-GB', { ...opts, hour: 'numeric', minute: '2-digit', hour12: true });
        case 'date':
            // e.g. "02 Apr 2026"
            return d.toLocaleDateString('en-GB', { ...opts, day: '2-digit', month: 'short', year: 'numeric' });
        case 'datetime':
            // e.g. "02 Apr, 14:35"
            return d.toLocaleDateString('en-GB', { ...opts, day: '2-digit', month: 'short' }) + ', ' +
                   d.toLocaleTimeString('en-GB', { ...opts, hour: '2-digit', minute: '2-digit', hour12: false });
        case 'datetime12':
            // e.g. "02 Apr, 2:35 pm"
            return d.toLocaleDateString('en-GB', { ...opts, day: '2-digit', month: 'short' }) + ', ' +
                   d.toLocaleTimeString('en-GB', { ...opts, hour: 'numeric', minute: '2-digit', hour12: true });
        case 'full':
            // e.g. "Wed 02 Apr 2026, 14:35"
            return d.toLocaleDateString('en-GB', { ...opts, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
                   d.toLocaleTimeString('en-GB', { ...opts, hour: '2-digit', minute: '2-digit', hour12: false });
        default:
            return d.toLocaleTimeString('en-GB', { ...opts, hour: '2-digit', minute: '2-digit', hour12: false });
    }
}

/**
 * Get the UK local hour (0-23) for a given timestamp.
 * Useful for checking opening hours in UK time.
 * @param {string|Date} date
 * @returns {number}
 */
export function getUKHour(date) {
    const d = new Date(date);
    return parseInt(d.toLocaleTimeString('en-GB', { timeZone: UK_TIMEZONE, hour: '2-digit', hour12: false }), 10);
}

/**
 * Check if currently BST (British Summer Time / UTC+1)
 * @returns {boolean}
 */
export function isCurrentlyBST() {
    const now = new Date();
    const ukOffset = -now.toLocaleString('en-GB', {
        timeZone: UK_TIMEZONE,
        timeZoneName: 'shortOffset'
    }).match(/GMT([+-]\d+)?/)?.[1] || 0;
    return Number(ukOffset) === 1;
}