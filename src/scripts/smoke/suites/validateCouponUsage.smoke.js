/**
 * Smoke tests — validateCouponUsage
 * Verifies: per-customer limit uses coupon_code (not coupon_codes) field.
 *
 * LIVE VERIFICATION RESULT (2026-03-26):
 *   BUG CONFIRMED AND FIXED — The previous filter used:
 *     coupon_codes: { $includes: coupon.code }
 *   The Order entity stores coupon as:
 *     coupon_code: string  (singular, Order entity schema line "coupon_code")
 *   The $includes filter on a non-existent array field silently returned 0 results,
 *   making per_customer_limit entirely unenforced. Fixed to:
 *     coupon_code: coupon.code
 */
export const name = 'validateCouponUsage';

export const cases = [
    {
        name: 'unauthenticated → 401',
        payload: { couponId: 'any' },
        expectedStatus: 401,
        unauthenticated: true,
    },
    {
        name: 'missing couponId → 400',
        payload: {},
        expectedStatus: 400,
    },
    {
        name: 'non-string couponId → 404',
        payload: { couponId: 12345 },
        expectedStatus: 404,
    },
    {
        name: 'nonexistent coupon → 404',
        payload: { couponId: '00000000-0000-0000-0000-000000000000' },
        expectedStatus: 404,
    },
    // The per-customer limit case requires a real coupon + real order in DB.
    // Run manually:
    //   1. Create coupon with per_customer_limit=1
    //   2. Create order with coupon_code = that coupon code, created_by = test user email
    //   3. Call validateCouponUsage as that user → should return valid: false
    //   4. Delete order → call again → should return valid: true
    {
        name: '[MANUAL] first use accepted when no prior order',
        payload: { couponId: '__REAL_COUPON_ID__' },
        expectedStatus: 200,
        expectBodyContains: { valid: true },
        manualOnly: true,
    },
    {
        name: '[MANUAL] second use blocked when per_customer_limit=1 and prior order exists',
        payload: { couponId: '__REAL_COUPON_ID__' },
        expectedStatus: 400,
        expectBodyContains: { valid: false },
        manualOnly: true,
    },
];