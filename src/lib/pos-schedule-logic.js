/**
 * src/lib/pos-schedule-logic.js
 * =============================
 * TESTED source of truth for menu dayparts and time-based pricing.
 *
 * Mirrored in functions/posCreateOrder (see SYNC RULE below). The server copy
 * decides the PRICE; the client copy only decides what is SHOWN.
 *
 * ─── TIME ZONES ARE THE WHOLE PROBLEM ────────────────────────────────────────
 * Backend functions run in UTC. UK restaurants run on GMT in winter and BST
 * (UTC+1) in summer. Comparing a schedule against the server clock would put
 * every window an hour late for half the year:
 *
 *   Happy hour 17:00-19:00 in July, server compares UTC:
 *     17:00 BST = 16:00 UTC → "not yet"   → full price charged
 *     19:00 BST = 18:00 UTC → "still on"  → discount after it ended
 *
 * So every comparison converts to the restaurant's LOCAL wall-clock time via
 * Intl with an IANA zone, which applies DST rules correctly with no
 * hand-maintained changeover dates.
 *
 * SYNC RULE: any change here MUST be applied to the mirrored copy in
 *   functions/posCreateOrder → localClock, toMinutes, isWithinWindow,
 *                              isItemAvailableNow, scheduledPrice
 */

export const DEFAULT_TIMEZONE = 'Europe/London';

/**
 * The restaurant's local day-of-week and minutes-past-midnight for an instant.
 * @returns {{ day: number, minutes: number }}  day 0=Sunday … 6=Saturday
 */
export function localClock(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type) => parts.find(p => p.type === type)?.value;
    const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
        day: DAYS[get('weekday')],
        minutes: Number(get('hour')) * 60 + Number(get('minute')),
    };
}

/** "17:30" → 1050. Returns null for anything malformed. */
export function toMinutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

/**
 * Is this instant inside a window?
 *
 * window: { days: [0..6], start: 'HH:MM', end: 'HH:MM' }
 *
 * OVERNIGHT WINDOWS: a late menu running 22:00-02:00 crosses midnight, so
 * start > end. The part after midnight belongs to the PREVIOUS day's window -
 * a Friday late menu is still on at 01:00 Saturday. Getting this wrong makes a
 * late-night menu vanish at midnight on its busiest night.
 *
 * start === end means all day on the listed days.
 */
export function isWithinWindow(window, date = new Date(), timeZone = DEFAULT_TIMEZONE) {
    if (!window) return false;
    const start = toMinutes(window.start);
    const end = toMinutes(window.end);
    if (start === null || end === null) return false;

    const { day, minutes } = localClock(date, timeZone);
    const days = Array.isArray(window.days) && window.days.length ? window.days : [0, 1, 2, 3, 4, 5, 6];

    if (start === end) return days.includes(day);

    if (start < end) {
        return days.includes(day) && minutes >= start && minutes < end;
    }

    // Overnight, e.g. 22:00-02:00
    if (minutes >= start) return days.includes(day);        // evening part - today's window
    const yesterday = (day + 6) % 7;
    return minutes < end && days.includes(yesterday);      // after midnight - yesterday's window
}

/**
 * Is an item orderable right now?
 *
 * No schedule, or an empty one, means always available. Scheduling is opt-in:
 * an existing menu must not disappear because the field is new.
 */
export function isItemAvailableNow(item, date = new Date(), timeZone = DEFAULT_TIMEZONE) {
    const windows = item?.availability_windows;
    if (!Array.isArray(windows) || windows.length === 0) return true;
    return windows.some(w => isWithinWindow(w, date, timeZone));
}

/**
 * Price for an item at this instant, applying any active timed price.
 *
 * price_windows: [{ days, start, end, price }]
 *
 * If windows overlap, the LOWEST price wins. That is what a customer expects -
 * two offers apply, they get the better - and it means an owner stacking a lunch
 * deal and a happy hour can never accidentally charge MORE because one window
 * happened to be listed first.
 *
 * A timed price can only LOWER the price. A window priced above base is ignored,
 * so a typo in the editor cannot silently raise prices.
 */
export function scheduledPrice(basePrice, item, date = new Date(), timeZone = DEFAULT_TIMEZONE) {
    const base = Number(basePrice);
    const windows = item?.price_windows;
    if (!Array.isArray(windows) || windows.length === 0) return base;
    let best = base;
    for (const w of windows) {
        // An EMPTY price must be ignored, not read as zero. Number('') and
        // Number(null) are both 0 in JavaScript, so without this check a price
        // window saved before the owner typed a price made the item FREE for
        // the whole window. Caught in the editor's save path, not by the
        // original tests - which checked 'free' (NaN) but never ''.
        const raw = w?.price;
        if (raw === '' || raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) continue;
        const p = Number(raw);
        if (!Number.isFinite(p) || p < 0) continue;     // malformed: ignore rather than charge £NaN
        if (isWithinWindow(w, date, timeZone) && p < best) best = p;
    }
    return best;
}
