# Offline Review Anomaly Indicators

**Level:** Operational health signals. Not fraud certainty.  
**Approach:** Rule-based thresholds. Deterministic. Human-reviewed required.

---

## Overview

The system now detects and highlights 7 categories of operational anomalies in offline order review workflows. Each anomaly is a **signal** that warrants investigation, not proof of a problem.

---

## Anomaly Categories

### 1. **Flagged Offline Rate**

**What it measures:**
- % of all orders that were created offline, synced, and flagged for review
- Formula: `(flagged_count / total_orders) * 100`

**Why it matters:**
- Offline POS should handle edge cases only. High rate = systemic sync/validation issue
- Indicates potential problems with:
  - POS configuration
  - Network resilience
  - Validation logic

**Thresholds:**
| Rate | Severity | Interpretation |
|------|----------|---|
| 0–5% | ✅ OK | Normal edge case handling |
| 6–15% | ⚠️ Elevated | Monitor; investigate POS config |
| 16–25% | 🔴 High | Systemic issue; requires action |
| >25% | 🔴 Critical | Major problem; urgent review |

**Example:**
- 100 total orders, 20 flagged → 20% rate → RED alert
- 1000 total orders, 30 flagged → 3% rate → OK

---

### 2. **Escalation Rate**

**What it measures:**
- % of *reviewed* orders that were escalated vs resolved
- Formula: `(escalated_count / reviewed_count) * 100`

**Why it matters:**
- Indicates review decision patterns
- High rate = process is strict, or many genuine problems
- Low rate = process accepts most orders (potential rubber-stamping)

**Thresholds:**
| Rate | Severity | Interpretation |
|------|----------|---|
| 0–30% | ✅ OK | Healthy mix; most flagged acceptable |
| 31–50% | ⚠️ Elevated | Many problems detected |
| 51–70% | 🟡 High | Process may be too strict; review standards |
| >70% | 🔴 Critical | Process may be broken; very few accepted |

**Example:**
- 20 reviewed orders, 15 escalated → 75% rate → RED alert
- 20 reviewed orders, 5 escalated → 25% rate → OK

---

### 3. **Unresolved Backlog**

**What it measures:**
- Count and age of orders stuck in "new" (unreviewed) state
- Triggers if:
  - Count > 10 items, OR
  - Oldest item > 24h old

**Why it matters:**
- Operational burden; orders piling up
- Time cost: unreviewed items increase risk exposure
- Manager capacity issue

**Severity:**
| Condition | Severity |
|-----------|----------|
| 0 unresolved | ✅ None |
| > 10 unresolved | 🔴 Critical |
| Age > 24h (any count) | ⚠️ Warning |
| Age > 72h | 🔴 Critical |

**Example:**
- 5 unresolved, oldest 2h → OK
- 15 unresolved, oldest 5h → RED (count > 10)
- 5 unresolved, oldest 36h → YELLOW (age > 24h)

---

### 4. **Reason Code Concentration**

**What it measures:**
- If one reason code is used for >70% of all review decisions
- Formula: `(dominant_code_count / total_reviewed) * 100`

**Why it matters:**
- Single dominant code can indicate:
  - Accurate precision (legitimate)
  - Validation blind spot (masking real issues)
  - Rote decision-making (copy-paste justifications)
- Concentration >85% = critical (likely masking)

**Thresholds:**
| Concentration | Severity | Action |
|---|---|---|
| <70% | ✅ OK | Healthy diversity |
| 70–85% | ⚠️ Warning | Investigate if pattern is real |
| >85% | 🔴 Critical | High likelihood of blind spot |

**Example:**
- 20 reviewed: 15 "price_adjusted_on_sync", 5 "other" → 75% → YELLOW alert
- 20 reviewed: 18 "other", 2 "escalated" → 90% → RED alert

---

### 5. **Abuse-Suspicious Escalations**

**What it measures:**
- Count of escalations flagged with abuse/integrity-related codes:
  - `potential_abuse`
  - `large_price_mismatch`
  - `repeated_offline_issues`
- Triggers if:
  - Count ≥ 2 AND
  - % of escalations ≥ 5%

**Why it matters:**
- Indicates potential fraud/integrity issues
- Requires investigation before potential losses accumulate

**Severity:**
| Count | % of Escalations | Severity |
|---|---|---|
| 0–1 | Any | ✅ None |
| 2+ | <5% | ✅ None |
| 2+ | ≥5% | ⚠️ Warning |
| 3+ | ≥5% | 🔴 Critical |

**Example:**
- 10 escalated: 2 "potential_abuse", 8 "price_adjusted_on_sync" → YELLOW (20% abuse)
- 10 escalated: 3 "potential_abuse", 7 "other" → RED (30% abuse)

---

### 6. **Manager Load Imbalance**

**What it measures:**
- If one manager reviewed >60% of flagged orders
- Formula: `(top_manager_reviews / total_reviews) * 100`

**Why it matters:**
- Bus factor: knowledge/decisions concentrated in one person
- Fatigue risk: overloaded manager → sloppy reviews
- Bias risk: single person's standards dominate

**Severity:** Informational (not a blocker)

