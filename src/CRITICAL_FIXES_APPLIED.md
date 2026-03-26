# Critical Security Fixes Applied
**Date:** 2026-03-23 (updated 2026-03-26)
**Status:** ✅ IMPLEMENTED

---

## 🔴 VULNERABILITY 1: Per-User Coupon Limits
**Severity:** CRITICAL
**Status:** ✅ FIXED

### What Was Fixed
Added `per_customer_limit` field to Coupon entity (default: 1)

**Implementation**
1. **Entity Schema Update** — Added `per_customer_limit` to Coupon.json
2. **Validation Logic** — Updated `validateCouponUsage` to check per-user limit
3. **Code:**
```javascript
// functions/validateCouponUsage
if (coupon.per_customer_limit && coupon.per_customer_limit > 0) {
  const userOrders = await base44.asServiceRole.entities.Order.filter({
    created_by: user.email,
    coupon_codes: { $includes: coupon.code }
  });
  if (userOrders.length >= coupon.per_customer_limit) {
    return { valid: false, error: 'Usage limit reached' };
  }
}
```

**Impact:**
- ✅ Single user cannot drain entire coupon budget
- ✅ Backward compatible (default: 1 use per customer)

---

## 🔴 VULNERABILITY 2: Order Velocity Throttling
**Severity:** CRITICAL
**Status:** ✅ FIXED

### What Was Fixed
Added `orderVelocityThrottle` backend function (replaces the previously misnamed `ipBasedRateLimiting`).

### What This Actually Does
This function enforces **three distinct controls** using data that genuinely exists in the system:

| Control | Signal Used | Threshold | Window |
|---------|-------------|-----------|--------|
| Per-user burst limit | `user.email` / `guest_email` | 5 orders | 60 seconds |
| Platform-wide circuit breaker | All orders (global count) | 30 orders | 60 seconds |
| Duplicate basket guard | Email + restaurant + item fingerprint | 1 duplicate | 90 seconds |

### What This Does NOT Do
**True per-IP rate limiting is not implemented.**

The `Order` entity does not store client IP addresses. Filtering recent orders by IP is therefore
not possible at the application layer. The IP is visible in request headers at function invocation
time, but there is no historical record to check against.

To add real per-IP controls, one of the following is required:
- Store `client_ip` on the Order entity at creation time, OR
- Enforce rate limits upstream at the CDN/reverse proxy layer (e.g. Cloudflare Rate Limiting rules)

### Code
```javascript
// functions/orderVelocityThrottle
// 1. Per-user: max 5 orders/min using user.email
// 2. Platform: max 30 orders/min globally (circuit breaker)
// 3. Duplicate basket: fingerprint(restaurant + sorted items) within 90s
```

**Impact:**
- ✅ Accidental double-submit → BLOCKED by basket fingerprint guard
- ✅ Single-account burst → BLOCKED after 5 orders/min
- ✅ Sudden platform-wide spike → BLOCKED at 30 orders/min (circuit breaker)
- ⚠️ Account farm (100 fake accounts) → Partially mitigated by platform circuit breaker;
  full per-IP defense requires platform-layer support

---

## 🔴 VULNERABILITY 3: No Phone Verification
**Severity:** HIGH
**Status:** ✅ FIXED

Added SMS OTP phone verification via `verifyPhoneOTP` backend function.

- 6-digit OTP, 10-minute expiry
- Twilio integration (secrets configured)
- Phone saved only after successful verification

---

## 🔴 VULNERABILITY 4: Account Creation Rate Limiting
**Severity:** CRITICAL
**Status:** ⚠️ PLATFORM LIMITATION — Cannot implement in app layer

Base44 manages authentication. Custom rate limiting on the signup endpoint is not possible
without platform-level configuration. Request this from Base44 support if needed.

---

## 🔴 VULNERABILITY 5: Brute Force Login Protection
**Severity:** CRITICAL
**Status:** ⚠️ PLATFORM LIMITATION — Cannot implement in app layer

Base44 SDK manages authentication. The app cannot intercept login attempts or enforce
lockout logic. This must be configured at the platform level.

---

## 📋 FIXES STATUS SUMMARY

| Vulnerability | Fix Type | Status | Signal Used |
|---------------|----------|--------|-------------|
| Per-user coupon limits | ✅ App code | IMPLEMENTED | user.email |
| Order velocity throttling | ✅ App code | IMPLEMENTED | email + basket fingerprint |
| Phone verification | ✅ App code | IMPLEMENTED | Twilio OTP |
| Account creation limiting | ⏳ Platform | REQUEST PENDING | N/A (platform layer) |
| Brute force protection | ⏳ Platform | REQUEST PENDING | N/A (platform layer) |

---

## 🧪 TESTING CHECKLIST

### Test 1: Per-User Coupon Limit
```
[ ] Create coupon with per_customer_limit: 2
[ ] User applies coupon once → SUCCESS
[ ] User applies coupon twice → SUCCESS
[ ] User applies coupon third time → BLOCKED
```

### Test 2: Order Velocity — Per-User Burst
```
[ ] Place 5 orders in under 60 seconds (same account) → 5th succeeds
[ ] Place 6th order → BLOCKED with 429 + Retry-After header
[ ] Wait 60 seconds → next order succeeds
```

### Test 3: Order Velocity — Duplicate Basket Guard
```
[ ] Place order for restaurant X with items A+B
[ ] Immediately re-submit identical basket to restaurant X → BLOCKED (duplicate)
[ ] Wait 90 seconds → identical basket accepted again
```

### Test 4: Phone Verification
```
[ ] Click "Verify Phone" → OTP sent via SMS
[ ] Enter wrong code → REJECTED
[ ] Enter correct code → VERIFIED
[ ] Verify phone_verified flag set in user profile
``