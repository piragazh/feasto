# Offline Review Reporting Audit & Anomaly Plan

## Part 1: Current State Analysis

### ✅ What's Already In Place

1. **OfflineOrdersReview component** (pages/components/restaurant/OfflineOrdersReview.jsx)
   - Displays flagged orders list
   - Shows unresolved count with filtering (Pending, Flagged, All Offline)
   - Displays sync_validation_notes
   - Shows overdue badge (>4h pending)
   - Lists review state and reviewer info
   - Structured reason codes shown per order

2. **OfflineReviewStats component** (components/restaurant/OfflineReviewStats.jsx)
   - Summary cards: Pending, Acknowledged, Resolved, Escalated, Documentation%
   - Overdue count tracked (>4h)
   - Notes ratio calculation (% with documented reviews)
   - Reason code breakdown by count + decision split
   - Top-level summary, not per-restaurant

3. **OfflineReviewAnalytics component** (components/restaurant/OfflineReviewAnalytics.jsx)
   - Bar chart of decisions by reason code
   - Resolved % vs Escalated %
   - Summary table with code counts
   - Basic insight: "high resolution rate" or "many escalated"
   - Per-restaurant visible in dashboard

4. **Audit Logging** (functions/offlineOrderReview.js)
   - Records action, reason_code, review_notes to DashboardActivity
   - Captures review_age_hours, was_overdue, sync_validation_notes
   - User email + timestamp logged

### ⚠️ Critical Gaps

**Gap 1: No Time-Based Trends**
- Stats are current snapshot only
- No visibility into whether flagged rate is increasing/decreasing
- No historical reason-code distribution
- Can't spot "sudden surge of potential_abuse" or "price_adjusted_on_sync explosion"

**Gap 2: No Operational Anomaly Indicators**
- High flagged offline rate not flagged (e.g., 20% of orders flagged = risk signal)
- High escalated rate not flagged
- Repeated single reason code dominance invisible (e.g., 80% all "other" = poor validation)
- Long unresolved queue not highlighted
- Manager volume anomalies (one manager resolved 50/100 flagged) not visible

**Gap 3: No Restaurant-Level Comparison**
- Stats per restaurant only
- No "platform view" showing which restaurants have anomalies
- No trend comparison (restaurant A: 5% escalated vs restaurant B: 30% escalated)
- Overdue handling not compared across restaurants

**Gap 4: Escalation Quality Invisible**
- All escalations treated equal
- No distinction between risky escalations (potential_abuse) vs normal (policy_review)
- No tracking of what happens after escalation

**Gap 5: Offline Sync Validation Divorced from Review Decisions**
- sync_validation_notes exist but not aggregated
- Can't see: "which sync validation errors are most common?"
- Can't see: "what % of validation errors get escalated?"
- Relationship between validation flag reason and review decision invisible

---

## Part 2: Minimal Anomaly Detection Plan

### Three-Tier Approach

**Tier 1: Per-Restaurant Summary Analytics**
- Extend OfflineReviewStats to calculate:
  - Total flagged in last 7 days vs. total online orders (flagged rate %)
  - Unresolved % of flagged
  - Overdue % of unresolved
  - Escalated % of reviewed
  - Escalated breakdown: potential_abuse / price_mismatch / other
  - Avg review age (how fast reviewed)
  - % with documented notes

**Tier 2: Lightweight Anomaly Rules**
- **Flagged Rate Spike**: If flagged % > 15% of orders → yellow warning; > 25% → red alert
- **High Escalation**: If escalated % > 50% → yellow; > 70% → red
- **Unresolved Backlog**: If unresolved count > 10 or avg age > 24h → yellow; > 3 days → red
- **Suspicious Pattern**: If any single reason code > 70% of reviewed → flag "concentration"
- **High Abuse Signals**: If potential_abuse + large_price_mismatch > 5% of all → yellow
- **Manager Volume**: If one manager reviewed >60% of orders → note "imbalanced load"

**Tier 3: Pattern Visibility**
- Show top 3 reason codes with trend (↑ or ↓)
- Highlight escalated items by type (potential_abuse in red, others in orange)
- Show sync validation error distribution (what flags are most common?)
- Comparison view: this restaurant vs platform average

### Why These Rules?

