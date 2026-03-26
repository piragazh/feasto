# Restaurant-Scoped Offline Risk Overview

## Overview

The **Restaurant Offline Risk Overview** provides store-level leaders with a practical local control center for managing offline-synced orders—without exposing portfolio-level data or cross-store rankings.

**For:** Restaurant admins and managers  
**Scope:** Single restaurant only  
**Data:** Local orders, local operators, local trends

---

## What's Included

### **Local Cards**

| Card | Source | What It Shows | Scoping |
|------|--------|---------------|---------|
| **Local Critical Alert** | Live orders | Overdue flagged + operator watch (this store) | Filtered by `restaurant_id` |
| **Unresolved Backlog** | Live orders | Top 4 oldest pending flagged orders | Filtered by `restaurant_id` |
| **Local Operator Outliers** | Derived | Operators in THIS restaurant with high flag rates | Operators from local orders only |
| **Local Escalation Trend** | Derived | Escalation trend for THIS store (24h vs 7d) | Calc from local orders |
| **Latest Snapshot** | Scheduled | Latest digest snapshot for THIS restaurant | `scope='restaurant'` |
| **Quick Navigation** | Static | Links to local actions (review queue, analytics, etc.) | Hardcoded local URLs |
| **Freshness Indicator** | Page state | Last refresh time + snapshot age + stale warning | Refreshes local data only |

### **NOT Included (SuperAdmin-Only)**

❌ Portfolio ranking ("Top Risk Stores")  
❌ Cross-store comparisons  
❌ Other restaurants' data  
❌ Platform-wide operator analytics  
❌ Manager/cross-team visibility

---

## Access Control

### **Who Can Access?**

✅ Restaurant admins (role = 'admin' + RestaurantManager record)  
✅ Restaurant managers (same)  
❌ Users without RestaurantManager assignment  
❌ Other restaurants' staff

### **Scoping Enforcement**

```javascript
// Page checks:
1. User is authenticated
2. User has RestaurantManager record
3. RestaurantManager.restaurant_ids includes the target restaurant
4. If not: show "Access Denied" error
```

### **Query Filtering**

All orders queried with filter:
```
{ restaurant_id: restaurantId, offline_created: true }
```

All snapshots queried with filter:
```
{ scope: 'restaurant', scope_id: restaurantId }
```

**Result:** No cross-store data leakage possible.

---

## Data Architecture

### **Local Order Analytics**

```
Orders fetched:
  ├─ Filter by restaurant_id
  ├─ Filter by offline_created = true
  └─ Calculate local metrics:
      ├─ Overdue count / oldest age
      ├─ Flagged count / flagged rate
      ├─ Operator stats (per staff member)
      └─ Escalation trend (local)
```

### **Restaurant-Scoped Digest**

Generated from local orders only:
```javascript
generateRestaurantDigest(restaurantId, localOrders, restaurant)
```

Returns:
- `critical_now` — overdue orders + local operator outliers
- `watch_worsening` — local escalation trend
- `summary_metrics` — counts/rates for THIS store

### **Local Snapshot**

Queried as:
```
scope = 'restaurant'
scope_id = restaurantId
```

Scheduled function creates restaurant-scoped snapshots every 5-10 min.

---

## Freshness Model

Same as SuperAdmin, but scoped to restaurant:

- 🟢 **Fresh** — ≤ 5 min old
- 🟡 **Aging** — 5–15 min old
- 🔴 **Stale** — > 15 min old (warning)

### **Refresh Behavior**

**Manual:** Click "Refresh" → refetch restaurant + orders + local snapshots (< 1s)  
**Auto (optional):** Every 5 min if enabled (off by default)

---

## Source Labels

Each card displays its data origin:

| Card | Label | Meaning |
|------|-------|---------|
| Local Critical Alert | 📊 Live Data | Real-time order queries |
| Unresolved Backlog | 📊 Live Data | Real-time order queries |
| Operator Outliers | 🔀 Derived | Calculated from local orders |
| Escalation Trend | 🔀 Derived | Calculated from local orders |
| Latest Snapshot | 📸 Latest Snapshot | Scheduled digest |

---

## Quick Navigation

Four quick-action links (all local):

1. **Review Flagged Orders** → Full review queue for this restaurant
2. **Local Analytics** → Detailed analytics for this store
3. **Temporal Analysis** → Shift-window insights (when available)
4. **Digest History** → Past snapshots for this restaurant

All links stay within restaurant scope.

---

## Limitations

### ❌ What's Not Available

1. **No cross-store comparison** — Can't see how this store ranks vs others
2. **No portfolio view** — No portfolio-level analytics
3. **No manager comparisons** — Can't compare other restaurants' managers
4. **No platform-wide operators** — Only local staff visible
5. **No real-time streaming** — Same 5-min polling as SuperAdmin

