# Offline Review Workflow — Operational Guide

**Last reviewed:** 2026-03-26  
**Status:** Complete — Actionable Manager Workflow

---

## Overview

Offline flagged orders are no longer just visible; they are now **operationally managed** with server-controlled manager actions, audit trails, and clear workflow states.

**From passive visibility → active workflow:**
- Manager sees flagged orders in a dedicated dashboard
- Manager takes action: acknowledge, resolve, or escalate
- System records decision + manager notes + timestamp
- Audit trail preserved for compliance
- Unresolved count visible on dashboard sidebar

---

## Review States

### `new` (Default)
- Order just flagged by sync validation
- Manager has not yet reviewed it
- **Visible in:** "Pending Review" tab (red badge)
- **Action available:** acknowledge, resolved, escalate

### `acknowledged`
- Manager confirmed receipt of flag
- Acceptable interim state before full review
- **Visible in:** All flagged / All offline tabs
- **Meaning:** "I've seen this and it's on my radar"

### `resolved`
- Manager investigated; order acceptable as-is
- No further action needed
- **Visible in:** All flagged / All offline tabs
- **Meaning:** "This is fine; sync validation caught the issue but it's acceptable"

### `escalated`
- Manager needs to investigate further
- Flagged for higher-level review or system change
- **Visible in:** All flagged / All offline tabs
- **Meaning:** "This needs more investigation/decision"

---

## Manager Workflow

### Step 1: View Pending Reviews
1. Open RestaurantDashboard
2. Check sidebar Operations → **"Offline Orders"** badge shows unresolved count
3. Click "Offline Orders"
4. Dashboard opens with **"Pending Review"** tab active
5. See list of flagged orders needing review

### Step 2: Review Each Order
For each order, see:
- **Order number + total**
- **"Needs Review" badge** (yellow)
- **Sync validation notes** — explanation of what triggered the flag
  - E.g., "Offline discount capped: £50 → £20"
  - E.g., "Coupon has reached per-customer limit"
  - E.g., "Menu prices updated from cached to live"
- **Discount/coupon applied** (if any)
- **Timestamps:** when created offline, when synced to server

### Step 3: Take Action
**Three action buttons:**

**Acknowledge** (blue) — "I've confirmed this"
- Use when you've noted the flag but need to investigate further later
- Sets status to "acknowledged"
- Optional: add review notes (e.g., "will follow up on this")

**Resolved** (green) — "This is acceptable"
- Use when you've reviewed and the order is fine as-is
- Example: "Discount was capped by system, which is correct"
- Sets status to "resolved"
- Optional: add review notes explaining your decision

**Escalate** (orange) — "Needs investigation"
- Use when you need to investigate further (e.g., contact customer, review policy)
- Sets status to "escalated"
- Recommended: add notes explaining what needs investigation

### Step 4: Confirm Action
1. Click action button
2. Optional: add review notes (e.g., "Spoke with customer, £20 cap is acceptable")
3. Click Confirm
4. Order status updates; manager email + timestamp recorded
5. Toast confirms success

---

## Dashboard Visibility

### Sidebar Badge
- **Location:** RestaurantDashboard → Operations section
- **Shows:** Number of unresolved flagged orders (review_status='new')
- **Color:** Red badge with count
- **Updates:** Every 30 seconds
- **Notification:** Included in top-bar alert count

### Tab Filtering

**"Pending Review" Tab** (Red highlight if count > 0)
- Shows only: needs_review=true AND offline_review_status=null OR 'new'
- Use this to focus on action items

**"All Flagged" Tab**
- Shows only: needs_review=true (regardless of review status)
- Use to see history of flagged orders

**"All Offline" Tab**
- Shows all offline-created orders (flagged or not)
- Use for comprehensive audit trail

---

## Audit Trail

### What Gets Logged
Every review action creates a **DashboardActivity** record:
- **Action:** OFFLINE_ORDER_REVIEW
- **Order ID:** which order was reviewed
- **Action taken:** acknowledge | resolved | escalated
- **New status:** acknowledged | resolved | escalated
- **Manager:** who took the action (email)
- **Timestamp:** when action was taken
- **Review notes:** optional manager notes
- **Original reason:** sync_validation_notes (why it was flagged)

### How to Access
Query the `DashboardActivity` entity:
```
{
  action: "OFFLINE_ORDER_REVIEW",
  resource_type: "Order",
  restaurant_id: "..."
}
```

All fields available for audits, compliance, or analysis.

---

## Review Workflow Examples

### Example 1: Discount Capped
**Order:** £100 order, offline manager applied £50 discount (50%)
**Sync validation:** Capped to £20 (manager max)
**Flag reason:** "Offline discount capped: £50 → £20"

