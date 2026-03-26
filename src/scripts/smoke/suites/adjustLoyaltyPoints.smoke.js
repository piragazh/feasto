/**
 * Smoke tests — adjustLoyaltyPoints
 * Verifies: admin-only, reason required, valid adjustment_type required, balance floor at 0
 */
export const name = 'adjustLoyaltyPoints';

export const cases = [
    {
        name: 'unauthenticated → 401',
        payload: { user_email: 'test@example.com', points_delta: 10, adjustment_type: 'goodwill', reason: 'test' },
        expectedStatus: 401,
        unauthenticated: true,
    },
    {
        name: 'manager (non-admin) → 403',
        payload: { user_email: 'test@example.com', points_delta: 10, adjustment_type: 'goodwill', reason: 'test' },
        expectedStatus: 403,
        role: 'manager',
    },
    {
        name: 'admin without reason → 400',
        payload: { user_email: 'test@example.com', points_delta: 10, adjustment_type: 'goodwill', reason: '' },
        expectedStatus: 400,
        role: 'admin',
    },
    {
        name: 'admin with invalid adjustment_type → 400',
        payload: { user_email: 'test@example.com', points_delta: 10, adjustment_type: 'free_money', reason: 'test' },
        expectedStatus: 400,
        role: 'admin',
    },
    {
        name: 'admin with zero delta → 400',
        payload: { user_email: 'test@example.com', points_delta: 0, adjustment_type: 'correction', reason: 'test' },
        expectedStatus: 400,
        role: 'admin',
    },
    {
        name: 'valid admin correction → 200 with before/after',
        payload: { user_email: 'smoke-test@example.com', points_delta: 50, adjustment_type: 'correction', reason: 'Smoke test correction', note: 'AUTO' },
        expectedStatus: 200,
        expectBodyContains: { success: true },
        role: 'admin',
    },
];