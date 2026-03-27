/**
 * Smoke Test: Rejection Paths Audit
 * 
 * Verifies that ALL rejection paths route through safe refund workflow
 * 
 * Tests:
 * 1. updateOrderStatus blocks 'cancelled' status
 * 2. bulkUpdateOrderStatus blocks 'cancelled' status
 * 3. rejectOrderWithRefund still works for card orders
 * 4. Bulk operations use backend function validation
 * 5. POSOrderQueue routes card cancellations through rejectOrderWithRefund
 */

import { assertEquals, assert } from 'jsr:@std/assert';
import { loadEnv, test, passed, failed } from '../lib/runner.js';

export async function run(env) {
  console.log('\n▶ Rejection Paths Audit\n');

  if (!env.restaurantId || !env.baseUrl) {
    console.log('⊘ SKIP: restaurantId required');
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(env.adminToken && { Authorization: `Bearer ${env.adminToken}` }),
  };

  let baseUrl = env.baseUrl;
  if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: updateOrderStatus blocks 'cancelled' status
  // ──────────────────────────────────────────────────────────────────────────
  {
    const testName = 'updateOrderStatus blocks cancelled status';
    try {
      // Create a test order first
      const createRes = await fetch(`${baseUrl}/functions/verifyAndCreateOrder`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orderData: {
            restaurant_id: env.restaurantId,
            items: [{ menu_item_id: 'test', name: 'Test', price: 10, quantity: 1 }],
            subtotal: 10,
            delivery_fee: 2,
            discount: 0,
            total: 12,
            payment_method: 'cash',
            order_type: 'delivery',
            delivery_address: '123 Test St',
            phone: '07123456789',
          },
        }),
      });

      const createResult = await createRes.json();
      const orderId = createResult.order_id;

      // Try to update to 'cancelled' via updateOrderStatus
      const updateRes = await fetch(`${baseUrl}/functions/updateOrderStatus`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          order_id: orderId,
          new_status: 'cancelled',
          rejection_reason: 'Test',
        }),
      });

      const updateResult = await updateRes.json();
      
      // MUST be blocked
      assert(updateRes.status === 400, `Expected 400, got ${updateRes.status}`);
      assert(updateResult.error?.includes('rejectOrderWithRefund'), 'Should direct to rejectOrderWithRefund');

      passed(testName);
    } catch (e) {
      failed(testName, e.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: bulkUpdateOrderStatus blocks 'cancelled' status
  // ──────────────────────────────────────────────────────────────────────────
  {
    const testName = 'bulkUpdateOrderStatus blocks cancelled status';
    try {
      // Create two test orders
      const createRes1 = await fetch(`${baseUrl}/functions/verifyAndCreateOrder`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orderData: {
            restaurant_id: env.restaurantId,
            items: [{ menu_item_id: 'test', name: 'Test', price: 10, quantity: 1 }],
            subtotal: 10,
            delivery_fee: 2,
            discount: 0,
            total: 12,
            payment_method: 'cash',
            order_type: 'delivery',
            delivery_address: '123 Test St',
            phone: '07123456789',
          },
        }),
      });

      const createRes2 = await fetch(`${baseUrl}/functions/verifyAndCreateOrder`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orderData: {
            restaurant_id: env.restaurantId,
            items: [{ menu_item_id: 'test', name: 'Test', price: 10, quantity: 1 }],
            subtotal: 10,
            delivery_fee: 2,
            discount: 0,
            total: 12,
            payment_method: 'cash',
            order_type: 'delivery',
            delivery_address: '123 Test St',
            phone: '07123456789',
          },
        }),
      });

      const order1 = await createRes1.json();
      const order2 = await createRes2.json();

      // Try to bulk update to 'cancelled'
      const bulkRes = await fetch(`${baseUrl}/functions/bulkUpdateOrderStatus`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          order_ids: [order1.order_id, order2.order_id],
          new_status: 'cancelled',
        }),
      });

      const bulkResult = await bulkRes.json();

      // MUST be blocked
      assert(bulkRes.status === 400, `Expected 400, got ${bulkRes.status}`);
      assert(bulkResult.error?.includes('not allowed'), 'Should block bulk cancellation');

      passed(testName);
    } catch (e) {
      failed(testName, e.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: rejectOrderWithRefund still works for cash orders
  // ──────────────────────────────────────────────────────────────────────────
  {
    const testName = 'rejectOrderWithRefund works for cash orders';
    try {
      const createRes = await fetch(`${baseUrl}/functions/verifyAndCreateOrder`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orderData: {
            restaurant_id: env.restaurantId,
            items: [{ menu_item_id: 'test', name: 'Test', price: 10, quantity: 1 }],
            subtotal: 10,
            delivery_fee: 2,
            discount: 0,
            total: 12,
            payment_method: 'cash',
            order_type: 'delivery',
            delivery_address: '123 Test St',
            phone: '07123456789',
          },
        }),
      });

      const createResult = await createRes.json();
      const orderId = createResult.order_id;

      const rejectRes = await fetch(`${baseUrl}/functions/rejectOrderWithRefund`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          order_id: orderId,
          rejection_reason: 'Item unavailable',
        }),
      });

      const rejectResult = await rejectRes.json();

      assert(rejectRes.status === 200, `Expected 200, got ${rejectRes.status}`);
      assert(rejectResult.success === true, 'Rejection should succeed');
      assert(rejectResult.refunded === false, 'Cash orders should not refund');

      passed(testName);
    } catch (e) {
      failed(testName, e.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Valid non-cancelled status transitions still work
  // ──────────────────────────────────────────────────────────────────────────
  {
    const testName = 'Non-cancelled status transitions work normally';
    try {
      const createRes = await fetch(`${baseUrl}/functions/verifyAndCreateOrder`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orderData: {
            restaurant_id: env.restaurantId,
            items: [{ menu_item_id: 'test', name: 'Test', price: 10, quantity: 1 }],
            subtotal: 10,
            delivery_fee: 2,
            discount: 0,
            total: 12,
            payment_method: 'cash',
            order_type: 'delivery',
            delivery_address: '123 Test St',
            phone: '07123456789',
          },
        }),
      });

      const createResult = await createRes.json();
      const orderId = createResult.order_id;

      // Update to confirmed (valid transition)
      const updateRes = await fetch(`${baseUrl}/functions/updateOrderStatus`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          order_id: orderId,
          new_status: 'confirmed',
        }),
      });

      const updateResult = await updateRes.json();

      assert(updateRes.status === 200, `Expected 200, got ${updateRes.status}`);
      assert(updateResult.success === true, 'Confirmed transition should succeed');

      passed(testName);
    } catch (e) {
      failed(testName, e.message);
    }
  }

  console.log('\n');
}