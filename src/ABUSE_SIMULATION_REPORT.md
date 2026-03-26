# Security Abuse Simulation Report
**Date:** 2026-03-23 (updated 2026-03-26)
**Scope:** Fake accounts, coupon abuse, spam orders, brute force login
**Status:** ⚠️ Some gaps remain — see per-section status

---

## 🔴 TEST 1: FAKE ACCOUNT CREATION

### Current Protections
| Layer | Status | Finding |
|-------|--------|---------|
| Duplicate Email Prevention | ✅ YES | Base44 SDK prevents duplicate emails |
| Account Abuse Monitoring | ❌ PLATFORM LIMIT | Signup rate limiting not possible in app layer |
| Phone Verification | ✅ ADDED | OTP via Twilio (`verifyPhoneOTP`) |
| CAPTCHA on Signup | ❌ PLATFORM LIMIT | Auth is managed by Base44 |

### Status
**PARTIALLY MITIGATED** — Phone verification now required for sensitive features.
Full account creation rate limiting requires platform-level (Base44) configuration.

---

## 🔴 TEST 2: COUPON ABUSE

### Current Protections

#### ✅ Server-Side Validation
Global usage limits, expiry dates, restaurant scope — all enforced server-side in
`validateCouponUsage` and `verifyAndCreateOrder`. No client-side bypass possible.

#### ✅ Per-User Limits (FIXED)
`per_customer_limit` is now enforced per authenticated user email.

#### ⚠️ Race Condition on usage_count
Between validation and DB write, a concurrent request could overshoot the global limit by 1-2 uses.
Severity: LOW (requires exact timing, results in 1-2 overage uses at most).

### Status: 🟢 SUBSTANTIALLY MITIGATED

---

## 🔴 TEST 3: SPAM ORDERS

### Current Protections (via `orderVelocityThrottle`)

#### ✅ Per-User Burst Limit
Max 5 orders per 60 seconds per authenticated user (by `user.email` or `guest_email`).

#### ✅ Platform-Wide Circuit Breaker
Max 30 orders per 60 seconds across the entire platform. Trips on sudden spikes regardless of
how many accounts are involved.

#### ✅ Duplicate Basket Guard
Identical basket (same restaurant + same items + same quantities) to the same user is blocked
within a 90-second window. Catches accidental double-taps and aggressive frontend retries.

#### ❌ True Per-IP Rate Limiting — NOT IMPLEMENTED
The `Order` entity does not store client IP addresses. While the IP is available in request headers
at invocation time, there is no historical record to query against. Filtering "orders from this IP"
is therefore not possible at the application layer.

**What an account farm attack looks like today:**
```
Attacker Account 1: 5 orders/min → blocked after 5
Attacker Account 2: 5 orders/min → blocked after 5
...×30 accounts = platform circuit breaker trips at 30 total orders/min
```
The platform circuit breaker provides a safety net, but is a blunt instrument.

**To add true per-IP controls, choose one of:**
1. Store `client_ip` on the Order entity at creation time (requires entity schema change)
2. Enforce rate limits upstream at CDN/reverse proxy (e.g. Cloudflare Rate Limiting rules)

### Status: 🟡 IMPROVED — platform circuit breaker + per-user + duplicate guard in place.
True per-IP protection requires platform-layer support.

---

## 🔴 TEST 4: BRUTE FORCE LOGIN

### Current Status: ❌ PLATFORM LIMITATION
Base44 SDK manages authentication. The app cannot intercept login attempts, track failed
attempts, or enforce lockout logic. This must be configured at the platform level.

No app-layer implementation is possible or appropriate here.

---

## 🟡 TEST 5: PROMOTION ABUSE

### Current Protection
```javascript
// verifyAndCreateOrder:
verifiedDiscount = Math.min(clientDiscount, serverSubtotal * 0.5);
// Caps promotions to 50% as sanity check
```

No per-order promotion stacking limits beyond the 50% cap. Acceptable for current scope.

---

## 📊 CURRENT STATUS SUMMARY

| Attack Vector | Status | Mechanism |
|---------------|--------|-----------|
| Coupon fraud (per-user) | 🟢 BLOCKED | `per_customer_limit` in `validateCouponUsage` |
| Duplicate order submit | 🟢 BLOCKED | Basket fingerprint in `orderVelocityThrottle` |
| Per-user order burst | 🟢 BLOCKED | 5 orders/min limit in `orderVelocityThrottle` |
| Platform-wide spike | 🟢 BLOCKED | 30 orders/min circuit breaker |
| Account farm (per-IP) | ⚠️ PARTIAL | Circuit breaker helps; no true per-IP control |
| Brute force login | ❌ PLATFORM | Base44 manages auth — not app-controllable |
| Account creation flood | ❌ PLATFORM | Base44 manages signup — not app-controllable |
| Fake phone orders | 🟢 BLOCKED | OTP verification via `verifyPhoneOTP` |

---

## 📝 Testing Checklist

Run these security tests monthly:

- [ ] Apply single coupon 5 times with same account → blocked after per_customer_limit
- [ ] Place 6 orders in 60 seconds (same account) → 6th blocked with 429
- [ ] Submit identical basket twice within 90s → 2nd blocked as duplicate
- [ ] Verify platform circuit breaker trips at 30 orders/min
- [ ] Verify no code references `ipBasedRateLimiting` (renamed/removed)
- [ ] Verify `orderVelocityThrottle` called from `verifyAndCreateOrder`
- [ ] Confirm Retry-After header present in all 429 responses