/**
 * What the kitchen sees.
 *
 * An unpaid kiosk order must stay off the kitchen board, join it once paid, and
 * a cancelled walk-away must never appear as cookable.
 */
import { describe, it, expect } from 'vitest';
import { isOnKitchenBoard } from '../kds-board.js';

const kiosk = (x = {}) => ({ order_source: 'kiosk', payment_method: 'pay_at_counter', payment_status: 'pending_payment', status: 'pending', order_status: 'new', ...x });

describe('the kitchen board', () => {
    it('REGRESSION GUARD: an unpaid kiosk order is NOT shown to the kitchen', () => {
        // It used to appear red, marked URGENT, with a disabled button.
        expect(isOnKitchenBoard(kiosk())).toBe(false);
    });

    it('it joins the board once paid at the till', () => {
        expect(isOnKitchenBoard(kiosk({ payment_status: 'payment_confirmed', status: 'confirmed', order_status: 'confirmed', payment_method: 'cash' }))).toBe(true);
    });

    it('REGRESSION GUARD: a cancelled walk-away never appears as cookable', () => {
        // Cancelling only `status` left order_status 'new' - and, with payment no
        // longer "pending", the kitchen treated it as ready to cook.
        expect(isOnKitchenBoard(kiosk({ payment_status: 'cancelled_payment', status: 'cancelled', order_status: 'cancelled' }))).toBe(false);
    });

    it('a kiosk order paid by card at the kiosk goes straight to the kitchen', () => {
        expect(isOnKitchenBoard(kiosk({ payment_method: 'card', payment_status: 'paid_card' }))).toBe(true);
    });

    it('online and till orders still show normally', () => {
        expect(isOnKitchenBoard({ order_source: 'online', status: 'confirmed' })).toBe(true);
        expect(isOnKitchenBoard({ order_source: 'pos', status: 'preparing' })).toBe(true);
    });

    it('finished orders leave the board', () => {
        expect(isOnKitchenBoard({ order_source: 'online', status: 'collected' })).toBe(false);
        expect(isOnKitchenBoard(kiosk({ payment_status: 'payment_confirmed', order_status: 'completed' }))).toBe(false);
    });
});

import { statusUpdateFor, statusFromKitchen, kitchenFromStatus } from '../kds-board.js';

describe('the two screens stay in step', () => {
    const paidKiosk = { order_source: 'kiosk', order_type: 'takeaway', status: 'confirmed', order_status: 'confirmed', payment_status: 'payment_confirmed' };

    it('REGRESSION GUARD: kitchen marks it done -> the TILL lets go too', () => {
        const u = statusUpdateFor(paidKiosk, { order_status: 'completed' });
        expect(u).toEqual({ order_status: 'completed', status: 'collected' });
        expect(isOnKitchenBoard({ ...paidKiosk, ...u })).toBe(false);
    });

    it('REGRESSION GUARD: till marks it collected -> the KITCHEN lets go too', () => {
        const u = statusUpdateFor(paidKiosk, { status: 'collected' });
        expect(u).toEqual({ status: 'collected', order_status: 'completed' });
        expect(isOnKitchenBoard({ ...paidKiosk, ...u })).toBe(false);
    });

    it('every step the kitchen takes has a till equivalent', () => {
        for (const s of ['new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']) {
            expect(statusFromKitchen(s, 'takeaway'), s).toBeTruthy();
        }
    });

    it('and every till step has a kitchen equivalent', () => {
        for (const s of ['pending', 'confirmed', 'preparing', 'ready_for_collection', 'out_for_delivery', 'collected', 'delivered', 'cancelled', 'refunded']) {
            expect(kitchenFromStatus(s), s).toBeTruthy();
        }
    });

    it('round trip: a status survives kitchen -> till -> kitchen', () => {
        for (const s of ['new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']) {
            expect(kitchenFromStatus(statusFromKitchen(s, 'takeaway'))).toBe(s);
        }
    });

    it('a delivery kiosk order goes out for delivery, not to collection', () => {
        expect(statusFromKitchen('ready', 'delivery')).toBe('out_for_delivery');
        expect(statusFromKitchen('completed', 'delivery')).toBe('delivered');
    });

    it('non-kiosk orders are untouched - only status is written', () => {
        expect(statusUpdateFor({ order_source: 'online' }, { status: 'collected' })).toEqual({ status: 'collected' });
    });
});
