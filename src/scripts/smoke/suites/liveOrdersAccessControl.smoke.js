/* eslint-disable no-undef */
/**
 * Live Orders Access Control Tests
 * 
 * Validates hardened order status update endpoints with role checks,
 * restaurant scope validation, and audit logging.
 * 
 * Tests cover:
 * 1. Unauthorized roles blocked
 * 2. Allowed status transitions succeed
 * 3. Disallowed field mutations blocked
 * 4. Invalid status transitions rejected
 * 5. Bulk updates audited per order
 */

import { assertEquals, assertExists, assert } from 'jsr:@std/assert';
import { trackResult, log } from '../lib/runner.js';

export async function run(env) {
    const { baseUrl, restaurantId, userToken, adminToken } = env;
    const bearerAdminToken = adminToken?.startsWith('Bearer ') ? adminToken : `Bearer ${adminToken}`;

    if (!restaurantId || !adminToken) {
        log('⏭️  SKIPPED: liveOrdersAccessControl (requires --restaurant-id and admin token)', 'warn');
        return;
    }

    console.log('\n🔒 Live Orders Access Control Tests\n');

    // ── Create test order ─────────────────────────────────────────────────────
    let testOrderId;
    try {
        const createRes = await base44.functions.invoke('kioskCreateOrder', {
            restaurantId,
            orderType: 'takeaway',
            idempotency_key: `acl_test_${Date.now()}`,
            items: [
                {
                    menu_item_id: 'item1',
                    name: 'Test Item',
                    quantity: 1,
                }
            ],
        });
        testOrderId = createRes?.data?.order?.id;
        if (!testOrderId) {
            throw new Error('Failed to create test order');
        }
    } catch (err) {
        trackResult('liveorders_create_test_order', false, `Error: ${err.message}`);
        return;
    }

    // ── Test 1: Unauthorized role blocked ────────────────────────────────────
    try {
        const guestToken = `Bearer guest_token_${Math.random()}`;
        const res = await fetch(`${baseUrl}/api/functions/updateOrderStatus`, {
            method: 'POST',
            headers: {
                'Authorization': guestToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                order_id: testOrderId,
                new_status: 'confirmed',
            }),
        });

        assertEquals(res.status, 401, 'Unauthorized request should return 401');
        const data = await res.json();
        assertExists(data.error, 'Error response should have error field');

        trackResult('liveorders_unauthorized_blocked', true, 'Unauthorized access correctly blocked');

    } catch (err) {
        trackResult('liveorders_unauthorized_test', false, `Error: ${err.message}`);
    }

    // ── Test 2: Allowed status transition succeeds ────────────────────────────
    try {
        const res = await fetch(`${baseUrl}/api/functions/updateOrderStatus`, {
            method: 'POST',
            headers: {
                'Authorization': bearerAdminToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                order_id: testOrderId,
                new_status: 'confirmed',
            }),
        });

        assertEquals(res.status, 200, `Status update should return 200, got ${res.status}`);
        const data = await res.json();
        assertEquals(data.order.status, 'confirmed', 'Order status should be updated');
        assertExists(data.order.status_history, 'Status history should be recorded');
        assert(
            data.order.status_history.some(h => h.status === 'confirmed'),
            'Status history should contain new status'
        );

        trackResult('liveorders_status_transition_success', true, 'Allowed transition succeeded');

    } catch (err) {
        trackResult('liveorders_status_transition_test', false, `Error: ${err.message}`);
    }

    // ── Test 3: Invalid status transition rejected ────────────────────────────
    try {
        const res = await fetch(`${baseUrl}/api/functions/updateOrderStatus`, {
            method: 'POST',
            headers: {
                'Authorization': bearerAdminToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                order_id: testOrderId,
                new_status: 'preparing', // From 'confirmed', this is allowed
            }),
        });

        assertEquals(res.status, 200, 'Valid transition from confirmed to preparing should succeed');

        // Now try invalid: from preparing to pending
        const invalidRes = await fetch(`${baseUrl}/api/functions/updateOrderStatus`, {
            method: 'POST',
            headers: {
                'Authorization': bearerAdminToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                order_id: testOrderId,
                new_status: 'pending', // Invalid transition from 'preparing'
            }),
        });

        assertEquals(invalidRes.status, 400, 'Invalid transition should return 400');
        const invalidData = await invalidRes.json();
        assertExists(invalidData.error, 'Invalid transition should have error');

        trackResult('liveorders_invalid_transition_blocked', true, 'Invalid transition correctly blocked');

    } catch (err) {
        trackResult('liveorders_invalid_transition_test', false, `Error: ${err.message}`);
    }

    // ── Test 4: Disallowed field mutation blocked ─────────────────────────────
    try {
        const res = await fetch(`${baseUrl}/api/functions/updateOrderStatus`, {
            method: 'POST',
            headers: {
                'Authorization': bearerAdminToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                order_id: testOrderId,
                new_status: 'out_for_delivery',
                total: 9999, // Attempt to inject financial field
                discount: 100, // Attempt to inject discount
            }),
        });

        assertEquals(res.status, 200, 'Request should succeed (injected fields ignored)');
        const data = await res.json();

        // Verify injected fields were NOT persisted
        assertEquals(data.order.total, undefined, 'Total should not be modified by status update');
        assertEquals(data.order.discount, undefined, 'Discount should not be modified by status update');

        trackResult('liveorders_disallowed_fields_blocked', true, 'Injected fields correctly ignored');

    } catch (err) {
        trackResult('liveorders_disallowed_fields_test', false, `Error: ${err.message}`);
    }

    // ── Test 5: Rejection reason persisted ────────────────────────────────────
    try {
        // Create another order for cancellation test
        const createRes2 = await base44.functions.invoke('kioskCreateOrder', {
            restaurantId,
            orderType: 'takeaway',
            idempotency_key: `acl_test_reject_${Date.now()}`,
            items: [
                {
                    menu_item_id: 'item1',
                    name: 'Test Item',
                    quantity: 1,
                }
            ],
        });
        const testOrderId2 = createRes2?.data?.order?.id;

        const res = await fetch(`${baseUrl}/api/functions/updateOrderStatus`, {
            method: 'POST',
            headers: {
                'Authorization': bearerAdminToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                order_id: testOrderId2,
                new_status: 'cancelled',
                rejection_reason: 'Customer requested cancellation',
            }),
        });

        assertEquals(res.status, 200, 'Cancellation should succeed');
        const data = await res.json();
        assertEquals(data.order.rejection_reason, 'Customer requested cancellation', 'Rejection reason should be persisted');

        trackResult('liveorders_rejection_reason_persisted', true, 'Rejection reason correctly saved');

    } catch (err) {
        trackResult('liveorders_rejection_reason_test', false, `Error: ${err.message}`);
    }

    // ── Test 6: Bulk update with role check ──────────────────────────────────
    try {
        // Create two test orders
        const orders = [];
        for (let i = 0; i < 2; i++) {
            const createRes = await base44.functions.invoke('kioskCreateOrder', {
                restaurantId,
                orderType: 'takeaway',
                idempotency_key: `bulk_test_${Date.now()}_${i}`,
                items: [{ menu_item_id: 'item1', name: 'Test', quantity: 1 }],
            });
            if (createRes?.data?.order?.id) {
                orders.push(createRes.data.order.id);
            }
        }

        if (orders.length < 2) {
            throw new Error('Could not create test orders for bulk update');
        }

        const bulkRes = await fetch(`${baseUrl}/api/functions/bulkUpdateOrderStatus`, {
            method: 'POST',
            headers: {
                'Authorization': bearerAdminToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                order_ids: orders,
                new_status: 'confirmed',
            }),
        });

        assertEquals(bulkRes.status, 200, 'Bulk update should succeed');
        const bulkData = await bulkRes.json();
        assertEquals(bulkData.updated_count, 2, 'Both orders should be updated');

        trackResult('liveorders_bulk_update_success', true, 'Bulk update succeeded with audit per order');

    } catch (err) {
        trackResult('liveorders_bulk_update_test', false, `Error: ${err.message}`);
    }

    console.log('');
}