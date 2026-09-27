import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client.js';
import { isNetworkError } from '../networkStatus.js';
import { staffErrorMessage } from '../function-errors.js';

/**
 * POSPayment decides between "queue this sale offline" and "the server
 * refused it" with isNetworkError(). Get it wrong one way and a refused sale
 * is silently queued; the other way and a paid sale is LOST. These run the
 * REAL SDK client, so they see exactly what posCreateOrder's invoke throws.
 */
async function sdk(fail) {
    const client = createAxiosClient({ baseURL: 'http://test.invalid' });
    client.defaults.adapter = async (config) => {
        if (fail === 'drop') throw new AxiosError('Network Error', 'ERR_NETWORK', config, {});
        if (fail === 'timeout') throw new AxiosError('timeout of 30000ms exceeded', 'ECONNABORTED', config, {});
        const [status, body] = fail;
        const response = { data: body, status, statusText: '', headers: {}, config, request: {} };
        throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, {}, response);
    };
    try { await client.post('/apps/x/functions/posCreateOrder', {}); } catch (e) { return e; }
    throw new Error('expected the request to fail');
}

describe('POS: offline queue vs server refusal, on real SDK errors', () => {
    it('REGRESSION GUARD: a dropped connection queues the sale offline', async () => {
        expect(isNetworkError(await sdk('drop'))).toBe(true);
        expect(isNetworkError(await sdk('timeout'))).toBe(true);
    });

    it('gateway failures (502/503/504) queue offline - no real answer came back', async () => {
        for (const s of [502, 503, 504]) expect(isNetworkError(await sdk([s, '<html>']))).toBe(true);
    });

    it('REGRESSION GUARD: a server refusal is NOT queued, and staff see why', async () => {
        const err = await sdk([400, { error: 'Discount over your limit - a manager must approve' }]);
        expect(isNetworkError(err)).toBe(false);
        expect(err.message).toBe('Request failed with status code 400');          // what staff used to see
        expect(staffErrorMessage(err, 'Unknown error')).toBe('Discount over your limit - a manager must approve');
    });

    it('permission and validation refusals are not queued either', async () => {
        for (const s of [401, 403, 409, 422]) expect(isNetworkError(await sdk([s, { error: 'no' }]))).toBe(false);
    });
});
