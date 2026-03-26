# Security & Abuse Controls

**Last reviewed: 2026-03-26**

This document states what protections actually exist, what their limitations are, and what is intentionally not claimed.

---

## Payment security

### Card payments
- `verifyAndCreateOrder` calls `stripe.paymentIntents.retrieve(paymentIntentId)` for every card order
- Payment status must be `succeeded` — any other status rejects the order
- Amount is compared against the server-computed total; mismatch >£0.50 rejects the order
- PaymentIntent ID is stored on the Order entity — duplicate PI prevents a second order being created from the same payment
- Format validation (`pi_` prefix check) runs before the Stripe call

### Price integrity
- All item prices are rewritten from the live menu DB in `verifyAndCreateOrder`
- Client-submitted prices are ignored — the server always computes the authoritative subtotal
- Total tolerance: ±£0.50 (accommodates rounding differences)

---

## Coupon policy

**One coupon code per order. No stacking.**

- If `coupon_codes` contains more than one code (comma-separated), the order is rejected with HTTP 400
- A single code is validated for: active status, date range, global usage limit, per-user limit (`per_customer_limit`), minimum order, restaurant scope
- Invalid or unrecognised codes are rejected — the order does not proceed silently
- Promotion discounts (auto-applied, no code) are capped at 50% of subtotal as a sanity check
- Promotions and a single coupon can co-exist; they are computed independently and applied sequentially

---

## Order abuse / velocity throttling

Enforced by `orderVelocityThrottle`, called from `verifyAndCreateOrder`.

| Control | Signal | Threshold | Window |
|---|---|---|---|
| Per-user burst | `user.email` or `guest_email` | 5 orders | 60 seconds |
| Platform circuit breaker | All orders (global count) | 30 orders | 60 seconds |
| Duplicate basket guard | Email + restaurant + sorted item fingerprint | 1 duplicate | 90 seconds |

All three controls return HTTP 429 with a `Retry-After` header.

### What is NOT provided: true per-IP rate limiting

The `Order` entity does not store client IP addresses. There is no historical record to query against when checking "how many orders came from this IP". The platform circuit breaker provides a broad safety net, but a coordinated account farm (many accounts, one IP) is constrained only by the per-user and global limits — not by a true per-IP check.

**This is an honest constraint, not an oversight.** It is documented here so it is not falsely claimed elsewhere.

To add true per-IP controls:
1. Add `client_ip` field to the Order entity and capture it from request headers in `verifyAndCreateOrder`
2. Or enforce IP-level rules upstream at the CDN layer (e.g. Cloudflare Rate Limiting)

---

## Authentication & authorisation

### Login and signup
- Managed entirely by Base44. The app cannot intercept login attempts, track failed logins, enforce lockout, or add CAPTCHA.
- Brute force login protection and signup rate limiting require platform-level configuration. Contact Base44 support.

### Function-level auth
- Every backend function calls `base44.auth.me()` to authenticate the caller
- Admin-only functions additionally check `user.role === 'admin'` and return HTTP 403 if not met
- Restaurant manager access is enforced by checking the `RestaurantManager` entity

### Phone verification
- OTP via Twilio (`verifyPhoneOTP`) — 6-digit code, 10-minute expiry
- Phone number is only saved after successful OTP verification
- Required for sensitive features; not required for all orders

---

## Input sanitisation & XSS

- Order notes and user-supplied text are sanitised via DOMPurify (`sanitizeInput.js`) before rendering
- `SanitizedOrderNotes` component wraps all order note display in the restaurant dashboard
- Backend returns generic error messages — internal details (stack traces, DB errors) are logged server-side only

---

## Refund guard

- `validateRefundIdempotency` prevents double-refund by checking `refund_requested_date` before accepting a new refund request
- Refund requests on orders older than 30 days are blocked
- Orders already in `refunded` or `refund_rejected_by_restaurant` status cannot be re-requested

---

## Delivery zone enforcement

- Delivery coordinates are validated with ray-casting polygon containment (not bounding box approximation)
- Zone minimum order value is checked server-side before accepting a delivery order

