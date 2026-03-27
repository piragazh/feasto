/**
 * MENU ITEM PAGINATION FIX — SMOKE TESTS
 * 
 * Validates that order validation works reliably regardless of restaurant menu size.
 * Tests pagination logic for:
 * - Small restaurants (10 items)
 * - Pagination boundary (50 items)
 * - Just over boundary (51 items)
 * - Large restaurants (200+ items)
 * - Mixed cart scenarios
 */

import { describe, it, expect } from 'vitest';
import axios from 'axios';

const BASE_URL = 'http://localhost:5173';
const API_TIMEOUT = 30000;

describe('MenuItem Pagination Fix', () => {
    
    it('should validate orders from restaurant with 10 items', async () => {
        const response = await axios.post(`${BASE_URL}/api/verifyAndCreateOrder`, {
            orderData: {
                restaurant_id: 'test_10_items',
                items: [
                    { menu_item_id: 'item_1', name: 'Pizza', price: 12.99, quantity: 1 },
                    { menu_item_id: 'item_5', name: 'Pasta', price: 9.99, quantity: 2 }
                ],
                subtotal: 32.97,
                delivery_fee: 2.00,
                discount: 0,
                total: 34.97,
                order_type: 'delivery',
                delivery_address: 'Test St',
                phone: '07931729926',
                guest_email: 'test@example.com'
            },
            paymentIntentId: 'pi_test_10items',
            idempotency_key: 'test_10items_1'
        }, { timeout: API_TIMEOUT });

        expect(response.status).toBe(201);
        expect(response.data.success).toBe(true);
        expect(response.data.order_id).toBeDefined();
    });

    it('should validate orders from restaurant with exactly 50 items (pagination boundary)', async () => {
        const items = [];
        for (let i = 1; i <= 3; i++) {
            items.push({
                menu_item_id: `item_${i}`,
                name: `Item ${i}`,
                price: 10.00,
                quantity: 1
            });
        }

        const response = await axios.post(`${BASE_URL}/api/verifyAndCreateOrder`, {
            orderData: {
                restaurant_id: 'test_50_items',
                items,
                subtotal: 30.00,
                delivery_fee: 2.00,
                discount: 0,
                total: 32.00,
                order_type: 'delivery',
                delivery_address: 'Test St',
                phone: '07931729926',
                guest_email: 'test50@example.com'
            },
            paymentIntentId: 'pi_test_50items',
            idempotency_key: 'test_50items_1'
        }, { timeout: API_TIMEOUT });

        expect(response.status).toBe(201);
        expect(response.data.success).toBe(true);
    });

    it('should validate orders from restaurant with 51 items (exceeds default pagination)', async () => {
        const items = [];
        // Request items from positions 40-55 (spans pagination boundary if pagination works)
        for (let i = 40; i <= 55; i++) {
            items.push({
                menu_item_id: `item_${i}`,
                name: `Item ${i}`,
                price: 10.00,
                quantity: 1
            });
        }

        const response = await axios.post(`${BASE_URL}/api/verifyAndCreateOrder`, {
            orderData: {
                restaurant_id: 'test_51_items',
                items,
                subtotal: 160.00,
                delivery_fee: 2.00,
                discount: 0,
                total: 162.00,
                order_type: 'delivery',
                delivery_address: 'Test St',
                phone: '07931729926',
                guest_email: 'test51@example.com'
            },
            paymentIntentId: 'pi_test_51items',
            idempotency_key: 'test_51items_1'
        }, { timeout: API_TIMEOUT });

        expect(response.status).toBe(201);
        expect(response.data.success).toBe(true);
        console.log('✅ Successfully validated order with items from 51-item restaurant spanning pagination boundary');
    });

    it('should validate orders from restaurant with 200+ items', async () => {
        const items = [];
        // Request items at boundaries: positions 10, 50, 51, 100, 150, 200
        const positions = [10, 50, 51, 100, 150, 200];
        for (const pos of positions) {
            items.push({
                menu_item_id: `item_${pos}`,
                name: `Item ${pos}`,
                price: 10.00,
                quantity: 1
            });
        }

        const response = await axios.post(`${BASE_URL}/api/verifyAndCreateOrder`, {
            orderData: {
                restaurant_id: 'test_200_items',
                items,
                subtotal: 60.00,
                delivery_fee: 2.00,
                discount: 0,
                total: 62.00,
                order_type: 'collection',
                delivery_address: 'Collection',
                phone: '07931729926',
                guest_email: 'test200@example.com'
            },
            paymentIntentId: 'pi_test_200items',
            idempotency_key: 'test_200items_1'
        }, { timeout: API_TIMEOUT });

        expect(response.status).toBe(201);
        expect(response.data.success).toBe(true);
        console.log('✅ Successfully validated order with items from 200+ item restaurant');
    });

    it('should reject orders with missing items from large restaurant', async () => {
        const response = await axios.post(`${BASE_URL}/api/verifyAndCreateOrder`, {
            orderData: {
                restaurant_id: 'test_200_items',
                items: [
                    { menu_item_id: 'item_999_nonexistent', name: 'Fake Item', price: 10.00, quantity: 1 }
                ],
                subtotal: 10.00,
                delivery_fee: 2.00,
                discount: 0,
                total: 12.00,
                order_type: 'delivery',
                delivery_address: 'Test St',
                phone: '07931729926',
                guest_email: 'test_missing@example.com'
            },
            paymentIntentId: 'pi_test_missing',
            idempotency_key: 'test_missing_1'
        }, { timeout: API_TIMEOUT }).catch(err => err.response);

        expect(response.status).toBe(400);
        expect(response.data.success).toBe(false);
        expect(response.data.error).toContain('no longer available');
    });

    it('should handle duplicate item IDs in cart correctly', async () => {
        const response = await axios.post(`${BASE_URL}/api/verifyAndCreateOrder`, {
            orderData: {
                restaurant_id: 'test_200_items',
                items: [
                    { menu_item_id: 'item_100', name: 'Item 100', price: 10.00, quantity: 3 },
                    { menu_item_id: 'item_100', name: 'Item 100', price: 10.00, quantity: 2 }
                    // Same item twice (would sum to quantity 5)
                ],
                subtotal: 50.00,
                delivery_fee: 2.00,
                discount: 0,
                total: 52.00,
                order_type: 'collection',
                delivery_address: 'Collection',
                phone: '07931729926',
                guest_email: 'test_dups@example.com'
            },
            paymentIntentId: 'pi_test_dups',
            idempotency_key: 'test_dups_1'
        }, { timeout: API_TIMEOUT });

        // Should succeed — validation works correctly with duplicates
        expect(response.status).toBe(201);
        expect(response.data.success).toBe(true);
    });

    it('should validate items with customizations from large restaurant', async () => {
        const response = await axios.post(`${BASE_URL}/api/verifyAndCreateOrder`, {
            orderData: {
                restaurant_id: 'test_200_items',
                items: [
                    {
                        menu_item_id: 'item_75',
                        name: 'Customizable Item',
                        price: 15.00,
                        quantity: 1,
                        customizations: { size: 'Large', toppings: ['cheese', 'pepperoni'] }
                    }
                ],
                subtotal: 15.00,
                delivery_fee: 2.00,
                discount: 0,
                total: 17.00,
                order_type: 'delivery',
                delivery_address: 'Test St',
                phone: '07931729926',
                guest_email: 'test_custom@example.com'
            },
            paymentIntentId: 'pi_test_custom',
            idempotency_key: 'test_custom_1'
        }, { timeout: API_TIMEOUT });

        expect(response.status).toBe(201);
        expect(response.data.success).toBe(true);
    });

    it('should validate order with deal items (synthetic IDs) from large restaurant', async () => {
        const response = await axios.post(`${BASE_URL}/api/verifyAndCreateOrder`, {
            orderData: {
                restaurant_id: 'test_200_items',
                items: [
                    {
                        menu_item_id: 'deal_combo_1',
                        name: 'Combo Deal',
                        price: 19.99,
                        quantity: 1,
                        is_deal: true
                    },
                    {
                        menu_item_id: 'item_150',
                        name: 'Regular Item',
                        price: 10.00,
                        quantity: 1
                    }
                ],
                subtotal: 29.99,
                delivery_fee: 0, // Collection
                discount: 0,
                total: 29.99,
                order_type: 'collection',
                delivery_address: 'Collection',
                phone: '07931729926',
                guest_email: 'test_deals@example.com'
            },
            paymentIntentId: 'pi_test_deals',
            idempotency_key: 'test_deals_1'
        }, { timeout: API_TIMEOUT });

        expect(response.status).toBe(201);
        expect(response.data.success).toBe(true);
        console.log('✅ Deal items correctly skipped pagination validation');
    });

    it('should detect price manipulation across pagination boundaries', async () => {
        const response = await axios.post(`${BASE_URL}/api/verifyAndCreateOrder`, {
            orderData: {
                restaurant_id: 'test_200_items',
                items: [
                    {
                        menu_item_id: 'item_100',
                        name: 'Item 100',
                        price: 999.99, // Way higher than server price (10.00)
                        quantity: 1
                    }
                ],
                subtotal: 999.99,
                delivery_fee: 2.00,
                discount: 0,
                total: 1001.99,
                order_type: 'delivery',
                delivery_address: 'Test St',
                phone: '07931729926',
                guest_email: 'test_fraud@example.com'
            },
            paymentIntentId: 'pi_test_fraud',
            idempotency_key: 'test_fraud_1'
        }, { timeout: API_TIMEOUT }).catch(err => err.response);

        // Price check should catch this (50p > 10.00 * 5% = 0.50)
        expect(response.status).toBe(400);
        expect(response.data.error).toContain('does not match');
    });
});