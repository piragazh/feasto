/**
 * Webhook Tests - Stripe Event Processing
 */

import { describe, test, expect, beforeEach } from 'vitest';

describe('Stripe Webhook - Deduplication', () => {
  test('WH-001: Identical webhook replayed, second ignored', async () => {
    const event = {
      id: 'evt_test_001',
      type: 'payment_intent.succeeded',
      data: {object: {id: 'pi_webhook_ddup_001', status: 'succeeded'}}
    };
    
    const res1 = await invokeWebhook(event);
    const res2 = await invokeWebhook(event);
    
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res2.data.status).toBe('duplicate_ignored');
  });

  test('WH-003: payment_intent.succeeded creates order', async () => {
    const response = await invokeWebhook({
      id: 'evt_pi_succ_001',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_webhook_succ_001',
          status: 'succeeded',
          amount: 5000,
          metadata: {
            restaurant_id: 'rest_123',
            items_json: '[{"id":"item1","qty":1,"price":50}]',
            total: '50'
          }
        }
      }
    });
    
    expect(response.status).toBe(200);
    expect(response.data.status).toMatch(/created|reconciled/);
  });

  test('WH-004: Invalid signature rejected', async () => {
    const response = await invokeWebhook(
      {id: 'evt_invalid_sig'},
      {'stripe-signature': 'invalid'}
    );
    
    expect(response.status).toBe(401);
  });
});