# Offline Risk Digest — Operational Alerting Layer

**Status:** ✅ Complete  
**Date:** 2026-03-26  
**Purpose:** Lightweight operational summary for proactive issue surfacing without dashboard fatigue

---

## Overview

The Offline Risk Digest is a **deterministic summary layer** that surfaces critical, worsening, and actionable signals from the offline-risk analytics system.

**Not a notification system.** Not automated alerts. Just: *"Here's what matters right now if you check in."*

---

## What It Includes

### Portfolio Level (SuperAdmin)

#### 🚨 Critical Now

1. **Overdue Flagged Orders**
   - Orders `offline_review_status='new'` AND `needs_review=true` AND `age > 4 hours`
   - Displays: count, oldest age, order IDs + restaurant names
   - Action: Review and decide

2. **Top Risk Restaurants** (by risk score)
   - Ranked by: `(flagged_rate * 0.6) + (escalation_rate * 0.4)`
   - Top 5 shown
   - Includes: risk score, flagged%, escalation%
   - Action: Investigate that restaurant

3. **Abuse-Related Escalations**
   - Count of orders escalated as `potential_abuse`, `large_price_mismatch`, or `repeated_offline_issues`
   - Shows recent examples
   - Action: Review patterns

#### ⚠️ Watch (Worsening)

1. **Escalation Rate Trending Up**
   - If `escalation_rate_24h > escalation_rate_7d + 10 points`
   - Displays: 24h rate, 7d rate, delta
   - Action: Monitor shift window / manager patterns

2. **Operator Outliers**
   - Operators with `flagged_rate > avg_flagged_rate * 2`
   - Shows: email, rate, vs average
   - Action: Correlate with shift/operator analytics

#### 📊 Summary (24h)

- Total offline orders
- Total flagged + rate
- Total escalated + rate
- Restaurants with issues

---

### Restaurant Level (Manager/Admin)

#### 🚨 Critical Now

1. **Overdue Flagged Orders** (same criteria)
   - Scoped to this restaurant only
   - Shows order ID + age

2. **Operator Watch**
   - Operators with `flagged_rate > local_avg + 10 points`
   - Shows: name, flagged count, rate
   - Action: Review with operator

#### 📋 Next Action

1. **Top Reason Code**
   - Most common issue type at this restaurant
   - Displays: code + count
   - Action: Address systematic issue

#### 📊 Summary (24h)

- Offline orders, flagged, escalated
- Flagged rate

---

## Implementation

### Core Files

**lib/offline-digest-logic.js** (~350 lines)

```javascript
// Portfolio digest (SuperAdmin)
generatePortfolioDigest(orders, restaurants, portfolioAnalytics, operatorAnalytics)
  → digest object with critical/worsening/summary

// Restaurant digest (Manager)
generateRestaurantDigest(restaurantId, orders, restaurant, restaurantAnalytics)
  → restaurant-scoped digest

// Plaintext export
formatDigestAsPlaintext(digest)
  → copy-to-clipboard friendly plaintext

// Quick criticality check
isDigestCritical(digest)
  → boolean
```

**components/superadmin/OfflineRiskDigest.jsx** (~400 lines)

- SuperAdmin panel showing portfolio digest
- Critical/worsening/summary cards
- Copy-to-clipboard plaintext export
- Color-coded severity (red/orange/yellow)

**components/restaurant/RestaurantOfflineDigest.jsx** (~250 lines)

- Manager/admin view for their restaurant
- Overdue orders, operator watch, next actions
- Copy-to-clipboard export
- Simplified vs portfolio view

---

## Key Design Decisions

### 1. Deterministic (No ML/Guessing)

- All thresholds explicit and documented
- No "smart" ranking that changes unexpectedly
- Rules are comparative (vs average, vs baseline)

### 2. No Notification Spam

- Digest is a **pull-based summary**, not push
- Manager/SuperAdmin visits dashboard, sees digest
- No emails, no Slack, no alert fatigue

### 3. High Signal, Low Noise

**Included:**
- Overdue orders (concrete age > 4h)
- Abuse escalations (rare, serious)
- Worsening trends (50+ threshold for escalation rate change)
- Top risk restaurants (actual risk score ranking)

**Excluded:**
- Individual operator per-order detail (too granular)
- Temporal/shift patterns (too complex for digest)
- Every anomaly signal (would be noisy)

### 4. Role-Scoped

- SuperAdmin sees portfolio digest (all restaurants)
- Manager sees only their restaurant digest
- Enforced at component level + API query level

### 5. Human-Focused

- Summary text, not raw JSON
- Emojis for quick scannability
- Plaintext export for email/docs
- "This is a signal, not proof" disclaimer

---

## Prioritisation Logic

### What Makes Something "Critical"?

1. **Age matters**
   - Overdue orders (>4h unreviewed) = highest priority
   - Abuse escalations = immediate attention needed