- **Flagged Rate**: POS offline mode should be rare edge case; 15%+ suggests systemic issue
- **Escalation**: >50% escalated = more problems than solutions; > 70% = broken process
- **Backlog**: Unresolved > 10 or > 24h = operational burden; needs attention
- **Concentration**: One reason code > 70% = either fake precision or real issue (need investigation)
- **Abuse**: potential_abuse or large_price_mismatch escalations = fraud/integrity risk
- **Manager Load**: Imbalance = bus factor + fatigue risk

---

## Part 3: UI/Display Plan

### 1. Extend OfflineReviewStats → OfflineReviewHealthIndicator

New component (replace or enhance OfflineReviewStats):
```
[Summary cards]
- Total Flagged (7d)        | Unresolved | Overdue | Escalated
- Flagged Rate: 12% (ok)    | 3 (2 overdue)
                            
[Anomaly Indicators]
IF flagged_rate > 15%: 
  ⚠ Offline sync issues detected (12% of orders). Check POS configuration.
  
IF escalated_pct > 50%:
  ⚠ High escalation rate (65%). Review decisions may need policy update.
  
IF unresolved_count > 10 AND avg_age_hours > 24:
  🔴 Unresolved backlog: 15 orders, avg 32h old. Triage required.
  
IF any reason_code_pct > 70%:
  ⚠ Concentration: 75% of reviews are "price_adjusted_on_sync". 
     Verify if pattern is genuine or masking validation issues.

[Reason Code Breakdown]
  ✓ Resolved (8 orders)
    - price_adjusted_on_sync: 5 (↓ from 8 last week)
    - acceptable_policy_override: 2
    - customer_already_served: 1
    
  ⚠ Escalated (4 orders)
    - potential_abuse: 2 🔴 [RED HIGHLIGHT]
    - large_price_mismatch: 1
    - repeated_offline_issues: 1
    
[Escalation Risk Summary]
  Potential Abuse Count: 2 (detected in last 7 days)
  Price Mismatch: 1
  → Overall risk: MEDIUM (watch for patterns)
```

### 2. Add to Analytics Tab

New tab or card in restaurant analytics showing:
- 7-day flagged rate trend (sparkline: ↑ bad, ↓ good)
- Resolution speed (median hours to review)
- Escalation breakdown by category
- Sync validation error frequency (top errors)

### 3. Dashboard Alerts

In RestaurantDashboard sidebar:
- Offline Orders badge shows unresolved count
- Badge turns yellow if anomaly detected
- Tooltip shows: "3 unresolved, flagged rate 18% (elevated)"

---

## Part 4: Implementation Checklist

### Files to Create/Modify

1. **NEW: components/restaurant/OfflineReviewHealthIndicator.jsx**
   - Replaces OfflineReviewStats in OfflineOrdersReview
   - Computes anomaly rules
   - Renders tiered alerts

2. **NEW: lib/offline-review-anomaly-rules.js**
   - Pure functions for threshold checks
   - Deterministic rule application
   - Testable

3. **MODIFY: components/restaurant/OfflineOrdersReview.jsx**
   - Import OfflineReviewHealthIndicator
   - Swap OfflineReviewStats → OfflineReviewHealthIndicator
   - Pass orders to indicator

4. **NEW: scripts/smoke/suites/offlineReviewAnomalies.smoke.js**
   - Test all anomaly rules
   - Verify threshold calculations
   - Edge case coverage

5. **NEW: docs/OFFLINE_REVIEW_ANOMALY_INDICATORS.md**
   - Explain each rule
   - Document thresholds
   - Clarify "indicators ≠ proof"

### Data Queries Needed

Per-restaurant, per-week:
- Count of flagged orders
- Count of total orders (to calc flagged %)
- Unresolved count + oldest age
- Escalated count + breakdown by code
- Average review age
- Notes ratio
- Sync validation error distribution
- Manager contribution breakdown

All pulled from:
- Order entity (offline_created, needs_review, offline_review_status, offline_review_reason_code)
- DashboardActivity (action, details, user_email, created_date)

---

## Part 5: Not Building (Out of Scope)

- ❌ ML-based anomaly detection
- ❌ Prediction models
- ❌ Behavioral scoring
- ❌ Complex time-series forecasting
- ❌ "Fraud certainty" scores
- ❌ Cross-platform fraud rings detection

**We are** building rule-based operational health indicators.

---

## Part 6: Honesty Statement

These indicators are **signals, not proof**:
- High flagged rate can mean POS config issue OR legitimate high-volume offline period
- High escalation can mean policy enforcement OR overly strict review standards
- potential_abuse escalations are suspicious but need investigation
- Manager volume imbalance can be assignment or competence

**All alerts require human review.**