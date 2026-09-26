/**
 * Which orders wait in the till's "Awaiting payment" lane.
 *
 * An unpaid kiosk order must sit here, apart from the kitchen columns, until
 * paid - and must leave the moment it is, or staff would try to take payment
 * twice.
 */
import { describe, it, expect } from 'vitest';
import { isAwaitingKioskPayment } from '../../components/pos/POSKioskPaymentLane.jsx';

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