---

## Restaurant settings-change control policy

### Write path
All restaurant settings writes are routed through `updateRestaurantSettings` (POST, auth required).
Direct frontend entity writes to `Restaurant` are no longer used by `RestaurantSettings`.

### Field allowlist
Only fields in the explicit `ALLOWED_FIELDS` set may be updated.
Unknown/unlisted fields are stripped server-side and logged — the request is not rejected so UX is preserved.

### Admin-only fields
`commission_rate`, `commission_type`, `fixed_commission_amount`, `pos_enabled`, `max_pos_count`,
`media_screen_enabled`, `max_screens_allowed`, `onboarding_status` — non-admin callers receive 403.

### Audit
- All settings changes write an audit record to `DashboardActivity`
- High-risk financial fields (delivery_fee, minimum_order, tiered_delivery, accepts_cash_on_delivery,
  loyalty_program_enabled, loyalty_points_multiplier, commission_rate) capture **before/after values**
  and are logged with `severity: high`
- Low-risk changes (name, logo, hours, printer config, SEO) are logged with `severity: info`

---

## Loyalty balance adjustment control policy

### Write path
Manual admin adjustments go through `adjustLoyaltyPoints` (POST, admin-only).
There is no UI for managers or customers to adjust raw balances.
Order-earned points still flow exclusively through `awardLoyaltyPoints`.

### Adjustment types
`correction` | `goodwill` | `penalty` | `expiry_reversal` | `bulk_promotion`
Unknown types are rejected with 400.

### Guards
- Admin-only: non-admin callers receive 403
- Reason required: blank reason rejected with 400
- Balance floor: balance never goes below 0
- All adjustments write a `LoyaltyTransaction` entry visible in the customer's history
- All adjustments write a `DashboardActivity` audit record with `severity: high`,
  capturing: actor, target user, type, delta, before/after balance, reason, note

---

## POS / restaurant money-control policy

### Roles
| Role | Refund approve | POS discount | Coupon create | Void order | Staff changes | Platform override |
|---|---|---|---|---|---|---|
| `cashier` / `kitchen_staff` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `manager` (RestaurantManager) | ✅ own restaurant | ≤20% / ≤£20 | ✅ own restaurant | ✅ own restaurant | ✅ own restaurant | ❌ |
| `admin` | ✅ any | ✅ any value | ✅ any | ✅ any | ✅ any | ✅ |

All permission checks are enforced server-side. The UI gates are supplementary only.

### Discount threshold policy (`posApplyDiscount`)
- Manager may apply up to **20%** or **£20** without admin sign-off
- Above either threshold: server returns 403 `requires_admin: true`
- A structured **reason code** is always mandatory — blank reason is rejected with 400

### Void policy (`posVoidOrder`)
- Only voidable statuses: `pending`, `confirmed`, `preparing`
- Structured reason code required
- Card-paid voided orders are **auto-flagged** for refund review (status stays `cancelled`, refund fields populated)
- Full audit written including before/after status

### Refund approval (`approveRefund`)
- Replaces direct frontend entity write — all writes go through the server function
- Amount and item-total cross-check re-run server-side at approval time
- Refunds ≥ £30 flagged as **high severity** in audit log

### POS discount bypass closure (`posCreateOrder`)
- `posCreateOrder` no longer trusts the client-supplied `discount` field directly
- Re-validates discount using the same threshold rules as `posApplyDiscount`:
  - No `discount_reason_code` → discount zeroed (logged, order still created)
  - Manager: discount capped at 20% of subtotal OR £20 server-side; above threshold → zeroed
  - Admin: any value accepted
- Financial fields (`total`, `subtotal`, `platform_commission_amount`, `restaurant_earnings`) are
  stripped from the client payload entirely — server always computes these
- The approved `discount_reason_code` is persisted on the Order for auditability

### verifyAndCreateOrder — online checkout coupon hardening (2026-03-26)

**Online checkout coupon policy (authoritative path):**

