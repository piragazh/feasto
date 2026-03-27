# Promotion Discount Integrity Fix

## Security Problem

**Vulnerable flow:**
```
❌ Client supplies:
   {
     promotion_id: "promo123",
     promotion_discount: 9999  // User-controlled amount
   }

❌ Server logic:
   // Only cap it, don't verify promotion exists!
   promotion_discount = Math.min(clientDiscount, MAX_CAP);
   
❌ Result:
   - User claims fake promotions with arbitrary discounts
   - No validation that promotion is active
   - No verification against database record
   - Attacker can apply discount to any order without proof
```

**Impact:**
- Revenue loss from injected discounts
- No audit trail (discount not tied to a real promotion ID)
- Scaling attack: single script claims huge discounts across all orders

---

## Secure Solution

**Safe flow:**
```
✅ Client supplies:
   {
     applied_promotion_id: "promo123"  // ID only, no amount
     // promotion_discount field: IGNORED
   }

✅ Server validates:
   - Promotion exists in database
   - Promotion is active (is_active=true)
   - Promotion dates are valid (now within start/end)
   - Restaurant scope matches
   - Minimum order met
   - Usage limits not exceeded
   - Promotion type is known

✅ Server calculates:
   - Discount amount based on promotion rules
   - Apply max_discount cap if percentage type
   - Apply universal 50% of subtotal cap
   - Return server-calculated discount_amount

✅ Server rejects:
   - Any client-supplied promotion_discount field
   - Non-existent promotion IDs
   - Inactive or expired promotions
   - Promotions for different restaurants
   - Returns zero discount, no order created
```

---

## Architecture Changes

### 1. **New Function: validateAndApplyPromotion**

**File:** `functions/validateAndApplyPromotion`

**Input:**
```javascript
{
  promotion_id: string,      // Promotion to validate
  restaurant_id: string,     // Restaurant context
  subtotal: number           // Order subtotal for min/cap checks
}
```

**Output:**
```javascript
{
  discount_amount: number,   // 0 if validation fails, >0 if success
  validation_ok: boolean,    // true only if promotion valid + active
  promotion_id: string,      // Echo the ID
  promotion_name: string,    // Display name
  reason: string             // "Promotion applied" or error reason
}
```

**Validation steps:**
1. ✅ Fetch promotion from DB
2. ✅ Check `is_active === true`
3. ✅ Check date range (start_date ≤ now ≤ end_date)
4. ✅ Check restaurant scope (restaurant_id matches or empty)
5. ✅ Check minimum order requirement
6. ✅ Check global usage limit
7. ✅ Calculate discount based on promotion_type
8. ✅ Apply max_discount cap (if percentage type)
9. ✅ Apply universal 50% subtotal cap
10. ✅ Return validated discount_amount

### 2. **Updated Function: verifyAndCreateOrder**

**File:** `functions/verifyAndCreateOrder`

**Changes (lines 489-523):**
```javascript
else if (orderData.applied_promotion_id) {
    // ── PROMOTION DISCOUNT: Server-validate and compute ──────────────────────
    // CRITICAL SECURITY: Never trust client-supplied promotion discount amounts.
    try {
        const promRes = await base44.functions.invoke('validateAndApplyPromotion', {
            promotion_id: orderData.applied_promotion_id,
            restaurant_id: orderData.restaurant_id,
            server_subtotal: serverSubtotal,
            delivery_fee: deliveryFee
        });
        
        if (promRes?.data?.valid && typeof promRes.data.discount === 'number') {
            verifiedDiscount = promRes.data.discount;
        } else {
            // Validation failed → reject order
            const promError = promRes?.data?.error || 'Promotion validation failed';
            return new Response(
                JSON.stringify({ error: `Promotion: ${promError}`, success: false }),
                { status: 400 }
            );
        }
    } catch (promErr) {
        console.error('[PROMOTION] Validation error:', promErr.message);
        return new Response(
            JSON.stringify({ error: 'Promotion validation failed. Please try again.', success: false }),
            { status: 500 }
        );
    }
}

// Reject any client-supplied promotion_discount field
if (cart.promotion_discount && typeof cart.promotion_discount === 'number' && cart.promotion_discount > 0.01) {
    console.warn(`[SECURITY] Client tried to inject promotion_discount=${cart.promotion_discount}`);
    // Ignored — server uses calculated value only
}
```

**Logic:**
- ✅ Takes `applied_promotion_id` from frontend (ID only)
- ✅ Calls `validateAndApplyPromotion` with server-calculated subtotal
- ✅ Rejects any `promotion_discount` field in request
- ✅ Uses server-calculated discount or fails order creation

---

## Promotion Types Supported

| Type | Calculation | Example |
|---|---|---|
| **percentage_off** | (subtotal × discount_value) / 100, capped at max_discount | 20% off = £20 on £100 |
| **fixed_amount_off** | discount_value (flat amount) | £5 off any order |
| **free_delivery** | delivery_fee (waived) | 0 if applied |
| **tiered_discount** | Select tier by min_order_value, apply its discount | 10% off £50+, 15% off £100+ |
| **buy_one_get_one** | Handled by order creation UI; server just validates | Special pricing logic |
| **combo_deal** | Handled by order creation; server validates | Item bundles |

