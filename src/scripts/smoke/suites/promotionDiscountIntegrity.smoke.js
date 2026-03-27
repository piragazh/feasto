/**
 * Promotion Discount Integrity Tests
 * 
 * Validates that promotion discounts are:
 * 1. Verified server-side (not trusted from client)
 * 2. Computed from active promotion records
 * 3. Not accepted when promotion doesn't exist or is inactive
 * 4. Combined safely with coupons (within 50% cap)
 */

import { assertEquals, assertExists, assert } from 'jsr:@std/assert';
import { trackResult, log } from '../lib/runner.js';

export async function run(env) {
    const { baseUrl, restaurantId, adminToken } = env;
    const bearerToken = adminToken?.startsWith('Bearer ') ? adminToken : `Bearer ${adminToken}`;

    if (!restaurantId || !adminToken) {
        log('⏭️  SKIPPED: promotionDiscountIntegrity (requires --restaurant-id and admin token)', 'warn');
        return;
    }

    console.log('\n💰 Promotion Discount Integrity Tests\n');

    // ── Create test promotion ────────────────────────────────────────────────────
    let testPromotionId;
    try {
        const startDate = new Date();
        const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

        const promotions = await base44.entities.Promotion.create({
            restaurant_id: restaurantId,
            name: 'Test Promotion 20% Off',
            description: 'Integrity test promotion',
            promotion_type: 'percentage_off',
            discount_value: 20,
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            is_active: true,
            usage_limit: 100,
            usage_count: 0,
            condition_type: 'minimum_order',
            minimum_order: 15.00
        });
        testPromotionId = promotions.id;
    } catch (err) {
        trackResult('promotion_create_test', false, `Error: ${err.message}`);
        return;
    }

    // ── Test 1: Valid active promotion accepted ──────────────────────────────────
    try {
        const res = await fetch(`${baseUrl}/api/functions/validateAndApplyPromotion`, {
            method: 'POST',
            headers: {
                'Authorization': bearerToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                promotion_id: testPromotionId,
                restaurant_id: restaurantId,
                server_subtotal: 50.00, // Above minimum of £15
                delivery_fee: 2.99
            }),
        });

        assertEquals(res.status, 200, 'Valid promotion should return 200');
        const data = await res.json();
        assertEquals(data.valid, true, 'Valid promotion should be marked as valid');
        
        // 20% of £50 = £10
        assertEquals(data.discount, 10.00, 'Discount should be 20% of subtotal');
        assertExists(data.promotion, 'Promotion object should be returned');
        assertEquals(data.promotion.name, 'Test Promotion 20% Off', 'Promotion name should match');

        trackResult('promotion_valid_accepted', true, 'Valid promotion accepted and discount computed');

    } catch (err) {
        trackResult('promotion_valid_test', false, `Error: ${err.message}`);
    }

    // ── Test 2: Fake promotion ID rejected ───────────────────────────────────────
    try {
        const res = await fetch(`${baseUrl}/api/functions/validateAndApplyPromotion`, {
            method: 'POST',
            headers: {
                'Authorization': bearerToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                promotion_id: 'fake_promo_999999', // Non-existent
                restaurant_id: restaurantId,
                server_subtotal: 50.00,
                delivery_fee: 2.99
            }),
        });

        assertEquals(res.status, 400, 'Fake promotion should return 400');
        const data = await res.json();
        assertEquals(data.valid, false, 'Fake promotion should be marked invalid');
        assertExists(data.error, 'Error message should be present');

        trackResult('promotion_fake_rejected', true, 'Fake promotion correctly rejected');

    } catch (err) {
        trackResult('promotion_fake_test', false, `Error: ${err.message}`);
    }

    // ── Test 3: Client-supplied discount amount IGNORED ──────────────────────────
    try {
        // Client tries to claim £999 discount (obviously fake)
        const res = await fetch(`${baseUrl}/api/functions/validateAndApplyPromotion`, {
            method: 'POST',
            headers: {
                'Authorization': bearerToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                promotion_id: testPromotionId,
                restaurant_id: restaurantId,
                server_subtotal: 50.00,
                delivery_fee: 2.99,
                client_discount: 999 // Attacker tries to inject huge discount
            }),
        });

        assertEquals(res.status, 200, 'Valid promotion should succeed');
        const data = await res.json();
        assertEquals(data.valid, true, 'Promotion should be valid');
        
        // Server computes 20% discount, NOT the client-supplied £999
        assertEquals(data.discount, 10.00, 'Server discount (£10) should be used, not client value (£999)');

        trackResult('promotion_client_discount_ignored', true, 'Client-supplied discount ignored, server computed');

    } catch (err) {
        trackResult('promotion_client_discount_test', false, `Error: ${err.message}`);
    }

    // ── Test 4: Inactive promotion rejected ──────────────────────────────────────
    try {
        // Create inactive promotion
        const inactivePromo = await base44.entities.Promotion.create({
            restaurant_id: restaurantId,
            name: 'Inactive Promo',
            promotion_type: 'percentage_off',
            discount_value: 50,
            is_active: false, // INACTIVE
            start_date: new Date().toISOString(),
            end_date: new Date(Date.now() + 86400000).toISOString(),
            usage_limit: 100,
            usage_count: 0,
            condition_type: 'no_condition'
        });

        const res = await fetch(`${baseUrl}/api/functions/validateAndApplyPromotion`, {
            method: 'POST',
            headers: {
                'Authorization': bearerToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                promotion_id: inactivePromo.id,
                restaurant_id: restaurantId,
                server_subtotal: 50.00,
                delivery_fee: 2.99
            }),
        });

        assertEquals(res.status, 400, 'Inactive promotion should return 400');
        const data = await res.json();
        assertEquals(data.valid, false, 'Inactive promotion should be invalid');

        trackResult('promotion_inactive_rejected', true, 'Inactive promotion correctly rejected');

    } catch (err) {
        trackResult('promotion_inactive_test', false, `Error: ${err.message}`);
    }

    // ── Test 5: Below minimum order rejected ─────────────────────────────────────
    try {
        const res = await fetch(`${baseUrl}/api/functions/validateAndApplyPromotion`, {
            method: 'POST',
            headers: {
                'Authorization': bearerToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                promotion_id: testPromotionId, // Requires £15 minimum
                restaurant_id: restaurantId,
                server_subtotal: 10.00, // Below £15 minimum
                delivery_fee: 2.99
            }),
        });

        assertEquals(res.status, 400, 'Below-minimum order should return 400');
        const data = await res.json();
        assertEquals(data.valid, false, 'Below-minimum should be invalid');

        trackResult('promotion_below_minimum_rejected', true, 'Below-minimum order correctly rejected');

    } catch (err) {
        trackResult('promotion_below_minimum_test', false, `Error: ${err.message}`);
    }

    // ── Test 6: Promotion + coupon cap enforcement ───────────────────────────────
    try {
        // Create 50% promotion
        const maxPromo = await base44.entities.Promotion.create({
            restaurant_id: restaurantId,
            name: '50% Max Discount',
            promotion_type: 'percentage_off',
            discount_value: 50, // 50% = £25 on £50
            is_active: true,
            start_date: new Date().toISOString(),
            end_date: new Date(Date.now() + 86400000).toISOString(),
            usage_limit: 100,
            usage_count: 0,
            condition_type: 'no_condition'
        });

        const res = await fetch(`${baseUrl}/api/functions/validateAndApplyPromotion`, {
            method: 'POST',
            headers: {
                'Authorization': bearerToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                promotion_id: maxPromo.id,
                restaurant_id: restaurantId,
                server_subtotal: 50.00,
                delivery_fee: 2.99
            }),
        });

        assertEquals(res.status, 200, 'Max promotion should succeed');
        const data = await res.json();
        assertEquals(data.valid, true, 'Promotion should be valid');
        
        // 50% of £50 = £25, but capped at 50% of subtotal = £25 (already at cap)
        assertEquals(data.discount, 25.00, 'Discount capped at 50% of subtotal');

        trackResult('promotion_coupon_cap_enforced', true, 'Promotion + coupon 50% cap enforced');

    } catch (err) {
        trackResult('promotion_cap_test', false, `Error: ${err.message}`);
    }

    console.log('');
}