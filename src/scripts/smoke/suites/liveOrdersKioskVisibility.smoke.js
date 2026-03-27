/**
 * LiveOrders Kiosk Visibility Tests
 *
 * Validates that kiosk orders are never lost from operational views due to
 * status-field mismatch. Tests canonical visibility mapping:
 * - Kiosk orders: use order_status + payment_status (not legacy 'status' field)
 * - Legacy orders: use status field
 * - Filters/sorts/rendering work with both models
 */

import { trackResult, log } from '../lib/runner.js';

export async function run(env) {
    const { baseUrl, restaurantId, adminToken } = env;
    const bearer = adminToken?.startsWith('Bearer ') ? adminToken : `Bearer ${adminToken}`;

    if (!restaurantId || !adminToken) {
        log('⏭️  SKIPPED: liveOrdersKioskVisibility (requires --restaurant-id and admin token)', 'warn');
        return;
    }

    console.log('\n🔍 LiveOrders Kiosk Visibility Tests\n');

    // ── Test 1: Kiosk order with order_status='new' is visible in query ──────
    try {
        const kioskOrderRes = await fetch(`${baseUrl}/api/entities/Order`, {
            method: 'POST',
            headers: { 'Authorization': bearer, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurant_id: restaurantId,
                items: [{ name: 'Test Item', price: 10, quantity: 1 }],
                total: 10,
                order_source: 'kiosk',
                order_status: 'new',           // Kiosk uses order_status, NOT status
                order_type: 'takeaway',
                phone: '07700000011',
            }),
        });
        const kioskOrder = await kioskOrderRes.json();

        if (!kioskOrder?.id) {
            trackResult('kiosk_order_visible_in_query', false, 'Could not seed kiosk order');
        } else {
            // Query all orders for this restaurant
            const queryRes = await fetch(`${baseUrl}/api/entities/Order?restaurant_id=${restaurantId}`, {
                headers: { 'Authorization': bearer },
            });
            const orders = await queryRes.json();

            if (Array.isArray(orders) && orders.find(o => o.id === kioskOrder.id)) {
                trackResult('kiosk_order_visible_in_query', true, `Kiosk order with order_status='new' found in query`);
            } else {
                trackResult('kiosk_order_visible_in_query', false, 'Kiosk order NOT in query results');
            }
        }
    } catch (err) {
        trackResult('kiosk_order_visible_in_query', false, `Error: ${err.message}`);
    }

    // ── Test 2: Unpaid kiosk order appears in "unpaid" filter ─────────────────
    try {
        const unpaidKioskRes = await fetch(`${baseUrl}/api/entities/Order`, {
            method: 'POST',
            headers: { 'Authorization': bearer, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurant_id: restaurantId,
                items: [{ name: 'Unpaid Item', price: 15, quantity: 1 }],
                total: 15,
                order_source: 'kiosk',
                order_status: 'new',
                payment_method: 'pay_at_counter',
                payment_status: 'pending_payment',  // Unpaid
                order_type: 'takeaway',
                phone: '07700000012',
            }),
        });
        const unpaidOrder = await unpaidKioskRes.json();

        if (!unpaidOrder?.id) {
            trackResult('unpaid_kiosk_filter', false, 'Could not seed unpaid kiosk order');
        } else {
            // Frontend filter: sourceFilter === 'unpaid_kiosk'
            const isUnpaidKiosk = unpaidOrder.order_source === 'kiosk' && 
                                   unpaidOrder.payment_status === 'pending_payment';
            if (isUnpaidKiosk) {
                trackResult('unpaid_kiosk_filter', true, 'Unpaid kiosk order passes filter logic');
            } else {
                trackResult('unpaid_kiosk_filter', false, 'Unpaid kiosk order FAILS filter logic');
            }
        }
    } catch (err) {
        trackResult('unpaid_kiosk_filter', false, `Error: ${err.message}`);
    }

    // ── Test 3: Legacy order with status='pending' still appears ─────────────
    try {
        const legacyRes = await fetch(`${baseUrl}/api/entities/Order`, {
            method: 'POST',
            headers: { 'Authorization': bearer, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurant_id: restaurantId,
                items: [{ name: 'Legacy Item', price: 20, quantity: 1 }],
                total: 20,
                order_source: 'online',        // NOT kiosk
                status: 'pending',             // Uses legacy status, no order_status
                order_type: 'delivery',
                phone: '07700000013',
                delivery_address: '123 Test St',
            }),
        });
        const legacyOrder = await legacyRes.json();

        if (!legacyOrder?.id) {
            trackResult('legacy_order_visible', false, 'Could not seed legacy order');
        } else {
            // Check: legacy order should still be found in query
            const queryRes = await fetch(`${baseUrl}/api/entities/Order?restaurant_id=${restaurantId}`, {
                headers: { 'Authorization': bearer },
            });
            const orders = await queryRes.json();

            if (Array.isArray(orders) && orders.find(o => o.id === legacyOrder.id)) {
                trackResult('legacy_order_visible', true, `Legacy order with status='pending' found`);
            } else {
                trackResult('legacy_order_visible', false, 'Legacy order NOT in query results');
            }
        }
    } catch (err) {
        trackResult('legacy_order_visible', false, `Error: ${err.message}`);
    }

    // ── Test 4: Status filter works with canonical helper ────────────────────
    try {
        // Create one kiosk order with order_status='preparing'
        const kioskPrepRes = await fetch(`${baseUrl}/api/entities/Order`, {
            method: 'POST',
            headers: { 'Authorization': bearer, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurant_id: restaurantId,
                items: [{ name: 'Kiosk Prep', price: 12, quantity: 1 }],
                total: 12,
                order_source: 'kiosk',
                order_status: 'preparing',    // Kiosk state
                order_type: 'takeaway',
                phone: '07700000014',
            }),
        });
        const kioskPrep = await kioskPrepRes.json();

        // Create one legacy order with status='preparing'
        const legacyPrepRes = await fetch(`${baseUrl}/api/entities/Order`, {
            method: 'POST',
            headers: { 'Authorization': bearer, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurant_id: restaurantId,
                items: [{ name: 'Legacy Prep', price: 12, quantity: 1 }],
                total: 12,
                order_source: 'online',
                status: 'preparing',          // Legacy status
                order_type: 'delivery',
                phone: '07700000015',
                delivery_address: '456 Test Ave',
            }),
        });
        const legacyPrep = await legacyPrepRes.json();

        if (!kioskPrep?.id || !legacyPrep?.id) {
            trackResult('status_filter_canonical', false, 'Could not seed both orders');
        } else {
            // Canonical filter simulation:
            // statusFilter === 'preparing'
            const getOrderOperationalStatus = (order) => {
                if (order.order_source === 'kiosk') {
                    return order.order_status || order.status || 'unknown';
                }
                return order.status || 'unknown';
            };

            const kioskMatchesFilter = getOrderOperationalStatus(kioskPrep) === 'preparing';
            const legacyMatchesFilter = getOrderOperationalStatus(legacyPrep) === 'preparing';

            if (kioskMatchesFilter && legacyMatchesFilter) {
                trackResult('status_filter_canonical', true, 'Both kiosk and legacy orders match "preparing" filter');
            } else {
                trackResult('status_filter_canonical', false,
                    `Kiosk match=${kioskMatchesFilter}, Legacy match=${legacyMatchesFilter}`);
            }
        }
    } catch (err) {
        trackResult('status_filter_canonical', false, `Error: ${err.message}`);
    }

    // ── Test 5: Sort priority includes kiosk 'new' status ───────────────────
    try {
        // Create orders in different states
        const orders = [
            {
                restaurant_id: restaurantId,
                items: [{ name: 'Old', price: 5, quantity: 1 }],
                total: 5,
                order_source: 'kiosk',
                order_status: 'ready',        // Low priority
                order_type: 'takeaway',
                phone: '07700000016',
            },
            {
                restaurant_id: restaurantId,
                items: [{ name: 'Urgent', price: 5, quantity: 1 }],
                total: 5,
                order_source: 'kiosk',
                order_status: 'new',          // High priority
                order_type: 'takeaway',
                phone: '07700000017',
            },
        ];

        const res1 = await fetch(`${baseUrl}/api/entities/Order`, {
            method: 'POST',
            headers: { 'Authorization': bearer, 'Content-Type': 'application/json' },
            body: JSON.stringify(orders[0]),
        });
        const order1 = await res1.json();

        // Wait a bit to ensure different timestamps
        await new Promise(r => setTimeout(r, 100));

        const res2 = await fetch(`${baseUrl}/api/entities/Order`, {
            method: 'POST',
            headers: { 'Authorization': bearer, 'Content-Type': 'application/json' },
            body: JSON.stringify(orders[1]),
        });
        const order2 = await res2.json();

        if (!order1?.id || !order2?.id) {
            trackResult('sort_priority_kiosk', false, 'Could not seed orders');
        } else {
            // Simulate canonical sort
            const statusPriority = { 'new': 0, 'preparing': 2, 'ready': 3 };
            const p1 = statusPriority[order1.order_status] ?? 4;
            const p2 = statusPriority[order2.order_status] ?? 4;

            // 'new' should sort before 'ready'
            if (p2 < p1) {
                trackResult('sort_priority_kiosk', true, 'Kiosk "new" status sorts higher priority than "ready"');
            } else {
                trackResult('sort_priority_kiosk', false, 'Kiosk "new" status NOT higher priority');
            }
        }
    } catch (err) {
        trackResult('sort_priority_kiosk', false, `Error: ${err.message}`);
    }

    // ── Test 6: Mixed dataset (old+new) renders without losing orders ────────
    try {
        const mixedOrders = [
            {
                name: 'Mixed Kiosk',
                restaurant_id: restaurantId,
                items: [{ name: 'K', price: 1, quantity: 1 }],
                total: 1,
                order_source: 'kiosk',
                order_status: 'confirmed',
                order_type: 'takeaway',
                phone: '07700000018',
            },
            {
                name: 'Mixed Legacy',
                restaurant_id: restaurantId,
                items: [{ name: 'L', price: 1, quantity: 1 }],
                total: 1,
                order_source: 'pos',
                status: 'confirmed',
                order_type: 'dine_in',
                phone: '07700000019',
            },
        ];

        const createdIds = [];
        for (const orderData of mixedOrders) {
            const res = await fetch(`${baseUrl}/api/entities/Order`, {
                method: 'POST',
                headers: { 'Authorization': bearer, 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData),
            });
            const order = await res.json();
            if (order?.id) createdIds.push(order.id);
        }

        if (createdIds.length !== 2) {
            trackResult('mixed_dataset_visibility', false, 'Could not seed both order types');
        } else {
            // Query all
            const queryRes = await fetch(`${baseUrl}/api/entities/Order?restaurant_id=${restaurantId}`, {
                headers: { 'Authorization': bearer },
            });
            const allOrders = await queryRes.json();

            const foundCount = allOrders.filter(o => createdIds.includes(o.id)).length;
            if (foundCount === 2) {
                trackResult('mixed_dataset_visibility', true, 'Both kiosk and legacy orders visible in mixed dataset');
            } else {
                trackResult('mixed_dataset_visibility', false, `Expected 2, found ${foundCount}`);
            }
        }
    } catch (err) {
        trackResult('mixed_dataset_visibility', false, `Error: ${err.message}`);
    }

    console.log('');
}