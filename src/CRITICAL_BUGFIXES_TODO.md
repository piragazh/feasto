# 🔴 CRITICAL BUGFIXES - IMPLEMENTATION CHECKLIST

## MUST FIX BEFORE PRODUCTION (6 ITEMS)

### 1. **StripePaymentForm.jsx** - handleStripeSuccess atomic guard
**Current Issue:** Can be called twice (Express Checkout + confirmPayment callback)  
**Impact:** Duplicate order creation OR double charge

**Fix Location:** `src/components/checkout/StripePaymentForm.jsx` → `handleStripeSuccess` function

**Change:**
```javascript
// ADD AT TOP OF FUNCTION - before any other logic:
if (paymentCompleted) {
    console.warn('[Checkout] handleStripeSuccess already processing');
    return;
}

// Move setPaymentCompleted(true) to FIRST line after guard
// Then try { await createOrder() }
// On error, set setPaymentCompleted(false) to allow retry
```

**Test:** Double-click pay button → only one charge & one order

---

### 2. **Checkout.jsx** - Payment state reset on cart/method change
**Current Issue:** Old clientSecret persists; cart changes trigger new PI but old one stays valid

**Fix Location:** `src/pages/Checkout.jsx` → initPayment useEffect (around line 1050)

**Change:**
```javascript
// When cart total changes, RESET all payment state:
useEffect(() => {
    // If cart total changed, invalidate the current payment intent
    setClientSecret('');
    setShowStripeForm(false);
    setPaymentCompleted(false);
    expressConfirmFiredRef.current = false;
    paymentInitInFlightRef.current = false;
}, [total]); // Whenever total changes

// Then in SEPARATE useEffect, create NEW PI:
useEffect(() => {
    if (paymentMethod !== 'card') return;
    if (clientSecret) return;
    // ... create PI ...
}, [paymentMethod, total]); // Recreate when needed
```

**Test:** Add item → select card → change address → card total updates

---

### 3. **Checkout.jsx** - Cart NOT cleared until order succeeds
**Current Issue:** Cart cleared BEFORE order response; if order fails, cart lost

**Fix Location:** `src/pages/Checkout.jsx` → `createOrder` function (around line 840)

**Change:**
```javascript
const createOrder = async (paymentIntentId = null) => {
    setIsSubmitting(true);

    try {
        const response = await base44.functions.invoke('verifyAndCreateOrder', {...});

        // Only on SUCCESS, clear cart:
        if (response?.data?.success && response?.data?.order_id) {
            localStorage.removeItem('cart');
            localStorage.removeItem('cartRestaurantId');
            // ... other localStorage clears ...
            setOrderPlaced(true);
            setTimeout(() => navigate(createPageUrl('Orders')), 2000);
        } else {
            // FAILURE: Don't clear cart, allow retry
            const error = response?.data?.error || 'Order failed';
            toast.error(error);
            setIsSubmitting(false);
        }
    } catch (error) {
        // Exception: cart NOT cleared
        toast.error(error?.message || 'Failed to place order');
        setIsSubmitting(false);
    }
};
```

**Test:** Add item → payment fails → refresh → cart still there

---

### 4. **createPaymentIntent** - idempotency_key validation
**Current Issue:** Empty string accepted; no length check

**Fix Location:** `src/functions/createPaymentIntent` (line 58)

**Change:**
```javascript
// OLD:
if (!idempotency_key) {
    return Response.json({ error: 'Missing idempotency_key' }, { status: 400 });
}

// NEW:
const keyStr = String(idempotency_key || '').trim();
if (!keyStr || keyStr.length < 8) {
    return Response.json({ 
        error: 'Invalid idempotency_key: must be non-empty, min 8 chars' 
    }, { status: 400 });
}
// Then use keyStr in Stripe call
```

**Test:** Try checkout without idempotency_key → 400 error

---

### 5. **verifyAndCreateOrder** - Menu validation error handling
**Current Issue:** Returns `new Response()` object which breaks .has() calls later

**Fix Location:** `src/functions/verifyAndCreateOrder` (line 569-622)

**Option A (Simplest):** Extract to separate function
```javascript
async function validateMenuItems(base44, items, restaurantId) {
    // ... validation logic ...
    // Return: { error: string } OR { data: Map }
    if (missing.length > 0) {
        return { error: 'Items not found: ' + missing.join(', ') };
    }
    return { data: itemMap };
}

// Use it:
const validation = await validateMenuItems(...);
if (validation.error) {
    await compensate(..., validation.error);
    return new Response(JSON.stringify({ error: validation.error }), { status: 400 });
}
const menuItemsMap = validation.data;
```

