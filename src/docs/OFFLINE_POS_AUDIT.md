# Offline POS Audit & Hardening Plan

**Audit Date:** 2026-03-26  
**Status:** IDENTIFIED GAPS — Hardening recommended before production-level offline use

---

## Summary

Offline POS orders currently **bypass all server validation** during local entry and sync to the database **with minimal re-validation**. This creates a window where the following high-risk actions **are not enforced offline:**

- Coupon validation (active status, date range, minimum spend, global limit, per-customer limit)
- Coupon usage_count increment (happens offline, not server-enforced)
- Coupon + manual discount mutual exclusion
- Manual discount threshold (manager ≤20% / £20 cap not enforced offline)
- Discount reason codes (not enforced offline)
- Promotion limits

**Impact:** A staff member working offline could apply coupons unlimited times, exceed manager discount thresholds, combine a coupon + manual discount, or boost prices — and all of this would persist to the database on sync without re-validation.

---

## Current Offline Flow

### 1. Local Storage (IndexedDB)

**File:** `components/pos/POSOfflineDB.js`

- `savePendingOrder(orderData)` — stores the raw order object with `offline_id`, `synced: false`, `created_at`
- No validation at entry time
- All fields from the client (discount, coupon_code, total, items, etc.) are stored as-is

### 2. Local Discount/Coupon Handling (POSPayment)

**File:** `components/pos/POSPayment.js`

- Line 156–159: `if (!navigator.onLine) { await savePendingOrder(orderData); return { offline: true }; }`
- **No pre-validation:** the order object is built with client-supplied discount, coupon_code, total
- Discount is applied locally without threshold check
- Coupon is applied locally without full validation (only client-side UI constraints)
- Client-computed total is stored as-is; no server recompute

### 3. Sync Path (POSOfflineSyncBanner)

**File:** `components/pos/POSOfflineSyncBanner.js`

- Line 40–54: Sync iterates pending orders
- **Line 48:** `await base44.entities.Order.create(orderData)`
- **No function wrapper:** sync directly creates an Order record from IndexedDB
- **No re-validation:** the order bypasses `posCreateOrder` (the authoritative server function)
- **No audit trail:** no metadata recorded that this was offline-created or any validation failures

### 4. What Validation Is Bypassed

| Control | Live Mode | Offline Mode |
|---|---|---|
| Coupon active status | ✅ posCreateOrder | ❌ None |
| Coupon date range | ✅ posCreateOrder | ❌ None |
| Coupon minimum spend | ✅ posCreateOrder | ❌ None |
| Coupon global usage_limit | ✅ posCreateOrder | ❌ None |
| Coupon per-customer limit | ✅ posCreateOrder | ❌ None |
| Coupon usage_count increment | ✅ Server-side (posCreateOrder) | ❌ Never incremented offline |
| Coupon + manual discount mutual exclusion | ✅ posCreateOrder (400 reject) | ❌ None |
| Manual discount threshold (manager ≤20%/£20) | ✅ posCreateOrder | ❌ None |
| Manual discount reason code required | ✅ posCreateOrder | ❌ None |
| Item price recompute from menu | ✅ posCreateOrder | ❌ None — client price stored |
| Discount-without-reason zeroing | ✅ posCreateOrder | ❌ None |

### 5. Data Preserved on Offline Order (IndexedDB → Server)

```javascript
{
  offline_id: "offline_1711...abc123",
  restaurant_id: "...",
  items: [...],           // client-supplied prices (not re-validated)
  subtotal: 50,           // client-supplied
  discount: 5,            // client-supplied, no threshold check
  discount_reason_code: "loyalty_gesture",  // no validation
  coupon_code: "SAVE10",  // no validation
  total: 45,              // client-supplied, not recomputed
  payment_method: "cash",
  // ... other order fields
  
  // Offline metadata (added by IndexedDB layer)
  synced: false,
  created_at: "2026-03-26T14:30:00Z"
}
```

**What's missing:**
- No `offline_created` flag (cannot identify offline-originated orders post-sync)
- No `sync_timestamp` (cannot audit when it synced)
- No `sync_result` or `validation_flags` (cannot track if sync failed any checks)

### 6. Known Attack Paths

