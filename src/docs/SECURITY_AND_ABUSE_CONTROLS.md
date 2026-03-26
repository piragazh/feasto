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
- A single code is validated for: active status, date range (`valid_from`, `valid_until`, `expires_at`), global usage limit, per-user limit (`per_customer_limit`), minimum order, restaurant scope
- Invalid or unrecognised codes are rejected — the order does not proceed silently
- Promotion discounts (auto-applied, no code) are capped at 50% of subtotal as a sanity check
- Promotions and a single coupon can co-exist; they are computed independently and applied sequentially

### Coupon per-customer enforcement strategy

| User type | Identity signal | Strength | How queried |
|---|---|---|---|
| Authenticated | `created_by` (platform-set) | **Strong** — cannot be spoofed | `created_by + coupon_code` |
| Guest | `guest_email` (normalised) | **Weak** — self-reported, easy to rotate | `guest_email + coupon_code` |
| Guest | `phone` (normalised) | **Medium** — harder to rotate, tied to SMS | `phone + coupon_code` |

For guests both signals are queried independently. The **maximum** usage count across both signals is used. This means:
- Rotating email alone does NOT bypass the limit if the phone matches a prior order
- Rotating phone alone does NOT bypass the limit if the email matches a prior order
- Rotating BOTH email AND phone bypasses per-customer limits — this is an accepted, unavoidable limitation

**Policy is best-effort for guests. It is not claimed to be identity verification.**

### Guest coupon abuse throttle

A secondary control detects high-frequency coupon activity from a single phone number:
- If the normalised phone has submitted ≥ 3 orders with a coupon code in the last hour → HTTP 429
- This catches rotating-email abuse where the phone stays constant

---

## Order abuse / velocity throttling

Enforced by `orderVelocityThrottle`, called from `verifyAndCreateOrder`.

| Control | Signal | Threshold | Window |
|---|---|---|---|
| Per-user burst (auth) | `user.email` | 5 orders | 60 seconds |
| Guest phone burst | normalised `phone` (guests only) | 5 orders | 60 seconds |
| Platform circuit breaker | All orders (global count) | 30 orders | 60 seconds |
| Duplicate basket guard | actor ID + restaurant + sorted item fingerprint | 1 duplicate | 90 seconds |

All controls return HTTP 429 with a `Retry-After` header.

### Guest signal normalisation

Both `email` and `phone` are normalised server-side before any comparison:
- **Email**: lowercased, trimmed. Plus-aliases and dots preserved (not stripped) to avoid false positives.
- **Phone**: all non-digit characters stripped; UK `07xxx` prefix converted to `447xxx` (E.164-ish). `07123 456789`, `+447123456789`, and `07123-456-789` all produce the same key.

Normalisation functions are pure, tested (`lib/__tests__/guest-identity.test.js`), and mirrored in both `verifyAndCreateOrder` and `orderVelocityThrottle`.

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

### verifyAndCreateOrder — online checkout coupon hardening (2026-03-26, updated 2026-03-26)

**Online checkout coupon policy (authoritative path):**

| Check | Before | After |
|---|---|---|
| Per-customer limit (auth) | ❌ Missing | ✅ Enforced via `created_by` + `coupon_code` query |
| Per-customer limit (guest) | ❌ Missing | ⚠️ Best-effort — dual-signal: `guest_email` + `phone` (both normalised) |
| Guest coupon abuse throttle | ❌ None | ✅ ≥3 coupon orders per phone in 1 hour → 429 |
| `expires_at` (reward coupons) | ❌ Not checked | ✅ Checked |
| `coupon_code` field written to Order | ❌ `coupon_codes` (wrong plural) | ✅ `coupon_code` (correct singular) |
| `usage_count` increment | ❌ Client-side race | ✅ Server-side after order created |
| Email normalisation | ❌ None | ✅ Lowercased + trimmed |
| Phone normalisation | ❌ None | ✅ Digits-only, `07` → `447` |

**Customer identifier strategy:**
- Authenticated: `created_by` (platform-set, cannot be spoofed)
- Guest: `guest_email` (normalised) + `phone` (normalised) — both queried independently, MAX taken

**Remaining guest limitation:** A guest who rotates BOTH email AND phone on each order can still bypass `per_customer_limit`. This is an accepted, unavoidable limitation with no strong identity anchor available. The abuse throttle (3 coupon orders/hr per phone) raises the cost of this evasion.

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

---

## POS coupon enforcement

**Last reviewed: 2026-03-26**

POS coupon handling uses a dedicated server path separate from online checkout (`verifyAndCreateOrder`). The policies are consistent where customer identity allows; differences are documented honestly.

### POS coupon path

