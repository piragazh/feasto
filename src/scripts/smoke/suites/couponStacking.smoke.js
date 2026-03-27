/**
 * SMOKE TESTS — Coupon Stacking Policy
 *
 * Policy: up to 3 stackable coupon codes per order. All coupons must have stackable=true
 * when more than 1 is applied. Server (verifyAndCreateOrder / posCreateOrder) is authoritative.
 *
 * Application order (deterministic):
 *   1. percentage coupons (sorted by code asc)
 *   2. fixed/other coupons (sorted by code asc)
 *
 * Total coupon discount capped at 50% of server-computed subtotal.
 * Final total never below 0.
 * POS: mutual exclusion between coupon stack and manual discount maintained.
 *
 * AUTOMATED TESTS (no fixture data required):
 *   - Input shape errors caught before DB lookup
 *
 * MANUAL TESTS (require fixture coupons + restaurant in staging):
 *   See MANUAL_CASES block below.
 */

export const name = 'couponStacking';

export const cases = [
    // ── verifyAndCreateOrder — automated reject paths ────────────────────────

    {
        name: 'verifyAndCreateOrder: 4 coupon codes → 400 (exceeds max 3)',
        function: 'verifyAndCreateOrder',
        payload: {
            orderData: {
                restaurant_id: '__restaurant__',
                items: [{ menu_item_id: '__item__', name: 'X', price: 20, quantity: 1 }],
                total: 20,
                payment_method: 'cash',
                order_type: 'collection',
                coupon_codes: ['A', 'B', 'C', 'D'],
            }
        },
        expectedStatus: 400,
        expectBodyContains: { success: false },
        description: 'More than 3 codes must be rejected before any DB lookup',
    },
    {
        name: 'verifyAndCreateOrder: duplicate coupon codes → 400',
        function: 'verifyAndCreateOrder',
        payload: {
            orderData: {
                restaurant_id: '__restaurant__',
                items: [{ menu_item_id: '__item__', name: 'X', price: 20, quantity: 1 }],
                total: 20,
                payment_method: 'cash',
                order_type: 'collection',
                coupon_codes: ['SAVE10', 'SAVE10'],
            }
        },
        expectedStatus: 400,
        expectBodyContains: { success: false },
        description: 'Exact duplicate codes on same order must be rejected',
    },

    // ── posCreateOrder — automated reject paths ───────────────────────────────

    {
        name: 'posCreateOrder: unauthenticated → 401',
        function: 'posCreateOrder',
        payload: {
            restaurant_id: 'any',
            items: [{ menu_item_id: 'a', name: 'X', price: 10, quantity: 1 }],
            total: 10,
        },
        expectedStatus: 401,
        unauthenticated: true,
    },
    {
        name: 'posCreateOrder: 4 coupon codes → 400 (exceeds max 3)',
        function: 'posCreateOrder',
        payload: {
            restaurant_id: '__restaurant__',
            items: [{ menu_item_id: '__item__', name: 'X', price: 20, quantity: 1 }],
            total: 20,
            coupon_codes: ['A', 'B', 'C', 'D'],
        },
        expectedStatus: 400,
        description: 'POS path: > 3 codes rejected',
    },
    {
        name: 'posCreateOrder: duplicate coupon codes → 400',
        function: 'posCreateOrder',
        payload: {
            restaurant_id: '__restaurant__',
            items: [{ menu_item_id: '__item__', name: 'X', price: 20, quantity: 1 }],
            total: 20,
            coupon_codes: ['SAVE5', 'SAVE5'],
        },
        expectedStatus: 400,
        description: 'POS path: duplicates rejected',
    },
    {
        name: 'posCreateOrder: coupon + manual discount → 400 mutual exclusion',
        function: 'posCreateOrder',
        payload: {
            restaurant_id: '__restaurant__',
            items: [{ menu_item_id: '__item__', name: 'X', price: 20, quantity: 1 }],
            total: 20,
            discount: 3,
            discount_reason_code: 'loyalty_gesture',
            coupon_codes: ['SAVE5'],
        },
        expectedStatus: 400,
        expectedBody: { policy: 'mutual_exclusion' },
        description: 'Coupon + manual discount combination blocked on POS',
    },
];

