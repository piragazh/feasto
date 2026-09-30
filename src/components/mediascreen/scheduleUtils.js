/**
 * Shared scheduling + ordering helpers for all media screen players.
 *
 * Replaces four copy-pasted versions of the schedule check. Fixes:
 *  - overnight time ranges (e.g. 22:00–02:00) now match
 *  - recurring schedules with days but no time ranges show all day on those days
 *  - end_time is exclusive (09:00–17:00 stops at 17:00, not 17:00:59)
 *  - stable sort: priority desc → display_order asc → created_date asc → id
 *    (items sharing a display_order no longer swap places between refreshes)
 *
 * Time is the display device's local clock (unchanged behaviour).
 */

const toMinutes = (hhmm) => {
    if (typeof hhmm !== 'string') return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
};

const inTimeRange = (nowMin, range) => {
    const start = toMinutes(range?.start_time);
    const end = toMinutes(range?.end_time);
    if (start == null || end == null) return true; // incomplete range → don't block
    if (start === end) return true;                // treat as all day
    if (start < end) return nowMin >= start && nowMin < end;
    return nowMin >= start || nowMin < end;        // crosses midnight
};

export function isScheduleActive(schedule, now = new Date()) {
    if (!schedule?.enabled) return true;

    if (schedule.start_date && new Date(schedule.start_date) > now) return false;
    if (schedule.end_date && new Date(schedule.end_date) < now) return false;

    const rec = schedule.recurring;
    if (rec?.enabled) {
        const days = Array.isArray(rec.days_of_week) ? rec.days_of_week.map(Number) : [];
        const ranges = Array.isArray(rec.time_ranges) ? rec.time_ranges : [];
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const today = now.getDay();
        const yesterday = (today + 6) % 7;

        if (ranges.length === 0) {
            return days.length === 0 || days.includes(today);
        }

        return ranges.some((range) => {
            if (!inTimeRange(nowMin, range)) return false;
            if (days.length === 0) return true;
            const start = toMinutes(range?.start_time);
            const end = toMinutes(range?.end_time);
            const overnight = start != null && end != null && start > end;
            // After midnight on an overnight range, the slot belongs to the previous day
            if (overnight && nowMin < end) return days.includes(yesterday);
            return days.includes(today);
        });
    }

    return true;
}

export function sortContent(items = []) {
    return [...items].sort((a, b) => {
        const p = (Number(b.priority) || 1) - (Number(a.priority) || 1);
        if (p !== 0) return p;
        const o = (Number(a.display_order) || 0) - (Number(b.display_order) || 0);
        if (o !== 0) return o;
        const c = String(a.created_date || '').localeCompare(String(b.created_date || ''));
        if (c !== 0) return c;
        return String(a.id || '').localeCompare(String(b.id || ''));
    });
}

export function filterActiveContent(items = [], now = new Date()) {
    if (!Array.isArray(items)) return [];
    return sortContent(items.filter((item) => item && isScheduleActive(item.schedule, now)));
}

export function filterActivePlaylists(playlists = [], now = new Date()) {
    if (!Array.isArray(playlists)) return [];
    return playlists
        .filter((p) => p && isScheduleActive(p.schedule, now))
        .sort((a, b) => (Number(b.priority) || 1) - (Number(a.priority) || 1));
}

/** Only removes this player's own cache keys — never auth tokens or kiosk settings. */
export function clearScreenCache() {
    try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('screen_cache_')) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
    } catch {}
}
