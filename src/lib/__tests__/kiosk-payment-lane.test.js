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

import { findByOrderNumber, functionErrorMessage } from '../kiosk-payment.js';
import { AxiosError } from 'axios';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client.js';

/**
 * Fail a request through the REAL SDK client, so the test sees exactly the
 * error functions.invoke throws - not a shape we guessed.
 */
async function sdkFailure(status, body) {
    const client = createAxiosClient({ baseURL: 'http://test.invalid' });
    client.defaults.adapter = async (config) => {
        const response = { data: body, status, statusText: '', headers: {}, config, request: {} };
        throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, {}, response);
    };
    try { await client.post('/apps/x/functions/kioskCreateOrder', {}); }
    catch (e) { return e; }
    throw new Error('expected the request to fail');
}

describe('showing the kiosk why an order was refused', () => {
    const fallback = 'Failed to place order. Please try again.';

    it('REGRESSION GUARD: the real SDK error carries the server reason, and we show it', async () => {
        const err = await sdkFailure(429, { error: 'The counter is very busy right now. Please order at the counter.', code: 'counter_queue_full', success: false });
        expect(err.response).toBeUndefined();          // why err.response.data.error never worked
        expect(err.message).toMatch(/status code 429/); // and why err.message must not be shown
        expect(functionErrorMessage(err, fallback)).toBe('The counter is very busy right now. Please order at the counter.');
    });

    it('shows existing refusals too - closed, unavailable item', async () => {
        expect(functionErrorMessage(await sdkFailure(400, { error: 'Restaurant is currently closed', success: false }), fallback)).toBe('Restaurant is currently closed');
        expect(functionErrorMessage(await sdkFailure(400, { error: '"Chips" is currently unavailable', success: false }), fallback)).toBe('"Chips" is currently unavailable');
    });

    it('falls back to the generic text for a network failure or an empty body', async () => {
        expect(functionErrorMessage(new TypeError('Failed to fetch'), fallback)).toBe(fallback);
        expect(functionErrorMessage(await sdkFailure(502, '<html>Bad gateway</html>'), fallback)).toBe(fallback);
        expect(functionErrorMessage(await sdkFailure(400, { error: '   ' }), fallback)).toBe(fallback);
        expect(functionErrorMessage(undefined, fallback)).toBe(fallback);
    });

    it('still understands a plain axios-shaped error', () => {
        expect(functionErrorMessage({ response: { data: { error: 'Closed' } } }, fallback)).toBe('Closed');
        expect(functionErrorMessage({ data: { error: { message: 'Nested' } } }, fallback)).toBe('Nested');
    });
});

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
