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

/** Weekday and minute-of-day in the UK, whatever the device's own zone. */
function ukClock(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: AVAILABILITY_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
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
function inWindow(w, date) {
    if (!w) return false;
    const start = hhmmToMinutes(w.start), end = hhmmToMinutes(w.end);
    if (start === null || end === null) return false;
    const { day, minutes } = ukClock(date);
    const days = Array.isArray(w.days) && w.days.length ? w.days : [0, 1, 2, 3, 4, 5, 6];
    if (start === end) return days.includes(day);
    if (start < end) return days.includes(day) && minutes >= start && minutes < end;
    if (minutes >= start) return days.includes(day);           // evening part of a late menu
    return minutes < end && days.includes((day + 6) % 7);       // after midnight: yesterday's window
}

/** No windows (or an empty list) means always - scheduling is opt-in. */
function inHours(item, date) {
    const ws = item?.availability_windows;
    if (!Array.isArray(ws) || ws.length === 0) return true;
    return ws.some(w => inWindow(w, date));
}

/**
 * Why this item cannot be sold here at `date`, or null if it can.
 * 'unavailable' - switched off; 'channel' - not sold here; 'hours' - outside its times.
 */
function whyNotSellable(item, where, date) {
    if (!item || item.is_available === false) return 'unavailable';
    if (!sellsAt(item, where)) return 'channel';
    if (!inHours(item, date)) return 'hours';
    return null;
}
// ── END ITEM AVAILABILITY ────────────────────────────────────────────────────

/**
 * For screens: the next time this item comes on, as "17:00" (today) or
 * "Fri 17:00", scanning the coming week in 15-minute steps. null if never.
 */
function nextOpening(item, from = new Date()) {
    const ws = item?.availability_windows;
    if (!Array.isArray(ws) || ws.length === 0) return null;
    const STEP = 15 * 60 * 1000;
    const t0 = Math.ceil(from.getTime() / STEP) * STEP;
    for (let t = t0; t <= from.getTime() + 7 * 24 * 3600 * 1000; t += STEP) {
        const d = new Date(t);
        if (inHours(item, d)) {
            const hm = new Intl.DateTimeFormat('en-GB', { timeZone: AVAILABILITY_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
            const sameDay = ukClock(d).day === ukClock(from).day && t - from.getTime() < 24 * 3600 * 1000;
            if (sameDay) return hm;
            const wd = new Intl.DateTimeFormat('en-GB', { timeZone: AVAILABILITY_TZ, weekday: 'short' }).format(d);
            return `${wd} ${hm}`;
        }
    }
    return null;
}

/** Customer-facing wording for a refusal (servers use the same words). */
function notSellableMessage(name, why) {
    const n = `"${name || 'An item'}"`;
    if (why === 'channel') return `${n} isn't sold here. Please remove it.`;
    if (why === 'hours') return `${n} isn't available at this time. Please remove it.`;
    return `${n} is currently unavailable. Please remove it.`;
}

export { SELLS_AT, channelOf, sellsAt, inHours, whyNotSellable, nextOpening, notSellableMessage };