1. **`posGetCoupons`** — returns only coupons that pass: `is_active`, restaurant scope, date range (`valid_from`, `valid_until`, `expires_at`), and global `usage_limit`. Expired or maxed-out coupons are not shown to staff.

2. **`posValidateCoupon`** — server validates on apply (before order creation): active, scope, date range, minimum spend, global limit, per-customer limit (when identity available). Returns `{ valid, discount_amount }`.

3. **`posCreateOrder`** — re-validates the coupon code server-side at order creation time (independent of client state), writes `coupon_code` to the Order entity, and increments `usage_count` after persisting the order.

### POS discount interaction policy (mutual exclusion)

**A POS order may have a coupon OR a manual discount — never both.**

This is the safest simple rule. Rationale:
- Combining both creates an undetectable double-discount path
- Makes margin analysis ambiguous (was the total loss from abuse or authorised gesture?)
- Harder for management to spot via audit log review

Enforcement layers:
1. **`posCreateOrder`** (hard gate): rejects with 400 `{ policy: "mutual_exclusion" }` if `discount > 0` AND `coupon_code` are both present
2. **`posValidateCoupon`** (early signal): returns `{ valid: false, policy: "mutual_exclusion" }` when `has_manual_discount: true` is passed
3. **UI — `POSDiscountPanel`**: shows a blocked notice when `couponActive=true`; discount form cannot be opened
4. **UI — coupon button**: replaced with an informational message when a manual discount is already applied
5. **UI — `ApplyPromotionDialog`**: shows an orange warning banner when `hasManualDiscount=true`

Staff workflow:
- To apply a coupon: ensure no manual discount is active first (remove it)
- To apply a manual discount: ensure no coupon is active first (remove it)
- The receipt/order record clearly shows either `coupon_code` or `discount_reason_code` — never both

---

### POS coupon policy rules

| Rule | Enforced? | Where |
|---|---|---|
| Active status | ✅ | posGetCoupons + posValidateCoupon + posCreateOrder |
| Date range / expires_at | ✅ | posGetCoupons + posValidateCoupon + posCreateOrder |
| Restaurant scope | ✅ | posGetCoupons + posValidateCoupon + posCreateOrder |
| Minimum spend | ✅ | posValidateCoupon + posCreateOrder |
| Global usage_limit | ✅ | posGetCoupons + posValidateCoupon + posCreateOrder |
| Per-customer limit (phone order) | ✅ | posValidateCoupon + posCreateOrder |
| Per-customer limit (walk-in, no identity) | ⚠️ Only global limit | Documented limitation |
| One coupon per order | ✅ | posCreateOrder (comma-separated → 400) |
| coupon_code written to Order | ✅ | posCreateOrder |
| usage_count incremented server-side | ✅ | posCreateOrder (after order persisted) |
| Manual discount remains separate | ✅ | posApplyDiscount / POSDiscountPanel (unchanged) |
| Coupon + manual discount mutually exclusive | ✅ NEW | posCreateOrder (400), posValidateCoupon (valid=false), UI blocks |

### POS vs online checkout: differences

| Aspect | Online checkout | POS |
|---|---|---|
| Auth identity | `created_by` (platform-set) or guest phone/email | Staff user auth; customer identity optional |
| Per-customer coupon limit | Enforced: auth = `created_by`; guest = phone+email dual signal | Enforced when phone/email captured (phone orders); walk-in has no identity |
| Velocity throttle (coupon abuse) | ✅ guest phone throttle (3/hr) | ❌ N/A — staff-facing, not public endpoint |
| usage_count increment | posCreateOrder / verifyAndCreateOrder (both server-side) | posCreateOrder (server-side) |
| Audit | verifyAndCreateOrder console log | posCreateOrder console log |

### Walk-in POS identity limitation (accepted)

For counter walk-in orders where no customer phone or email is captured:
- **Per-customer coupon limits cannot be enforced** — there is no identity to query against
- Only the **global `usage_limit`** acts as a hard cap
- This is an accepted, documented limitation. The mitigation is to set `usage_limit` on coupons that need hard caps.
- If a restaurant captures customer phone (e.g. loyalty programme integration), per-customer limits will apply automatically.

---

---

## Offline POS Mode

**Last reviewed: 2026-03-26**

Offline POS orders currently **bypass all real-time validation** during local creation. To prevent offline mode from becoming a compliance loophole, the following hardening has been implemented:

### Offline Policy (Hardened)

