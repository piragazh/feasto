/**
 * Smoke: validateCouponUsage
 * Category B/D – Authenticated read + auth rejection
 * Environment: staging (reads Coupon entity)
 * Destructive: NO — read-only
 */

import { call, test, assertStatus, assertBodyHas, assertNoRawError } from '../lib/runner.js';

export async function run(env) {
    console.log('\n── validateCouponUsage ───────────────────────────────────');

    // ── D: Auth required ─────────────────────────────────────────────────────
    await test('unauthenticated request returns 401', 'D', async () => {
        const { status, body } = await call(env.baseUrl, 'validateCouponUsage', {
            couponId: env.couponId || 'any-id',
        });
        assertStatus(status, 401);
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    await test('missing couponId returns 400', 'A', async () => {
        const { status, body } = await call(env.baseUrl, 'validateCouponUsage', {}, env.userToken || env.adminToken || undefined);
        // Will be 401 if no token, or 400 if token present but no couponId
        const allowed = [400, 401];
        if (!allowed.includes(status)) {
            throw new Error(`Expected 400 or 401, got ${status}`);
        }
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    await test('non-string couponId is rejected safely', 'A', async () => {
        // Injects a non-string (object) as couponId — should not crash
        const { status, body } = await call(env.baseUrl, 'validateCouponUsage', {
            couponId: { $gt: '' },
        }, env.userToken || env.adminToken || undefined);
        const allowed = [400, 401, 404];
        if (!allowed.includes(status)) {
            throw new Error(`Expected 400/401/404 for object couponId, got ${status}`);
        }
        assertNoRawError(body);
    });

    await test('unknown couponId returns 404 without leaking internals', 'A', async () => {
        if (!env.userToken && !env.adminToken) {
            console.log('       (no token available — request will return 401 which is acceptable)');
        }
        const { status, body } = await call(env.baseUrl, 'validateCouponUsage', {
            couponId: 'nonexistent-id-00000000',
        }, env.userToken || env.adminToken || undefined);
        const allowed = [401, 404];
        if (!allowed.includes(status)) {
            throw new Error(`Expected 401 or 404 for unknown couponId, got ${status}. Body: ${JSON.stringify(body)}`);
        }
        assertNoRawError(body);
    });

    // ── B: Valid coupon path ──────────────────────────────────────────────────
    if (env.userToken && env.couponId) {
        await test('valid active coupon is accepted', 'B', async () => {
            const { status, body } = await call(env.baseUrl, 'validateCouponUsage', {
                couponId: env.couponId,
            }, env.userToken);
            assertStatus(status, 200);
            assertBodyHas(body, 'valid');
            if (!body.valid) {
                throw new Error(`Coupon reported invalid unexpectedly: ${body.error}`);
            }
            assertBodyHas(body, 'coupon');
            assertBodyHas(body.coupon, 'code');
            assertBodyHas(body.coupon, 'discount_type');
            assertNoRawError(body);
        });
    } else {
        console.log('   ⏭  Skipped valid-coupon tests (SMOKE_USER_TOKEN or SMOKE_TEST_COUPON_ID not set)');
    }
}