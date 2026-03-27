# Order Rejection Paths Audit

**Date:** 2026-03-27  
**Status:** AUDIT COMPLETE  
**Risk Level:** MEDIUM (bulk paths unsafe, direct writes in POS)

---

## Rejection Entry Points Found

| Path | Component | User | Trigger | Routes Through | Status | Risk |
|---|---|---|---|---|---|---|
| **1. OrderQueue (Restaurant)** | OrderQueue.tsx | manager/admin/cashier | "Reject" button | `rejectOrderWithRefund()` ✅ | SAFE | ✅ |
| **2. POSOrderQueue (POS)** | POSOrderQueue.tsx | cashier | Status change (none) | Direct entity write ❌ | UNSAFE | ⚠️ |
| **3. POSOrderEntry (Dine-in)** | POSOrderEntry.tsx | cashier | Table payment | Direct entity write ❌ | UNSAFE | ⚠️ |
| **4. Bulk Rejection** | OrderQueue.tsx (lines 84-104) | manager/admin | Bulk action | `bulkUpdateMutation` direct write ❌ | UNSAFE | 🔴 |
| **5. updateOrderStatus** | functions/updateOrderStatus | Any staff | Backend update | Direct Order.update() ❌ | UNSAFE | 🔴 |
| **6. bulkUpdateOrderStatus** | functions/bulkUpdateOrderStatus | manager/admin | Bulk backend | Direct Order.update() ❌ | UNSAFE | 🔴 |

---

## Detail Analysis

### ✅ PATH 1: OrderQueue (Restaurant Dashboard)

**Location:** `components/restaurant/OrderQueue.tsx` lines 125-149

```javascript
const handleReject = async (orderId, reason) => {
    const result = await base44.functions.invoke('rejectOrderWithRefund', {
        order_id: orderId,
        rejection_reason: reason,
    });
    // Shows toast: refunded / failed / etc
}
```

**Status:** ✅ SAFE
- Routes through `rejectOrderWithRefund` function
- No direct entity writes
- Handles refund automatically
- Shows status to staff

---

### ⚠️ PATH 2: POSOrderQueue (POS Dashboard)

**Location:** `components/pos/POSOrderQueue.tsx` lines 47-55

```javascript
const updateOrderStatus = async (orderId, newStatus) => {
    await base44.entities.Order.update(orderId, { status: newStatus });
    // Direct write! No refund logic!
}
```

**Status:** ⚠️ UNSAFE
- **Problem:** No rejection reason, direct entity write
- **Impact:** If cashier changes status to 'cancelled', no refund issued
- **Card orders at risk:** YES
- **Fix:** Route through `rejectOrderWithRefund` when cancelling

---

### ⚠️ PATH 3: POSOrderEntry (Dine-in Table Payment)

**Location:** `components/pos/POSOrderEntry.tsx` lines 214-230

```javascript
const handlePaymentComplete = async () => {
    for (const order of ordersForTable) {
        await base44.entities.Order.update(order.id, { status: 'delivered' });
    }
}
```

**Status:** ⚠️ POTENTIALLY UNSAFE (but not rejection)
- **Note:** This marks delivered, not rejected
- **But:** No refund logic if payment was card
- **Risk:** Low for this path, but architecture inconsistent

---

### 🔴 PATH 4: Bulk Rejection (OrderQueue)

**Location:** `components/restaurant/OrderQueue.tsx` lines 84-104

```javascript
const bulkUpdateMutation = useMutation({
    mutationFn: async ({ orderIds, status }) => {
        const promises = orderIds.map(orderId => {
            const order = orders.find(o => o.id === orderId);
            const statusHistory = order?.status_history || [];
            statusHistory.push({ status, timestamp, note: 'Bulk action' });
            return base44.entities.Order.update(orderId, { 
                status, 
                status_history: statusHistory 
            });
        });
        await Promise.all(promises);
    },
    onSuccess: () => { queryClient.invalidateQueries(['order-queue']); }
});
```

**Status:** 🔴 VERY UNSAFE
- **Problem:** Direct entity writes, no rejection_reason, no refund logic
- **Usage:** "Bulk action" on selected orders
- **Impact:** Can set status to 'cancelled' with NO refund
- **Card orders at risk:** YES
- **Fix:** Must route through backend validation + refund logic

---

### 🔴 PATH 5: updateOrderStatus Backend Function

**Location:** `functions/updateOrderStatus` lines 47-94

```javascript
Deno.serve(async (req) => {
    const { order_id, new_status, rejection_reason } = await req.json();
    // ... validation ...
    const updateData = { status: new_status };
    if (rejection_reason) {
        updateData.rejection_reason = rejection_reason;
    }
    // ... direct update with NO refund logic ...
    const result = await base44.asServiceRole.entities.Order.update(order_id, updateData);
});
```

**Status:** 🔴 VERY UNSAFE
- **Problem:** Accepts any status transition, NO refund logic
- **Usage:** Currently used for non-rejection status changes (confirmed → preparing, etc.)
- **Risk:** If called with 'cancelled', no refund
- **Card orders at risk:** YES (if misused)
- **Fix:** Add guard to reject 'cancelled' status (route to rejectOrderWithRefund instead)

---

### 🔴 PATH 6: bulkUpdateOrderStatus Backend Function

**Location:** `functions/bulkUpdateOrderStatus` lines 47-100

```javascript
Deno.serve(async (req) => {
    const { order_ids, new_status } = await req.json();
    // ... validation ...
    const results = await Promise.all(
        orders.map(async (order) => {
            const updateData = { status: new_status };
            // ... NO refund logic ...
            return base44.asServiceRole.entities.Order.update(order.id, updateData);
        })
    );
});
```