**Example:**
- 100 reviews: bob=70, alice=20, charlie=10 → YELLOW (bob 70%)
- Recommendation: distribute workload

---

### 7. **Documentation Gap**

**What it measures:**
- % of reviews that have notes/comments
- Triggers if: <50% have documented notes

**Why it matters:**
- Notes provide audit trail
- Without notes, decisions are unexplained
- Audit compliance risk

**Severity:** Informational

**Example:**
- 10 reviews: 3 with notes → 30% → YELLOW alert
- Recommendation: encourage managers to document decisions

---

## Rule Implementation

All rules are implemented in `lib/offline-review-anomaly-rules.js`:

```javascript
import { detectAnomalies } from '@/lib/offline-review-anomaly-rules';

const anomalies = detectAnomalies({
    totalOrders: 100,
    flaggedCount: 20,
    unresolvedCount: 5,
    reviewedCount: 20,
    escalatedCount: 8,
    oldestUnresolvedHours: 5,
    reasonCodes: { 'price_adjusted_on_sync': 12, 'other': 8 },
    reviews: [...],
    abuseSuspiciousCodes: { 'potential_abuse': 1 }
});

// Returns:
// {
//   anomalies: [
//     {type: 'flagged_rate', severity: 'high', percent: 20, message: '...'},
//     {type: 'reason_code_concentration', severity: 'warning', code: 'price_adjusted_on_sync', percent: 60, message: '...'}
//   ],
//   summary: {...},
//   severity: 'warning'
// }
```

---

## UI Display

### OfflineReviewHealthIndicator Component

Displays:
1. **Summary metrics** (flagged count, unresolved, escalated, resolved, documentation %)
2. **Anomaly alerts** (color-coded by severity)
3. **Reason code breakdown** (resolved vs escalated by code, abuse-related in red)
4. **Sync validation error distribution** (most common flags)
5. **Operational context** (review speed, top codes, manager count)

### Alert Colors

- 🔴 **Red (Critical):** Immediate action recommended
- 🟡 **Yellow (Warning):** Investigate and monitor
- 🔵 **Blue (Info):** Informational; helpful context
- ✅ **Green/Gray (OK):** No action needed

### Example Alert Layout

```
[Red alert box]
🔴 Flagged rate: 20% (20/100 orders). High: investigate POS configuration.

[Yellow alert box]
⚠️  Reason code concentration: 75% use "price_adjusted_on_sync". 
    Verify pattern is genuine or masking validation issues.

[Red alert box]
🔴 Abuse-related escalations: 2 potential_abuse cases (20% of escalations). 
    Investigate.
```

---

## Important Caveats

### ❌ These Are NOT

- Fraud proofs
- Behavioral predictions
- Certainty scores
- Automated enforcement triggers
- User behavior classification

### ✅ These ARE

- Operational health signals
- Rule-based thresholds
- Starting points for investigation
- Context for human review
- Audit trail helpers

### Investigation Required

Every anomaly requires human judgment:

1. **High flagged rate?**
   - Check POS configuration, network logs, sync timing
   - Verify if legitimate high-volume offline period
   - Not necessarily fraud

2. **High escalation rate?**
   - Review decision standards; are they too strict?
   - Check if genuine issues (customer issues, inventory)
   - Could be valid vigilance or over-caution

3. **Abuse escalations?**
   - Investigate each case individually
   - Cross-reference with payment data, customer history
   - Look for patterns, not single incidents

4. **Manager load imbalance?**
   - Understand assignment strategy
   - Check for fatigue or training needs
   - Not necessarily bias

---

## Configuration

All thresholds are editable in `lib/offline-review-anomaly-rules.js`. Example:

```javascript
// Change flagged rate critical threshold
export function flaggedRateAnomaly(flaggedRatePercent) {
    if (flaggedRatePercent <= 3) return 'ok';           // now 3% instead of 5%
    if (flaggedRatePercent <= 12) return 'elevated';    // now 12% instead of 15%
    if (flaggedRatePercent <= 20) return 'high';        // now 20% instead of 25%
    return 'critical';
}
```

After changes, re-run smoke tests to verify threshold impact.

---

## Testing

### Automated Coverage

File: `scripts/smoke/suites/offlineReviewAnomalies.smoke.js`

- 35+ tests covering all 7 anomaly types
- Threshold boundary testing
- Edge cases (divide by zero, empty data)
- Full integration test (detectAnomalies aggregation)

### Manual Coverage

- UI rendering of alerts
- Color coding and severity badges
- Click-through and drill-down accuracy
- Dashboard refresh behavior

Run tests:
```bash
npm run test:offline-anomalies
```

---

## Future Enhancements (Out of Scope)

- ❌ ML-based outlier detection
- ❌ Time-series forecasting
- ❌ Cross-restaurant pattern detection
- ❌ Automated enforcement actions
- ❌ Scoring algorithms

---

## Honesty

These are **signals, not proof**. A high flagged rate can mean:
- Legitimate offline period (heavy volume)
- POS sync bug (infrastructure issue)
- Validation threshold too strict (process issue)
- All of the above

**All anomalies require human investigation and judgment.**