**Path A — Coupon Abuse Offline**
1. Staff goes offline
2. Uses the same coupon code 100 times in one shift
3. All 100 orders sync to database
4. No per-customer limit was enforced; coupon usage_count was never incremented
5. Customer effectively got 100x coupon value

**Path B — Double Discount Offline**
1. Staff applies both manual discount (20%) and coupon code at same time
2. Order saves offline with both discounts
3. On sync, order creates with combined discount
4. Mutual exclusion policy was never enforced

**Path C — Manager Discount Bypass Offline**
1. Manager applies a 50% manual discount offline (above the 20%/£20 cap)
2. Order saves with full 50% discount
3. On sync, Order.create() accepts it (no re-validation)
4. Manager threshold was bypassed

**Path D — Price Inflation Offline**
1. Staff manually edits item price upward in cart before creating order
2. Order saves with inflated price
3. Syncs to database
4. Server never re-validated menu price

---

## Recommended Offline Policy

### A. Safe Offline (no restrictions)

- ✅ Full-price orders without any discount/coupon
- ✅ Basic order capture (items, quantity, order type, customer details)
- ✅ Cash payment recording
- ✅ Status updates on existing orders (preparing → ready, etc.)

### B. Blocked Offline (not allowed)

- ❌ **Coupons** — too risky without real-time limit enforcement
- ❌ **Manual discounts** — manager threshold cannot be enforced offline
- ❌ **Price edits** — menu prices must come from server, not client
- ❌ **Refund approvals** — financial controls require real-time verification

### C. Flagged for Review on Sync

- ⚠️ Offline-created orders (with `offline_created: true`)
- ⚠️ Any order with fields that differ from current menu (audit mismatch)
- ⚠️ Sync rejections or re-validation failures (with clear reason)

---

## Hardening Recommendations

### 1. Block Offline Coupon Entry

**Where:** `components/pos/POSPayment.js`
- Disable coupon dialog when `!navigator.onLine`
- Show explanation: "Coupons are not available in offline mode"

**Where:** `components/pos/ApplyPromotionDialog.js`
- Add `isOffline` prop; disable coupon selection
- Show message

### 2. Block Offline Manual Discounts (or strict cap)

**Option A (Preferred — Blocking):**
- Disable `POSDiscountPanel` entirely when offline
- Simplest, safest

**Option B (Stricter allowing — Capped):**
- Allow manual discount offline ONLY for admins
- Cap at max £10 (vs manager £20 / 20%)
- Require reason code (enforced UI-side offline, re-validated on sync)
- Flag on sync with `needs_review: true`

### 3. Enforce Server Re-validation on Sync

**Create new function:** `syncOfflineOrder`
- Input: IndexedDB offline order record
- Steps:
  1. Authenticate sync caller
  2. Re-validate discount (if present): manager cap, reason code required
  3. Re-validate coupon (if present): all checks from `posCreateOrder`
  4. Recompute subtotal from live menu prices
  5. If validation passes: call `posCreateOrder` (authoritative function)
  6. If validation fails: mark order `needs_review: true`; write to audit log; **do not auto-adjust totals**

**Replace:** `POSOfflineSyncBanner.js` line 48  
Instead of `base44.entities.Order.create(orderData)`, call `syncOfflineOrder(orderData)`

### 4. Add Offline Metadata to Order Entity

**Update:** `entities/Order.json`
- Add `offline_created: boolean` — true if order originated offline
- Add `offline_created_at: string (date-time)` — when order was created locally
- Add `offline_synced_at: string (date-time)` — when it synced to server
- Add `needs_review: boolean` — true if sync re-validation flagged issues
- Add `sync_validation_notes: string` — details of any flagged issues

### 5. Add Operator Identity Capture Offline

**File:** `components/pos/POSPayment.js`
- Capture logged-in user email before creating offline order
- Store `created_by: user.email` in offline order
- Use for audit trail & access control checks

### 6. Update UI to Communicate Offline Constraints

**Show offline banner with clear messaging:**

```
🔴 OFFLINE MODE
Actions unavailable until connection restores:
  • Coupons (cannot verify limits)
  • Discounts (will be reviewed when syncing)
  • Refunds (requires admin verification)

Full-price orders sync automatically.
Discounted orders marked for manager review.
```

