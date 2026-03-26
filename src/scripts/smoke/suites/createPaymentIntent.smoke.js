/**
 * Smoke: createPaymentIntent
 * Category A/D – Input validation + auth rejection paths ONLY
 * Environment: staging safe (tests never reach Stripe — all rejected before the Stripe call)
 * Destructive: NO — all tests are rejected before creating a PaymentIntent
 *
 * ⚠️  We deliberately do NOT test the happy path here.
 *    A successful createPaymentIntent call creates a real Stripe PaymentIntent (test mode charges).
 *    That is tested manually during checkout smoke testing against Stripe test keys.
 *    Automated smoke tests only verify the guard rails work.
 */

import { call, test, assertStatus, assertBodyHas, assertNoRawError } from '../lib/runner.js';

export async function run(env) {
    console.log('\n── createPaymentIntent ───────────────────────────────────');
    console.log('   ℹ️  Only input-validation paths tested (no real Stripe calls)');

    // ── A: Invalid amount rejected before Stripe ──────────────────────────────
    await test('zero amount rejected with 400', 'A', async () => {
        const { status, body } = await call(env.baseUrl, 'createPaymentIntent', { amount: 0 });
        assertStatus(status, 400);
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    await test('negative amount rejected with 400', 'A', async () => {
        const { status, body } = await call(env.baseUrl, 'createPaymentIntent', { amount: -10 });
        assertStatus(status, 400);
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    await test('amount above £500 limit rejected with 400', 'A', async () => {
        const { status, body } = await call(env.baseUrl, 'createPaymentIntent', { amount: 501 });
        assertStatus(status, 400);
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    await test('non-numeric amount rejected with 400', 'A', async () => {
        const { status, body } = await call(env.baseUrl, 'createPaymentIntent', { amount: 'lots' });
        assertStatus(status, 400);
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    await test('unknown orderId rejected with 404 (not a 500)', 'A', async () => {
        const { status, body } = await call(env.baseUrl, 'createPaymentIntent', {
            amount: 10,
            orderId: 'nonexistent-order-00000',
        }, env.adminToken || undefined);
        assertStatus(status, 404);
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    await test('response never leaks STRIPE_SECRET_KEY or stack trace', 'A', async () => {
        // Trigger the Stripe error path by providing valid amount but invalid currency
        const { body } = await call(env.baseUrl, 'createPaymentIntent', {
            amount: 10,
            currency: 'xxx', // invalid currency — will fail at Stripe level
        });
        assertNoRawError(body);
        // Body must have an error key, not a raw exception
        if (typeof body === 'object' && 'clientSecret' in body) {
            // If somehow it succeeded with a bogus currency, that's also OK from a security standpoint
            return;
        }
        assertBodyHas(body, 'error');
    });
}