# Manager/Operator-Level Offline Review Analytics

**Status:** ✅ Phase 1 Complete (Manager Analytics)  
**Date:** 2026-03-26  
**Scope:** Manager-level review metrics, outlier detection, cross-restaurant visibility

---

## Overview

Extends offline review monitoring from **restaurant-level** to **people-level** visibility.

**Problem:** Admins could see restaurants with high escalation rates but couldn't identify which specific managers were responsible for poor review quality.

**Solution:** Track and analyze review actions by individual managers, flag outlier patterns, and enable drill-down investigation.

---

## Part 1: What Is Captured

### Manager Identity
- `offline_review_by` — Manager email who performed the review
- Persisted on Order entity ✅
- Audit logged in DashboardActivity ✅

### Review Actions Tracked
- Acknowledge / Resolve / Escalate decisions
- Reason codes (structured categorization)
- Review notes (documentation quality)
- Review timestamps (response time)
- Overdue detection (>4h old when reviewed)

### Data Points Per Manager

| Metric | Type | Meaning |
|--------|------|---------|
| **Total Reviews** | Count | Orders reviewed by this manager |
| **Escalation Rate** | % | Escalated / (Resolved + Escalated) |
| **Resolution Rate** | % | Resolved / (Resolved + Escalated) |
| **Documentation Rate** | % | Reviews with notes / total reviews |
| **Average Review Age** | Hours | Time from sync to review (avg) |
| **Unresolved Backlog** | Count | Orders pending review |
| **Abuse Escalations** | Count | Escalations with potential_abuse/price_mismatch codes |
| **Reason Code Distribution** | Map | Most-used codes per manager |

---

## Part 2: Manager Metrics & Rankings

### Calculation

For each manager, aggregate orders where:
- `offline_created = true` (offline order)
- `offline_review_by = {manager_email}` (reviewed by this person)

Group by email and calculate metrics:

```javascript
// Escalation rate
escalationRate = escalatedCount / (escalatedCount + resolvedCount)

// Documentation quality
documentationRate = reviewsWithNotes / totalReviews

// Average review speed
averageReviewAgeHours = mean(review_timestamps - sync_timestamps)
```

### Ranking Order

Primary: **Escalation Rate** (DESC) — Higher = more risk  
Secondary: **Documentation Rate** (ASC) — Lower = more risk  
Tertiary: **Total Reviews** (DESC) — More visibility

**Result:** Managers with concerning escalation rates appear first.

---

## Part 3: Outlier Flags (6 Types)

Each outlier is a **signal for investigation**, not proof of misconduct.

### 1. Highest Escalation Rate
- **Threshold:** >50% of completed reviews escalated
- **Why it matters:** Indicates many orders flagged as problematic
- **Possible causes:**
  - Process too strict
  - Manager highly cautious (legitimate)
  - Systemic validation issues at restaurants managed
  - Actual fraud patterns
- **Action:** Review recent escalations; check if concentrated at specific restaurant(s)

### 2. Lowest Documentation Rate
- **Threshold:** <50% of reviews have notes (min 3 reviews)
- **Why it matters:** Audit trail gaps, harder to trace decisions
- **Possible causes:**
  - Time pressure
  - Unclear policy
  - Manager style
- **Action:** Remind team to add contextual notes

### 3. Highest Reason Code Concentration
- **Threshold:** >70% of reviews use single code
- **Why it matters:** May indicate blind spot or template thinking
- **Example:** Manager uses "price_adjusted_on_sync" for 92% of reviews
- **Action:** Review variety of codes; verify if pattern is genuine

### 4. Most Abuse-Related Escalations
- **Threshold:** ≥2 escalations with codes: potential_abuse, large_price_mismatch, repeated_offline_issues
- **Why it matters:** Concentrated fraud signal
- **Action:** Investigate the 2+ cases; look for patterns

### 5. Slowest Review Time
- **Threshold:** >8h average review age (min 3 reviews)
- **Why it matters:** Slow response indicates workload or engagement issue
- **Action:** Consider load distribution or training