**Status:** 🔴 VERY UNSAFE
- **Problem:** Bulk status updates with NO rejection_reason, NO refund logic
- **Usage:** Could set 100 orders to 'cancelled' at once
- **Risk:** Mass refund bypass possible
- **Card orders at risk:** YES
- **Fix:** Block 'cancelled' status entirely, route to specialized function

---

## Risk Summary

| Severity | Count | Paths | Action |
|---|---|---|---|
| ✅ Safe | 1 | OrderQueue reject | No action needed |
| ⚠️ Unsafe (non-rejection) | 2 | POSOrderQueue, POSOrderEntry | Monitor, low risk |
| 🔴 Critical | 3 | Bulk rejection, updateOrderStatus, bulkUpdateOrderStatus | BLOCK + REDIRECT |

---

## Recommended Fixes

### FIX 1: Block 'cancelled' in updateOrderStatus

```javascript
// In functions/updateOrderStatus
if (new_status === 'cancelled') {
    return Response.json({ 
        error: 'Use rejectOrderWithRefund function for order cancellation' 
    }, { status: 400 });
}
```

**Rationale:** Force all rejections through proper refund workflow.

### FIX 2: Block 'cancelled' in bulkUpdateOrderStatus

```javascript
// In functions/bulkUpdateOrderStatus
if (new_status === 'cancelled') {
    return Response.json({ 
        error: 'Bulk cancellation not allowed. Use rejectOrderWithRefund for each order.' 
    }, { status: 400 });
}
```

**Rationale:** Prevent mass cancellations without refund logic.

### FIX 3: Route POSOrderQueue rejections through refund function

```javascript
// In components/pos/POSOrderQueue.tsx
const handleCancelOrder = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (order?.status === 'pending' && order?.payment_method === 'card') {
        // Route through rejectOrderWithRefund
        const result = await base44.functions.invoke('rejectOrderWithRefund', {
            order_id: orderId,
            rejection_reason: 'Cancelled by staff (POS)',
        });
        return result;
    } else {
        // For non-card, use regular status update
        await base44.entities.Order.update(orderId, { status: 'cancelled' });
    }
};
```

**Rationale:** POS cancellations must also trigger refund logic.

### FIX 4: Remove frontend bulk write, route through backend

Replace `bulkUpdateMutation` direct entity writes with:

```javascript
const bulkUpdateMutation = useMutation({
    mutationFn: async ({ orderIds, status }) => {
        const result = await base44.functions.invoke('bulkUpdateOrderStatus', {
            order_ids: orderIds,
            new_status: status,
        });
        return result;
    },
    // ... existing success handler ...
});
```

**Rationale:** Enforce backend validation even for bulk operations.

---

## Implementation Plan

| Priority | Fix | File(s) | Est. Time |
|---|---|---|---|
| 🔴 P1 | Block 'cancelled' in updateOrderStatus | functions/updateOrderStatus | 5 min |
| 🔴 P1 | Block 'cancelled' in bulkUpdateOrderStatus | functions/bulkUpdateOrderStatus | 5 min |
| 🟠 P2 | Route POSOrderQueue to refund function | components/pos/POSOrderQueue.tsx | 10 min |
| 🟡 P3 | Use backend bulk function instead of direct writes | components/restaurant/OrderQueue.tsx | 5 min |
| 🟡 P3 | Add tests for unsafe path blocking | scripts/smoke/suites/ | 15 min |

---

## Files to Change

1. **functions/updateOrderStatus** — Add guard against 'cancelled'
2. **functions/bulkUpdateOrderStatus** — Add guard against 'cancelled'
3. **components/pos/POSOrderQueue.tsx** — Route card rejections through rejectOrderWithRefund
4. **components/restaurant/OrderQueue.tsx** — Use backend bulk function
5. **scripts/smoke/suites/rejectionPathsAudit.smoke.js** — NEW: Tests for all paths

---

## Testing Strategy

### Smoke Tests Needed

```javascript
// Test 1: updateOrderStatus blocks 'cancelled'
POST /functions/updateOrderStatus
{ order_id: "order-123", new_status: "cancelled" }
→ Expected: 400 error "Use rejectOrderWithRefund"

// Test 2: bulkUpdateOrderStatus blocks 'cancelled'
POST /functions/bulkUpdateOrderStatus
{ order_ids: ["order-123"], new_status: "cancelled" }
→ Expected: 400 error "Bulk cancellation not allowed"

// Test 3: POSOrderQueue uses rejectOrderWithRefund for card orders
(Requires UI interaction test)

// Test 4: OrderQueue bulk uses backend function
(Verify bulkUpdateMutation calls bulkUpdateOrderStatus function, not direct writes)
```

---

## Audit Conclusion

### Current State
- ✅ Main rejection path (OrderQueue) is SAFE
- 🔴 3 critical unsafe paths identified
- 🔴 Risk: Card orders can be cancelled without refund via 3 vectors

### After Fixes
- ✅ All rejection paths will route through `rejectOrderWithRefund`
- ✅ No direct entity writes for cancellation
- ✅ Idempotent + safe even if called multiple times

### Approval Needed
- [ ] Confirm FIX 1: Block 'cancelled' in updateOrderStatus
- [ ] Confirm FIX 2: Block 'cancelled' in bulkUpdateOrderStatus
- [ ] Confirm FIX 3: Route POSOrderQueue through refund function
- [ ] Confirm FIX 4: Use backend bulk function