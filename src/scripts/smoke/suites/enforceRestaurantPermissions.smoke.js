/**
 * Smoke: enforceRestaurantPermissions
 * Category B/D – Admin mutation gate + auth rejection
 * Environment: staging (reads RestaurantManager entity)
 * Destructive: NO — read-only
 */

import { call, test, assertStatus, assertBodyHas, assertNoRawError } from '../lib/runner.js';

export async function run(env) {
    console.log('\n── enforceRestaurantPermissions ──────────────────────────');

    // ── D: Unauthenticated blocked ────────────────────────────────────────────
    await test('unauthenticated request returns 401', 'D', async () => {
        const { status, body } = await call(env.baseUrl, 'enforceRestaurantPermissions', {
            restaurantId: env.restaurantId || 'any-id',
        });
        assertStatus(status, 401);
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    await test('missing restaurantId returns 400', 'A', async () => {
        const token = env.userToken || env.adminToken;
        if (!token) {
            console.log('       (no token available — skipped)');
            return;
        }
        const { status, body } = await call(env.baseUrl, 'enforceRestaurantPermissions', {}, token);
        assertStatus(status, 400);
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    // ── D: Unprivileged user blocked from unknown restaurant ──────────────────
    if (env.userToken) {
        await test('regular user without manager role is denied access', 'D', async () => {
            const { status, body } = await call(env.baseUrl, 'enforceRestaurantPermissions', {
                restaurantId: env.restaurantId || 'some-restaurant-id',
            }, env.userToken);
            // Either 403 (has no manager role) or 200 (happens to be a manager for this restaurant)
            // In smoke test setup the test user is NOT a manager, so expect 403
            assertStatus(status, 403);
            assertBodyHas(body, 'error');
            assertNoRawError(body);
        });
    } else {
        console.log('   ⏭  Skipped regular-user denial test (SMOKE_USER_TOKEN not set)');
    }

    // ── B: Admin access allowed ───────────────────────────────────────────────
    if (env.adminToken && env.restaurantId) {
        await test('admin user is allowed for any restaurantId', 'B', async () => {
            const { status, body } = await call(env.baseUrl, 'enforceRestaurantPermissions', {
                restaurantId: env.restaurantId,
            }, env.adminToken);
            assertStatus(status, 200);
            assertBodyHas(body, 'allowed');
            if (!body.allowed) {
                throw new Error('Admin should always be allowed but got allowed=false');
            }
            if (body.role !== 'admin') {
                throw new Error(`Expected role=admin, got "${body.role}"`);
            }
            assertNoRawError(body);
        });
    } else {
        console.log('   ⏭  Skipped admin-allowed test (SMOKE_ADMIN_TOKEN or SMOKE_TEST_RESTAURANT_ID not set)');
    }
}