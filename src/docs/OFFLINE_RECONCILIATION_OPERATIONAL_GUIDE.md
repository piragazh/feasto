# Offline Reconciliation — Operational Guide

**Last reviewed:** 2026-03-26  
**Status:** Production Ready — Phase 1 (Blocking) + Phase 2 (Visibility) Complete

---

## Executive Summary

Offline POS orders are now handled with **explicit sync outcomes**, **manager visibility**, and **retry safety**. No silent failures. No ambiguous policies. All offline activity is auditable.

### Three Explicit Sync Outcomes

| Outcome | What Happens | Manager Sees |
|---------|---|---|
| **SYNC_ACCEPTED** | Order valid, synced normally | Order in Order list (normal) |
| **SYNC_ACCEPTED_NEEDS_REVIEW** | Order synced but has validation issues | Order flagged in "Offline Orders" dashboard with reason |
| **SYNC_REJECTED** | Order fails critical validation (e.g., duplicate), NOT synced | Order stays in local queue, retry button available |

---

## For Staff (Cashiers)

### Offline Constraints (Explicit)

**You CANNOT use offline:**
- ❌ Manual discounts — "Manual discounts unavailable offline" (red message shown)
- ❌ Coupons — coupon button disabled with explanation
- ❌ Approve refunds
- ❌ Edit menu prices

**You CAN use offline:**
- ✅ Create full-price orders
- ✅ Record cash/card payment
- ✅ Update order status (preparing → ready)
- ✅ Capture customer details

### UI Communication

**Offline Banner:**
- Red banner at top: "OFFLINE MODE — X changes queued"
- Shows when you're offline or have pending changes

**Discount Panel:**
- Red disabled state with message: "Manual discounts unavailable offline"
- Cannot be clicked or bypassed

**Coupon Button:**
- Completely hidden/disabled
- Explanation shown: "Coupons unavailable offline"

**When Back Online:**
- Offline banner auto-syncs pending orders
- All buttons re-enable immediately
- Success toast: "X offline change(s) synced"
- If failures: "X update(s) failed to sync" — see details

### If Sync Fails

**You will see:**
- Error toast: "Update failed to sync"
- Pending count stays the same
- Order remains in offline queue (not deleted)

**What to do:**
1. Check connection (WiFi/network)
2. When stable again, click "Sync Now" button in offline banner
3. Order will retry automatically or you can click button
4. Order either syncs successfully or shows error again
5. **Never silently lost** — you'll always see it

---

## For Managers / Admin

### Review Offline Orders

**Navigate to:**
- RestaurantDashboard → Operations → Offline Orders

**Two tabs:**

1. **"Flagged" Tab** (red badge)
   - Shows offline orders with validation issues
   - Each card displays:
     - Order number + total
     - "Needs Review" badge
     - **Validation reason** (e.g., "discount capped from £50 to £20")
     - When created offline + when synced to server
     - Discount/coupon details if applicable
   - **Action:** Review reason, acknowledge in record, no action required from you

2. **"All Offline" Tab**
   - Every offline-created order (flagged or not)
   - Same details as above
   - Total count for audit trail
   - **Purpose:** Full audit history of what was created offline

### Why Orders Are Flagged

**Example reasons in sync_validation_notes:**

```
"Offline discount zeroed: no reason code"
→ Discount was applied offline but had no reason code; server zeroed it

"Offline discount capped: £50 → £20"
→ Manager applied 50% discount offline; server capped to manager max (£20)

"Coupon has reached per-customer limit"
→ Coupon was attempted offline; sync rejected due to customer limit

"Coupon has expired (expires_at)"
→ Coupon was valid when offline created; expired before sync

"Manual discount already applied; coupon removed (mutual exclusion policy)"
→ Both discount and coupon were somehow in order; sync kept discount, removed coupon
```

### Audit Trail

Every offline order carries:

