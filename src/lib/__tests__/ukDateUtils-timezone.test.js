import { describe, it, expect } from 'vitest';
import { formatUKTime } from '../ukDateUtils.js';
import { getRestaurantTimeZone } from '../region.js';

const FORMATS = ['time', 'time12', 'date', 'datetime', 'datetime12', 'full', 'other'];
// Winter, summer (BST) and both 2026 clock-change days.
const MOMENTS = ['2026-01-15T09:05:00Z', '2026-07-01T23:30:00Z', '2026-03-29T00:59:00Z', '2026-03-29T01:00:00Z',
    '2026-10-25T00:59:00Z', '2026-10-25T01:00:00Z', '2026-11-27T18:45:00Z'];

describe('formatUKTime — restaurant clock', () => {
    it('no zone, the UK zone and a UK restaurant give the same text as before', () => {
        const ukShop = getRestaurantTimeZone({ country: null, timezone: 'UTC' });
        for (const m of MOMENTS) for (const f of FORMATS) {
            const before = formatUKTime(m, f);
            expect(formatUKTime(m, f, 'Europe/London')).toBe(before);
            expect(formatUKTime(m, f, ukShop)).toBe(before);
            expect(formatUKTime(m, f, undefined)).toBe(before);
            expect(formatUKTime(m, f, '')).toBe(before);
        }
    });

    it('UK text is the London wall clock (GMT and BST)', () => {
        expect(formatUKTime('2026-01-15T09:05:00Z', 'time')).toBe('09:05');
        expect(formatUKTime('2026-07-01T23:30:00Z', 'time')).toBe('00:30');
    });

    it('a Sri Lankan shop sees Colombo time', () => {
        const lk = getRestaurantTimeZone({ country: 'LK', timezone: 'UTC' });
        expect(formatUKTime('2026-11-27T18:45:00Z', 'time', lk)).toBe('00:15');
        expect(formatUKTime('2026-11-27T18:45:00Z', 'full', lk)).toContain('28 Nov 2026');
    });

    it('an unreadable zone falls back to UK time instead of crashing', () => {
        expect(formatUKTime('2026-01-15T09:05:00Z', 'time', 'Not/AZone')).toBe('09:05');
    });

    it('missing or bad dates still show --:--', () => {
        expect(formatUKTime(null, 'time', 'Asia/Colombo')).toBe('--:--');
        expect(formatUKTime('garbage', 'time', 'Asia/Colombo')).toBe('--:--');
    });
});
