import { describe, it, expect } from 'vitest';
import { describeWindow, describeWindows } from '../item-availability.js';

// How an item's time windows read in the dashboard's menu list.
describe('time windows in words', () => {
    it("REGRESSION GUARD: Tilbury's box meal - the missing Tuesday is visible", () => {
        // Verbatim from the live record: the platform stores the days as floats.
        expect(describeWindow({ start: '17:00', days: [0.0, 1.0, 3.0, 4.0, 5.0, 6.0], end: '19:00' }))
            .toBe('Mon, Wed\u2013Sun 17:00\u201319:00');
    });
    it('weekdays, weekends, every day', () => {
        expect(describeWindow({ days: [1, 2, 3, 4, 5], start: '11:30', end: '14:30' })).toBe('Mon\u2013Fri 11:30\u201314:30');
        expect(describeWindow({ days: [6, 0], start: '09:00', end: '12:00' })).toBe('Sat, Sun 09:00\u201312:00');
        expect(describeWindow({ days: [0, 1, 2, 3, 4, 5, 6], start: '17:00', end: '22:00' })).toBe('Every day 17:00\u201322:00');
        expect(describeWindow({ days: [], start: '17:00', end: '22:00' })).toBe('Every day 17:00\u201322:00');
    });
    it('late menus, all day, and broken times', () => {
        expect(describeWindow({ days: [5, 6], start: '22:00', end: '02:00' })).toBe('Fri, Sat 22:00\u201302:00');
        expect(describeWindow({ days: [0], start: '00:00', end: '00:00' })).toBe('Sun all day');
        expect(describeWindow({ days: [1], start: '', end: '12:00' })).toBe('Mon (times not set)');
    });
    it('Sunday is last in the UK week, so Sat-Sun-Mon is not a range', () => {
        expect(describeWindow({ days: [6, 0, 1], start: '10:00', end: '11:00' })).toBe('Mon, Sat, Sun 10:00\u201311:00');
    });
    it('several windows, and none', () => {
        expect(describeWindows({ availability_windows: [
            { days: [1, 2, 3, 4, 5], start: '07:00', end: '11:00' }, { days: [6, 0], start: '08:00', end: '12:00' }] }))
            .toBe('Mon\u2013Fri 07:00\u201311:00; Sat, Sun 08:00\u201312:00');
        expect(describeWindows({ availability_windows: [] })).toBe('');
        expect(describeWindows({})).toBe('');
    });
});
