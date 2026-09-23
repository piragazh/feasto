/**
 * src/lib/pos-course-logic.js
 * ===========================
 * TESTED source of truth for courses and seats on a table order.
 *
 * ─── WHAT COURSING IS FOR ───────────────────────────────────────────────────
 * Starters go to the kitchen now; mains are HELD until the table has finished
 * them. Without it everything cooks at once and mains sit under a lamp.
 *
 * ─── THE RULE THAT MATTERS ──────────────────────────────────────────────────
 * A HELD course must never look like a SENT one. If a waiter believes mains were
 * fired and they are sitting unfired, the table waits indefinitely and nobody
 * finds out until they complain. So:
 *   - held and fired are explicit states, never inferred from absence
 *   - the kitchen sees held courses listed, clearly marked, so it knows they
 *     exist and is not surprised later
 *   - firing stamps a time, so "how long since mains were fired" is answerable
 *
 * Seats record which cover ordered what, so food reaches the right person and a
 * bill can be split by seat without anyone remembering.
 */

/** Courses in the order they are served. */
export const COURSES = ['drinks', 'starters', 'mains', 'desserts'];

export const COURSE_LABELS = {
    drinks: 'Drinks',
    starters: 'Starters',
    mains: 'Mains',
    desserts: 'Desserts',
};

/** Items with no course set are treated as mains - the commonest case. */
export const DEFAULT_COURSE = 'mains';

export function courseOf(item) {
    const c = String(item?.course || '').trim().toLowerCase();
    return COURSES.includes(c) ? c : DEFAULT_COURSE;
}

/** Seat 0 / unset means "for the table" (sharing platters, sides). */
export function seatOf(item) {
    const n = Number(item?.seat);
    return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Group an order's items by course, in serving order.
 *
 * Every group reports whether it has been fired. `fired` is true only when EVERY
 * item in it has been fired - a partly-fired course counts as still held, since
 * something in it is not yet cooking.
 *
 * @returns {Array<{ course, label, items, fired, firedAt, partial }>}
 */
export function groupByCourse(items = []) {
    const groups = new Map();
    for (const item of items) {
        const c = courseOf(item);
        if (!groups.has(c)) groups.set(c, []);
        groups.get(c).push(item);
    }
    return COURSES
        .filter(c => groups.has(c))
        .map(c => {
            const list = groups.get(c);
            const firedCount = list.filter(i => i?.fired === true).length;
            const times = list.map(i => i?.fired_at).filter(Boolean).sort();
            return {
                course: c,
                label: COURSE_LABELS[c],
                items: list,
                fired: firedCount === list.length,
                partial: firedCount > 0 && firedCount < list.length,
                firedAt: times[0] || null,
            };
        });
}

/**
 * The next course a waiter would fire: the earliest course not fully fired.
 * Returns null when everything has been sent.
 */
export function nextCourseToFire(items = []) {
    const group = groupByCourse(items).find(g => !g.fired);
    return group ? group.course : null;
}

/** Are any courses still waiting to be sent? */
export function hasHeldCourses(items = []) {
    return groupByCourse(items).some(g => !g.fired);
}

/**
 * Mark one course's items as fired.
 *
 * Returns a NEW items array - never mutates the order in place, so a failed save
 * cannot leave the screen showing a course as sent when it was not.
 * Items already fired keep their original time; re-firing does not reset it.
 */
export function fireCourse(items = [], course, at = new Date()) {
    const target = COURSES.includes(course) ? course : DEFAULT_COURSE;
    const stamp = at instanceof Date ? at.toISOString() : String(at);
    return (items || []).map(item => (
        courseOf(item) === target && item?.fired !== true
            ? { ...item, fired: true, fired_at: stamp }
            : item
    ));
}

/**
 * Items grouped by seat, for serving and for splitting a bill.
 * Seat 0 ("for the table") is always last.
 */
export function groupBySeat(items = []) {
    const seats = new Map();
    for (const item of items) {
        const s = seatOf(item);
        if (!seats.has(s)) seats.set(s, []);
        seats.get(s).push(item);
    }
    return [...seats.entries()]
        .sort(([a], [b]) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
        .map(([seat, list]) => ({
            seat,
            label: seat === 0 ? 'For the table' : `Seat ${seat}`,
            items: list,
            total: Math.round(list.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0) * 100) / 100,
        }));
}

/** Minutes since a course was fired - for the kitchen's sense of urgency. */
export function minutesSinceFired(group, now = new Date()) {
    if (!group?.firedAt) return null;
    return Math.max(0, Math.floor((now.getTime() - new Date(group.firedAt).getTime()) / 60000));
}
