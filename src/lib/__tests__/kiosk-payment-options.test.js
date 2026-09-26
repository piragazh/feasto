/**
 * Kiosk payment options - tested against the REAL function.
 *
 * The existing smoke suite keeps its own copy of this logic, so it could not
 * notice that 5 of the 24 possible settings left a customer with NO way to pay.
 */
import { describe, it, expect } from 'vitest';
import { getKioskPaymentOptions } from '../kioskTerminalReadiness.js';

const cfg = (counter, card, reader, down) => ({
    payment_counter_enabled: counter, payment_card_enabled: card,
    terminal_unavailable: down, card_terminal: { reader_id: reader },
});

describe('a customer can always pay', () => {
    it('REGRESSION GUARD: no combination of settings leaves zero payment options', () => {
        for (const counter of [true, false, undefined])
            for (const card of [true, false])
                for (const reader of ['', 'tmr_123'])
                    for (const down of [false, true]) {
                        const o = getKioskPaymentOptions(cfg(counter, card, reader, down));
                        expect(o.showCard || o.showCounter, JSON.stringify({ counter, card, reader, down })).toBe(true);
                    }
    });

    it('a card-only kiosk whose reader goes offline falls back to the counter', () => {
        const o = getKioskPaymentOptions(cfg(false, true, 'tmr_123', true));
        expect(o.showCard).toBe(false);
        expect(o.showCounter).toBe(true);
        expect(o.counterIsFallback).toBe(true);
    });

    it('with no config at all, the counter is offered', () => {
        expect(getKioskPaymentOptions(null).showCounter).toBe(true);
    });
});

describe('when to tell the customer card is unavailable', () => {
    it('REGRESSION GUARD: NOT when the kiosk never offered card', () => {
        // Every order at a counter-only kiosk used to say card was unavailable.
        expect(getKioskPaymentOptions(cfg(true, false, '', false)).cardUnavailable).toBe(false);
    });

    it('yes, when card is offered but the reader is down', () => {
        expect(getKioskPaymentOptions(cfg(true, true, 'tmr_123', true)).cardUnavailable).toBe(true);
    });

    it('no, when card is working', () => {
        const o = getKioskPaymentOptions(cfg(true, true, 'tmr_123', false));
        expect(o.showCard).toBe(true);
        expect(o.cardUnavailable).toBe(false);
    });
});

describe('the owner\'s choices are otherwise respected', () => {
    it('a counter-only kiosk shows only the counter', () => {
        const o = getKioskPaymentOptions(cfg(true, false, '', false));
        expect(o.showCard).toBe(false);
        expect(o.showCounter).toBe(true);
        expect(o.counterIsFallback).toBe(false);
    });

    it('a working card-only kiosk shows only card', () => {
        const o = getKioskPaymentOptions(cfg(false, true, 'tmr_123', false));
        expect(o.showCard).toBe(true);
        expect(o.showCounter).toBe(false);
    });
});
