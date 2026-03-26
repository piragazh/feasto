# Manager/Operator Analytics — Identity & Data Audit

**Date:** 2026-03-26  
**Status:** ✅ Audit Complete — Ready for Implementation

---

## Part 1: Available Identity Data

### 1.1 Offline Order Creation

**Who:** Captured in `syncOfflineOrder` function
- User who triggered sync: `user.email` (manager/admin)
- Logged in console: `[OFFLINE-SYNC] Order synced by=${user.email}`
- **Problem:** No field on Order entity tracking who *created* the offline order
- **Gap:** Cannot attribute offline order creation to specific operator/staff

### 1.2 Offline Review Actions

**Who:** Captured in `offlineOrderReview` function & Order entity
- Reviewer email: `offline_review_by` (set on Order)
- Review action: `offline_review_status` (acknowledged/resolved/escalated)
- Review reason: `offline_review_reason_code`
- Review notes: `offline_review_notes`
- Review timestamp: `offline_review_at`
- **Status:** ✅ Fully captured — can group review actions by manager

### 1.3 Audit Log

**Entity:** `DashboardActivity`
- `user_email` — who performed the action
- `action` — action type (e.g., OFFLINE_ORDER_REVIEW)
- `resource_id` — order ID
- `details` — JSON with context (reason code, notes, etc.)
- **Status:** ✅ Reviews are logged — can trace audit trail by person

### 1.4 Staff Identity

**Entity:** `StaffMember` (per-restaurant)
- `email` — staff login email
- `full_name` — staff name
- `staff_number` — short ID (e.g., S001)
- `role` — waiter/cashier/kitchen_staff/manager
- `restaurant_id` — which restaurant(s) they work at
- **Status:** ✅ Full identity available

### 1.5 Manager Identity

**Entity:** `RestaurantManager` (platform-level)
- `user_email` — manager email
- `full_name` — manager name
- `restaurant_ids` — which restaurants they manage
- `is_active` — whether active
- **Status:** ✅ Full identity available

---

## Part 2: Identity Attribution Chains

### Chain 1: Offline Order Creation → Sync User

```
Order (offline_created=true)
  ↓
offline_synced_at, offline_created_at
  ↓
syncOfflineOrder() logs: "by=${user.email}"
  ↓
Console log only (NOT persisted on Order entity)
  
❌ PROBLEM: Cannot query "who created this offline order?"
   — No field on Order for creator identity
   — Only logged to console
```

**Mitigation needed:** Add `offline_created_by` field to Order entity to persist operator identity.

### Chain 2: Offline Review Action → Reviewer Identity

```
Order (offline_created=true, needs_review=true)
  ↓
offline_review_by (set by offlineOrderReview function)
  ↓
offline_review_status (acknowledged/resolved/escalated)
offline_review_reason_code
offline_review_notes
offline_review_at
  
✅ WORKS: Can query orders grouped by offline_review_by
   — ReviewBy email → restaurant manager identity
   — Can attribute review quality to specific person
```

### Chain 3: Review Audit Trail

```
DashboardActivity created when review action performed
  {
    user_email: "manager@example.com",
    action: "OFFLINE_ORDER_REVIEW",
    resource_id: "order_id",
    details: {
      action: "resolved|escalated",
      review_reason_code: "...",
      was_overdue: true/false,
      ...
    }
  }

✅ WORKS: Can audit review actions by person
   — Trace decisions back to specific manager
   — Review quality signals (notes, overdue handling)
```

---

## Part 3: People-Level Attribution Reliability

### For Reviews (✅ STRONG)

**Can reliably group:**
- ✅ All review actions by `offline_review_by` (manager email)
- ✅ Escalation rate per manager
- ✅ Resolution rate per manager
- ✅ Average review age per manager
- ✅ Documentation quality (% with notes) per manager
- ✅ Reason code distribution per manager
- ✅ Unresolved backlog per manager

**Caveats:**
- Manager can review orders from any restaurant they manage
- No field on Order linking to staff_number / StaffMember

### For Order Creation (❌ WEAK)

**Cannot reliably attribute:**
- ❌ Which operator/staff created offline order (not persisted)
- ❌ Only console logs it; no database field
- ❌ POS operator identity lost after sync

**Mitigation:** Add `offline_created_by` field to Order entity

### For Offline Sync (⚠️ PARTIAL)

**Can attribute sync action:**
- ✅ Which manager triggered sync (from syncOfflineOrder function)
- ✅ But no field on Order — logged to console only
- ⚠️ Cannot distinguish between "operator created offline" vs "manager synced it"