**Test:** Order with non-existent menu item → 400 error with message

---

### 6. **verifyAndCreateOrder** - Minimum order check AFTER price correction
**Current Issue:** Checks subtotal BEFORE menu items are price-corrected (line 530)

**Fix Location:** `src/functions/verifyAndCreateOrder`

**Current (WRONG):**
```javascript
// Line 530 - BEFORE menu price validation
const clientSubtotal = (orderData.items || []).reduce(...);
if (restaurant.minimum_order > 0 && clientSubtotal < restaurant.minimum_order) { ... }

// Line 671 - AFTER menu price validation
cartItem.price = menuItem.price; // Prices corrected here
```

**Fix:**
```javascript
// Move minimum order check to AFTER line 675:
const serverSubtotal = orderData.items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
if (restaurant.minimum_order > 0 && serverSubtotal < restaurant.minimum_order) {
    await compensate(...);
    return new Response(JSON.stringify({ error: 'Minimum order...' }), { status: 400 });
}
```

**Test:** Order with items that look below minimum, but correct server price is above → succeeds

---

## HIGH PRIORITY FIXES (3 ITEMS)

### 7. Move POS-only validation to PRE-payment
**Location:** `src/functions/verifyAndCreateOrder`  
**Current:** Line 643 (after PaymentTransaction created → must refund on fail)  
**Fix:** Move to line ~420 (before payment verification)

```javascript
// Add after restaurant fetch:
for (const item of orderData.items) {
    if (String(item.menu_item_id).startsWith('deal_')) continue;
    const mi = await base44.asServiceRole.entities.MenuItem.filter({
        id: item.menu_item_id, restaurant_id: orderData.restaurant_id
    });
    if (mi[0]?.availability_channel === 'pos_only') {
        return new Response(JSON.stringify({
            error: `${item.name} not available online`
        }), { status: 400 });
    }
}
```

---

### 8. Address validation on zone/orderType changes
**Location:** `src/pages/Checkout.jsx`  
**Add new useEffect:**

```javascript
useEffect(() => {
    if (orderType === 'delivery') {
        if (!deliveryCoordinates?.lat) {
            setShowManualAddressEntry(true);
        }
    }
}, [orderType]);

useEffect(() => {
    if (deliveryZoneInfo?.available === false) {
        toast.error('Outside service area — select different address');
        // Don't block, but warn
    }
}, [deliveryZoneInfo?.available]);
```

---

### 9. Total calculation via useMemo
**Location:** `src/pages/Checkout.jsx`  
**Replace all references to `total` variable:**

```javascript
const orderTotals = useMemo(() => {
    const sub = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
    const fee = orderType === 'collection' ? 0 : (deliveryFee || 0);
    const disc = appliedCoupons.reduce((s, c) => s + (c.discount || 0), 0) +
                 appliedPromotions.reduce((s, p) => s + (p.discount || 0), 0);
    return {
        subtotal: sub,
        deliveryFee: fee,
        discount: disc,
        total: Math.max(0, sub + fee - disc)
    };
}, [cart, deliveryFee, appliedCoupons, appliedPromotions, orderType]);

// Use: orderTotals.total everywhere
```

---

## VALIDATION TESTS

After applying fixes, run these tests:

```
CRITICAL PATH:
[ ] Add item → checkout → card payment → success → order created
[ ] Payment fails → error shown → cart preserved → retry works
[ ] Double-click pay → only one charge
[ ] Change address mid-checkout → payment resets
[ ] Guest without email → validation error
[ ] Non-existent menu item → error before payment
[ ] Order below minimum → error before payment

EDGE CASES:
[ ] Rapid add/remove items → correct final subtotal
[ ] Coupon expires during checkout → rejected
[ ] Zone removed during checkout → error
[ ] Offline then online → cart intact
[ ] Mobile landscape → form readable
[ ] Very long address → input accepts it
```

---

## ESTIMATED EFFORT

- **Fixes 1-6:** 4 hours (critical path)
- **Fixes 7-9:** 2 hours (high priority)
- **Testing:** 2-3 hours
- **Total:** ~8-9 hours

---

## SIGN-OFF

After all 6 CRITICAL fixes applied:
- [ ] No double-charge paths
- [ ] No orphaned payments
- [ ] No lost carts
- [ ] No backend crashes
- [ ] No duplicate orders

**Then:** SAFE FOR STAGING

**Then:** Run full integration tests (Bug #21 - localStorage sync)

**Then:** SAFE FOR PRODUCTION