### 6. Largest Unresolved Backlog
- **Threshold:** >3 orders pending review
- **Why it matters:** Reviews not acted upon; potential delays
- **Action:** Triage backlog; check if manager is available

---

## Part 4: UI & Views

### SuperAdmin Dashboard

**Path:** SuperAdmin > Operations > Manager Analytics

**Features:**
- Summary cards (total managers, average escalation rate)
- Outliers section (red background, all 6 types highlighted)
- Sortable/filterable manager table:
  - Sort by: Escalation Rate / Documentation / Total Reviews / Review Speed
  - Filter by: All Restaurants / Specific Restaurant
- Manager ranking table with metrics
- "View" button for drill-down detail modal
- Detail modal shows reason code distribution, review counts

**Role Visibility:**
- ✅ SuperAdmin: See all managers across all restaurants
- ⚠️ Restaurant Admin: (Not yet implemented — future phase)
- ❌ Regular Users: No access

### Information Displayed

Each manager row shows:
- **Name & Email** — Who
- **Total Reviews** — Volume (blue badge)
- **Escalation %** — Color-coded red/yellow/green
- **Documentation %** — Color-coded red/yellow/green
- **Avg Review Time** — Hours (red if >8h)
- **Unresolved Count** — Red badge if >0
- **Action Button** — "View" detail modal

---

## Part 5: Files & Implementation

### Created
- `lib/manager-operator-analytics.js` (410 lines)
  - Core metrics calculation
  - Ranking logic
  - Outlier detection
  - Cross-restaurant aggregation

- `components/superadmin/ManagerOperatorAnalytics.jsx` (400 lines)
  - SuperAdmin dashboard component
  - Sort/filter controls
  - Manager ranking table
  - Detail modal

- `scripts/smoke/suites/managerOperatorAnalytics.smoke.js` (320 lines)
  - 20+ automated test cases
  - 5 manual UI test scenarios

- `docs/MANAGER_OPERATOR_ANALYTICS.md` (This file)
  - Complete guide

### Modified
- `pages/SuperAdmin` (2 changes)
  - Added "Manager Analytics" menu item
  - Added route to component

---

## Part 6: Data Attribution

### What Is Captured ✅

| Source | Field | Use Case |
|--------|-------|----------|
| Order entity | `offline_review_by` | Identify reviewer |
| Order entity | `offline_review_status` | Track decision (resolve/escalate) |
| Order entity | `offline_review_reason_code` | Categorize reason |
| Order entity | `offline_review_notes` | Document quality |
| Order entity | `offline_review_at` | Review timestamp |
| DashboardActivity | `user_email`, `details` | Audit trail |

### What Is NOT Captured ❌

| Item | Why Missing | Future Phase |
|------|------------|--------------|
| `offline_created_by` | Not persisted on Order | Phase 2 (schema change) |
| Staff role | No link to StaffMember | Phase 2 (POS integration) |
| POS operator identity | Logged to console only | Phase 2 (capture on creation) |

---

## Part 7: Privacy & Role Boundaries

### SuperAdmin Access
- ✅ View all managers across all restaurants
- ✅ Rank by metrics
- ✅ Identify problematic patterns
- ✅ Drill down to individual manager data

### Restaurant Admin Access (Future Phase)
- Will see only own restaurant's managers
- Cannot see metrics for other restaurants

### Regular Users & Staff
- ❌ No access to manager analytics

---

## Part 8: Example Usage

### Example 1: High Escalation Flag

```
Outliers:
🔴 Highest escalation rate: Alice (75%)

Manager Analytics:
  Alice | 20 reviews | 75% escalation | 60% documentation

Action:
  1. View Alice's recent escalations
  2. Check if concentrated at specific restaurant
  3. Verify if process is too strict or legitimate safety concern
  4. Discuss with Alice if needed
```

### Example 2: Poor Documentation Flag

```
Outliers:
🟡 Lowest documentation: Bob (25%)

Manager Analytics:
  Bob | 8 reviews | 50% escalation | 25% documentation

Action:
  1. Remind Bob to add contextual notes
  2. Check if time pressure or unclear policy
  3. Provide template/guidelines if helpful
```

### Example 3: Abuse Signal

