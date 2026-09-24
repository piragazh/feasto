/**
 * Loyalty identity tests.
 *
 * The rule: every way a customer writes their number must reach the SAME
 * balance. Points were awarded under one form and looked up under another, so
 * a customer typing "+44 7123 456789" was told they had no points at all.
 */
import { describe, it, expect } from 'vitest';
import { normalizeUkPhone, phoneLoyaltyKey, loyaltyIdentifier, mergeCandidate } from '../loyalty-identity.js';

describe('one customer, one balance', () => {
    const SAME_PERSON = [
        '07123456789', '07123 456789', '07123-456789', ' 07123456789 ', '(07123) 456789',
        '+447123456789', '+44 7123 456789', '447123456789', '0044 7123456789', '00447123456789',
        '7123456789',
    ];

    it('REGRESSION GUARD: every way of writing it reaches one balance', () => {
        const keys = new Set(SAME_PERSON.map(normalizeUkPhone));
        expect([...keys]).toEqual(['07123456789']);
    });

    it('REGRESSION GUARD: 0044 does not start a second balance', () => {
        expect(normalizeUkPhone('00447123456789')).toBe(normalizeUkPhone('07123456789'));
    });

    it('REGRESSION GUARD: the international form is not reported as zero points', () => {
        // Awarded under 07…, previously looked up under 447… and found nothing.
        expect(phoneLoyaltyKey('+447123456789')).toBe('phone:07123456789');
    });

    it('a landline works the same way', () => {
        expect(normalizeUkPhone('+44 20 7946 0958')).toBe('02079460958');
        expect(normalizeUkPhone('020 7946 0958')).toBe('02079460958');
    });
});

describe('different people stay different', () => {
    it('two numbers never collide', () => {
        expect(normalizeUkPhone('07123456789')).not.toBe(normalizeUkPhone('07123456788'));
    });

    it('a non-UK number keeps its own key rather than merging with others', () => {
        const fr = normalizeUkPhone('+33 6 12 34 56 78');
        const de = normalizeUkPhone('+49 151 23456789');
        expect(fr).not.toBe(de);
        expect(fr).toBeTruthy();
    });

    it('nothing usable gives no key at all - never a shared empty one', () => {
        for (const junk of ['', null, undefined, 'n/a', '123', '  ']) {
            expect(normalizeUkPhone(junk)).toBe('');
            expect(phoneLoyaltyKey(junk)).toBeNull();
        }
    });
});

describe('which balance an order belongs to', () => {
    it('a signed-in customer is keyed by their account', () => {
        expect(loyaltyIdentifier({ created_by: 'sam@example.com', phone: '07123456789' }))
            .toEqual({ type: 'email', key: 'sam@example.com' });
    });

    it('a guest is keyed by phone, however they typed it', () => {
        expect(loyaltyIdentifier({ created_by: 'anonymous', phone: '+44 7123 456789' }))
            .toEqual({ type: 'phone', key: 'phone:07123456789' });
    });

    it('reads the phone from whichever field the order used', () => {
        expect(loyaltyIdentifier({ customer_phone: '07123456789' }).key).toBe('phone:07123456789');
        expect(loyaltyIdentifier({ guest_phone: '07123456789' }).key).toBe('phone:07123456789');
    });

    it('an order with no usable identity earns nothing rather than guessing', () => {
        expect(loyaltyIdentifier({ created_by: 'anonymous' })).toBeNull();
        expect(loyaltyIdentifier({})).toBeNull();
    });
});

describe('spotting a split balance', () => {
    it('flags an account order that also carries a phone', () => {
        // The same person signing in sometimes and not others builds two
        // balances. Surfaced, never merged silently.
        expect(mergeCandidate({ created_by: 'sam@example.com', phone: '07123456789' }))
            .toEqual({ accountKey: 'sam@example.com', phoneKey: 'phone:07123456789' });
    });

    it('a guest order is not a merge candidate', () => {
        expect(mergeCandidate({ created_by: 'anonymous', phone: '07123456789' })).toBeNull();
    });
});
