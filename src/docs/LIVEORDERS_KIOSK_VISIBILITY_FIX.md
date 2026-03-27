# LiveOrders Kiosk Visibility Fix

## Problem

LiveOrders was filtering only by `order.status` (legacy field), causing kiosk orders to disappear from operational views:

```
❌ Kiosk order created:
   - order_source: 'kiosk'
   - order_status: 'new'       ← Kiosk uses this
   - payment_status: 'pending_payment'
   - status: undefined         ← Kiosk does NOT set this!

❌ Filter logic:
   if (statusFilter !== 'all' && order.status !== statusFilter) return false;
   //                               ↑ This is undefined for kiosk!

Result: Order filtered out invisibly
```

## Root Cause

The Order entity supports two operational status models:

1. **Legacy/Online/POS orders**: Use `status` field (pending → confirmed → preparing → out_for_delivery → delivered)
2. **Kiosk orders**: Use `order_status` + `payment_status` fields (new → confirmed → preparing → ready, and payment separately)

But LiveOrders only checks `status`, ignoring kiosk's `order_status`.

---

## Solution: Canonical Visibility Mapping

**Canonical Helper Function:**
```javascript
const getOrderOperationalStatus = (order) => {
    // Kiosk orders: use order_status (operationally meaningful)
    if (order.order_source === 'kiosk') {
        return order.order_status || order.status || 'unknown';
    }
    // Legacy/online/pos: use status
    return order.status || 'unknown';
};
```

**Applied to:**
1. **Filter logic** — `statusFilter` comparison
2. **Sort priority** — operational state priority mapping
3. **Status badge rendering** — color + label
4. **Status transition handling** — `handleStatusChange()`

---

## Visibility Mapping Table

| Order Source | Operational Field | Values | LiveOrders Filter |
|---|---|---|---|
| **kiosk** | `order_status` | new, confirmed, preparing, ready, completed, cancelled | ✅ Uses canonical helper |
| **online/pos** | `status` | pending, confirmed, preparing, out_for_delivery, ready_for_collection, delivered, collected, cancelled | ✅ Uses canonical helper |

### Payment State (Separate)

| Field | Values | Usage |
|---|---|---|
| `payment_status` (kiosk only) | pending_payment, payment_confirmed, paid_card, failed_payment | Filter: sourceFilter === 'unpaid_kiosk' |
| Implicit in status (legacy) | status='pending' means unpaid | No separate payment_status field |

---

## Changes Made

### 1. **components/restaurant/LiveOrders**

**Added canonical helper:**
```javascript
const getOrderOperationalStatus = (order) => {
    if (order.order_source === 'kiosk') {
        return order.order_status || order.status || 'unknown';
    }
    return order.status || 'unknown';
};
```

**Updated filter logic:**
```javascript
// Before: if (statusFilter !== 'all' && order.status !== statusFilter) return false;
// After:
if (statusFilter !== 'all') {
    const operationalStatus = getOrderOperationalStatus(order);
    if (operationalStatus !== statusFilter) return false;
}
```

**Updated sort priority:**
```javascript
const statusPriority = { 
    'new': 0, 'pending': 0, 'confirmed': 1, 'preparing': 2,
    'ready': 3, 'ready_for_collection': 3, 'out_for_delivery': 3,
    'completed': 4, 'collected': 4, 'cancelled': 5
};
const aStatus = getOrderOperationalStatus(a);
const bStatus = getOrderOperationalStatus(b);
```

**Updated status badge rendering:**
```javascript
// Before: Only legacy orders checked order.status
// After: Both kiosk and legacy use getStatusColor(getOrderOperationalStatus(order))
```

**Extended status labels:**
```javascript
const getStatusColor = (status) => {
    const colors = {
        // Legacy
        pending: '...', confirmed: '...', preparing: '...', out_for_delivery: '...', ready_for_collection: '...',
        // Kiosk
        new: '...', ready: '...', completed: '...', collected: '...',
    };
};
```

### 2. **scripts/smoke/suites/liveOrdersKioskVisibility.smoke.js**

**New test suite (6 tests):**
1. ✅ Kiosk order with `order_status='new'` visible in query
2. ✅ Unpaid kiosk order appears in "unpaid" filter
3. ✅ Legacy order with `status='pending'` still visible
4. ✅ Status filter works with canonical helper (both models)
5. ✅ Sort priority includes kiosk 'new' status (high urgency)
6. ✅ Mixed dataset (kiosk + legacy) renders without losing orders

### 3. **scripts/smoke/run-smoke.js**

**Registered suite:**
```javascript
import { run as runLiveOrdersKioskVisibility } from './suites/liveOrdersKioskVisibility.smoke.js';

const SUITES = {
    // ...
    liveOrdersKioskVisibility: runLiveOrdersKioskVisibility,
};
```

---

## Backward Compatibility

**Migration-safe fallback in canonical helper:**
```javascript
const getOrderOperationalStatus = (order) => {
    // If kiosk order lacks order_status (migration glitch), fall back to status
    if (order.order_source === 'kiosk') {
        return order.order_status || order.status || 'unknown';
    }
    // Legacy orders: always use status
    return order.status || 'unknown';
};
```

This ensures:
- Old kiosk orders that somehow have `status` field are still visible
- Legacy orders continue working exactly as before
- No data loss during migration
- No UI breakage on mixed old/new datasets

---

## Test Coverage

**Run smoke tests:**
```bash
node scripts/smoke/run-smoke.js --only liveOrdersKioskVisibility
```

**Expected output:**
```
✅ kiosk_order_visible_in_query
✅ unpaid_kiosk_filter
✅ legacy_order_visible
✅ status_filter_canonical
✅ sort_priority_kiosk
✅ mixed_dataset_visibility
```

---

## Remaining Limitations

| Limitation | Risk | Mitigation |
|---|---|---|
| Status field still exists on legacy orders (not cleaned up) | Low — coexistence is safe with canonical helper | No cleanup needed during migration phase |
| Kiosk orders with both `order_status` AND `status` (should not happen) | Very low — canonical helper prioritizes `order_status` | Prefer explicit kiosk state via `order_status` |
| Filter values still hardcoded in UI (not data-driven) | Low — UI must change less often than data | Filter options defined in `getStatusColor()` + switch statements |

---

## Canonical Order States

**Kiosk workflow (order_status):**
```
new → confirmed → preparing → ready → completed
                              (payment happens before or after)
```

**Legacy workflow (status):**
```
pending → confirmed → preparing → {
                                   out_for_delivery → delivered (delivery orders)
                                   ready_for_collection → collected (collection orders)
                                 }
```

**Both can be:**
- `cancelled` (rejected or refunded)

---

## Files Changed

- `components/restaurant/LiveOrders` (5 sections updated)
- `scripts/smoke/suites/liveOrdersKioskVisibility.smoke.js` (NEW)
- `scripts/smoke/run-smoke.js` (1 suite registered)
- `docs/LIVEORDERS_KIOSK_VISIBILITY_FIX.md` (THIS FILE)

---

## Summary

**Fixed:** Kiosk orders were being filtered out of LiveOrders due to missing `status` field.
**Solution:** Canonical visibility mapping via `getOrderOperationalStatus()` helper that works with both kiosk's `order_status` and legacy's `status`.
**Result:** All kiosk and legacy orders remain visible; unpaid kiosk orders highlighted; sorting by urgency works correctly.
**Tests:** 6 smoke tests cover happy path + mixed datasets.
**Backward compat:** Migration-safe fallback ensures no data loss.