**Manager action:**
1. Opens order in Offline Orders dashboard
2. Sees sync note: "Offline discount capped"
3. Sees final discount applied: £20 (correct)
4. Decides: discount cap is acceptable policy
5. Clicks **Resolved**
6. Adds note: "Discount cap policy is correct; no action needed"
7. Status changes to "resolved"

**Result:** Order accepted. Audit trail shows manager confirmed the cap.

---

### Example 2: Coupon Expired
**Order:** Offline, cashier applied SPRING20 coupon (no offline validation)
**Sync validation:** Coupon expired between local creation and sync
**Flag reason:** "Coupon 'SPRING20' has expired (expires_at)"

**Manager action:**
1. Opens order; sees sync note about expired coupon
2. Notes: coupon was removed during sync
3. Decides: needs to contact customer about different discount
4. Clicks **Escalated**
5. Adds note: "Need to call customer about alternative discount"
6. Status changes to "escalated"

**Result:** Order flagged for follow-up. Audit shows manager decision + reasoning.

---

### Example 3: Menu Price Changed
**Order:** Item cached as £10, synced as £12 (price increased)
**Sync validation:** Items re-priced from live menu on sync
**Flag reason:** "Prices updated from cached menu to live menu"

**Manager action:**
1. Reviews the order; price difference noted
2. Notes: customer was charged cached price (lower), which is fair
3. Clicks **Acknowledged**
4. Note: "Price update acceptable; customer not overcharged"
5. Status changes to "acknowledged"

**Result:** Order reviewed. Timestamp + manager info recorded.

---

## Server-Controlled Actions

**Why server-controlled?**
- Frontend cannot directly modify review state (no client-side entity writes)
- All review state changes routed through `offlineOrderReview` backend function
- Function enforces:
  - Manager authentication (must be logged in)
  - Tenant scope (can only review own restaurant's orders)
  - Audit logging (every action logged)
  - Data validation (only flagged offline orders reviewable)

**Benefits:**
- Cannot bypass review workflow
- Cannot forge manager identity
- Cannot review orders from unauthorized restaurants
- Full audit trail guaranteed

---

## Authorization

### Who Can Review Orders?
- **Restaurant managers** (RestaurantManager records for this restaurant)
- **Admin users** (can review any restaurant)

### Who Cannot?
- Regular customers
- Cashiers (non-manager staff)
- Managers from different restaurants

### How It's Enforced?
Every review action checks:
```
user.role === 'admin' OR
(user is in RestaurantManager AND restaurant in their list)
```

If check fails → 403 Forbidden

---

## Resolving vs. Dismissing

**"Resolved"** ≠ "dismiss" or "ignore"

- **Resolved** = Manager has investigated and determined the order is acceptable as-is
- Not resolved = Order still needs review (status = acknowledged or escalated)
- Every flagged order should eventually move to a terminal state (resolved or escalated)

**Best practice:** Don't leave orders in "acknowledged" indefinitely. Plan to either resolve or escalate within a shift.

---

## What "Resolved" Means for Each Flag Type

| Flag | Resolved Means |
|---|-|
| "Discount capped" | Manager agrees cap is acceptable |
| "Coupon expired" | Coupon removal is fine; customer OK with it |
| "Coupon limit exceeded" | Limit enforcement is correct |
| "Prices updated" | Customer charged correct live price; acceptable |
| "Mutual exclusion" | Only discount OR coupon applied; correct |

**Key:** You're not overriding the sync validation. You're confirming that the server's decision was correct given the situation.

---

## Remaining Limitations

| Limitation | Why | Mitigation |
|---|---|---|
| Cannot undo sync revalidation | Order already created with updated values | Review notes explain manager's decision |
| Cannot refund during review | Must use refund workflow separately | Note if refund needed; escalate if critical |
| Review doesn't auto-refund | Sync validation is not a refund trigger | Manager manually initiates refunds if warranted |

---

## Monitoring & Health

### Daily Checks
1. Check sidebar "Offline Orders" badge
2. If count > 0, open dashboard and review pending items
3. Keep unresolved count low (don't accumulate)
4. Resolve or escalate each day's flagged orders

### Weekly Audit
1. Query DashboardActivity for OFFLINE_ORDER_REVIEW actions
2. Verify all flagged orders from past week have a review status
3. Check escalated orders were followed up

### Red Flags
- Unresolved count constantly > 5
- Same order reviewed multiple times without resolution
- No review notes for escalated orders
- Manager reviewing orders for unauthorized restaurant (should fail)

---

## Summary

**Old state:** Flagged orders visible in dashboard. Manager could read them. No way to record decisions.

**New state:** Flagged orders visible with actionable workflow. Manager can:
- Acknowledge (interim), Resolve (acceptable), or Escalate (investigate)
- Add notes explaining decision
- See full audit trail of who reviewed what when
- Dashboard badge shows unresolved count
- All changes server-controlled, authorized, audited

**Result:** From passive awareness → active operational management.