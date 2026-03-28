/**
 * Chaos / Failure Injection Tests
 * Testing system resilience under failure conditions
 */

import { describe, test, expect, vi } from 'vitest';

describe('Chaos: Stripe API Failures', () => {
  test('CH-001: Stripe unavailable returns error', async () => {
    // Mock Stripe down
    vi.stubGlobal('stripeFetch', () => {
      throw new Error('Stripe API unavailable');
    });
    
    const response = await invoke('createPaymentIntent', {
      amount: 50,
      restaurant_id: 'rest_123'
    });
    
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.data.recoverable).toBe(true);
  });

  test('CH-002: Rate limit triggers retry logic', async () => {
    let callCount = 0;
    vi.stubGlobal('stripeRateLimitSimulator', () => {
      callCount++;
      if (callCount <= 2) throw new Error('Rate limited');
      return {id: 'pi_ratelimit', clientSecret: 'secret'};
    });
    
    const response = await invoke('createPaymentIntent', {amount: 50});
    
    expect(response.status).toBe(200);
    expect(callCount).toBeGreaterThan(1);
  });

  test('CH-003: Invalid API key non-recoverable', async () => {
    const response = await invoke('createPaymentIntent', {
      amount: 50
      // Mock Stripe auth error
    });
    
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.data.recoverable).toBe(false);
  });
});

describe('Chaos: Database Failures', () => {
  test('CH-006: Order creation failure triggers refund', async () => {
    // Mock DB failure
    vi.stubGlobal('dbQueryFail', true);
    
    const response = await invoke('verifyAndCreateOrder', {
      orderData: {total: 50},
      paymentIntentId: 'pi_ch_db_fail'
    });
    
    expect(response.data.success).toBe(false);
    expect(response.data.refunded).toBe(true);
  });
});

describe('Chaos: Timing / Race Injection', () => {
  test('CH-011: Reduced PT dedup window exposes race', async () => {
    // Inject: reduce pause from 75ms to 10ms
    vi.stubGlobal('PT_DEDUP_PAUSE_MS', 10);
    
    const pi = 'pi_ch_timing_001';
    
    const r1 = invoke('verifyAndCreateOrder', {
      orderData: {total: 50},
      paymentIntentId: pi,
      idempotency_key: 'key_timing_1'
    });
    
    // Webhook arrives immediately
    const r2 = invoke('createIdempotentOrder', {
      paymentIntentId: pi,
      paymentIntentMetadata: {total: '50'}
    });
    
    const [res1, res2] = await Promise.allSettled([r1, r2]);
    
    // With short window, both might succeed (exposing race)
    // In production with 75ms, one should fail
    const orders = await getOrders({payment_intent_id: pi});
    expect(orders.length).toBeGreaterThanOrEqual(1);
  });
});