```
Outliers:
🔴 Most abuse escalations: Carol (3)

Manager Analytics:
  Carol | 12 reviews | 45% escalation | 75% documentation

Action:
  1. Review the 3 abuse-flagged orders
  2. Identify if patterns exist
  3. Decide if escalations are justified or false positives
```

---

## Part 9: Testing & Coverage

### Automated Tests (20+)
- Metrics calculation (7 tests)
- Ranking correctness (2 tests)
- Outlier detection (6 tests)
- Cross-restaurant aggregation (3 tests)

### Manual Tests (5 scenarios)
1. Manager ranking displays in escalation rate order
2. Filtering by restaurant shows only that restaurant's managers
3. Sorting by different metrics changes order
4. Outlier section highlights all 6 types
5. "View" button opens detail modal with correct data

---

## Part 10: Limitations & Honesty

### What This System Does
✅ Track manager review patterns  
✅ Identify outlier behavior (high escalations, poor docs, slow response, etc.)  
✅ Enable drill-down investigation  
✅ Rank managers by review quality signals  

### What It Does NOT Do
❌ Prove misconduct (signals, not proof)  
❌ Track operator (staff) creation of orders  
❌ Monitor cross-restaurant patterns (Phase 2 feature)  
❌ Predict future behavior  
❌ Automate decisions  

### Still Requires Human Judgment
- All outlier flags are **starting points for investigation**
- High escalation rates could be legitimate (process is strict but correct)
- Low documentation could be time pressure, not negligence
- Slow reviews could indicate workload, not disengagement
- Abuse escalations need context before action

---

## Part 11: Future Phases

### Phase 2: Operator-Level Creation Analytics
**Requires:** Add `offline_created_by` field to Order entity
- Track which POS operators create high-flagged-rate orders
- Identify operators with validation issues
- Correlate operator training needs

### Phase 3: Cross-Restaurant Patterns
- Managers handling multiple restaurants
- Load imbalance detection
- Restaurant-specific manager performance

### Phase 4: Historical Trending
- Daily/weekly snapshots of manager metrics
- Trend analysis (improving/stable/worsening)
- Seasonal patterns

---

## Part 12: Configuration

All thresholds **configurable** in code:

```javascript
// In lib/manager-operator-analytics.js
const ESCALATION_THRESHOLD = 50;      // Flag if >50%
const DOCUMENTATION_MIN = 50;          // Flag if <50%
const REVIEW_TIME_SLOW = 8;            // Hours (flag if >8h avg)
const CODE_CONCENTRATION = 70;         // Flag if >70%
const ABUSE_MIN_COUNT = 2;             // Flag if >=2
const UNRESOLVED_MIN = 3;              // Flag if >3 pending
```

To adjust:
1. Modify thresholds in `lib/manager-operator-analytics.js`
2. Update documentation in this guide
3. Run smoke tests: `npm run test:manager-analytics`
4. Deploy

---

## Part 13: Summary

**Manager/operator analytics transforms per-restaurant monitoring into people-level visibility.**

- Calculate review quality metrics per manager
- Rank managers by concerning patterns
- Flag 6 types of outliers (escalations, documentation, speed, backlog, concentration, abuse)
- Enable drill-down investigation
- Maintain clear role boundaries

**No automation. Pure metrics and signals for human decision-making.**

---

## Quick Reference

**File Structure:**
- Metrics logic: `lib/manager-operator-analytics.js`
- UI component: `components/superadmin/ManagerOperatorAnalytics.jsx`
- Tests: `scripts/smoke/suites/managerOperatorAnalytics.smoke.js`
- Menu: `pages/SuperAdmin` (added "Manager Analytics" item)

**Key Thresholds:**
- Escalation rate: >50% flag
- Documentation: <50% flag (min 3 reviews)
- Review speed: >8h avg flag (min 3 reviews)
- Reason code concentration: >70% flag
- Abuse escalations: ≥2 flag
- Unresolved backlog: >3 flag

**Access:**
- SuperAdmin: Full access (all restaurants, all managers)
- Admin/Manager: Not yet available (future phase)
- Regular users: No access

---

**Delivered:** 2026-03-26 ✅