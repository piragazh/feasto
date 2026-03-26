# Production Readiness

**Status: 🟡 Conditionally production-ready**  
**Last reviewed: 2026-03-26**

---

## What is production-ready

### Payment processing ✅
- Stripe `paymentIntents.retrieve()` called server-side on every card order — status must be `succeeded`
- Amount verified against server-computed order total (tolerance ±£0.50)
- PaymentIntent ID stored on Order and checked for duplicates (prevents double-charge)
- Idempotency key prevents double-order creation on network retry

### Order validation ✅
- All item prices recomputed from the live menu DB — client-supplied prices are overwritten
- Unavailable items rejected at order creation
- Delivery zone checked with ray-casting polygon math (not bounding box)
- Restaurant opening hours validated server-side
- Minimum order enforced server-side

### Coupon / discount ✅
- All coupon validation is server-side (expiry, usage limits, restaurant scope, minimum spend)
- Exactly one coupon code per order — stacking is rejected at the handler level
- Per-user limit enforced via `validateCouponUsage`
- Promotion discounts capped at 50% of subtotal

### Abuse controls ✅
- Per-user burst limit: 5 orders/60 seconds (by authenticated email or guest email)
- Platform circuit breaker: 30 orders/60 seconds platform-wide
- Duplicate basket guard: identical basket blocked for 90 seconds
- See [SECURITY_AND_ABUSE_CONTROLS.md](SECURITY_AND_ABUSE_CONTROLS.md) for detail

### Auth & admin ✅
- All backend functions authenticate via `base44.auth.me()`
- Admin-only functions check `user.role === 'admin'` and return 403 if not met
- Restaurant manager access enforced via `RestaurantManager` entity

### Error handling ✅
- Backend functions return generic error messages to clients
- Internals (stack traces, DB details) logged server-side only, never returned

---

## Known limitations

### True per-IP rate limiting — NOT available ❌
The `Order` entity does not store client IP addresses. Filtering orders by IP is not possible at the application layer. The platform circuit breaker (30 orders/min) provides a blunt safety net. To add true per-IP controls:
- Option A: Add `client_ip` field to Order entity, capture at creation time in the handler
- Option B: Enforce IP-level rules upstream at CDN (e.g. Cloudflare Rate Limiting)

### Login brute force protection — Platform limitation ❌
Base44 manages authentication. The app cannot intercept failed login attempts, enforce lockout, or add CAPTCHA. Contact Base44 support to configure platform-level protection.

### Signup rate limiting — Platform limitation ❌
Same as above. Account creation rate limiting is not configurable from the app layer.

### Race condition on coupon `usage_count` — Low severity ⚠️
Between coupon validation and DB write, a concurrent request could overshoot the global usage limit by 1–2 uses. Probability is low; impact is minor (small revenue leakage). Requires atomic DB operations or distributed locking to fully eliminate.

### Cart signature (`validateCartSignature.js`) — Not integrated
This function exists in `functions/` but is not called from the checkout flow. It was superseded by server-side price recomputation in `verifyAndCreateOrder`, which rewrites all item prices from the live menu DB. The signature approach is redundant and the file can be removed if desired.

### `localStorage` stores PII in plaintext
Delivery addresses and phone numbers in the checkout flow are stored in browser `localStorage` without encryption. If a device is compromised, this data is accessible. Acceptable for current scope; mitigate with Web Crypto API or remove from localStorage entirely (server-side session instead).

---

## POS / restaurant money-control ✅

### Permissions (server-enforced)
- `cashier` and `kitchen_staff` roles cannot apply discounts, void orders, approve refunds, or create coupons — blocked at the function layer
- `RestaurantManager` access is scoped to assigned restaurants only; cross-tenant actions return 403
- Platform refund overrides are admin-only and verified server-side

### Audit trail
- Every sensitive money action (discount, void, refund approval, coupon mutation, staff change, platform override) writes a structured record to `DashboardActivity` via `auditSensitiveAction`
- Records include: actor email, role, restaurant scope, action type, before/after values, reason code, timestamp
- Actor identity is always resolved server-side — cannot be spoofed from the client

### Discount controls
- POS discounts validated server-side via `posApplyDiscount`
- Managers: max 20% or £20; above requires admin
- Structured reason code required — blank reason rejected with 400

### Restaurant settings controls (2026-03-26)
- All restaurant settings writes go through `updateRestaurantSettings` server function
- Field allowlist enforced server-side — unknown fields silently stripped and logged
- `commission_rate` and platform-ops fields require admin role
- Financial/order-affecting field changes (delivery_fee, minimum_order, etc.) capture before/after in `DashboardActivity` with `severity: high`

### Loyalty balance controls (2026-03-26)
- Manual balance adjustments require admin role via `adjustLoyaltyPoints`
- Adjustment type from allowlist required; blank reason rejected
- Every adjustment writes a `LoyaltyTransaction` (visible to customer) and a high-severity audit record
- No manager or customer path to raw balance writes

### coupon_code per-customer limit fix (2026-03-26)
- **CRITICAL BUG FIXED**: `validateCouponUsage` was querying `coupon_codes: { $includes: ... }` —
  a non-existent array field. The Order entity stores `coupon_code: string` (singular).
- The $includes filter silently returned 0 results every time, making `per_customer_limit` completely unenforced.
- Fixed to `coupon_code: coupon.code`. Single-use coupons now actually enforce the per-customer limit.

### POS discount bypass closure (2026-03-26)
- `posCreateOrder` no longer blindly trusts client `discount` field
- Re-runs threshold validation: no reason → zeroed; manager >20%/£20 → zeroed; admin → any value
- `total`, `subtotal`, `platform_commission_amount`, `restaurant_earnings` stripped from client payload

### Void controls
- POS voids routed through `posVoidOrder`; direct status=cancelled update via `posUpdateOrder` is blocked
- Card-paid voided orders automatically flagged for refund review

### Refund controls
- Restaurant managers approve via `approveRefund` function (not direct entity write)
- Amount and item-total re-verified server-side at approval time
- Refunds ≥ £30 flagged as high severity

---

## Must pass before every deploy

- [ ] CI workflow green (lint → typecheck → test:run → mirror-sync → build)
- [ ] `npm run verify` passes locally
- [ ] No new Vitest test failures
- [ ] `npm run check:mirror-sync` reports 0 drift issues
- [ ] Manual smoke test: checkout flow (card + cash), coupon application, order status update

---

## Platform constraints affecting readiness

| Constraint | Impact |
|---|---|
| Base44 manages auth | Cannot add brute force / signup rate limiting |
| Deno functions are independent | Cannot share code between handlers; mirror pattern required |
| No direct DB transactions | Coupon usage_count race condition cannot be fully eliminated |
| Entity RLS via platform settings | Ensure RLS rules are configured in Base44 dashboard before go-live |