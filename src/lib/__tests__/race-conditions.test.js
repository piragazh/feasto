/**
 * Race Condition Tests
 * Concurrency, idempotency, and atomicity verification
 */

import { describe, test, expect, beforeEach } from 'vitest';

describe('Race Condition: Concurrent Order Creation', () => {
  test('RC-001: Frontend + Webhook race prevents duplicate order', async () => {
    const pi = 'pi_race_concurrent_001';
    
    const frontendReq = invoke('verifyAndCreateOrder', {
      orderData: {restaurant_id: 'rest_123', total: 50},
      paymentIntentId: pi,
      idempotency_key: 'key_frontend'
    });
    
    const webhookReq = invoke('createIdempotentOrder', {
      paymentIntentId: pi,
      paymentIntentMetadata: {restaurant_id: 'rest_123', total: '50'}
    });
    
    const [frontRes, webhookRes] = await Promise.allSettled([frontendReq, webhookReq]);
    
    // Exactly one succeeds
    const successes = [frontRes.value, webhookRes.value].filter(r => r?.data?.success);
    expect(successes).toHaveLength(1);
  });

  test('RC-002: Coupon usage limit race (2 users, limit=1)', async () => {
    const email = 'race@example.com';
    const coupon = 'RACE_COUPON_001';
    
    const order1 = invoke('verifyAndCreateOrder', {
      orderData: {
        guest_email: email,
        coupon_codes: [coupon],
        total: 50
      },
      paymentIntentId: 'pi_coupon_race_1',
      idempotency_key: 'key_coupon_1'
    });
    
    const order2 = invoke('verifyAndCreateOrder', {
      orderData: {
        guest_email: email,
        coupon_codes: [coupon],
        total: 50
      },
      paymentIntentId: 'pi_coupon_race_2',
      idempotency_key: 'key_coupon_2'
    });
    
    const [r1, r2] = await Promise.allSettled([order1, order2]);
    
    // One succeeds, one fails with limit exceeded
    const succeeded = [r1.value, r2.value].filter(r => r?.data?.success);
    const failed = [r1.value, r2.value].filter(r => !r?.data?.success && r?.data?.code === 'COUPON_LIMIT_EXCEEDED');
    
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
  });
});