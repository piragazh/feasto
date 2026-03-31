/* eslint-disable no-undef */
/**
 * Smoke tests — kioskCreateOrder backend function
 *
 * Tests:
 *  1. Normal pay-at-counter order accepted (happy path)
 *  2. Manipulated cart price rejected (client price discarded, server recomputes)
 *  3. Unavailable item rejected
 *  4. pos_only item rejected
 *  5. Missing restaurantId rejected
 *  6. Empty cart rejected
 *  7. Unknown menu_item_id rejected
 *  8. Invalid quantity rejected
 *  9. Closed restaurant rejected
 * 10. Counter payment disabled rejected
 * 11. Idempotency key deduplicates correctly
 * 12. Correct kiosk fields written on order (order_source, payment_status, order_status)
 */

const BASE_URL = process.env.FUNCTION_BASE_URL || 'http://localhost:8000';
const FUNCTION = 'kioskCreateOrder';

// Shared test helpers
function pass(name) { console.log(`  ✅ PASS: ${name}`); }
function fail(name, detail) { console.error(`  ❌ FAIL: ${name} — ${detail}`); process.exitCode = 1; }

async function invoke(payload) {
    const res = await fetch(`${BASE_URL}/${FUNCTION}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { status: res.status, data };
}

// ─── Test data constants (replace with real IDs from your test DB) ────────────
// These are placeholders — replace with valid IDs in CI or against a live env.
const VALID_RESTAURANT_ID   = process.env.TEST_RESTAURANT_ID   || '__TEST_RESTAURANT_ID__';
const VALID_MENU_ITEM_ID    = process.env.TEST_MENU_ITEM_ID    || '__TEST_MENU_ITEM_ID__';
const UNAVAILABLE_ITEM_ID   = process.env.TEST_UNAVAIL_ITEM_ID || '__TEST_UNAVAIL_ITEM_ID__';
const POS_ONLY_ITEM_ID      = process.env.TEST_POS_ONLY_ITEM_ID|| '__TEST_POS_ONLY_ITEM_ID__';
const CLOSED_RESTAURANT_ID  = process.env.TEST_CLOSED_REST_ID  || '__TEST_CLOSED_REST_ID__';
const NO_COUNTER_REST_ID    = process.env.TEST_NO_COUNTER_REST  || '__TEST_NO_COUNTER_REST_ID__';

const validCart = [
    {
        menu_item_id: VALID_MENU_ITEM_ID,
        name: 'Test Burger',
        price: 999.99,  // deliberately wrong client price — server must recompute
        quantity: 1,
        customizations: {},
        itemQuantities: {},
    },
];

export async function run() {
    console.log('\n=== kioskCreateOrder smoke tests ===\n');

    // 1. Happy path — normal pay-at-counter order
    {
        const { status, data } = await invoke({
            restaurantId: VALID_RESTAURANT_ID,
            items: validCart,
            orderType: 'takeaway',
        });
        if (status === 201 && data.success && data.order?.id) {
            pass('Happy path: pay-at-counter order created');

            // 12. Verify kiosk-fixed fields are written correctly
            const o = data.order;
            const fieldsOk = (
                o.order_source === 'kiosk' &&
                o.payment_method === 'pay_at_counter' &&
                o.payment_status === 'pending_payment' &&
                o.order_status === 'new'
            );
            if (fieldsOk) {
                pass('Kiosk fields: order_source, payment_method, payment_status, order_status correct');
            } else {
                fail('Kiosk fields incorrect', JSON.stringify({
                    order_source: o.order_source,
                    payment_method: o.payment_method,
                    payment_status: o.payment_status,
                    order_status: o.order_status,
                }));
            }

            // Verify client price was discarded (order total should NOT be £999.99)
            if (o.total !== 999.99) {
                pass('Client price rejected: server recomputed total (not £999.99)');
            } else {
                fail('Client price accepted: server used client-supplied price (security failure)', `total=£${o.total}`);
            }

            // Verify discount is always 0 for kiosk pay-at-counter
            if (o.discount === 0) {
                pass('Discount is 0 on kiosk pay-at-counter order');
            } else {
                fail('Non-zero discount on kiosk order', `discount=${o.discount}`);
            }

        } else {
            fail('Happy path failed', JSON.stringify({ status, data }));
        }
    }

    // 2. Manipulated cart — client sends negative price
    {
        const { status, data } = await invoke({
            restaurantId: VALID_RESTAURANT_ID,
            items: [{ ...validCart[0], price: -50 }],
            orderType: 'takeaway',
        });
        // Should succeed (because server ignores client price), but order total must be > 0
        if (status === 201) {
            if (data.order?.total > 0) {
                pass('Manipulated negative price: server recomputed to correct positive total');
            } else {
                fail('Manipulated negative price accepted as-is', `total=${data.order?.total}`);
            }
        } else {
            // Also acceptable — some implementations reject negative prices at input layer
            pass('Manipulated negative price rejected at input layer (acceptable)');
        }
    }

    // 3. Unavailable item
    {
        const { status, data } = await invoke({
            restaurantId: VALID_RESTAURANT_ID,
            items: [{ menu_item_id: UNAVAILABLE_ITEM_ID, name: 'Unavail', price: 5, quantity: 1, customizations: {} }],
            orderType: 'takeaway',
        });
        if (status === 400 && !data.success) {
            pass('Unavailable item rejected');
        } else if (UNAVAILABLE_ITEM_ID.startsWith('__')) {
            console.log('  ⚠️  SKIP: unavailable item test — set TEST_UNAVAIL_ITEM_ID env var');
        } else {
            fail('Unavailable item not rejected', JSON.stringify({ status, error: data.error }));
        }
    }

    // 4. POS-only item
    {
        const { status, data } = await invoke({
            restaurantId: VALID_RESTAURANT_ID,
            items: [{ menu_item_id: POS_ONLY_ITEM_ID, name: 'POS Item', price: 5, quantity: 1, customizations: {} }],
            orderType: 'takeaway',
        });
        if (status === 400 && !data.success) {
            pass('pos_only item rejected from kiosk');
        } else if (POS_ONLY_ITEM_ID.startsWith('__')) {
            console.log('  ⚠️  SKIP: pos_only item test — set TEST_POS_ONLY_ITEM_ID env var');
        } else {
            fail('pos_only item not rejected', JSON.stringify({ status, error: data.error }));
        }
    }

    // 5. Missing restaurantId
    {
        const { status, data } = await invoke({
            items: validCart,
            orderType: 'takeaway',
        });
        if (status === 400 && !data.success) {
            pass('Missing restaurantId rejected');
        } else {
            fail('Missing restaurantId not rejected', JSON.stringify({ status, data }));
        }
    }

    // 6. Empty cart
    {
        const { status, data } = await invoke({
            restaurantId: VALID_RESTAURANT_ID,
            items: [],
            orderType: 'takeaway',
        });
        if (status === 400 && !data.success) {
            pass('Empty cart rejected');
        } else {
            fail('Empty cart not rejected', JSON.stringify({ status, data }));
        }
    }

    // 7. Unknown menu_item_id
    {
        const { status, data } = await invoke({
            restaurantId: VALID_RESTAURANT_ID,
            items: [{ menu_item_id: 'nonexistent_item_xyz', name: 'Ghost', price: 5, quantity: 1, customizations: {} }],
            orderType: 'takeaway',
        });
        if (status === 400 && !data.success) {
            pass('Unknown menu_item_id rejected');
        } else {
            fail('Unknown menu_item_id not rejected', JSON.stringify({ status, data }));
        }
    }

    // 8. Invalid quantity (0)
    {
        const { status, data } = await invoke({
            restaurantId: VALID_RESTAURANT_ID,
            items: [{ ...validCart[0], quantity: 0 }],
            orderType: 'takeaway',
        });
        if (status === 400 && !data.success) {
            pass('Zero quantity rejected');
        } else {
            fail('Zero quantity not rejected', JSON.stringify({ status, data }));
        }
    }

    // 9. Closed restaurant
    {
        if (CLOSED_RESTAURANT_ID.startsWith('__')) {
            console.log('  ⚠️  SKIP: closed restaurant test — set TEST_CLOSED_REST_ID env var');
        } else {
            const { status, data } = await invoke({
                restaurantId: CLOSED_RESTAURANT_ID,
                items: validCart,
                orderType: 'takeaway',
            });
            if (status === 400 && !data.success) {
                pass('Closed restaurant rejected');
            } else {
                fail('Closed restaurant not rejected', JSON.stringify({ status, data }));
            }
        }
    }

    // 10. Counter payment disabled
    {
        if (NO_COUNTER_REST_ID.startsWith('__')) {
            console.log('  ⚠️  SKIP: counter-disabled test — set TEST_NO_COUNTER_REST env var');
        } else {
            const { status, data } = await invoke({
                restaurantId: NO_COUNTER_REST_ID,
                items: validCart,
                orderType: 'takeaway',
            });
            if (status === 400 && !data.success) {
                pass('Counter payment disabled: order rejected');
            } else {
                fail('Counter payment disabled: order not rejected', JSON.stringify({ status, data }));
            }
        }
    }

    // 11. Idempotency key deduplicates
    {
        const iKey = `smoke-test-ikey-${Date.now()}`;
        const { status: s1, data: d1 } = await invoke({
            restaurantId: VALID_RESTAURANT_ID,
            items: validCart,
            orderType: 'takeaway',
            idempotency_key: iKey,
        });
        const { status: s2, data: d2 } = await invoke({
            restaurantId: VALID_RESTAURANT_ID,
            items: validCart,
            orderType: 'takeaway',
            idempotency_key: iKey,
        });

        if (s1 === 201 && s2 === 200 && d2.duplicate === true && d1.order?.id === d2.order?.id) {
            pass('Idempotency key: duplicate request returns same order (no double-create)');
        } else if (VALID_RESTAURANT_ID.startsWith('__') || VALID_MENU_ITEM_ID.startsWith('__')) {
            console.log('  ⚠️  SKIP: idempotency test — set TEST_RESTAURANT_ID and TEST_MENU_ITEM_ID env vars');
        } else {
            fail('Idempotency key: duplicate not detected correctly', JSON.stringify({
                s1, s2, d1Order: d1.order?.id, d2Order: d2.order?.id, d2Dup: d2.duplicate,
            }));
        }
    }

    console.log('\n=== kioskCreateOrder smoke tests complete ===\n');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    run().catch(e => { console.error(e); process.exit(1); });
}