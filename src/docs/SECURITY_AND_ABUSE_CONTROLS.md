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