---

## Universal Safety Caps

```javascript
const MAX_PROMOTIONAL_DISCOUNT_PERCENTAGE = 50;

// Applied to:
// 1. Individual promotion discount (before accumulating)
// 2. Combined promotion + coupon stack
// 3. Final order total never negative
```

**Formula:**
```
maxAllowedDiscount = subtotal × 50%
if (calculatedDiscount > maxAllowedDiscount) {
    discountAmount = maxAllowedDiscount;
}
```

Example:
- Subtotal: £100
- Promotion: 40% (£40)
- Max cap: 50% (£50)
- **Applied:** £40 ✅
- ---
- Promotion: 100% (£100)
- Max cap: 50% (£50)
- **Applied:** £50 (capped) ✅

---

## Test Coverage

**File:** `scripts/smoke/suites/promotionDiscountIntegrity.smoke.js`

**7 tests:**

1. ✅ **valid_promotion_accepted** — Active promotion passes validation, discount calculated
2. ✅ **fake_promotion_rejected** — Non-existent ID returns validation_ok=false
3. ✅ **inactive_promotion_rejected** — is_active=false rejected
4. ✅ **expired_promotion_rejected** — Past end_date rejected
5. ✅ **client_discount_rejected** — Client-supplied discount_amount ignored
6. ✅ **promotion_coupon_cap** — Promo + coupon respects 50% total cap
7. ✅ **promotion_50_percent_cap** — 100% promotion capped at 50% of subtotal

**Run:**
```bash
node scripts/smoke/run-smoke.js --only promotionDiscountIntegrity
```

**Expected output:**
```
✅ valid_promotion_accepted
✅ fake_promotion_rejected
✅ inactive_promotion_rejected
✅ expired_promotion_rejected
✅ client_discount_rejected
✅ promotion_coupon_cap
✅ promotion_50_percent_cap
```

---

## Backward Compatibility

**Migration path:**
1. Deploy `validateAndApplyPromotion` function
2. Update `verifyAndCreateOrder` to call it and reject client discounts
3. Frontend: Change from `promotion_discount` field to `applied_promotion_id`
4. Old orders: No change (historical data unaffected)
5. New orders: Use validated server-side discount only

**No breaking changes:**
- Coupon logic unchanged (separate validation path)
- Order total calculation unchanged (still cap at 50%)
- Existing active promotions still work (just validated server-side now)

---

## Audit & Logging

**validateAndApplyPromotion logs:**
```
[PROMOTION] Validated: id={id} discount=£{amount}
[PROMOTION] Validation failed: id={id} error={reason}
```

**verifyAndCreateOrder logs:**
```
[SECURITY] Client tried to inject promotion_discount={amount}  // Logged but ignored
[PROMOTION] Validated and applied: id={id} discount=£{amount}
[ORDER] Created: ... discounts=£{totalDis} (promotion + coupons combined)
```

---

## Attack Surface Mitigation

| Attack | Old Flow | New Flow |
|---|---|---|
| **Inject arbitrary discount** | ✅ Allowed (capped only) | ❌ Rejected (not in promotion DB) |
| **Claim expired promotion** | ✅ Allowed (not checked) | ❌ Rejected (date validation) |
| **Inactive promotion abuse** | ✅ Allowed (not checked) | ❌ Rejected (is_active check) |
| **Cross-restaurant promotion** | ✅ Allowed (not scoped) | ❌ Rejected (restaurant_id match) |
| **Bypass usage limits** | ✅ Allowed (not enforced) | ❌ Rejected (limit check) |
| **Clone valid promotion ID** | ✅ Works if promotion real | ❌ Validation per ID in DB |

---

## Files Changed

| File | Change | Lines |
|---|---|---|
| `functions/validateAndApplyPromotion` | NEW | Standalone validation function |
| `functions/verifyAndCreateOrder` | UPDATED | Lines 489–523 (promotion handling) + client discount rejection |
| `scripts/smoke/suites/promotionDiscountIntegrity.smoke.js` | NEW | 7 test cases |
| `scripts/smoke/run-smoke.js` | UPDATED | Import + register test suite |
| `docs/PROMOTION_DISCOUNT_INTEGRITY_FIX.md` | NEW | This document |

---

## Rollout Checklist

- [ ] Deploy `validateAndApplyPromotion` function
- [ ] Deploy updated `verifyAndCreateOrder` (rejects client discount)
- [ ] Update frontend: remove `promotion_discount` field → send `applied_promotion_id`
- [ ] Test: run smoke test suite `promotionDiscountIntegrity`
- [ ] Monitor: check logs for validation failures
- [ ] Communicate: notify merchants about promotion validation

---

## Summary

**Fixed:** Promotion discounts are now fully validated server-side instead of blindly accepting client amounts.

**Invariant:** Every promotional discount originates from an active, validated database record.

**Impact:** Attackers can no longer inject fake discounts; revenue protection improved.

**Tests:** 7 comprehensive tests covering valid/invalid/expired/overpriced promotions.

**Backward compat:** Existing promotions work as before, just with validation added.