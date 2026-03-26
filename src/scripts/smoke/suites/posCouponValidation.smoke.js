/**
 * SMOKE TEST: POS coupon validation and enforcement
 *
 * What changed (2026-03-26):
 *   - posGetCoupons now filters by date range, expires_at, and global usage_limit
 *     (previously returned all active coupons regardless of expiry/limits)
 *   - posValidateCoupon (new) — server validates coupon before the order is placed:
 *     date range, restaurant scope, minimum spend, global limit, per-customer limit (if phone)
 *   - posCreateOrder now:
 *     - Accepts and re-validates coupon_code server-side
 *     - Writes coupon_code to Order entity (previously never written)
 *     - Increments usage_count server-side after order creation
 *     - Enforces one-coupon-per-order (comma-separated codes rejected with 400)
 *   - ApplyPromotionDialog:
 *     - Removed direct base44.entities.Order.update() writes
 *     - Now calls posValidateCoupon before accepting a coupon
 *     - Passes has_manual_discount flag to posValidateCoupon
 *   - Mutual exclusion policy (2026-03-26):
 *     - posCreateOrder rejects orders with both discount>0 AND coupon_code → 400 mutual_exclusion
 *     - posValidateCoupon rejects coupon when has_manual_discount=true → valid=false mutual_exclusion
 *     - UI: POSDiscountPanel shows blocked state when coupon is active (couponActive prop)
 *     - UI: Add Coupon button replaced with info message when manual discount is active
 *     - UI: ApplyPromotionDialog shows warning banner when has_manual_discount=true
 *
 * POS customer identity policy:
 *   - Walk-in orders (no phone/email): only global usage_limit applies
 *   - Phone orders (phone captured): per_customer_limit enforced by phone number
 *   - POS staff cannot bypass expired/out-of-scope/min-spend coupons
 */

export const name = 'posCouponValidation';

export const cases = [
    // ── posValidateCoupon automated reject paths ─────────────────────────────

    {
        name: 'posValidateCoupon: has_manual_discount=true → valid=false (mutual exclusion)',
        function: 'posValidateCoupon',
        payload: { restaurant_id: '__restaurant__', coupon_code: 'ANYCODE', subtotal: 20, has_manual_discount: true },
        expectedStatus: 200,
        expectedBody: { valid: false, policy: 'mutual_exclusion' },
    },
    {
        name: 'posValidateCoupon: unauthenticated → 401',
        function: 'posValidateCoupon',
        payload: { restaurant_id: 'any', coupon_code: 'TEST', subtotal: 10 },
        expectedStatus: 401,
        unauthenticated: true,
    },
    {
        name: 'posValidateCoupon: missing restaurant_id → 400',
        function: 'posValidateCoupon',
        payload: { coupon_code: 'TEST', subtotal: 10 },
        expectedStatus: 400,
    },
    {
        name: 'posValidateCoupon: missing coupon_code → 400',
        function: 'posValidateCoupon',
        payload: { restaurant_id: '__restaurant__', subtotal: 10 },
        expectedStatus: 400,
    },
    {
        name: 'posValidateCoupon: invalid subtotal → 400',
        function: 'posValidateCoupon',
        payload: { restaurant_id: '__restaurant__', coupon_code: 'TEST', subtotal: -5 },
        expectedStatus: 400,
    },
    {
        name: 'posCreateOrder: unauthenticated → 401',
        function: 'posCreateOrder',
        payload: { restaurant_id: 'any', items: [{ menu_item_id: 'a', name: 'X', price: 10, quantity: 1 }], total: 10 },
        expectedStatus: 401,
        unauthenticated: true,
    },
    {
        name: 'posGetCoupons: unauthenticated → 401',
        function: 'posGetCoupons',
        payload: { restaurant_id: 'any' },
        expectedStatus: 401,
        unauthenticated: true,
    },
];