| Check | Before | After |
|---|---|---|
| Per-customer limit (auth) | ❌ Missing | ✅ Enforced via `created_by` + `coupon_code` query |
| Per-customer limit (guest) | ❌ Missing | ⚠️ Weak — enforced via `guest_email` (self-reported) |
| `expires_at` (reward coupons) | ❌ Not checked | ✅ Checked |
| `coupon_code` field written to Order | ❌ `coupon_codes` (wrong plural) | ✅ `coupon_code` (correct singular) |
| `usage_count` increment | ❌ Client-side race | ✅ Server-side after order created |

**Customer identifier strategy:**
- Authenticated: `created_by` (platform-set, cannot be spoofed)
- Guest: `guest_email` from orderData (weak — self-reported, not verified)

**Guest checkout limitation:** A guest can bypass `per_customer_limit` by using a different email. This is a known, accepted limitation. There is no strong identity anchor for unauthenticated users on this platform.

### validateCouponUsage — per-customer limit fix (2026-03-26)
**BUG FOUND AND FIXED.**
- Previous query: `coupon_codes: { $includes: coupon.code }` (array operator on non-existent field)
- Correct query: `coupon_code: coupon.code` (matches the `coupon_code: string` field in Order schema)
- Impact: `per_customer_limit` was entirely unenforced — any user could apply a single-use coupon
  unlimited times. The fix makes the per-customer limit actually work.

### Platform refund override (`platformRefundOverride`)
- Admin-only (role check is server-side)
- Reason is required — blank reason is rejected
- Writes `HIGH` severity audit record with before/after values and admin identity

### Sensitive action audit (`auditSensitiveAction`)
- Authenticated-only endpoint — anonymous writes are rejected
- Actor email and role are resolved server-side (cannot be spoofed from client)
- Covers: coupon CRUD, staff CRUD, POS discount, POS void, refund events
- Persists to `DashboardActivity` entity; always console-logs even on DB failure

---

## Summary scorecard

| Area | Status |
|---|---|
| Payment verification (Stripe) | ✅ Full server-side verification |
| Price integrity | ✅ Server rewrites all prices from DB |
| Coupon stacking | ✅ Rejected — one code per order |
| Per-user coupon limits | ✅ Enforced via `per_customer_limit` |
| Per-user order burst | ✅ 5/min limit |
| Duplicate basket guard | ✅ 90s window |
| Platform circuit breaker | ✅ 30/min global |
| Per-IP rate limiting | ❌ Not possible without entity/CDN change |
| Login brute force | ❌ Platform limitation (Base44) |
| Signup rate limiting | ❌ Platform limitation (Base44) |
| XSS in order notes | ✅ DOMPurify |
| Double-refund | ✅ Idempotency check |
| Admin-only guards | ✅ role check + 403 |
| POS discount threshold | ✅ Server-enforced, reason required |
| POS void audit | ✅ Full before/after log, reason required |
| Refund approval (server-side) | ✅ No direct entity write from frontend |
| Platform override audit | ✅ Admin-only, high-severity log |
| Coupon CRUD audit | ✅ auditSensitiveAction on every mutation |
| Staff CRUD audit | ✅ auditSensitiveAction on add/deactivate/remove |
| Cashier/kitchen discount/void | ✅ Blocked server-side (manager check) |
| Restaurant settings (financial) | ✅ updateRestaurantSettings, allowlist + before/after audit |
| Loyalty manual adjustment | ✅ adjustLoyaltyPoints, admin-only, reason required, audited |
| POS discount bypass (posCreateOrder) | ✅ Re-validates discount server-side, strips financial fields |
| coupon_code per-customer limit | ✅ FIXED — was querying wrong field (coupon_codes vs coupon_code) |
| Online checkout coupon per-customer limit | ✅ NEW — was missing entirely from verifyAndCreateOrder |
| Online checkout expires_at check | ✅ NEW — reward coupon expiry now checked |
| Online checkout coupon_code field written | ✅ FIXED — now writes correct singular field |
| Online checkout usage_count increment | ✅ MOVED TO SERVER — was client-side race |