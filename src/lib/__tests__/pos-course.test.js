/**
 * Course and seat tests.
 *
 * The one that matters most: a HELD course must never be reported as sent.
 * If a waiter believes mains were fired and they are sitting unfired, the table
 * waits until they complain.
 */
import { describe, it, expect } from 'vitest';
import {
    COURSES, courseOf, seatOf, groupByCourse, nextCourseToFire, hasHeldCourses,
    fireCourse, groupBySeat, minutesSinceFired,
} from '../pos-course-logic.js';

const item = (name, course, seat, extra = {}) => ({ name, course, seat, price: 10, quantity: 1, ...extra });

describe('reading a line', () => {
    it('recognises the four courses', () => {
        expect(COURSES).toEqual(['drinks', 'starters', 'mains', 'desserts']);
        expect(courseOf({ course: 'starters' })).toBe('starters');
        expect(courseOf({ course: 'STARTERS' })).toBe('starters');
    });

    it('an item with no course is a main - the commonest case', () => {
        expect(courseOf({})).toBe('mains');
        expect(courseOf({ course: 'pudding' })).toBe('mains');
    });

    it('seat 0 or unset means "for the table"', () => {
        expect(seatOf({ seat: 3 })).toBe(3);
        expect(seatOf({})).toBe(0);
        expect(seatOf({ seat: -1 })).toBe(0);
        expect(seatOf({ seat: 2.5 })).toBe(0);
    });
});

describe('grouping by course', () => {
    const items = [
        item('Coke', 'drinks', 1), item('Soup', 'starters', 1),
        item('Steak', 'mains', 1), item('Fish', 'mains', 2),
    ];

    it('returns courses in serving order, not the order they were added', () => {
        expect(groupByCourse([items[2], items[0], items[1]]).map(g => g.course))
            .toEqual(['drinks', 'starters', 'mains']);
    });

    it('omits courses with nothing in them', () => {
        expect(groupByCourse(items).map(g => g.course)).not.toContain('desserts');
    });

    it('a course is only FIRED when every item in it has been', () => {
        const half = [item('Steak', 'mains', 1, { fired: true }), item('Fish', 'mains', 2)];
        const g = groupByCourse(half)[0];
        expect(g.fired).toBe(false);      // something is still not cooking
        expect(g.partial).toBe(true);
    });

    it('reports a fully fired course as fired', () => {
        const all = [item('Steak', 'mains', 1, { fired: true }), item('Fish', 'mains', 2, { fired: true })];
        expect(groupByCourse(all)[0].fired).toBe(true);
    });
});

describe('THE SAFETY RULE: held is never mistaken for sent', () => {
    const items = [
        item('Soup', 'starters', 1, { fired: true, fired_at: '2026-09-22T18:00:00Z' }),
        item('Steak', 'mains', 1),
    ];

    it('knows mains are still waiting', () => {
        expect(hasHeldCourses(items)).toBe(true);
        expect(nextCourseToFire(items)).toBe('mains');
    });

    it('a partly fired course still counts as waiting', () => {
        const partial = [item('Steak', 'mains', 1, { fired: true }), item('Fish', 'mains', 2)];
        expect(hasHeldCourses(partial)).toBe(true);
        expect(nextCourseToFire(partial)).toBe('mains');
    });

    it('reports nothing left once everything is sent', () => {
        const done = items.map(i => ({ ...i, fired: true }));
        expect(hasHeldCourses(done)).toBe(false);
        expect(nextCourseToFire(done)).toBeNull();
    });

    it('fires in serving order - starters before mains', () => {
        const fresh = [item('Steak', 'mains', 1), item('Soup', 'starters', 1)];
        expect(nextCourseToFire(fresh)).toBe('starters');
    });
});

describe('firing a course', () => {
    const items = [item('Soup', 'starters', 1), item('Steak', 'mains', 1), item('Fish', 'mains', 2)];

    it('fires only that course', () => {
        const out = fireCourse(items, 'mains', new Date('2026-09-22T19:00:00Z'));
        expect(out.filter(i => i.fired).map(i => i.name)).toEqual(['Steak', 'Fish']);
        expect(out[0].fired).toBeUndefined();          // the starter is untouched
    });

    it('stamps the time, so "how long ago" is answerable', () => {
        const out = fireCourse(items, 'mains', new Date('2026-09-22T19:00:00Z'));
        expect(out[1].fired_at).toBe('2026-09-22T19:00:00.000Z');
    });

    it('REGRESSION GUARD: never mutates the original order', () => {
        // A failed save must not leave the screen showing a course as sent.
        const before = JSON.parse(JSON.stringify(items));
        fireCourse(items, 'mains');
        expect(items).toEqual(before);
    });

    it('re-firing does not reset the original time', () => {
        const once = fireCourse(items, 'mains', new Date('2026-09-22T19:00:00Z'));
        const twice = fireCourse(once, 'mains', new Date('2026-09-22T20:00:00Z'));
        expect(twice[1].fired_at).toBe('2026-09-22T19:00:00.000Z');
    });
});

describe('seats', () => {
    const items = [
        item('Steak', 'mains', 2), item('Soup', 'starters', 1),
        item('Bread', 'starters', 0), item('Fish', 'mains', 1),
    ];

    it('groups by seat with shared items last', () => {
        expect(groupBySeat(items).map(g => g.label))
            .toEqual(['Seat 1', 'Seat 2', 'For the table']);
    });

    it('totals each seat, for splitting the bill', () => {
        const seat1 = groupBySeat(items).find(g => g.seat === 1);
        expect(seat1.items.map(i => i.name)).toEqual(['Soup', 'Fish']);
        expect(seat1.total).toBe(20);
    });

    it('seat totals add up to the order total', () => {
        const groups = groupBySeat(items);
        expect(groups.reduce((s, g) => s + g.total, 0)).toBe(40);
    });
});

describe('time since firing', () => {
    it('counts minutes since a course went to the kitchen', () => {
        const g = groupByCourse([item('Steak', 'mains', 1, { fired: true, fired_at: '2026-09-22T19:00:00Z' })])[0];
        expect(minutesSinceFired(g, new Date('2026-09-22T19:25:00Z'))).toBe(25);
    });

    it('is null for a course that has not been fired', () => {
        expect(minutesSinceFired(groupByCourse([item('Steak', 'mains', 1)])[0])).toBeNull();
    });
});
