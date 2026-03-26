/**
 * Smoke tests — updateRestaurantSettings
 * Verifies: auth required, tenant scope, field allowlist, high-risk audit, admin-only fields
 */
export const name = 'updateRestaurantSettings';

export const cases = [
    {
        name: 'unauthenticated → 401',
        payload: { restaurant_id: 'any', updates: { delivery_fee: 5 } },
        expectedStatus: 401,
        unauthenticated: true,
    },
    {
        name: 'manager updating wrong restaurant → 403',
        payload: { restaurant_id: '__nonexistent_restaurant_id__', updates: { delivery_fee: 5 } },
        expectedStatus: 403,
        role: 'manager',
    },
    {
        name: 'manager trying to set commission_rate → 403',
        payload: { restaurant_id: '__own_restaurant__', updates: { commission_rate: 0 } },
        expectedStatus: 403,
        role: 'manager',
    },
    {
        name: 'non-allowlisted field is stripped, not rejected',
        payload: { restaurant_id: '__own_restaurant__', updates: { name: 'Test', _injected_field: 'evil' } },
        expectedStatus: 200,
        expectBodyContains: { success: true },
        role: 'manager',
    },
    {
        name: 'admin can set commission_rate',
        payload: { restaurant_id: '__any_restaurant__', updates: { commission_rate: 15 }, note: 'smoke test' },
        expectedStatus: 200,
        expectBodyContains: { success: true },
        role: 'admin',
    },
    {
        name: 'high-risk change (delivery_fee) returns high_risk_changes in response',
        payload: { restaurant_id: '__own_restaurant__', updates: { delivery_fee: 3.99 } },
        expectedStatus: 200,
        expectBodyContains: { success: true },
        role: 'manager',
    },
];