### 7. Reconciliation & Audit

**On sync failure (validation rejects the order):**
- Do NOT silently adjust discount to 0
- Do NOT silently remove coupon
- Instead:
  1. Mark order `needs_review: true`
  2. Write to `DashboardActivity` with `severity: high`
  3. Notify staff: "Order created offline but validation flagged issues. Manager review required."
  4. Create a manual order review workflow (future: ticket/assignment)

---

## Implementation Scope (Minimal)

**Phase 1 — Immediate (blocking unsafe actions):**
1. Block coupon selection offline
2. Block manual discounts offline (or cap + flag strictly)
3. Update UI messaging

**Phase 2 — Sync validation (safe recovery):**
1. Create `syncOfflineOrder` function
2. Add offline metadata to Order entity
3. Update sync path to call new function
4. Add audit logging for flagged orders

**Phase 3 — Operator audit (future):**
1. Capture user email in offline orders
2. Build operator-specific offline reconciliation dashboard
3. Notify staff of flagged orders

---

## Files to Modify

| File | Change | Priority |
|---|---|---|
| `components/pos/POSPayment.js` | Block coupon dialog offline; option to block discounts | P1 |
| `components/pos/POSOfflineSyncBanner.js` | Replace direct Order.create with syncOfflineOrder call | P2 |
| `functions/syncOfflineOrder.js` | New function: re-validate and sync offline orders | P2 |
| `components/pos/ApplyPromotionDialog.js` | Add isOffline prop; disable coupon picker | P1 |
| `entities/Order.json` | Add offline_created, offline_created_at, offline_synced_at, needs_review, sync_validation_notes | P2 |
| `docs/SECURITY_AND_ABUSE_CONTROLS.md` | Add offline policy section | P1 |

---

## Testing Plan

### Smoke Tests (new)

1. **offlineNoCoupon** — coupon dialog blocked offline; order created without coupon ✅
2. **offlineNoDiscount** — discount button disabled offline; order created at full price ✅
3. **offlineOrderSyncValidation** — offline order with old discount syncs and gets flagged ✅
4. **offlineOrderSyncReject** — offline order with invalid coupon syncs and marked needs_review ✅

### Manual Tests

1. Go offline → try to add coupon → disabled ✅
2. Go offline → apply full-price order → sync on reconnect ✅
3. Go offline → apply discount → sync → see "Review needed" flag ✅
4. Go offline → apply old coupon code → sync → rejected ✅

---

## Unavoidable Offline Limitations (Documented)

| Limitation | Why | Mitigation |
|---|---|---|
| Cannot enforce real-time coupon per-customer limit offline | No server round-trip | Block offline; use sync re-validation |
| Cannot recompute prices from live menu offline | Menu cached, could be stale | Warn staff; re-validate on sync |
| Cannot verify manager discount threshold offline | No auth context in IndexedDB | Disable offline or flag for review |
| Manager cannot see live pending order count offline | Offline DB is local | Cache order count before going offline |

---

## Summary Table

| Control | Live | Offline (Current) | Offline (Proposed) |
|---|---|---|---|
| Coupon active | ✅ Block invalid | ❌ None | ✅ Blocked entirely |
| Coupon per-customer limit | ✅ Block if exceeded | ❌ None | ✅ Blocked entirely |
| Coupon + discount mutual exclusion | ✅ Block 400 | ❌ None | ✅ Blocked entirely |
| Manual discount threshold | ✅ Enforce cap | ❌ None | ⚠️ Disabled or flagged |
| Menu price recompute | ✅ Server | ❌ None | ✅ Re-validated on sync |
| Audit trail | ✅ Full | ❌ Minimal | ✅ offline_created, sync_result |
| Offline operator identity | ✅ created_by | ❌ None | ✅ Capture & store |
| Sync path validation | ✅ Implicit (online) | ❌ Direct entity write | ✅ Function re-validates |

---

## Conclusion

**Current state:** Offline POS is a **compliance and financial control gap**. Blocking high-risk actions (coupons, discounts) and adding server-side sync validation creates a **production-safe offline mode**.

**Safest recommendation:** Block all discount/coupon actions offline. Staff can still create full-price orders; discounted orders require online mode or manager review on sync.