/**
 * Smoke: verifyAndCreateOrder
 * Category A/B/C/D
 * Environment: STAGING ONLY — some tests create real Order records
 * Destructive: YES for happy-path test (creates an Order with payment_method=cash)
 *
 * Safe fixture strategy:
 *   - Uses SMOKE_TEST_RESTAURANT_ID (a dedicated non-customer-facing restaurant)
 *   - Uses SMOKE_TEST_MENU_ITEM_ID
 *   - All created orders have notes: "[SMOKE_TEST] safe to delete"
 *   - payment_method: "cash" (no Stripe call triggered)
 *   - order_type: "collection" (no delivery zone check)
 */

import { call, test, assertStatus, assertBodyHas, assertNoRawError } from '../lib/runner.js';

// Minimal fixture order that should pass all validations
function buildFixtureOrder({ restaurantId, menuItemId, couponCode = null, idempotencyKey = null }) {
    const order = {
        restaurant_id: restaurantId,
        items: [
            {
                menu_item_id: menuItemId,
                name: '[SMOKE] Test Burger',
                price: 10.00,
                quantity: 1,
            }
        ],
        subtotal: 10.00,
        delivery_fee: 0,
        discount: 0,
        total: 10.00,
        payment_method: 'cash',
        order_type: 'collection',
        notes: '[SMOKE_TEST] safe to delete',
        phone: '07700000000',
        guest_name: 'Smoke Test',
    };
    if (couponCode) {
        order.coupon_codes = couponCode;
    }
    if (idempotencyKey) {
        order.idempotency_key = idempotencyKey;
    }
    return order;
}

export async function run(env) {
    console.log('\n── verifyAndCreateOrder ──────────────────────────────────');

    const hasFixtures = env.restaurantId && env.menuItemId;

    // ── A: Invalid/missing data rejected ─────────────────────────────────────
    await test('empty payload returns 400', 'A', async () => {
        const { status, body } = await call(env.baseUrl, 'verifyAndCreateOrder', {});
        assertStatus(status, 400);
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    await test('missing restaurant_id returns 400', 'A', async () => {
        const { status, body } = await call(env.baseUrl, 'verifyAndCreateOrder', {
            orderData: { items: [{ name: 'Test', price: 10, quantity: 1 }], total: 10 },
        });
        assertStatus(status, 400);
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    await test('coupon stacking (two codes) rejected with 400', 'A', async () => {
        if (!hasFixtures) {
            console.log('       (no fixtures — using stub restaurant ID)');
        }
        const orderData = buildFixtureOrder({
            restaurantId: env.restaurantId || 'smoke-stub-restaurant',
            menuItemId: env.menuItemId || 'smoke-stub-item',
        });
        orderData.coupon_codes = 'CODE1,CODE2'; // stacking attempt
        orderData.total = 8.00; // artificially reduced as if two coupons applied

        const { status, body } = await call(env.baseUrl, 'verifyAndCreateOrder', { orderData });
        assertStatus(status, 400);
        assertBodyHas(body, 'error');
        if (!body.error.toLowerCase().includes('coupon') && !body.error.toLowerCase().includes('one')) {
            throw new Error(`Expected coupon stacking error, got: "${body.error}"`);
        }
        assertNoRawError(body);
    });

    await test('card payment with no paymentIntentId returns 400', 'A', async () => {
        const orderData = buildFixtureOrder({
            restaurantId: env.restaurantId || 'smoke-stub-restaurant',
            menuItemId: env.menuItemId || 'smoke-stub-item',
        });
        orderData.payment_method = 'card';
        // paymentIntentId deliberately omitted

        const { status, body } = await call(env.baseUrl, 'verifyAndCreateOrder', { orderData });
        assertStatus(status, 400);
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    await test('card payment with invalid paymentIntentId format returns 400', 'A', async () => {
        const orderData = buildFixtureOrder({
            restaurantId: env.restaurantId || 'smoke-stub-restaurant',
            menuItemId: env.menuItemId || 'smoke-stub-item',
        });
        orderData.payment_method = 'card';

        const { status, body } = await call(env.baseUrl, 'verifyAndCreateOrder', {
            orderData,
            paymentIntentId: 'not-a-real-stripe-id',
        });
        assertStatus(status, 400);
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    // ── C: Happy path (staging only, requires fixtures) ───────────────────────
    if (hasFixtures) {
        const idemKey = `smoke-test-${Date.now()}`;

        await test('valid cash collection order created successfully', 'C', async () => {
            const orderData = buildFixtureOrder({
                restaurantId: env.restaurantId,
                menuItemId: env.menuItemId,
                idempotencyKey: idemKey,
            });

            const { status, body } = await call(env.baseUrl, 'verifyAndCreateOrder', {
                orderData,
                idempotency_key: idemKey,
            });

            if (status === 400 && body.error?.includes('closed')) {
                // Restaurant may be set as closed — skip rather than fail
                console.log(`       ⏭  Skipped: restaurant is_open=false or outside hours`);
                return;
            }
            if (status === 400 && body.error?.includes('no longer available')) {
                console.log(`       ⏭  Skipped: test menu item is_available=false`);
                return;
            }

            assertStatus(status, 201);
            assertBodyHas(body, 'success');
            assertBodyHas(body, 'order_id');
            if (!body.success) throw new Error(`Order creation returned success=false: ${body.error}`);
            assertNoRawError(body);

            // Stash order_id for idempotency test
            run._lastCreatedOrderId = body.order_id;
        });

        await test('duplicate submit with same idempotency_key returns existing order', 'C', async () => {
            const orderData = buildFixtureOrder({
                restaurantId: env.restaurantId,
                menuItemId: env.menuItemId,
                idempotencyKey: idemKey,
            });

            const { status, body } = await call(env.baseUrl, 'verifyAndCreateOrder', {
                orderData,
                idempotency_key: idemKey,
            });

            // Should be 200 (already exists) or 201 (re-created if first test skipped)
            const allowed = [200, 201];
            if (!allowed.includes(status)) {
                // Accept 400 only if it's because the restaurant is closed
                if (status === 400 && (body.error?.includes('closed') || body.error?.includes('no longer available'))) {
                    console.log(`       ⏭  Skipped: restaurant/item unavailable`);
                    return;
                }
                throw new Error(`Expected 200 or 201 for idempotent submit, got ${status}: ${JSON.stringify(body)}`);
            }

            assertBodyHas(body, 'order_id');
            assertNoRawError(body);

            if (status === 200) {
                if (!body.duplicate) {
                    throw new Error('Expected duplicate=true for idempotent re-submit');
                }
            }
        });
    } else {
        console.log('   ⏭  Skipped happy-path and idempotency tests');
        console.log('       Set SMOKE_TEST_RESTAURANT_ID and SMOKE_TEST_MENU_ITEM_ID to enable them');
    }
}

run._lastCreatedOrderId = null;