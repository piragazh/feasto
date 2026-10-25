// Seasonal storefront animations: the catalogue, their usual dates, and the
// rules for when one is showing. Drawing lives in components/restaurant/SeasonalEffect.jsx;
// the server applies the same rules in updateRestaurantSettings.

export const SEASONAL_EFFECTS = [
    { id: 'bats', label: 'Halloween bats', occasion: 'Halloween', usual: { start: [10, 24], end: [11, 1] } },
    { id: 'snow', label: 'Christmas snow', occasion: 'Christmas and winter', usual: { start: [12, 1], end: [12, 26] } },
    { id: 'hearts', label: 'Floating hearts', occasion: "Valentine's Day, Mother's Day", usual: { start: [2, 7], end: [2, 14] } },
    { id: 'stars', label: 'Twinkling stars', occasion: 'Eid, Ramadan, Diwali', usual: null },
    { id: 'sparkles', label: 'Golden sparkles', occasion: 'New Year, Bonfire Night, celebrations', usual: { start: [12, 28], end: [1, 2] } },
];

export const SEASONAL_IDS = SEASONAL_EFFECTS.map((e) => e.id);
export const SEASONAL_INTENSITIES = ['light', 'medium'];
export const MAX_SEASONAL_DAYS = 92;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today's date on this device as YYYY-MM-DD. */
export function todayLocal(now = new Date()) {
    return ymd(now);
}

function isRealDate(s) {
    if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function daysBetween(a, b) {
    const [ya, ma, da] = a.split('-').map(Number);
    const [yb, mb, db] = b.split('-').map(Number);
    return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

/**
 * The next time an effect's usual dates come round (this year's if not over yet).
 * Effects without usual dates (moving festivals) get the coming week.
 */
export function usualDates(id, now = new Date()) {
    const effect = SEASONAL_EFFECTS.find((e) => e.id === id);
    const today = todayLocal(now);
    if (!effect?.usual) {
        const end = new Date(now);
        end.setDate(end.getDate() + 7);
        return { starts_on: today, ends_on: ymd(end) };
    }
    const [sm, sd] = effect.usual.start;
    const [em, ed] = effect.usual.end;
    for (const year of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
        const endYear = em < sm ? year + 1 : year; // ranges that cross New Year
        const starts_on = `${year}-${pad(sm)}-${pad(sd)}`;
        const ends_on = `${endYear}-${pad(em)}-${pad(ed)}`;
        if (ends_on >= today) return { starts_on, ends_on };
    }
    return null;
}

/** A stored seasonal_effect if it is well-formed, else null. */
export function sanitizeSeasonal(se) {
    if (!se || typeof se !== 'object' || Array.isArray(se)) return null;
    if (!SEASONAL_IDS.includes(se.type)) return null;
    if (!isRealDate(se.starts_on) || !isRealDate(se.ends_on)) return null;
    if (se.ends_on < se.starts_on) return null;
    return {
        type: se.type,
        intensity: SEASONAL_INTENSITIES.includes(se.intensity) ? se.intensity : 'light',
        starts_on: se.starts_on,
        ends_on: se.ends_on,
    };
}

/** Problems with an editor's seasonal choice, as a user-facing message, or null. */
export function seasonalProblem(se) {
    if (!se || se.type === 'none' || !se.type) return null;
    if (!isRealDate(se.starts_on) || !isRealDate(se.ends_on)) return 'Choose a start and end date for the seasonal animation.';
    if (se.ends_on < se.starts_on) return 'The seasonal animation ends before it starts.';
    if (daysBetween(se.starts_on, se.ends_on) > MAX_SEASONAL_DAYS) return 'A seasonal animation can run for up to 3 months.';
    return null;
}

/** The effect to show today, or null. */
export function activeSeasonal(se, today = todayLocal()) {
    const s = sanitizeSeasonal(se);
    if (!s) return null;
    return s.starts_on <= today && today <= s.ends_on ? s : null;
}

/** Short status for the editor: showing now, upcoming or finished. */
export function seasonalStatus(se, today = todayLocal()) {
    const s = sanitizeSeasonal(se);
    if (!s) return null;
    const fmt = (d) => {
        const [y, m, day] = d.split('-').map(Number);
        return new Date(y, m - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };
    if (today < s.starts_on) return { state: 'upcoming', text: `Starts ${fmt(s.starts_on)}, runs until ${fmt(s.ends_on)}` };
    if (today > s.ends_on) return { state: 'ended', text: `Finished on ${fmt(s.ends_on)} — pick new dates to show it again` };
    return { state: 'live', text: `Showing to customers now, until ${fmt(s.ends_on)}` };
}
