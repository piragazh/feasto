/**
 * Platform timestamps arrive in UTC but WITHOUT a time zone marker.
 *
 * The platform returns created_date / updated_date like
 *     "2026-09-22T15:33:32.810000"
 * - UTC, but with no trailing "Z". Browsers read a timestamp with no zone as
 * LOCAL time, so in the UK every order time displayed ONE HOUR EARLY during
 * British Summer Time (an order placed at 16:33 showed as 15:33). In winter UK
 * time equals UTC, so it looked right - which is why it only appeared after
 * launching in summer.
 *
 * It also skewed everything that FILTERS by time: an order placed just after
 * midnight UK time could land in the previous day's reports.
 *
 * The fix lives here, at the one point every read passes through, rather than
 * at the ~187 places that parse these timestamps - so new screens are correct
 * automatically.
 *
 * ONLY created_date and updated_date are corrected. They are written by the
 * PLATFORM and are always UTC. Fields a PERSON types - a promotion's start_date,
 * a coupon's valid_until - use their own conventions and are deliberately left
 * alone; "correcting" those would shift them by an hour the other way.
 */

const PLATFORM_KEYS = new Set(['created_date', 'updated_date']);

// A date-time with no zone: 2026-09-22T15:33:32 or .810 or .810000
const ZONELESS = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?$/;

/**
 * "2026-09-22T15:33:32.810000" -> "2026-09-22T15:33:32.810Z"
 * The fraction is trimmed to milliseconds: some browsers (older Safari) return
 * Invalid Date for six fractional digits. Anything already carrying a zone, or
 * not a date-time at all, is returned unchanged.
 */
export function asUtcTimestamp(value) {
    if (typeof value !== 'string') return value;
    const m = ZONELESS.exec(value);
    if (!m) return value;
    const ms = m[2] ? m[2].slice(0, 4).padEnd(4, '0') : '';
    return `${m[1]}${ms}Z`;
}

/** Correct platform timestamps anywhere in a result - records, arrays, nested. */
export function normalizePlatformTimestamps(value, seen = new WeakSet()) {
    if (Array.isArray(value)) {
        if (seen.has(value)) return value;
        seen.add(value);
        for (let i = 0; i < value.length; i++) value[i] = normalizePlatformTimestamps(value[i], seen);
        return value;
    }
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        if (seen.has(value)) return value;
        seen.add(value);
        for (const key of Object.keys(value)) {
            value[key] = PLATFORM_KEYS.has(key)
                ? asUtcTimestamp(value[key])
                : normalizePlatformTimestamps(value[key], seen);
        }
    }
    return value;
}