- **offline_created**: boolean (true = offline origin)
- **offline_created_at**: timestamp when cashier created it locally
- **offline_synced_at**: timestamp when it synced to server
- **needs_review**: boolean (true = validation flagged this)
- **sync_validation_notes**: human-readable reason(s) for flagging

**All stored on Order entity** — fully queryable, auditable, no hidden state.

### No Silent Changes

**Policy:** Offline orders are **never silently rewritten** into a different financial state.

- If sync revalidation changes the discount or coupon, the order is marked `needs_review=true`
- You can see exactly what changed in `sync_validation_notes`
- You are informed via the "Offline Orders" dashboard
- No surprise surprises — you control what happens next

---

## Technical Details: Sync Outcomes

### 1. SYNC_ACCEPTED

**Conditions:**
- Order passes all server-side validation
- No validation issues found

**Result:**
- Order created with `needs_review=false`
- Appears in normal Order list
- No manager action needed

**Example:** Full-price order, no discounts/coupons
```
Order created: £25.00, no validation issues
```

### 2. SYNC_ACCEPTED_NEEDS_REVIEW

**Conditions:**
- Order is created (not rejected)
- BUT sync revalidation found one or more issues
- Issues are non-blocking (e.g., discount was capped, coupon was invalid)

**Result:**
- Order created with `needs_review=true`
- `sync_validation_notes` populated with reason(s)
- Appears in "Offline Orders" → "Flagged" tab
- Manager can review and understand what happened

**Examples:**
```
Offline discount exceeds manager threshold
→ Order created with capped discount (£20 instead of £50)
→ Flagged; notes: "Offline discount capped: £50 → £20"

Coupon per-customer limit exceeded
→ Order created without coupon (coupon code removed)
→ Flagged; notes: "Coupon rejected: customer limit exceeded"

Menu price changed between offline creation and sync
→ Order created with new prices; total recalculated
→ Flagged; notes: "Prices updated from cached menu to live menu"
```

### 3. SYNC_REJECTED

**Conditions:**
- Order fails critical validation
- Cannot be safely stored
- Examples: duplicate offline_id, missing required fields, restaurant doesn't exist

**Result:**
- Order NOT created on server
- Remains in local offline queue
- `syncStatus="failed"` stored in IndexedDB
- `syncError` contains error message
- `syncAttempts` incremented
- Staff sees "Retry Failed" button

**Example:**
```
Error: "Order already synced (duplicate offline_id)"
→ Order remains in offline queue for retry
→ Staff clicks "Retry Failed" after issue is resolved
```

---

## Retry / Failure Recovery

### Failed Offline Order Lifecycle

1. **Offline Creation**
   - Cashier creates order offline: `syncStatus='pending'`

2. **First Sync Attempt**
   - Goes online; auto-sync or manual "Sync Now"
   - Error occurs: restaurant_id invalid, network timeout, etc.
   - `syncStatus='failed'`, `syncError` logged

3. **Failure Visible**
   - Offline banner shows error: "1 update failed to sync"
   - Order still in "pending" count (not discarded)
   - Retry button available: "Sync Now"

4. **Retry**
   - Cashier fixes issue (e.g., network restored)
   - Clicks "Sync Now" or auto-retry
   - Sync succeeds: `syncStatus='synced'`
   - Order removed from pending list
   - Toast: "1 offline change synced"

5. **Fallback: Manual Intervention** (if needed)
   - If sync keeps failing, manager can:
     - Review in Offline Orders dashboard
     - Check `syncError` reason
     - Delete order locally if invalid
     - Re-create order through normal online path

### Idempotency Protection

**Same offline_id never synced twice:**

- Each offline order gets unique `offline_id` (timestamp + random)
- syncOfflineOrder checks for duplicate offline_id before creating
- If already exists: returns 409 Conflict, `isDuplicate=true`
- Only ONE order created on server per offline_id

**Safety:**
- Accidental resubmission (double-tap, network retry) won't create duplicates
- Multiple sync attempts are safe

---

## Configuration / Policy

### Offline Discount Policy (Explicit)

**Current rule: FULLY BLOCKED**

