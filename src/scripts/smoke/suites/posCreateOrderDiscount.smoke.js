/**
 * Smoke tests — posCreateOrder discount bypass hardening
 * Verifies that client-injected discount values are validated server-side.
 *
 * Key policy (implemented 2026-03-26):
 *   - discount without discount_reason_code → zeroed (logged, not rejected)
 *   - manager: discount capped at 20% of subtotal OR £20 (whichever is lower)
 *   - admin: any discount value accepted
 *   - financial fields (total, subtotal, platform_commission_amount, restaurant_earnings)
 *     stripped from client payload entirely
 */
export const name = 'posCreateOrderDiscount';

export const cases = [
    {
        name: 'unauthenticated → 401',
        payload: { restaurant_id: 'any', items: [], total: 0 },
        expectedStatus: 401,
        unauthenticated: true,
    },
    {
        name: 'discount without reason_code → order created with discount=0',
        // Cannot assert discount=0 here without a real restaurant — document expected behavior
        description: 'Client sends discount:5.00 without discount_reason_code. Server should zero it.',
        payload: {
            restaurant_id: '__real_restaurant_id__',
            items: [{ menu_item_id: '__item__', quantity: 1 }],
            total: 10,
            discount: 5.00,
        },
        expectedStatus: 200,
        expectBodyContains: {},
        manualOnly: true,
        expectedBehavior: 'Response order.discount should be 0 (reason_code missing)',
    },
    {
        name: 'manager discount above 20% threshold → capped to 0 server-side',
        description: 'Manager sends 50% discount. Server should zero it (above MANAGER_MAX_PCT=20).',
        payload: {
            restaurant_id: '__real_restaurant_id__',
            items: [{ menu_item_id: '__item__', quantity: 1 }],
            total: 20,
            discount: 15.00,  // 75% on a £20 order
            discount_reason_code: 'manager_discretion',
        },
        expectedStatus: 200,
        manualOnly: true,
        expectedBehavior: 'Response order.discount should be 0 (exceeds manager threshold)',
    },
    {
        name: 'valid manager discount within threshold → accepted',
        description: 'Manager sends 10% discount with reason. Should be accepted.',
        payload: {
            restaurant_id: '__real_restaurant_id__',
            items: [{ menu_item_id: '__item__', quantity: 1 }],
            total: 18,
            discount: 2.00,   // 10% on a £20 order — within threshold
            discount_reason_code: 'customer_complaint',
        },
        expectedStatus: 200,
        manualOnly: true,
        expectedBehavior: 'Response order.discount should be 2.00',
    },
];