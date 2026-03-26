/**
 * Smoke: getManifest
 * Category A – Structural (no auth required)
 * Environment: safe for local, staging, AND production (pure read)
 */

import { get, test, assert, assertStatus, assertBodyHas, assertNoRawError } from '../lib/runner.js';

export async function run(env) {
    console.log('\n── getManifest ──────────────────────────────────────────');

    await test('returns valid manifest JSON with required PWA fields', 'A', async () => {
        const { status, body } = await get(env.baseUrl, '/getManifest');
        assertStatus(status, 200);
        assertBodyHas(body, 'name');
        assertBodyHas(body, 'short_name');
        assertBodyHas(body, 'start_url');
        assertBodyHas(body, 'display');
        assertBodyHas(body, 'icons');
        assert(Array.isArray(body.icons) && body.icons.length > 0, 'icons must be a non-empty array');
        assert(typeof body.name === 'string' && body.name.length > 0, 'name must be a non-empty string');
        assertNoRawError(body);
    });

    await test('returns manifest with mode=pos (no restaurantId)', 'A', async () => {
        const { status, body } = await get(env.baseUrl, '/getManifest?mode=pos');
        assertStatus(status, 200);
        assertBodyHas(body, 'name');
        assertBodyHas(body, 'display');
        assertNoRawError(body);
    });

    await test('returns manifest with mode=tablet (no restaurantId)', 'A', async () => {
        const { status, body } = await get(env.baseUrl, '/getManifest?mode=tablet');
        assertStatus(status, 200);
        assert(body.orientation === 'landscape-primary', 'tablet mode must use landscape-primary orientation');
        assertNoRawError(body);
    });

    if (env.restaurantId) {
        await test('customises manifest for a known restaurantId', 'B', async () => {
            const { status, body } = await get(env.baseUrl, `/getManifest?restaurant_id=${env.restaurantId}`);
            assertStatus(status, 200);
            assertBodyHas(body, 'name');
            assertBodyHas(body, 'start_url');
            assert(
                body.start_url.includes(env.restaurantId),
                `start_url should include restaurantId. Got: ${body.start_url}`
            );
            assertNoRawError(body);
        });

        await test('dashboard mode sets start_url to RestaurantDashboard', 'B', async () => {
            const { status, body } = await get(env.baseUrl, `/getManifest?restaurant_id=${env.restaurantId}&mode=dashboard`);
            assertStatus(status, 200);
            assert(
                body.start_url.includes('RestaurantDashboard'),
                `Expected start_url to include "RestaurantDashboard". Got: ${body.start_url}`
            );
            assertNoRawError(body);
        });
    } else {
        console.log('   ⏭  Skipped restaurant-specific manifest tests (SMOKE_TEST_RESTAURANT_ID not set)');
    }

    await test('handles unknown restaurantId gracefully (no crash)', 'A', async () => {
        const { status, body } = await get(env.baseUrl, '/getManifest?restaurant_id=nonexistent-id-000');
        // Should return a valid fallback manifest, not a 500
        assertStatus(status, 200);
        assertBodyHas(body, 'name');
        assertNoRawError(body);
    });
}