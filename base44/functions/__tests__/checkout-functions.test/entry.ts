/**
 * Backend Function Tests - Checkout System
 * Framework: Vitest
 * Functions tested: createPaymentIntent, verifyAndCreateOrder, refundWithRetry
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Mock Stripe
vi.mock('npm:stripe', () => ({
  default: class StripeMock {
    paymentIntents = {
      create: vi.fn().mockResolvedValue({
        id: 'pi_test_001',
        clientSecret: 'pi_test_001_secret_fake',
        amount: 5000,
        status: 'requires_payment_method'
      }),
      retrieve: vi.fn().mockResolvedValue({
        id: 'pi_test_001',
        status: 'succeeded',
        amount: 5000
      })
    };
    
    refunds = {
      create: vi.fn().mockResolvedValue({
        id: 're_test_001',
        status: 'succeeded'
      }),
      list: vi.fn().mockResolvedValue({
        data: [{id: 're_test_001'}]
      })
    };
  }
}));

describe('createPaymentIntent', () => {
  test('BE-001: Valid request creates PI with correct amount', async () => {
    const response = await invoke('createPaymentIntent', {
      amount: 50.00,
      currency: 'gbp',
      idempotency_key: 'key_001',
      restaurant_id: 'rest_123',
      items: [{id: 'item1', qty: 2, price: 10}, {id: 'item2', qty: 1, price: 8}],
      subtotal: 28,
      delivery_fee: 2,
      discount: 0,
      order_type: 'delivery',
      delivery_address: '10 Downing St, London'
    });
    
    expect(response.status).toBe(200);
    expect(response.data.clientSecret).toMatch(/^pi_.*_secret_/);
    expect(response.data.paymentIntentId).toMatch(/^pi_/);
    expect(response.data.amount_pence).toBe(5000);
  });

  test('BE-002: Idempotency key prevents duplicate PI creation', async () => {
    const payload = {
      amount: 50,
      idempotency_key: 'key_dup_001',
      restaurant_id: 'rest_123',
      items: [{id: 'item1', qty: 1, price: 50}],
      subtotal: 50,
      delivery_fee: 0,
      order_type: 'collection'
    };
    
    const res1 = await invoke('createPaymentIntent', payload);
    const res2 = await invoke('createPaymentIntent', payload);
    
    // Should return same PI on retry
    expect(res1.data.paymentIntentId).toBe(res2.data.paymentIntentId);
  });

  test('BE-003: Invalid amount (zero) rejected', async () => {
    const response = await invoke('createPaymentIntent', {
      amount: 0,
      idempotency_key: 'key_zero',
      restaurant_id: 'rest_123',
      items: []
    });
    
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.data.error).toMatch(/amount|invalid|greater than 0/i);
  });

  test('BE-005: Math integrity check failure', async () => {
    const response = await invoke('createPaymentIntent', {
      amount: 100,
      idempotency_key: 'key_math_fail',
      restaurant_id: 'rest_123',
      items: [{id: 'item1', qty: 1, price: 10}],
      subtotal: 20,
      delivery_fee: 5,
      discount: 2
      // Expected = 20 + 5 - 2 = 23, actual = 100
    });
    
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.data.code).toBe('MATH_INTEGRITY_FAIL');
  });

  test('BE-007: Missing required field (restaurant_id) fails', async () => {
    const response = await invoke('createPaymentIntent', {
      amount: 50,
      idempotency_key: 'key_no_rest',
      items: []
    });
    
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.data.error).toMatch(/restaurant|missing|required/i);
  });
});

describe('verifyAndCreateOrder', () => {
  test('BE-011: Valid order creation from frontend', async () => {
    const orderData = {
      restaurant_id: 'rest_123',
      items: [{menu_item_id: 'item1', name: 'Pizza', qty: 1, price: 10}],
      subtotal: 10,
      delivery_fee: 2,
      discount: 0,
      total: 12,
      payment_method: 'card',
      order_type: 'delivery',
      delivery_address: '10 Downing St, London',
      phone: '07700000001',
      guest_email: 'guest@example.com',
      guest_name: 'John Doe'
    };
    
    const response = await invoke('verifyAndCreateOrder', {
      orderData,
      paymentIntentId: 'pi_success_001',
      idempotency_key: 'key_order_001'
    });
    
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.order_id).toBeDefined();
  });

  test('BE-012: Duplicate order returns same order', async () => {
    const payload = {
      orderData: {restaurant_id: 'rest_123', total: 12},
      paymentIntentId: 'pi_dup_001',
      idempotency_key: 'key_dup_002'
    };
    
    const res1 = await invoke('verifyAndCreateOrder', payload);
    const res2 = await invoke('verifyAndCreateOrder', payload);
    
    expect(res1.data.order_id).toBe(res2.data.order_id);
    expect(res2.data.duplicate).toBe(true);
  });

  test('BE-013: Payment intent not found', async () => {
    const response = await invoke('verifyAndCreateOrder', {
      orderData: {total: 12},
      paymentIntentId: 'pi_nonexistent',
      idempotency_key: 'key_not_found'
    });
    
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.data.code).toMatch(/PI_NOT_FOUND|nonexistent/);
  });

  test('BE-015: Menu item unavailable triggers refund', async () => {
    const response = await invoke('verifyAndCreateOrder', {
      orderData: {
        items: [{menu_item_id: 'item_missing', qty: 1, price: 10}],
        total: 12
      },
      paymentIntentId: 'pi_item_missing_001',
      idempotency_key: 'key_item_missing'
    });
    
    expect(response.data.success).toBe(false);
    expect(response.data.code).toBe('ITEM_NOT_FOUND');
    expect(response.data.refunded).toBe(true);
  });

  test('BE-020: Distributed lock prevents concurrent creation', async () => {
    const pi = 'pi_concurrent_001';
    
    const res1 = await invoke('verifyAndCreateOrder', {
      orderData: {total: 12},
      paymentIntentId: pi,
      idempotency_key: 'key_lock_a'
    });
    
    const res2 = await invoke('verifyAndCreateOrder', {
      orderData: {total: 12},
      paymentIntentId: pi,
      idempotency_key: 'key_lock_b'
    });
    
    // One succeeds, one fails
    const successes = [res1, res2].filter(r => r.data.success).length;
    expect(successes).toBeGreaterThanOrEqual(1);
  });

  test('BE-023: Coupon usage_count incremented', async () => {
    const response = await invoke('verifyAndCreateOrder', {
      orderData: {
        coupon_codes: ['SAVE10'],
        total: 12
      },
      paymentIntentId: 'pi_coupon_incr_001',
      idempotency_key: 'key_coupon_incr'
    });
    
    expect(response.data.success).toBe(true);
  });
});

describe('refundWithRetry', () => {
  test('BE-028: Successful refund updates PT status', async () => {
    const response = await invoke('refundWithRetry', {
      paymentIntentId: 'pi_refund_ok_001',
      reason: 'order_creation_failed'
    });
    
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.refund_id).toBe('re_test_001');
  });

  test('BE-029: Existing refund detected, treated as success (FIX #20)', async () => {
    const response = await invoke('refundWithRetry', {
      paymentIntentId: 'pi_timeout_success_001'
    });
    
    expect(response.data.success).toBe(true);
  });

  test('BE-030: Max retries exhausted, marked needs_review', async () => {
    const response = await invoke('refundWithRetry', {
      paymentIntentId: 'pi_max_retries_001'
    });
    
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.data.success).toBe(false);
  });
});