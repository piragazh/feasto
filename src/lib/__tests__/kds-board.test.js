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