2. **Trends matter**
   - Escalation rate up >10pts = watch
   - New anomaly pattern = investigate

3. **Scale matters**
   - Top 5 restaurants by risk = biggest impact
   - Top 2 operators by deviation = investigation targets

### Example Ranking

```
CRITICAL NOW (act immediately)
  1. 5 overdue orders (oldest 6h old)
  2. 2 abuse escalations
  3. Top 3 restaurants by risk

WATCH (next 24h)
  1. Escalation rate up 15pts (55% vs 40%)
  2. 2 operators with high flagged rates

SUMMARY
  Total metrics for context
```

---

## Visibility Boundaries

### SuperAdmin Digest
- ✅ All restaurants in portfolio
- ✅ All operators
- ✅ All escalations
- ✅ Worsening trends across network

### Manager Digest (Per-Restaurant)
- ✅ Only their restaurant's orders
- ✅ Only their restaurant's operators
- ✅ Only their restaurant's escalations
- ❌ Other restaurants, portfolio trends

---

## Usage Workflow

### For SuperAdmin

1. Open SuperAdmin → Operations → "Offline Risk Digest" (future)
2. Scan critical now section
3. If overdue orders: Click to review panel
4. If worsening trend: Check shift-window / operator analytics
5. Copy plaintext for team summary if needed

### For Restaurant Manager

1. Open Restaurant Dashboard → "Store Risk Digest" (future)
2. Check for overdue orders → review immediately
3. Check operator watch → discuss with team
4. Check next action (reason code) → address systematic issue

---

## Outputs

### UI (Dashboard Panel)
- Cards for critical/worsening/summary
- Color-coded severity
- Clickable drill-down (future)

### Plaintext Export
- Copy-to-clipboard friendly
- Suitable for email, team notes, reports
- Example:

```
=== OFFLINE RISK DIGEST ===
Generated: 2026-03-26 10:30 AM

🚨 CRITICAL NOW
  Overdue Flagged: 5 orders (oldest: 320m)
    - order-123: 320m old
    - order-456: 180m old
    - order-789: 150m old
  Top Risk Restaurants:
    - Store A: Risk 68, 35% flagged
    - Store B: Risk 52, 28% flagged
  Abuse Escalations: 2

⚠️ WATCH (WORSENING)
  Escalation Rate: 55% (24h) vs 40% (7d) — UP 15pts
  Operator Outliers:
    - op1@test.com: 45% flagged (avg 20%)

📊 SUMMARY
  Total Offline: 247
  Flagged: 62 (25%)
  Escalated: 25 (40%)
```

---

## Limitations (Explicit)

### ❌ What It Is NOT

- Not a root cause analyzer (signals only)
- Not a performance evaluation system (for human review only)
- Not real-time (summary at check-in time)
- Not automated enforcement (no auto-actions)
- Not proof of wrongdoing (flags patterns for investigation)

### ✅ What It IS

- A summary signal layer
- Human-curated alerting (you decide what matters)
- Operational awareness tool
- Starting point for investigation

---

## Future Extensions (Not Included)

1. **Scheduled Digest Email** — Daily/weekly plaintext summary sent to SuperAdmin
2. **Custom Thresholds** — Operators can adjust what counts as "critical"
3. **Historical Trends** — Track digest items over time (trending up/down)
4. **Drill-Down Actions** — Click through to specific review workflows
5. **Multi-Store Manager** — Digest for managers overseeing multiple locations

---

## Testing

**File:** `scripts/smoke/suites/offlineDigest.smoke.js`

**Tests (10):**

1. ✅ Portfolio digest generation
2. ✅ Restaurant digest generation
3. ✅ Overdue orders correctly identified (>4h)
4. ✅ Critical ranking by risk score
5. ✅ Worsening trend detection (escalation up >10pts)
6. ✅ Abuse spike detection (≥2 abuse escalations)
7. ✅ Operator outliers identified (>2x avg)
8. ✅ Plaintext formatting includes sections
9. ✅ Criticality check (has critical items)
10. ✅ Role visibility boundaries (SuperAdmin vs manager)

All tests deterministic, no external dependencies.

---

## Summary

| Item | Details |
|------|---------|
| **Purpose** | Lightweight operational summary for proactive awareness |
| **Audience** | SuperAdmin, restaurant managers |
| **Delivery** | Dashboard panel + plaintext export |
| **Update Frequency** | On-demand (when dashboard is opened) |
| **Signal Tightness** | High (only critical/worsening items) |
| **Role Scoping** | Yes (SuperAdmin vs manager visibility) |
| **Automation** | None (human-driven, no actions) |
| **Production Ready** | Yes |

---

**Status:** ✅ Phase 1 Complete  
**Next:** Schedule email digest (Phase 2, optional)  
**Delivery Date:** 2026-03-26