/**
 * MANUAL_CASES — run against staging with fixture data
 * =====================================================
 * Requires: SMOKE_TEST_RESTAURANT_ID, SMOKE_TEST_MENU_ITEM_ID, an authenticated staff/manager token
 *
 * CASE 1: posGetCoupons — expired coupon excluded
 *   Setup:   Coupon with valid_until in the past, is_active=true
 *   Call:    posGetCoupons({ restaurant_id })
 *   Expect:  ✅ response.coupons does NOT include the expired coupon
 *
 * CASE 2: posGetCoupons — usage-limit-exhausted coupon excluded
 *   Setup:   Coupon with usage_limit=3, usage_count=3
 *   Call:    posGetCoupons({ restaurant_id })
 *   Expect:  ✅ response.coupons does NOT include that coupon
 *
 * CASE 3: posValidateCoupon — nonexistent code → valid=false
 *   Call:    posValidateCoupon({ restaurant_id, coupon_code: 'DOESNTEXIST', subtotal: 20 })
 *   Expect:  ✅ { valid: false, error: "Coupon code not found" }
 *
 * CASE 4: posValidateCoupon — valid coupon → valid=true with discount_amount
 *   Setup:   Active coupon CODE_10 with discount_type=fixed, discount_value=10
 *   Call:    posValidateCoupon({ restaurant_id, coupon_code: 'CODE_10', subtotal: 30 })
 *   Expect:  ✅ { valid: true, coupon_code: 'CODE_10', discount_amount: 10 }
 *
 * CASE 5: posValidateCoupon — minimum spend not met → valid=false
 *   Setup:   Coupon with minimum_order=25
 *   Call:    posValidateCoupon({ ..., coupon_code: 'MIN25CODE', subtotal: 20 })
 *   Expect:  ✅ { valid: false, error: "Minimum order of £25.00 required..." }
 *
 * CASE 6: posValidateCoupon — wrong restaurant → valid=false
 *   Setup:   Coupon scoped to restaurant B; caller is for restaurant A
 *   Call:    posValidateCoupon({ restaurant_id: restaurantA, coupon_code: 'RESTAURANT_B_CODE', subtotal: 20 })
 *   Expect:  ✅ { valid: false, error: "not valid for this restaurant" }
 *
 * CASE 7: posValidateCoupon — expired coupon → valid=false
 *   Setup:   Coupon with valid_until yesterday
 *   Call:    posValidateCoupon({ ..., coupon_code: 'EXPIRED', subtotal: 20 })
 *   Expect:  ✅ { valid: false, error: "expired" }
 *
 * CASE 8: posValidateCoupon — global usage_limit reached → valid=false
 *   Setup:   Coupon with usage_limit=2, usage_count=2
 *   Call:    posValidateCoupon({ ..., coupon_code: 'MAXEDOUT', subtotal: 20 })
 *   Expect:  ✅ { valid: false, error: "reached its usage limit" }
 *
 * CASE 9: posCreateOrder — coupon_code written to Order; usage_count incremented
 *   Setup:   Active coupon CODE_5 with discount_type=fixed, discount_value=5, usage_count=0
 *   Call:    posCreateOrder({ restaurant_id, items: [...], total: 15, coupon_code: 'CODE_5' })
 *   Expect:
 *     ✅ response.order.coupon_code === 'CODE_5'
 *     ✅ response.order.discount === 5
 *     ✅ response.order.total === 10  (15 - 5)
 *     ✅ DB: Coupon.usage_count === 1
 *
 * CASE 10: posCreateOrder — coupon stacking rejected
 *   Call:    posCreateOrder({ ..., coupon_code: 'CODE1,CODE2', total: 20 })
 *   Expect:  ❌ 400 "Only one coupon code per order is allowed"
 *
 * CASE 11: posCreateOrder — expired coupon rejected at create time
 *   Setup:   Expired coupon EXPIRED_CODE
 *   Call:    posCreateOrder({ ..., coupon_code: 'EXPIRED_CODE', total: 20 })
 *   Expect:  ❌ 400 "has expired"
 *
 * CASE 12: posCreateOrder — coupon + manual discount combination BLOCKED
 *   Setup:   Coupon CODE_FIXED; manual discount £3 with reason code
 *   Call:    posCreateOrder({ ..., discount: 3, discount_reason_code: 'loyalty_gesture', coupon_code: 'CODE_FIXED' })
 *   Expect:  ❌ 400 { error: "...", policy: "mutual_exclusion" }
 *   POLICY:  Coupon and manual discount cannot coexist on the same POS order.
 *
 * CASE 12b: posValidateCoupon — coupon blocked when has_manual_discount=true
 *   Call:    posValidateCoupon({ ..., coupon_code: 'CODE_10', subtotal: 30, has_manual_discount: true })
 *   Expect:  ✅ { valid: false, error: "A manual discount is already applied...", policy: "mutual_exclusion" }
 *
 * CASE 12c: posCreateOrder — coupon-only succeeds (no manual discount)
 *   Call:    posCreateOrder({ ..., coupon_code: 'CODE_FIXED' })  (no discount/discount_reason_code)
 *   Expect:  ✅ 200 — order.coupon_code set, order.discount = coupon discount
 *
 * CASE 12d: posCreateOrder — manual discount only succeeds (no coupon)
 *   Call:    posCreateOrder({ ..., discount: 3, discount_reason_code: 'loyalty_gesture' })  (no coupon_code)
 *   Expect:  ✅ 200 — order.discount_reason_code set, order.coupon_code absent
 *
 * CASE 13: posCreateOrder — per-customer limit enforced when phone provided
 *   Setup:   Coupon SINGLE_USE with per_customer_limit=1; prior order with phone=07500111222 and coupon_code=SINGLE_USE
 *   Call:    posCreateOrder({ ..., coupon_code: 'SINGLE_USE', phone: '07500111222' })
 *   Expect:  ❌ 400 "already been used the maximum number of times"
 *
 * CASE 14: posCreateOrder — walk-in (no phone) uses global limit only
 *   Setup:   Coupon SINGLE_USE with per_customer_limit=1, usage_count=0; no phone provided
 *   Call:    posCreateOrder({ ..., coupon_code: 'SINGLE_USE' }) (no phone field)
 *   Expect:  ✅ 200 — no identity to check per-customer limit against; global limit not yet hit
 *   NOTE:    This is a documented limitation of walk-in POS (SECURITY_AND_ABUSE_CONTROLS.md)
 *
 * CASE 15: posApplyDiscount — manual discount unaffected by coupon policy
 *   Call:    posApplyDiscount({ restaurant_id, discount_type: 'percentage', discount_value: 10,
 *            subtotal: 20, reason_code: 'customer_complaint' })
 *   Expect:  ✅ { allowed: true, discount_amount: 2 }  (manual discount still works independently)
 */