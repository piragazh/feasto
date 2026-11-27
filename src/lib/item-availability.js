/**
 * Can this item be sold here, at this time? ONE rule for every screen that
 * shows a menu and every server that takes an order.
 *
 * Where each channel setting sells (the menu form's options):
 *   both         "Both (Online & In-Store POS)"  till, online, kiosk, QR
 *   online_only  "Online Only"                   online
 *   pos_only     "In-Store POS Only"             the staff till only
 * Kiosk and QR are customer self-service, so they sell "both" items only -
 * what the kiosk screen already did and what both their servers enforced.
 *
 * Found 27 Sep: a POS-only item showed on the online menu (the popular-items
 * rail cached ALL items under the menu's own query key); the kiosk and QR
 * screens offered items their servers then refused; online checkout never
 * checked the channel; and time windows were enforced at the till only.
 *
 * The block between the markers is copied VERBATIM into
 *   base44/functions/kioskCreateOrder/entry.ts
 *   base44/functions/tableCreateOrder/entry.ts
 *   base44/functions/verifyAndCreateOrder/entry.ts
 * by scripts/sync-item-availability.mjs; check-item-availability.mjs fails if
 * any copy differs, and proves the time rule matches pos-schedule-logic.js
 * (the till's) at every tested instant.
 */

// ── ITEM AVAILABILITY (shared - keep identical in every copy) ────────────────
const AVAILABILITY_TZ = 'Europe/London';
// A restaurant's clock. Same rule as getRestaurantTimeZone in src/lib/region.js
// (check-region.mjs compares them): a real zone on the record wins; blank or
// the schema default "UTC" means "not set", so the country's zone is used; no
// restaurant, no country or a zone the runtime can't read means the UK clock.
// Every time rule below takes this zone and defaults to the UK clock, so a
// caller that passes no zone behaves exactly as before region support.
const COUNTRY_TZ = { GB: 'Europe/London', LK: 'Asia/Colombo' };
function isValidTz(tz) {
    try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch (_) { return false; }
}
function restaurantTz(restaurant) {
    const tz = typeof restaurant?.timezone === 'string' ? restaurant.timezone.trim() : '';
    if (tz && tz.toUpperCase() !== 'UTC' && isValidTz(tz)) return tz;
    const c = typeof restaurant?.country === 'string' ? restaurant.country.trim().toUpperCase() : '';
    return COUNTRY_TZ[c] || AVAILABILITY_TZ;
}
const SELLS_AT = {
    till: ['both', 'pos_only'],
    online: ['both', 'online_only'],
    kiosk: ['both'],
    qr: ['both'],
};
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** An unknown or missing setting means "both" - never hide a menu by accident. */
function channelOf(item) {
    const c = item?.availability_channel;
    return c === 'online_only' || c === 'pos_only' ? c : 'both';
}

function sellsAt(item, where) {
    return (SELLS_AT[where] || []).includes(channelOf(item));
}

/** Weekday and minute-of-day on the restaurant's clock (UK by default), whatever the device's own zone. */
function ukClock(date, tz = AVAILABILITY_TZ) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (t) => parts.find(p => p.type === t)?.value;
    return { day: WEEKDAYS[get('weekday')], minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

function hhmmToMinutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    return h > 23 || min > 59 ? null : h * 60 + min;
}

/** Same rule as the till: days, late menus past midnight, start === end is all day. */
function inWindow(w, date, tz = AVAILABILITY_TZ) {
    if (!w) return false;
    const start = hhmmToMinutes(w.start), end = hhmmToMinutes(w.end);
    if (start === null || end === null) return false;
    const { day, minutes } = ukClock(date, tz);
    const days = Array.isArray(w.days) && w.days.length ? w.days : [0, 1, 2, 3, 4, 5, 6];
    if (start === end) return days.includes(day);
    if (start < end) return days.includes(day) && minutes >= start && minutes < end;
    if (minutes >= start) return days.includes(day);           // evening part of a late menu
    return minutes < end && days.includes((day + 6) % 7);       // after midnight: yesterday's window
}

/** No windows (or an empty list) means always - scheduling is opt-in. */
function inHours(item, date, tz = AVAILABILITY_TZ) {
    const ws = item?.availability_windows;
    if (!Array.isArray(ws) || ws.length === 0) return true;
    return ws.some(w => inWindow(w, date, tz));
}

