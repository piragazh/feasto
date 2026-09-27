import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client.js';
import { staffErrorMessage, functionErrorMessage } from '../function-errors.js';

/**
 * Fail a request through the REAL SDK client, so these tests see exactly what
 * functions.invoke / entity calls throw - not a shape we guessed.
 * status null = the network dropped (no response at all).
 */
async function sdkFailure(status, body) {
    const client = createAxiosClient({ baseURL: 'http://test.invalid' });
    client.defaults.adapter = async (config) => {
        if (status == null) throw new AxiosError('Network Error', 'ERR_NETWORK', config, {});
        const response = { data: body, status, statusText: '', headers: {}, config, request: {} };
        throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, {}, response);
    };
    try { await client.post('/apps/x/functions/confirmKioskPayment', {}); }
    catch (e) { return e; }
    throw new Error('expected the request to fail');
}

const FALLBACK = 'Failed to confirm payment';
const OLD_WAY = (e) => e?.response?.data?.error || e?.message || FALLBACK;   // what LiveOrders did

describe('staff screens show why an action failed', () => {
    it('REGRESSION GUARD: a function refusal shows its reason, not "status code 400"', async () => {
        const err = await sdkFailure(400, { error: 'Order already confirmed', success: false });
        expect(OLD_WAY(err)).toBe('Request failed with status code 400');   // the bug, proven on the real SDK
        expect(staffErrorMessage(err, FALLBACK)).toBe('Order already confirmed');
    });

    it('permission refusals come through (403)', async () => {
        const err = await sdkFailure(403, { error: "Role 'staff' cannot bulk update orders" });
        expect(staffErrorMessage(err, FALLBACK)).toBe("Role 'staff' cannot bulk update orders");
    });

    it('our own thrown errors still show - the role check before confirming payment', () => {
        const err = new Error("Role 'kitchen' cannot confirm payments");
        expect(staffErrorMessage(err, FALLBACK)).toBe("Role 'kitchen' cannot confirm payments");
    });

    it('a platform body message shows (entity validation, as DomainManagement relies on)', async () => {
        const err = await sdkFailure(422, { message: 'custom_domain must be a valid hostname' });
        expect(staffErrorMessage(err, FALLBACK)).toBe('custom_domain must be a valid hostname');
    });

    it('transport noise is never shown - network drop, bare 500, HTML gateway page', async () => {
        expect(staffErrorMessage(await sdkFailure(null), FALLBACK)).toBe(FALLBACK);
        expect(staffErrorMessage(await sdkFailure(500, {}), FALLBACK)).toBe(FALLBACK);
        expect(staffErrorMessage(await sdkFailure(502, '<html>Bad gateway</html>'), FALLBACK)).toBe(FALLBACK);
        expect(staffErrorMessage(new TypeError('Failed to fetch'), FALLBACK)).toBe(FALLBACK);
        expect(staffErrorMessage(await sdkFailure(400, { error: '  ' }), FALLBACK)).toBe(FALLBACK);
    });

    it('safe with nothing', () => {
        expect(staffErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
        expect(staffErrorMessage(null, FALLBACK)).toBe(FALLBACK);
        expect(staffErrorMessage({}, FALLBACK)).toBe(FALLBACK);
    });
});

describe('customer screens stay stricter than staff screens', () => {
    it('a platform or crash message never reaches a customer', async () => {
        const err = await sdkFailure(422, { message: 'custom_domain must be a valid hostname' });
        expect(functionErrorMessage(err, 'Something went wrong')).toBe('Something went wrong');
        expect(functionErrorMessage(new Error('Cannot read properties of undefined'), 'Something went wrong')).toBe('Something went wrong');
    });
    it('an explicit refusal does', async () => {
        const err = await sdkFailure(400, { error: 'Restaurant is currently closed' });
        expect(functionErrorMessage(err, 'Something went wrong')).toBe('Restaurant is currently closed');
    });
});