---

## Part 4: Manager vs Operator vs Staff

### Manager Role
- `RestaurantManager` entity
- Reviews flagged offline orders
- Makes terminal decisions (resolved/escalated)
- **Data available:** ✅ Full identity, reviews linked to email

### Staff/Operator Role
- `StaffMember` entity (per-restaurant)
- Creates offline orders (on POS, during offline mode)
- POS staff login via `staff_number` + PIN
- **Data available:** ❌ No link between offline order and staff_number

### Distinction Needed

```
Offline Order Creation Flow:
  1. Staff member (cashier/waiter) creates order on POS (offline mode)
  2. Staff logged in via staff_number + PIN (not email)
  3. Order synced to server by manager/admin via syncOfflineOrder()
  4. Sync triggers by user.email (manager, not original operator)
  
Current gap: Cannot track original operator (staff_number lost)
Solution: Add staff_number or POS operator email to Order on creation
```

---

## Part 5: Safest Minimal Analytics Plan

### Phase 1: Manager-Level Review Analytics (No Changes to Order Entity)

**SAFE: Purely use existing fields**
- Group orders by `offline_review_by` (manager email)
- Calculate metrics per manager:
  - Total reviews performed
  - Escalation rate
  - Resolution rate
  - Average review age
  - % with documentation
  - Reason code distribution
  - Unresolved backlog (orders awaiting review by this manager)
- Outlier flags:
  - High escalation rate
  - Poor documentation
  - High reason code concentration

**No code changes to Order entity — uses existing fields only.**

### Phase 2: Operator-Level Creation Analytics (Requires Order Entity Change)

**REQUIRES: Add `offline_created_by` field to Order**
- Track staff/operator who created offline order
- Calculate per-operator metrics:
  - Total offline orders created
  - Flagged rate (orders that failed sync validation)
  - Most common failure types
- Outlier flags:
  - Unusually high flagged rate
  - Repeated same validation errors

**Decision:** Implement Phase 1 first, then Phase 2 with schema change.

---

## Part 6: Role Visibility Boundaries

### SuperAdmin
- ✅ See all managers across all restaurants
- ✅ See manager review quality/volume
- ✅ Identify best/worst managers
- ✅ Drill down to per-manager order list

### Restaurant Admin / RestaurantManager
- ✅ See staff members at own restaurants
- ✅ See own review metrics (if reviewing)
- ❌ Cannot see other managers' metrics (cross-restaurant)
- ✅ Can see team at own restaurant (StaffMember list)

### Regular User / Staff
- ❌ No access to analytics

---

## Part 7: Summary of Findings

| Component | Status | Can Use For | Limitations |
|-----------|--------|-------------|-------------|
| `offline_review_by` | ✅ Robust | Manager review attribution | Only reviews, not creation |
| `offline_review_status` | ✅ Robust | Escalation/resolution rates | Terminal decisions only |
| `offline_review_reason_code` | ✅ Robust | Decision quality signals | Requires code-based categorization |
| `DashboardActivity` | ✅ Robust | Audit trail per person | Requires parsing JSON details |
| `StaffMember` | ✅ Available | Staff roster per restaurant | Not linked to offline orders |
| `RestaurantManager` | ✅ Available | Manager roster, access control | Cross-restaurant attribution unclear |
| Order creation origin | ❌ Missing | Cannot trace offline creation | Logged to console, not persisted |

---

## Part 8: Recommended Implementation Sequence

1. **Phase 1 (Immediate):** Manager-level review analytics
   - No schema changes
   - Use `offline_review_by` + existing fields
   - Identify which managers have high escalation rates, poor docs, etc.
   - Files: 1-2 new files (metrics module + UI)

2. **Phase 2 (Future):** Operator-level creation analytics
   - Requires `offline_created_by` field on Order
   - Backward-compatible (optional field)
   - Track who created problematic offline orders
   - Files: Modify Order schema + metrics module

3. **Phase 3 (Optional):** Cross-restaurant pattern detection
   - Identify managers handling multiple restaurants with problems
   - Detect load imbalance (one manager > 60% of reviews)
   - Already partially supported by existing code

---

## Conclusion

✅ **Manager-level review attribution is robust and ready to implement immediately.**

❌ **Operator-level order creation attribution requires schema change (add `offline_created_by`).**

**Recommended:** Start with Phase 1 (manager analytics) using existing fields. This provides immediate value without schema changes. Phase 2 can be added later with schema expansion.

---

**Ready for Phase 1 Implementation:** Let's build manager/operator review analytics.