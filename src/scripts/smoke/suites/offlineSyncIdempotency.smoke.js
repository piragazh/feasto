/**
 * Offline POS Sync Idempotency Tests
 * 
 * Validates that offline_id-based UUID deduplication prevents double-sync duplicates.
 * Tests cover:
 * 1. First sync accepted
 * 2. Duplicate detected and safely returns existing order
 * 3. Retry after failure creates no duplicate
 * 4. offline_id persists correctly in Order record
 */

import { assertEquals, assertExists } from 'jsr:@std/assert';
import { trackResult, log } from '../lib/runner.js';

export async function run(env) {
    const { baseUrl, restaurantId, userToken, adminToken } = env;
    const bearerAdminToken = adminToken?.startsWith('Bearer ') ? adminToken : `Bearer ${adminToken}`;

    if (!restaurantId || !adminToken) {
        log('⏭️  SKIPPED: offlineSyncIdempotency (requires --restaurant-id and admin token)', 'warn');
        return;
    }

    console.log('\n📦 Offline Sync Idempotency Tests\n');

    // ── Test 1: First sync accepted ───────────────────────────────────────────
    try {
        const offlineId = `offline_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const offlineOrderData = {
            offline_id: offlineId,
            restaurant_id: restaurantId,
            guest_name: 'Test Customer 1',
            guest_email: 'test1@example.com',
            phone: '07900000001',
            order_type: 'takeaway',
            items: [
                {
                    menu_item_id: 'item1',
                    name: 'Test Item',
                    price: 10.00,
                    quantity: 1,
                    customizations: {},
                }
            ],
            subtotal: 10.00,
            discount: 0,
            total: 10.00,
            created_at: new Date().toISOString(),
        };

        const syncRes = await fetch(`${baseUrl}/api/functions/syncOfflineOrder`, {
            method: 'POST',
            headers: {
                'Authorization': bearerAdminToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(offlineOrderData),
        });

        assertEquals(syncRes.status, 200, `First sync should return 200, got ${syncRes.status}`);
        const syncData = await syncRes.json();
        assertExists(syncData.order, 'Response should include order');
        assertEquals(syncData.order.offline_id, offlineId, 'Order should have offline_id persisted');
        assertEquals(syncData.isDuplicate, undefined, 'First sync should not be marked as duplicate');
        
        const firstOrderId = syncData.order.id;
        trackResult('offline_sync_first_sync_accepted', true, `Order ${firstOrderId} synced successfully`);

        // ── Test 2: Duplicate detected and returns existing order ────────────────
        const dupRes = await fetch(`${baseUrl}/api/functions/syncOfflineOrder`, {
            method: 'POST',
            headers: {
                'Authorization': bearerAdminToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(offlineOrderData),
        });

        assertEquals(dupRes.status, 200, `Duplicate sync should return 200 (safe idempotent), got ${dupRes.status}`);
        const dupData = await dupRes.json();
        assertEquals(dupData.isDuplicate, true, 'Duplicate should be marked isDuplicate=true');
        assertEquals(dupData.duplicateOf, firstOrderId, `Duplicate should reference original order ${firstOrderId}`);
        assertEquals(dupData.order.id, firstOrderId, 'Duplicate response should return original order');
        assertEquals(dupData.success, true, 'Duplicate response should indicate success');

        trackResult('offline_sync_duplicate_safe_return', true, `Duplicate detected and returned original order ${firstOrderId}`);

        // ── Test 3: Offline order fields persisted correctly ────────────────────
        assertEquals(dupData.order.offline_created, true, 'Order should have offline_created=true');
        assertEquals(dupData.order.offline_id, offlineId, 'Order should persist offline_id');
        assertExists(dupData.order.offline_created_at, 'Order should have offline_created_at');
        assertExists(dupData.order.offline_synced_at, 'Order should have offline_synced_at');

        trackResult('offline_sync_fields_persisted', true, 'offline_id, offline_created, timestamps all persisted');

    } catch (err) {
        trackResult('offline_sync_idempotency_flow', false, `Error: ${err.message}`);
        console.error('[SMOKE] Offline sync idempotency error:', err);
    }

    // ── Test 4: Missing offline_id rejected ──────────────────────────────────
    try {
        const missingIdData = {
            // Missing offline_id — should be rejected
            restaurant_id: restaurantId,
            guest_name: 'Test Customer 2',
            phone: '07900000002',
            order_type: 'takeaway',
            items: [
                {
                    menu_item_id: 'item1',
                    name: 'Test Item',
                    price: 10.00,
                    quantity: 1,
                }
            ],
            subtotal: 10.00,
            discount: 0,
            total: 10.00,
            created_at: new Date().toISOString(),
        };

        const noIdRes = await fetch(`${baseUrl}/api/functions/syncOfflineOrder`, {
            method: 'POST',
            headers: {
                'Authorization': bearerAdminToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(missingIdData),
        });

        assertEquals(noIdRes.status, 400, `Missing offline_id should return 400, got ${noIdRes.status}`);
        const noIdData = await noIdRes.json();
        assertExists(noIdData.error, 'Error response should have error field');

        trackResult('offline_sync_missing_id_rejected', true, 'Missing offline_id correctly rejected with 400');

    } catch (err) {
        trackResult('offline_sync_missing_id_test', false, `Error: ${err.message}`);
    }

    // ── Test 5: Duplicate with modified data still returns original ───────────
    try {
        const offlineId2 = `offline_test_${Date.now() + 1000}_${Math.random().toString(36).substr(2, 9)}`;
        const originalData = {
            offline_id: offlineId2,
            restaurant_id: restaurantId,
            guest_name: 'Test Customer 3',
            phone: '07900000003',
            order_type: 'takeaway',
            items: [
                {
                    menu_item_id: 'item1',
                    name: 'Test Item',
                    price: 10.00,
                    quantity: 1,
                }
            ],
            subtotal: 10.00,
            discount: 0,
            total: 10.00,
            created_at: new Date().toISOString(),
        };

        const res1 = await fetch(`${baseUrl}/api/functions/syncOfflineOrder`, {
            method: 'POST',
            headers: {
                'Authorization': bearerAdminToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(originalData),
        });

        const data1 = await res1.json();
        const orderId = data1.order.id;

        // Now try to sync with same offline_id but different data
        const modifiedData = {
            ...originalData,
            total: 50.00, // Changed total
            guest_name: 'Different Name', // Changed name
        };

        const res2 = await fetch(`${baseUrl}/api/functions/syncOfflineOrder`, {
            method: 'POST',
            headers: {
                'Authorization': bearerAdminToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(modifiedData),
        });

        assertEquals(res2.status, 200, 'Duplicate with modified data should return 200');
        const data2 = await res2.json();
        assertEquals(data2.order.id, orderId, 'Should return original order, not create new one');
        assertEquals(data2.order.total, 10.00, 'Original order total should not be modified');
        assertEquals(data2.order.guest_name, 'Test Customer 3', 'Original order data should remain unchanged');

        trackResult('offline_sync_duplicate_modified_data_safe', true, 'Modified duplicate data safely ignored, original order unchanged');

    } catch (err) {
        trackResult('offline_sync_modified_duplicate_test', false, `Error: ${err.message}`);
    }

    console.log('');
}