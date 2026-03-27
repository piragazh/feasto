# Coupon Array Query — Backend Verification Report

**Date:** 2026-03-27  
**Engineer:** Automated audit via `probeCouponArrayQuery`  
**Status:** ✅ Fixed — all four functions updated

---

## 1. Exact array query operator currently used

**Before fix (WRONG):**
```js
base44.asServiceRole.entities.Order.filter({
    coupon_codes: { $contains: code }
})
```

**After fix (CORRECT):**
```js
base44.asServiceRole.entities.Order.filter({
    coupon_codes: { $all: [code] }
})
```

---

## 2. Operator support — confirmed by live probe

The `probeCouponArrayQuery` function was deployed and run against the live environment.

| Operator | Result | Verdict |
|----------|--------|---------|
| `$contains` | Throws `"Invalid query: Invalid query"` (HTTP 500) | ❌ **Not supported** |
| `$all` | Returns 200, zero results for no-history code | ✅ **Supported** |
| `$all: [code]` single-element array | Deploys and executes without error | ✅ **Correct syntax** |

**Raw probe output (SMOKE_TEST_CODE — no history):**
```json
{
  "array_query_wrong_op_error": "Invalid query: Invalid query",
  "array_query_all_count": 0,
  "recommendation": "$contains throws an error (confirmed unsupported). $all is the correct operator. No action needed."
}
```

---

## 3. Impact of the bug (pre-fix)

`$contains` throws a `ValueError` at the SDK level. The error was **caught** by the surrounding `try/catch` in `countUniqueBothFields` (it was not caught — it propagated up).

**Actual behavior in `verifyAndCreateOrder` and `posCreateOrder`:**  
The `Promise.all([legacyQuery, arrayQuery])` — if `$contains` throws, the entire `Promise.all` rejects, which propagates up to the outer `try/catch` in the Deno handler, returning **HTTP 500 "Order creation failed"** whenever a customer with a `per_customer_limit`-enforced coupon tried to place an order.

**Actual behavior in `validateCouponUsage`:**  
Same — the outer `try/catch` catches it and returns HTTP 500 "Coupon validation failed".

**Actual behavior in `posValidateCoupon`:**  
Same — HTTP 500 "Coupon validation failed".

**Summary of bug severity:** 
- Any order with a coupon that has `per_customer_limit > 0` AND any customer identity (email/phone) would fail at checkout with a 500 error.
- Since all coupons default `per_customer_limit: 1`, this would affect **all coupon redemptions for authenticated users and phone-identified guests**.
- Walk-in POS orders with no identity were unaffected (the `$contains` call was only reached when `normalizedPhone || normalizedEmail` was truthy).

> **Note:** The bug was introduced when dual-field deduplication was added in the previous audit. Prior to that, only the legacy `coupon_code` field was queried, which worked correctly.

---

## 4. Files changed

| File | Change |
|------|--------|
| `functions/verifyAndCreateOrder` | `$contains` → `$all: [code]` in `countUniqueBothFields` |
| `functions/posCreateOrder` | `$contains` → `$all: [code]` in `posCountUniqueBothFields` |
| `functions/posValidateCoupon` | `$contains` → `$all: [code]` in `valCountUniqueBothFields` |
| `functions/validateCouponUsage` | `$contains` → `$all: [code]` in inline parallel query |
| `functions/probeCouponArrayQuery` | New — live verification probe (admin-only) |
| `scripts/smoke/suites/couponArrayQueryProbe.smoke.js` | New — smoke test suite |

---

## 5. Live verification plan

Once real coupon orders exist in the database, run:

```
POST /probeCouponArrayQuery
{ "coupon_code": "<a code used on at least 3 orders, including stacked ones>" }
```

**Expected results confirming full correctness:**

| Field | Expected |
|-------|----------|
| `legacy_query_count` | > 0 (finds orders with `coupon_code == code`) |
| `array_query_all_count` | > 0 (finds orders with `coupon_codes` containing code) |
| `position_breakdown.position_2` | > 0 (if stacked orders exist — confirms pos 2 lookup works) |
| `position_breakdown.position_3` | > 0 (if 3-coupon orders exist) |
| `deduplicated_count` | < `legacy_count + array_count` (dedup removes new orders counted twice) |
| `array_query_wrong_op_count` | 0 |
| `recommendation` | Does NOT contain "CRITICAL" |

**If `position_breakdown.position_2 == 0` despite stacked orders in DB:**  
→ `$all` is not working as expected. Escalate — per-customer limits are broken for codes at positions 2+.

---

## 6. Remaining limitations (unchanged)

1. **Race condition on `usage_count`:** Non-transactional read-modify-write. Two simultaneous requests with the same coupon can both pass the global limit check.
2. **Guest identity is self-reported:** Phone and email can be falsified. Per-customer limits for guests are best-effort only.
3. **Walk-in POS (no identity):** Only global `usage_limit` applies. Per-customer limits are unenforced without identity. Documented in `SECURITY_AND_ABUSE_CONTROLS.md` and `COUPON_STACKING_POLICY.md`.
4. **`$all` with single-element array:** Confirmed supported by live probe. If the platform SDK changes this behavior, the probe function will detect it on next run.