/**
 * MANUAL_CASES — run against staging with fixture data
 * =====================================================
 * Required fixtures:
 *   STACKABLE_A: is_active=true, discount_type=percentage, discount_value=10, stackable=true
 *   STACKABLE_B: is_active=true, discount_type=fixed, discount_value=5, stackable=true
 *   STACKABLE_C: is_active=true, discount_type=fixed, discount_value=3, stackable=true
 *   NON_STACK:   is_active=true, discount_type=fixed, discount_value=5, stackable=false
 *   EXPIRED:     is_active=true, valid_until yesterday
 *   WRONG_REST:  is_active=true, restaurant_id = different restaurant
 *   MIN20:       is_active=true, discount_type=fixed, discount_value=5, minimum_order=20
 *   SINGLE_USE:  is_active=true, per_customer_limit=1
 *
 *   SMOKE_RESTAURANT_ID, SMOKE_MENU_ITEM_ID, SMOKE_ITEM_PRICE=30
 *
 * ── verifyAndCreateOrder ────────────────────────────────────────────────────
 *
 * CASE 1: 1 valid non-stackable coupon accepted
 *   coupon_codes: ['NON_STACK']
 *   Expect: 201, coupon_codes=['NON_STACK'], coupon_code='NON_STACK', discount=5
 *
 * CASE 2: 2 valid stackable coupons accepted
 *   coupon_codes: ['STACKABLE_A', 'STACKABLE_B']  (subtotal=30)
 *   Expect: 201
 *   Discount: STACKABLE_A gives 10% of 30 = 3.00; STACKABLE_B gives £5 → total £8
 *   coupon_codes=['STACKABLE_A','STACKABLE_B'] (percentage applied first — deterministic)
 *
 * CASE 3: 3 valid stackable coupons accepted
 *   coupon_codes: ['STACKABLE_A', 'STACKABLE_B', 'STACKABLE_C']  (subtotal=30)
 *   Expect: 201
 *   Cap: 50% of 30 = £15. Discount: 3 + 5 + 3 = £11 (within cap)
 *
 * CASE 4: 4 coupons rejected
 *   coupon_codes: ['STACKABLE_A', 'STACKABLE_B', 'STACKABLE_C', 'NON_STACK']
 *   Expect: 400 "maximum of 3 coupon codes"
 *
 * CASE 5: duplicate codes rejected
 *   coupon_codes: ['STACKABLE_A', 'STACKABLE_A']
 *   Expect: 400 "Duplicate coupon codes"
 *
 * CASE 6: non-stackable combination rejected
 *   coupon_codes: ['STACKABLE_A', 'NON_STACK']
 *   Expect: 400 "cannot be combined" (NON_STACK.stackable=false)
 *
 * CASE 7: expired coupon rejected
 *   coupon_codes: ['EXPIRED']
 *   Expect: 400 "has expired"
 *
 * CASE 8: wrong restaurant coupon rejected
 *   coupon_codes: ['WRONG_REST']
 *   Expect: 400 "not valid for this restaurant"
 *
 * CASE 9: minimum spend enforced
 *   coupon_codes: ['MIN20']  with subtotal=15
 *   Expect: 400 "minimum order of £20.00"
 *
 * CASE 10: per-customer limit enforced per coupon
 *   Setup: order with coupon_code='SINGLE_USE' already exists for this user
 *   coupon_codes: ['SINGLE_USE']
 *   Expect: 400 "already used this coupon the maximum number of times"
 *
 * CASE 11: combined discount cap enforced (50% of subtotal)
 *   subtotal=10, coupon_codes: ['STACKABLE_A'(10%=1), 'STACKABLE_B'(£5)]
 *   Cap=£5. STACKABLE_A gives £1, STACKABLE_B gives £4 (remaining cap) = £5 total
 *   Expect: 201, discount=5, total=5
 *
 * CASE 12: final total never negative
 *   subtotal=3, coupon FIXED_10 (£10 off), stackable=true
 *   Expect: 201, discount=1.50 (50% cap of 3), total=1.50
 *
 * ── posCreateOrder ──────────────────────────────────────────────────────────
 *
 * CASE 13: POS — 2 stackable coupons accepted
 *   coupon_codes: ['STACKABLE_A', 'STACKABLE_B']
 *   Expect: 200, order.coupon_codes=['STACKABLE_A','STACKABLE_B']
 *
 * CASE 14: POS — non-stackable combination rejected
 *   coupon_codes: ['STACKABLE_A', 'NON_STACK']
 *   Expect: 400 "cannot be combined"
 *
 * CASE 15: POS — walk-in (no phone) with SINGLE_USE coupon allowed when global limit not hit
 *   coupon_codes: ['SINGLE_USE']  (no phone field)
 *   Expect: 200 — no identity to check per-customer limit against
 *   NOTE: documented POS walk-in limitation
 *
 * CASE 16: POS — coupon stack + manual discount blocked (mutual exclusion preserved)
 *   discount: 3, discount_reason_code: 'loyalty_gesture', coupon_codes: ['STACKABLE_A']
 *   Expect: 400 { policy: 'mutual_exclusion' }
 */