/**
 * Why this item cannot be sold here at `date`, or null if it can.
 * 'unavailable' - switched off; 'channel' - not sold here; 'hours' - outside its times.
 */
function whyNotSellable(item, where, date, tz = AVAILABILITY_TZ) {
    if (!item || item.is_available === false) return 'unavailable';
    if (!sellsAt(item, where)) return 'channel';
    if (!inHours(item, date, tz)) return 'hours';
    return null;
}
/**
 * When an order is FOR: a future scheduled slot, else now. A scheduled order is
 * checked against the time it will be made, not the time it was placed.
 */
function forTime(isScheduled, scheduledFor, now = new Date()) {
    const t = isScheduled !== false && scheduledFor ? new Date(scheduledFor) : null;
    return t && Number.isFinite(t.getTime()) && t.getTime() > now.getTime() ? t : now;
}

/** Customer-facing wording for a refusal (servers use the same words). */
function notSellableMessage(name, why) {
    const n = `"${name || 'An item'}"`;
    if (why === 'channel') return `${n} isn't sold here. Please remove it.`;
    if (why === 'hours') return `${n} isn't available at this time. Please remove it.`;
    return `${n} is currently unavailable. Please remove it.`;
}
// ── END ITEM AVAILABILITY ────────────────────────────────────────────────────

/**
 * For screens: the next time this item comes on, as "17:00" (today) or
 * "Fri 17:00", scanning the coming week in 15-minute steps. null if never.
 */
function nextOpening(item, from = new Date(), tz = AVAILABILITY_TZ) {
    const ws = item?.availability_windows;
    if (!Array.isArray(ws) || ws.length === 0) return null;
    const STEP = 15 * 60 * 1000;
    const t0 = Math.ceil(from.getTime() / STEP) * STEP;
    for (let t = t0; t <= from.getTime() + 7 * 24 * 3600 * 1000; t += STEP) {
        const d = new Date(t);
        if (inHours(item, d, tz)) {
            const hm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
            const sameDay = ukClock(d, tz).day === ukClock(from, tz).day && t - from.getTime() < 24 * 3600 * 1000;
            if (sameDay) return hm;
            const wd = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(d);
            return `${wd} ${hm}`;
        }
    }
    return null;
}

/**
 * A window in words, UK week order: "Mon–Fri 17:00–19:00", "Mon, Wed–Sun 17:00–19:00",
 * "Sat, Sun all day", "Every day 11:30–14:30". Runs of 3+ days collapse to a range,
 * so a missing day stands out. For owners reading their menu list.
 */
function describeWindow(w) {
    const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const WEEK = [1, 2, 3, 4, 5, 6, 0];                        // Monday first
    const raw = Array.isArray(w?.days) && w.days.length ? w.days.map(Number) : [0, 1, 2, 3, 4, 5, 6];
    const on = WEEK.filter(d => raw.includes(d));
    let days;
    if (on.length === 7) days = 'Every day';
    else {
        const runs = [];
        for (const d of on) {
            const last = runs[runs.length - 1];
            if (last && WEEK.indexOf(d) === WEEK.indexOf(last[last.length - 1]) + 1) last.push(d);
            else runs.push([d]);
        }
        days = runs.map(r => r.length >= 3 ? `${NAMES[r[0]]}\u2013${NAMES[r[r.length - 1]]}` : r.map(d => NAMES[d]).join(', ')).join(', ');
    }
    const s = hhmmToMinutes(w?.start), e = hhmmToMinutes(w?.end);
    if (s === null || e === null) return `${days} (times not set)`;
    return s === e ? `${days} all day` : `${days} ${w.start}\u2013${w.end}`;
}

/** Every window of an item, joined; '' when it has none (sold all day). */
function describeWindows(item) {
    const ws = item?.availability_windows;
    return Array.isArray(ws) && ws.length ? ws.map(describeWindow).join('; ') : '';
}

export { SELLS_AT, channelOf, sellsAt, inHours, whyNotSellable, nextOpening, notSellableMessage, forTime, describeWindow, describeWindows, restaurantTz, COUNTRY_TZ };