### ❌ What Remains SuperAdmin-Only

- Portfolio ranking ("Top Risk Stores")
- Cross-store analytics
- System-wide outlier detection
- Admin-level platform settings
- Multi-restaurant management

---

## User Workflow

### **As a Restaurant Manager:**

1. **Open Restaurant Offline Risk Overview** → See local status at a glance
2. **Check freshness badge** → Know how current the data is
3. **Scan critical issues** → Overdue orders? Operator watch?
4. **Click "Review Flagged Orders"** → Manage specific orders
5. **Check "Local Analytics"** → Drill into patterns
6. **Enable auto-refresh** if managing active incident → Get 5-min updates

### **Key Actions:**

- Review and acknowledge flagged orders (in detail view)
- Track operator performance trends (temporal analysis)
- Understand why orders are flagged (digest history)
- Know when data is stale (freshness indicator)

---

## Technical Implementation

### **Files**

**New pages:**
- `pages/RestaurantOfflineRiskOverview.jsx` — Main page

**New components:**
- `components/restaurant/OfflineRiskControlCenter/LocalCriticalAlert.jsx`
- `components/restaurant/OfflineRiskControlCenter/LocalOperatorOutliersCard.jsx`
- `components/restaurant/OfflineRiskControlCenter/LocalEscalationTrendCard.jsx`
- `components/restaurant/OfflineRiskControlCenter/LocalQuickNavigationPanel.jsx`

**Reused (with scoping):**
- `FreshnessIndicator` — Page-level freshness
- `SourceLabel` — Card data-origin labels
- `UnresolvedBacklogCard` — Filtered by restaurant
- `LatestSnapshotCard` — Restaurant snapshot

### **Routing**

```
/RestaurantOfflineRiskOverview?restaurant_id=rest-123
```

Can also auto-detect from RestaurantManager assignment.

### **Access Control**

Enforced in page component:
1. Fetch user + manager record
2. Verify restaurant_id is in manager's list
3. If not, show "Access Denied"

### **Data Fetching**

```javascript
// Orders
base44.entities.Order.filter({
  restaurant_id: scopedRestaurantId,
  offline_created: true
})

// Snapshots
base44.entities.DigestSnapshot.filter({
  scope: 'restaurant',
  scope_id: scopedRestaurantId
})
```

---

## Testing Coverage

**Smoke tests:** `scripts/smoke/suites/restaurantOfflineRiskOverview.smoke.js`

**Coverage (12 tests):**
✅ Restaurant scoping enforced  
✅ Access control (denied)  
✅ Access control (allowed)  
✅ Local critical alert renders  
✅ Unresolved backlog filtered  
✅ Operator outliers (local only)  
✅ Escalation trend (local)  
✅ Snapshot restaurant-scoped  
✅ Quick navigation links local  
✅ Freshness indicator works  
✅ No portfolio ranking leaked  
✅ No cross-store data leaked

---

## Frequently Asked Questions

### **Q: Can a manager see other restaurants' data?**
**A:** No. Access control verifies the restaurant_id against their RestaurantManager assignment. If not approved, the page shows "Access Denied."

### **Q: Can this view compare me to other stores?**
**A:** No. This is intentionally local-only. Portfolio comparisons remain in SuperAdmin.

### **Q: Can I see other operators?**
**A:** No. Only operators from YOUR restaurant (staff who created offline orders) appear.

### **Q: How often does the snapshot update?**
**A:** Every 5-10 minutes via scheduled function. You can also click "Refresh" for manual updates.

### **Q: What if I enable auto-refresh?**
**A:** The page will refresh all local data every 5 minutes. Default is OFF to avoid polling overhead.

### **Q: Is this a replacement for the full review queue?**
**A:** No. This is a summary/overview layer. Click "Review Flagged Orders" for the detailed queue with full actions.

---

## Remaining Limitations (Future Enhancements)

- [ ] No real-time webhooks (polling only)
- [ ] Snapshot lag (5-10 min schedule)
- [ ] No granular per-card refresh
- [ ] No historical per-field tracking
- [ ] No failed-refresh retry

---

## Quick Reference

| Question | Answer |
|----------|--------|
| **Who can access?** | Restaurant admins/managers with RestaurantManager assignment |
| **Can I see other stores?** | No. Access control enforces restaurant scoping. |
| **Can I see other operators?** | No. Only local staff visible. |
| **How fresh is the data?** | Check status badge (🟢/🟡/🔴) and timestamp |
| **How do I refresh?** | Click "Refresh" button or enable 5-min auto-refresh |
| **Where do I review orders?** | Click "Review Flagged Orders" quick link |
| **Where's the detailed analytics?** | Click "Local Analytics" quick link |
| **What if data is stale?** | Stale warning (🔴) appears after 15 min without refresh |