# Promotion Discount: Before & After

## BEFORE (Unsafe)

### Frontend Flow
```javascript
// User selects promotion and enters quantity
const orderData = {
  restaurant_id: 'rest_123',
  items: [...],
  subtotal: 100,
  promotion_discount: 50,  // ❌ CLIENT CALCULATES
  total: 150               // subtotal + delivery - promotion
};

// Send to server
await fetch('/api/functions/verifyAndCreateOrder', {
  method: 'POST',
  body: JSON.stringify({ orderData, paymentIntentId })
});
```

### Backend Logic (OLD)
```javascript
// functions/verifyAndCreateOrder (OLD)

// ❌ Only cap it, don't verify!
let promotion_discount = orderData.promotion_discount || 0;
const maxDiscount = (subtotal * 50) / 100;
if (promotion_discount > maxDiscount) {
    promotion_discount = maxDiscount;
}
promotion_discount = Math.max(0, Math.round(promotion_discount * 100) / 100);

// No check if promotion exists!
// No check if promotion is active!
// No check if dates are valid!
// No audit trail linking to a real promotion!
```

### Attack Examples

**Attack 1: Fake discount**
```javascript
{
  subtotal: 100,
  promotion_discount: 999  // Claim £999 discount (capped at £50)
  // Server calculates: min(999, 50) = £50 ✅ Attacker wins!
}
```

**Attack 2: No promotion, claim discount**
```javascript
{
  subtotal: 100,
  promotion_discount: 25  // No promotion_id needed!
  // Server accepts without verifying any promotion exists
}
```

**Attack 3: Expired promotion**
```javascript
{
  promotion_discount: 20  // Old expired promotion amount
  // Server doesn't check if promotion was ever active
}
```

---

## AFTER (Secure)

### Frontend Flow
```javascript
// User selects promotion (from list of ACTIVE ones)
const orderData = {
  restaurant_id: 'rest_123',
  items: [...],
  subtotal: 100,
  applied_promotion_id: 'promo_abc123',  // ✅ ID ONLY
  // NO promotion_discount field!
  // NO client-side calculation!
};

// Send to server
await fetch('/api/functions/verifyAndCreateOrder', {
  method: 'POST',
  body: JSON.stringify({ orderData, paymentIntentId })
});
```

### Backend Logic (NEW)

**Step 1: Validate Promotion**
```javascript
// functions/validateAndApplyPromotion (NEW)

// Input: { promotion_id, restaurant_id, subtotal }

// Fetch from DB
const promotions = await base44.asServiceRole.entities.Promotion.filter({
    id: promotion_id
});

if (!promotions.length) {
    return { validation_ok: false, reason: 'Promotion not found' };
}

const promo = promotions[0];

// ✅ Check active status
if (!promo.is_active) {
    return { validation_ok: false, reason: 'Promotion is inactive' };
}

// ✅ Check date range
if (now < new Date(promo.start_date)) {
    return { validation_ok: false, reason: 'Promotion has not started' };
}
if (now > new Date(promo.end_date)) {
    return { validation_ok: false, reason: 'Promotion has expired' };
}

// ✅ Check restaurant scope
if (promo.restaurant_id && promo.restaurant_id !== restaurant_id) {
    return { validation_ok: false, reason: 'Not valid for this restaurant' };
}

// ✅ Check minimum order
if (promo.minimum_order && subtotal < promo.minimum_order) {
    return { validation_ok: false, reason: 'Minimum not met' };
}

// ✅ Check usage limit
if (promo.usage_limit && promo.usage_count >= promo.usage_limit) {
    return { validation_ok: false, reason: 'Usage limit reached' };
}

// ✅ Calculate discount based on type
let discount = 0;
if (promo.promotion_type === 'percentage_off') {
    discount = (subtotal * promo.discount_value) / 100;
    if (promo.max_discount) {
        discount = Math.min(discount, promo.max_discount);
    }
} else if (promo.promotion_type === 'fixed_amount_off') {
    discount = promo.discount_value;
}

// ✅ Apply universal 50% cap
const maxAllowed = (subtotal * 50) / 100;
discount = Math.min(discount, maxAllowed);

return {
    validation_ok: true,
    discount_amount: discount,  // Server-calculated only
    promotion_id,
    promotion_name: promo.name
};
```

**Step 2: Use in Order Creation**
```javascript
// functions/verifyAndCreateOrder (UPDATED)

else if (orderData.applied_promotion_id) {
    // Call validateAndApplyPromotion
    const promRes = await base44.functions.invoke('validateAndApplyPromotion', {
        promotion_id: orderData.applied_promotion_id,
        restaurant_id: orderData.restaurant_id,
        subtotal: serverSubtotal
    });

    if (promRes?.data?.validation_ok) {
        verifiedDiscount = promRes.data.discount_amount;  // ✅ Use server value
    } else {
        // Validation failed → reject order
        return { error: `Promotion: ${promRes.data.reason}`, success: false };
    }
}

// ❌ Reject any client-supplied promotion_discount field
if (orderData.promotion_discount && orderData.promotion_discount > 0.01) {
    console.warn('[SECURITY] Client tried to inject promotion_discount');
    // IGNORED — server uses calculated value only
}

const serverTotal = serverSubtotal + deliveryFee - verifiedDiscount;
```