```jsx
// POSDiscountPanel.js
if (isOffline) {
    return <message>"Manual discounts unavailable offline"</message>
}
```

**No ambiguity:**
- ❌ Not "blocked OR capped depending on config"
- ✅ Always blocked
- ✅ Message clear: "unavailable offline"

**Why:**
- Manager threshold (20%/£20) cannot be enforced offline
- Safer to block than to cap with uncertainty
- Sync revalidation is not needed if discounts never created offline
- Staff understands the rule clearly

### Offline Coupon Policy (Explicit)

**Current rule: FULLY BLOCKED**

- Coupon dialog disabled/hidden offline
- Message: "Coupons unavailable offline"
- Coupon cannot be applied in any form offline

**Why:**
- Per-customer coupon limits require server query
- Cannot prevent double-redemption in offline window
- Block is safest, clearest policy

---

## Monitoring & Alerts

### Manager Checks (Daily)

1. **Offline Orders Dashboard**
   - Open RestaurantDashboard → Operations → Offline Orders
   - Check "Flagged" count — should be 0 or minimal
   - Review flagged orders; understand reasons
   - If high number of flags: investigate offline conditions

2. **Sync Failures**
   - Check server logs for `[OFFLINE-SYNC-BANNER]` messages
   - Look for `syncStatus='failed'` in Order table
   - If persistent: investigate network, staff training

### Audit Trail Export

All offline orders stored with:
- `offline_created=true` filter in Order entity
- `needs_review` boolean for quick flagging
- `sync_validation_notes` for human-readable reason
- Timestamps: `offline_created_at`, `offline_synced_at`

**Export:** Query Order table with `offline_created=true` to get full history.

---

## FAQs

### Q: Can staff apply a discount offline if they really need to?
**A:** No. The rule is clear: "Manual discounts unavailable offline." If a discount is truly needed, the staff member must wait for internet connection or create a note for manager to apply discount later online.

### Q: What happens if a coupon expires after an offline order is created but before it syncs?
**A:** Sync will re-validate the coupon, find it expired, and reject it. The order syncs without the coupon, and `needs_review=true` is set. Manager is notified via "Offline Orders" dashboard.

### Q: Can an offline order sync twice?
**A:** No. Idempotency check prevents it. If you somehow submit the same offline_id twice, the second attempt returns 409 Conflict. Only one order ever created.

### Q: If sync fails, is the order lost?
**A:** No. The order remains in the local offline queue. `syncStatus='failed'`, and a "Retry Failed" button is available. The order is never silently discarded.

### Q: Can a manager override an offline order that was flagged?
**A:** The order is already created on the server with the approved financial state. The flag is informational — it tells you what sync validation found. You review and understand, but the order stands as synced. Future feature: explicit override/approval UI.

### Q: How do I know if the offline feature is working?
**A:** Check Offline Orders dashboard daily:
- Should see mostly SYNC_ACCEPTED orders (no flags)
- Occasional SYNC_ACCEPTED_NEEDS_REVIEW (e.g., price change)
- No SYNC_REJECTED (all orders should eventually sync)
- If high failed count: investigate offline conditions

---

## Rollout Checklist

- [ ] Staff trained on offline constraints (discounts/coupons blocked)
- [ ] Staff understand "Sync Now" button and retry flow
- [ ] Managers shown "Offline Orders" dashboard location
- [ ] Managers understand validation notes and flagged orders
- [ ] Server logs monitored for `[OFFLINE-SYNC-BANNER]` errors
- [ ] First week: daily check of Offline Orders count
- [ ] Document any unexpected sync outcomes for platform team

---

## Summary

**Before:** Offline mode was risky. Coupons/discounts applied without validation. No audit trail. Silent failures.

**After:** Offline mode is operationally safe. Clear constraints. Explicit sync outcomes. Manager visibility. Full audit trail. Retry-safe.

**Policy:** Discounts and coupons fully blocked offline. Unambiguous. No silent financial rewrites. Manager dashboard shows flagged orders with reasons.