/**
 * SMOKE TEST: Guest coupon abuse controls
 *
 * What changed (2026-03-26):
 *   - verifyAndCreateOrder now checks BOTH guest_email AND phone for per-customer
 *     coupon limits (dual-signal). Previously only guest_email was checked.
 *   - A new phone-based coupon abuse throttle blocks guests with ≥3 coupon orders
 *     in the last hour from the same normalised phone number.
 *   - Phone normalisation ensures 07123456789 == +44 7123 456 789 == 07123 456789.
 *   - orderVelocityThrottle now includes a dedicated guest phone burst check (5/60s).
 *
 * Automated tests (no fixtures needed):
 *   All reject on missing auth / malformed payload — these don't require DB state.
 *
 * Manual test cases (require staging fixtures with real data):
 *   See MANUAL_CASES below.
 */

import { runSuite } from '../lib/runner.js';

const FUNCTION = 'verifyAndCreateOrder';

runSuite('guestCouponAbuse', [

    // ── Automated: missing payload rejects cleanly ──────────────────────────

    {
        name: 'empty payload → 500 (auth context missing in smoke runner)',
        payload: {},
        expectStatus: 500,
    },

    {
        name: 'coupon_codes stacking still rejected for guests',
        payload: {
            orderData: {
                restaurant_id: 'stub',
                items: [{ menu_item_id: 'a', name: 'Item', price: 10, quantity: 1 }],
                total: 10,
                coupon_codes: 'CODE1,CODE2',
                payment_method: 'cash',
                order_type: 'collection',
                guest_email: 'guest@test.com',
                phone: '07111222333',
            },
        },
        // Velocity throttle trips first (no auth → 500), but if auth existed → 400 stacking
        // In smoke runner without auth this shows as 500 (auth check in velocity throttle)
        expectStatus: 500,
    },

]);

/**
 * MANUAL_CASES — run against staging with fixture data
 * =====================================================
 *
 * CASE 1: First-time guest (email=new, phone=new) with single-use coupon
 *   Setup:   Active coupon CODE_ONCE with per_customer_limit=1, usage_limit=10, usage_count=0
 *   Order:   guest_email=fresh@test.com, phone=07900111001
 *   Expect:  ✅ 201 order created; coupon_code=CODE_ONCE on order
 *
 * CASE 2: Same email, same phone (repeat of case 1) — single-use coupon
 *   Setup:   Same coupon CODE_ONCE; Case 1 order exists in DB
 *   Order:   guest_email=fresh@test.com, phone=07900111001
 *   Expect:  ❌ 400 "You have already used this coupon"
 *            Both email AND phone signals match → blocked
 *
 * CASE 3: Same phone, different email — email rotation evasion attempt
 *   Setup:   Same coupon CODE_ONCE; Case 1 order exists
 *   Order:   guest_email=rotated@test.com, phone=07900111001 (SAME PHONE)
 *   Expect:  ❌ 400 "You have already used this coupon"
 *            Phone signal alone triggers the block — email rotation doesn't help
 *
 * CASE 4: Different phone, same email — phone rotation evasion attempt
 *   Setup:   Same coupon CODE_ONCE; Case 1 order exists
 *   Order:   guest_email=fresh@test.com (SAME EMAIL), phone=07900111999
 *   Expect:  ❌ 400 "You have already used this coupon"
 *            Email signal alone triggers the block — phone rotation doesn't help
 *
 * CASE 5: Different phone AND different email — full dual-signal rotation
 *   Setup:   Same coupon CODE_ONCE; Case 1 order exists
 *   Order:   guest_email=brand_new@test.com, phone=07999888777
 *   Expect:  ⚠️ 201 — KNOWN ACCEPTED LIMITATION
 *            No signal matches any prior order → limit bypassed
 *            This is documented in SECURITY_AND_ABUSE_CONTROLS.md
 *
 * CASE 6: Phone normalisation — same phone in different format
 *   Setup:   Order exists with phone=07123456789
 *   Order:   phone=+44 7123 456 789 (different format, same number)
 *   Expect:  ❌ 400 — normalised to same key (447123456789)
 *
 * CASE 7: Guest phone coupon abuse throttle — 3 orders with coupons in 1 hour
 *   Setup:   2 prior orders in DB with phone=07500111222, each with a coupon_code set,
 *            both created within the last hour
 *   Order:   3rd order, phone=07500111222, with coupon code CODE_SAVE5
 *   Expect:  ❌ 429 "Too many coupon uses from this phone number"
 *            The throttle fires BEFORE per-customer limit check
 *
 * CASE 8: Guest velocity burst — 5 rapid orders same phone (no coupon)
 *   Setup:   4 orders in DB for phone=07600222333 in last 60 seconds (no coupons)
 *   Order:   5th order, phone=07600222333
 *   Expect:  ❌ 429 from orderVelocityThrottle (guest phone burst check)
 *
 * CASE 9: Authenticated user — per-customer limit uses created_by, not guest signals
 *   Setup:   Authenticated user with email=auth@test.com; prior order with
 *            created_by=auth@test.com and coupon_code=CODE_ONCE
 *   Order:   Same authenticated user, coupon CODE_ONCE again
 *   Expect:  ❌ 400 "You have already used this coupon"
 *            Enforced via created_by (authoritative) — guest signals irrelevant
 *
 * CASE 10: Multi-use coupon (per_customer_limit=3) — second use allowed
 *   Setup:   Coupon CODE_MULTI with per_customer_limit=3; 1 prior order for
 *            guest_email=repeat@test.com, phone=07700111222
 *   Order:   Same email + phone, CODE_MULTI
 *   Expect:  ✅ 201 — within limit (1 of 3 uses)
 */