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

import { paymentFailureNotice } from '../kiosk-payment.js';

/** A request whose connection drops, through the real SDK - no response at all. */
async function sdkDrop() {
    const client = createAxiosClient({ baseURL: 'http://test.invalid' });
    client.defaults.adapter = async (config) => { throw new AxiosError('Network Error', 'ERR_NETWORK', config, {}); };
    try { await client.post('/apps/x/functions/confirmKioskPayment', {}); } catch (e) { return e; }
    throw new Error('expected the request to fail');
}

describe('telling the cashier what happened when taking payment fails', () => {
    it('REGRESSION GUARD: already paid says ALREADY PAID, never "NOT recorded"', async () => {
        const err = await sdkFailure(409, { error: 'This order has already been paid.', code: 'ALREADY_HANDLED' });
        const n = paymentFailureNotice(err, 'Order K-003');
        expect(n.kind).toBe('already_paid');
        expect(n.message).toMatch(/K-003 is ALREADY PAID/);
        expect(n.message).not.toMatch(/NOT recorded/);
        expect(n.refresh).toBe(true);
    });

    it('REGRESSION GUARD: no answer never claims "NOT recorded" - it may have been', async () => {
        for (const err of [await sdkDrop(), await sdkFailure(500, { error: 'Failed to confirm payment. Please try again.' }), await sdkFailure(502, '<html>')]) {
            const n = paymentFailureNotice(err, 'Order K-003');
            expect(n.kind).toBe('unknown');
            expect(n.message).toMatch(/MAY have been recorded/);
            expect(n.message).not.toMatch(/NOT recorded/);
            expect(n.refresh).toBe(true);
        }
    });

    it('a definite refusal says NOT recorded, with the server reason', async () => {
        const n = paymentFailureNotice(await sdkFailure(409, { error: 'This order has been cancelled.' }), 'Order K-003');
        expect(n).toEqual({ kind: 'refused', refresh: true, message: 'Payment NOT recorded: This order has been cancelled.' });
        const p = paymentFailureNotice(await sdkFailure(403, { error: 'Access denied' }));
        expect(p.kind).toBe('refused');
        expect(p.message).toBe('Payment NOT recorded: Access denied');
        expect(p.refresh).toBe(false);
    });

    it('a 2xx that still carries an error is a refusal (as the lane throws it)', () => {
        const n = paymentFailureNotice(Object.assign(new Error('Nope'), { status: 400, data: { error: 'Nope' } }));
        expect(n.kind).toBe('refused');
        expect(n.message).toBe('Payment NOT recorded: Nope');
    });

    it('anything unrecognised is treated as unknown, the safe side', () => {
        expect(paymentFailureNotice(undefined).kind).toBe('unknown');
        expect(paymentFailureNotice(new TypeError('Failed to fetch')).kind).toBe('unknown');
    });
});

import { readFileSync } from 'node:fs';

describe('the payment lane uses these words', () => {
    // Comments stripped, so a comment mentioning it cannot pass.
    const lane = readFileSync(new URL('../../components/pos/POSKioskPaymentLane.jsx', import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const catchBlock = lane.slice(lane.indexOf('} catch (e) {'), lane.indexOf('} finally {'));

    it('REGRESSION GUARD: the lane words failures through paymentFailureNotice', () => {
        expect(catchBlock).toMatch(/paymentFailureNotice\(e,/);
        expect(catchBlock).not.toMatch(/NOT recorded/);   // its own blanket wording is gone
    });
    it('a refusal returned as 2xx is thrown as a refusal, not an unknown', () => {
        expect(lane).toMatch(/if \(data\?\.error\) throw Object\.assign\(new Error\(data\.error\), \{ status: 400, data \}\)/);
    });
});
