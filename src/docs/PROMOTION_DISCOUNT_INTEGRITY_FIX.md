# Promotion Discount Integrity Fix

## Problem

**High-Risk Security Gap**: Promotion discounts were client-supplied and only capped, not verified server-side.

An attacker could:
- Claim a promotion exists when it doesn't
- Claim arbitrary discount amounts (£999+ discounts on £50 orders)
- Bypass usage limits (claimed promotions that had been exhausted)
- Skip date validation (use expired/future promotions)

**Root Cause**: `verifyAndCreateOrder` only applied `Math.min(clientDiscount, subtotal * 0.5)` — a sanity cap, not validation.

---

## Solution

**Move validation fully server-side**:

### 1. New Backend Function: `validateAndApplyPromotion`

**File**: `functions/validateAndApplyPromotion`

**Security checks**:
- ✅ Fetch promotion record by ID (must exist)
- ✅ Verify `is_active = true`
- ✅ Check date range: `start_date ≤ now ≤ end_date`
- ✅ Verify restaurant scope (promotion belongs to order's restaurant)
- ✅ Check global usage limit: `usage_count < usage_limit`
- ✅ Validate minimum order threshold (if applicable)
- ✅ **Compute discount server-side** (never trust client amount)
- ✅ Cap discount at 50% of subtotal (global policy)

**Input**: `{ promotion_id, restaurant_id, server_subtotal, delivery_fee }`

**Output**: `{ valid: true, discount, promotion }` or `{ valid: false, error }`

---

### 2. Updated `verifyAndCreateOrder`

**Logic flow**:

```
if (coupon_codes present):
  → Validate coupons (existing path, unchanged)
else if (applied_promotion_id present):
  → Call validateAndApplyPromotion (NEW)
  → Use returned discount if valid
  → Reject order if validation fails
else:
  → No discount
```

**Key change**: Line 490-492 replaced with server-side validation block.

---

## Files Changed

| File | Change | Purpose |
|------|--------|---------|
| `functions/validateAndApplyPromotion` | **NEW** | Server-side promotion validation & discount computation |
| `functions/verifyAndCreateOrder` | **UPDATED** | Call validateAndApplyPromotion instead of trusting clientDiscount |
| `scripts/smoke/suites/promotionDiscountIntegrity.smoke.js` | **NEW** | 6 comprehensive integrity tests |
| `scripts/smoke/run-smoke.js` | **UPDATED** | Register new smoke test suite |

---

## Tests Added

**File**: `scripts/smoke/suites/promotionDiscountIntegrity.smoke.js`

**6 Smoke Tests**:

1. ✅ **Valid active promotion accepted** — discount computed from promotion record
2. ✅ **Fake promotion ID rejected** — non-existent promotions return 400
3. ✅ **Client-supplied discount ignored** — server computes, not client value
4. ✅ **Inactive promotion rejected** — `is_active=false` blocked
5. ✅ **Below minimum rejected** — minimum order thresholds enforced
6. ✅ **Promotion + coupon cap enforced** — 50% subtotal cap always applies

**Run test**:
```bash
node scripts/smoke/run-smoke.js --only promotionDiscountIntegrity
```

---

## Security Invariants

| Invariant | Enforcement |
|-----------|------------|
| **No fake promotions** | Promotion must exist in DB with matching ID |
| **No inactive promotions** | `is_active=true` required |
| **No expired promotions** | Date range checked server-side |
| **No overused promotions** | `usage_count < usage_limit` enforced |
| **No minimum bypass** | Minimum order validated before discount |
| **No arbitrary discounts** | Server computes from promotion record, never trusts client |
| **Max discount cap** | Capped at 50% of subtotal globally |
| **Combined policy** | Promotions + coupons both respect 50% cap |

---

## Workflow (Frontend to Backend)

### Before (Unsafe)
```
Frontend:
  1. Fetch promotions
  2. Calculate discount locally (20% of subtotal)
  3. Apply discount to cart total (client-supplied)
  
Backend:
  1. Trust discount amount from orderData
  2. Apply sanity cap: Math.min(discount, subtotal * 0.5)
  3. Create order
  
RISK: Attacker claims £999 discount, gets Math.min(999, 25) = £25 (only capped, not validated)
```

### After (Secure)
```
Frontend:
  1. Fetch active promotions
  2. Show to user
  3. Send promotion_id in orderData (NOT discount amount)
  
Backend verifyAndCreateOrder:
  1. If promotion_id present:
     → Call validateAndApplyPromotion(id, restaurant, subtotal)
     → Returns { valid, discount } (server-computed)
     → If valid → use returned discount
     → If invalid → reject order
  2. If no promotion_id → no discount
  
SECURE: Attacker sends fake promo ID → validation fails → order rejected
```

---

## Backward Compatibility

**Frontend changes needed**:
- Stop sending `discount` amount from promotions
- Send `applied_promotion_id` instead (just the ID)
- Let backend compute the actual discount

**Legacy orders**: Existing orders without promotion_id work fine (no discount applied).

---

## Key Attack Vectors Blocked

| Attack | Prevention |
|--------|-----------|
| Fake promo ID | Must exist in DB |
| Expired promo | Date validation server-side |
| Exhausted promo | `usage_count < usage_limit` check |
| Arbitrary amount | Server computes from promo record |
| Wrong restaurant | `restaurant_id` scope check |
| Inactive promo | `is_active=true` required |
| Over 50% discount | Cap enforced on all discounts |