| Action | Offline | Enforcement | Audit Trail |
|---|---|---|---|
| Full-price order | ✅ Allowed | UI allows; syncs directly | offline_created=true |
| Manual discount | ❌ Blocked (safest) or ⚠️ Capped+flagged | UI disabled; if allowed, max £10 admin-only, capped on sync | needs_review=true on sync if applied |
| Coupon application | ❌ Blocked entirely | Coupon dialog disabled; message shown | N/A — not allowed offline |
| Coupon limit enforcement | ✅ Re-validated on sync | Sync calls `syncOfflineOrder` which re-validates all coupon rules | sync_validation_notes populated |
| Discount threshold cap | ✅ Re-validated on sync | Manager ≤20%/£20 enforced on sync, not offline | needs_review=true if capped |
| Menu price recompute | ✅ Re-validated on sync | Prices re-fetched from live menu on sync | order.items.price updated |

### Offline Safe Actions

- ✅ Create full-price orders
- ✅ Record cash/card payment
- ✅ Update existing order statuses (preparing, ready, etc.)
- ✅ Capture customer details (phone, name, address)

### Offline Blocked Actions

- ❌ Apply coupons (requires real-time limit validation)
- ❌ Apply manual discounts (manager threshold cannot be enforced offline)
- ❌ Edit menu prices
- ❌ Approve refunds

### Offline Metadata & Audit

Every offline-originated order is recorded with:
- `offline_created: true` — identifies offline source
- `offline_created_at` — local creation timestamp
- `offline_synced_at` — server sync timestamp
- `needs_review: boolean` — flagged if sync revalidation found issues
- `sync_validation_notes: string` — audit details (e.g., "discount capped from £50 to £20")

### Sync Revalidation (New: `syncOfflineOrder`)

When an offline order syncs, `syncOfflineOrder` function re-validates:
1. **Discount:** Manager threshold enforced; reason code required; invalid discount zeroed
2. **Coupon:** All checks re-run (active, date range, minimum spend, global limit, per-customer limit)
3. **Prices:** Items re-priced from live menu database
4. **Mutual exclusion:** Coupon and discount enforced as exclusive
5. **Result:** If any validation fails, order marked `needs_review=true` with detailed notes

Orders that fail validation are **never auto-adjusted**; staff receive a clear audit trail and must manually review or approve.

### Why Coupons Are Blocked Offline

- Cannot verify real-time coupon limits (global usage_limit, per_customer_limit) without server round-trip
- Cannot enforce coupon usage_count increment atomically
- Cannot prevent double-redemption within the offline window
- **Simplest safe policy:** block entirely offline; enforce on sync

### Known Offline Limitations (Documented)

| Limitation | Mitigation |
|---|---|
| Cannot enforce manager discount threshold offline | Sync re-validates; order flagged if exceeded |
| Cannot verify coupon per-customer limit offline | Sync re-validates; coupon rejected if limit exceeded |
| Cannot sync if menu prices have changed | Sync re-prices items from live menu; total recalculated |
| Cannot sync if coupon became inactive | Sync re-validates coupon status; rejected if inactive |
| Manager cannot see live order count offline | Cache order count before going offline; update on reconnect |

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
| Guest coupon dual-signal (email+phone) | ✅ NEW — both queried independently, MAX taken |
| Guest phone coupon abuse throttle | ✅ NEW — ≥3 coupon orders/hr per phone → 429 |
| Guest phone velocity burst | ✅ NEW — 5 orders/60s per normalised phone in throttle |
| Email normalisation (guest) | ✅ NEW — lowercase+trim before all comparisons |
| Phone normalisation (guest) | ✅ NEW — digits-only, 07→447, consistent across formats |
| Guest dual-signal full evasion (rotate both) | ❌ Accepted limitation — no strong identity anchor available |
| POS coupon date range / expiry enforcement | ✅ NEW — posGetCoupons + posValidateCoupon + posCreateOrder |
| POS coupon restaurant scope enforcement | ✅ NEW — posGetCoupons + posValidateCoupon + posCreateOrder |
| POS coupon minimum spend enforcement | ✅ NEW — posValidateCoupon + posCreateOrder |
| POS global usage_limit enforcement | ✅ NEW — all three layers |
| POS per-customer limit (phone orders) | ✅ NEW — posValidateCoupon + posCreateOrder |
| POS per-customer limit (walk-in, no identity) | ❌ Accepted — no customer identity; global limit applies |
| POS coupon_code written to Order | ✅ NEW — was never written; now written by posCreateOrder |
| POS usage_count increment (server-side) | ✅ NEW — was client-side / missing; now in posCreateOrder |
| POS one-coupon-per-order enforcement | ✅ NEW — posCreateOrder rejects comma-separated codes |
| POS manual discount path separation | ✅ Unchanged — posApplyDiscount / POSDiscountPanel |
| POS coupon + manual discount mutual exclusion | ✅ NEW — posCreateOrder 400, posValidateCoupon valid=false, UI blocks |
| POS order record distinguishes coupon vs manual discount | ✅ NEW — coupon_code XOR discount_reason_code written; audit log shows discount_source |