### Attack Examples (All Blocked)

**Attack 1: Fake discount**
```javascript
{
  applied_promotion_id: 'fake-promo-123',
  promotion_discount: 999  // Ignored
}
// Result: ❌ Promotion not found → order rejected
```

**Attack 2: Claim inactive promotion**
```javascript
{
  applied_promotion_id: 'promo_old_inactive'
}
// Result: ❌ is_active check fails → order rejected
```

**Attack 3: Use expired promotion**
```javascript
{
  applied_promotion_id: 'promo_expired_2024'
}
// Result: ❌ Date validation fails → order rejected
```

**Attack 4: Inject discount field**
```javascript
{
  applied_promotion_id: 'promo_valid',
  promotion_discount: 9999  // Injected
}
// Result: ✅ Promotion validated, server discount applied, client value ignored
```

---

## Security Properties

| Property | Before | After |
|---|---|---|
| **Promotion verified to exist** | ❌ No | ✅ Yes (fetched from DB) |
| **Active status checked** | ❌ No | ✅ Yes (is_active=true required) |
| **Date range validated** | ❌ No | ✅ Yes (start ≤ now ≤ end) |
| **Restaurant scope enforced** | ❌ No | ✅ Yes (restaurant_id match) |
| **Usage limits respected** | ❌ No | ✅ Yes (usage_count < usage_limit) |
| **Discount calculated by server** | ❌ No (client) | ✅ Yes (server only) |
| **Client amount rejected** | ❌ No (trusted) | ✅ Yes (ignored/logged) |
| **50% cap enforced** | ✅ Yes (code has it) | ✅ Yes (verified) |
| **Audit trail** | ❌ No (discount not linked to promo) | ✅ Yes (tied to promotion ID) |

---

## Data Validation Examples

### Example 1: Valid Percentage Promotion

**Input:**
```javascript
{
  promotion_id: 'promo_summer20',
  restaurant_id: 'rest_metro',
  subtotal: 100
}
```

**Promotion in DB:**
```javascript
{
  id: 'promo_summer20',
  restaurant_id: 'rest_metro',
  name: 'Summer Sale 20%',
  promotion_type: 'percentage_off',
  discount_value: 20,
  max_discount: 50,
  is_active: true,
  start_date: '2026-06-01',
  end_date: '2026-08-31',
  usage_limit: 1000,
  usage_count: 500
}
```

**Calculation:**
```
discount = (100 * 20) / 100 = £20
capped at max_discount = £50 → still £20
capped at universal 50% = £50 → still £20
✅ Return: { validation_ok: true, discount_amount: 20 }
```

### Example 2: Expired Promotion

**Input:**
```javascript
{
  promotion_id: 'promo_old_winter',
  restaurant_id: 'rest_metro',
  subtotal: 100
}
```

**Promotion in DB:**
```javascript
{
  id: 'promo_old_winter',
  name: 'Winter Sale (EXPIRED)',
  is_active: true,
  start_date: '2025-12-01',
  end_date: '2025-12-31'  // ❌ Past
}
```

**Validation:**
```
Check: now > end_date → true
❌ Return: { validation_ok: false, reason: 'Promotion has expired' }
```

### Example 3: Fake Promotion ID

**Input:**
```javascript
{
  promotion_id: 'promo_doesnt_exist',
  restaurant_id: 'rest_metro',
  subtotal: 100
}
```

**Database Query:**
```
Coupon.filter({ id: 'promo_doesnt_exist' }) → []
❌ Return: { validation_ok: false, reason: 'Promotion not found' }
```

---

## Deployment Order

1. **Deploy function:** `validateAndApplyPromotion` (new)
2. **Update function:** `verifyAndCreateOrder` (add validation call)
3. **Update frontend:** Remove `promotion_discount` → Use `applied_promotion_id`
4. **Test:** Run `promotionDiscountIntegrity` smoke tests
5. **Monitor:** Check logs for validation failures

---

## Summary

| Aspect | Before | After |
|---|---|---|
| **Discount source** | Client-supplied (only capped) | Server-calculated from DB record |
| **Validation** | None (except amount cap) | Full (existence, active, dates, scope, limits) |
| **Attack surface** | Fake discounts, no audit | Impossible without real promotion in DB |
| **Revenue impact** | High (uncontrolled) | Protected (validated only) |
| **Rollback risk** | Low (simple cap logic) | Very low (opt-in validation call) |