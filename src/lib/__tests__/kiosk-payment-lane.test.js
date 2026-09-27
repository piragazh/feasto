/**
 * Which orders wait in the till's "Awaiting payment" lane.
 *
 * An unpaid kiosk order must sit here, apart from the kitchen columns, until
 * paid - and must leave the moment it is, or staff would try to take payment
 * twice.
 */
import { describe, it, expect } from 'vitest';
import { isAwaitingKioskPayment } from '../kiosk-payment.js';

const kiosk = (x = {}) => ({ order_source: 'kiosk', payment_method: 'pay_at_counter', payment_status: 'pending_payment', status: 'pending', ...x });

describe('the awaiting-payment lane', () => {
    it('holds an unpaid kiosk counter order', () => {
        expect(isAwaitingKioskPayment(kiosk())).toBe(true);
    });

    it('REGRESSION GUARD: releases it the moment it is paid', () => {
        // confirmKioskPayment sets payment_status to payment_confirmed.
        expect(isAwaitingKioskPayment(kiosk({ payment_status: 'payment_confirmed', status: 'confirmed', payment_method: 'cash' }))).toBe(false);
    });

    it('drops a cancelled order', () => {
        expect(isAwaitingKioskPayment(kiosk({ status: 'cancelled' }))).toBe(false);
    });

    it('never holds a kiosk order already paid by card at the kiosk', () => {
        expect(isAwaitingKioskPayment(kiosk({ payment_method: 'card', payment_status: 'paid_card' }))).toBe(false);
    });

    it('never holds online, till or table orders', () => {
        for (const source of ['online', 'pos', 'qr', 'third_party']) {
            expect(isAwaitingKioskPayment(kiosk({ order_source: source }))).toBe(false);
        }
    });

    it('is safe with missing data', () => {
        expect(isAwaitingKioskPayment(null)).toBe(false);
        expect(isAwaitingKioskPayment({})).toBe(false);
    });
});

import { needsCashierAttention } from '../kiosk-payment.js';

describe('which orders alert the till', () => {
    it('a kiosk order waiting to be paid alerts - a customer is at the counter', () => {
        expect(needsCashierAttention(kiosk())).toBe(true);
    });

    it('REGRESSION GUARD: a kiosk order paid by card at the kiosk does NOT alert', () => {
        expect(needsCashierAttention(kiosk({ payment_method: 'card', payment_status: 'paid_card' }))).toBe(false);
    });

    it('stops alerting once paid at the counter', () => {
        expect(needsCashierAttention(kiosk({ payment_status: 'payment_confirmed' }))).toBe(false);
    });

    it('online and marketplace orders still alert', () => {
        expect(needsCashierAttention({ order_source: 'online', status: 'pending' })).toBe(true);
        expect(needsCashierAttention({ order_source: 'third_party', status: 'pending' })).toBe(true);
    });

    it('orders rung up at this till never alert', () => {
        expect(needsCashierAttention({ order_source: 'pos', status: 'pending' })).toBe(false);
    });
});

import { findByOrderNumber } from '../kiosk-payment.js';

describe('finding the order the cashier typed', () => {
    const lane = ['K-003', 'K-013', 'K-023', 'K-030', 'K-4821'].map(n => kiosk({ order_number: n }));
    const nums = (list) => list.map(o => o.order_number);

    it('REGRESSION GUARD: typing 3 finds K-003 only, not K-013 / K-023 / K-030', () => {
        expect(nums(findByOrderNumber(lane, '3'))).toEqual(['K-003']);
    });

    it('leading zeros and the K prefix make no difference', () => {
        for (const q of ['03', '003', 'K3', 'k-003', ' 3 ']) {
            expect(nums(findByOrderNumber(lane, q))).toEqual(['K-003']);
        }
    });

    it('a two-digit number is exact too', () => {
        expect(nums(findByOrderNumber(lane, '13'))).toEqual(['K-013']);
        expect(nums(findByOrderNumber(lane, '30'))).toEqual(['K-030']);
    });

    it('falls back to a partial match when nothing matches exactly', () => {
        expect(nums(findByOrderNumber(lane, '482'))).toEqual(['K-4821']);
        expect(nums(findByOrderNumber(lane, '2'))).toEqual(['K-023', 'K-4821']);
    });

    it('shows nothing when nothing matches at all', () => {
        expect(findByOrderNumber(lane, '99')).toEqual([]);
    });

    it('an empty or non-numeric query shows the whole lane, in its order', () => {
        expect(nums(findByOrderNumber(lane, ''))).toEqual(nums(lane));
        expect(nums(findByOrderNumber(lane, 'K-'))).toEqual(nums(lane));
    });

    it('is safe with missing numbers and missing input', () => {
        const withBlank = [kiosk({ order_number: undefined }), ...lane];
        expect(nums(findByOrderNumber(withBlank, '3'))).toEqual(['K-003']);
        expect(findByOrderNumber(undefined, '3')).toEqual([]);
        expect(findByOrderNumber(lane, undefined)).toEqual(lane);
    });
});
