# Offline Review Severity Scoring & Prioritisation

**Level:** Operational alert prioritisation system  
**Status:** ✅ Complete  
**Date:** 2026-03-26

---

## Overview

Transforms 7 independent anomaly signals into a **ranked, actionable priority list** with:
- Normalized severity levels (LOW → MEDIUM → HIGH)
- Aggregated risk score
- Overall operational status
- Next action hints per alert

**No automation.** Pure prioritisation for human decision-making.

---

## Part 1: Severity Model

### 3-Level Severity Scale

All anomalies map to: **LOW** → **MEDIUM** → **HIGH**

Each level has:
- **Numeric score:** LOW=1, MEDIUM=2, HIGH=3
- **Color coding:** Yellow → Orange → Red
- **Icon:** Clock → AlertTriangle → AlertCircle
- **Next action hint:** Guidance for what to do

### Rule-Specific Severity Bands

#### 1. Flagged Rate (% of orders flagged)

| Severity | Band | Interpretation |
|----------|------|---|
| LOW | 5–15% | Monitor POS; minor issues |
| MEDIUM | 15–25% | Investigate POS config |
| HIGH | >25% | Urgent: systemic sync/validation problem |

**Next Actions:**
- LOW: "Monitor POS sync performance"
- MEDIUM: "Review POS configuration; check network stability"
- HIGH: "Urgent: investigate sync/validation issues"

---

#### 2. Escalation Rate (% of reviewed orders escalated)

| Severity | Band | Interpretation |
|----------|------|---|
| LOW | 30–50% | Healthy: most orders acceptable |
| MEDIUM | 50–70% | Many issues detected; audit criteria |
| HIGH | >70% | Process broken: rejecting almost everything |

**Next Actions:**
- LOW: "Review escalation criteria; maintain standards"
- MEDIUM: "Audit decision standards; may be too strict"
- HIGH: "Critical: review process may be broken"

---

#### 3. Unresolved Backlog (pending review queue)

| Severity | Band | Interpretation |
|----------|------|---|
| LOW | 5–10 items (age <24h) | Minor queue; monitor |
| MEDIUM | 10–15 items (age 24–48h) | Growing backlog; add capacity |
| HIGH | >15 items OR age >48h | Urgent: clear queue |

**Next Actions:**
- LOW: "Monitor review queue; maintain pace"
- MEDIUM: "Increase review capacity; assign more reviewers"
- HIGH: "Urgent: clear pending review queue"

---

#### 4. Reason Code Concentration (single code dominance)

| Severity | Band | Interpretation |
|----------|------|---|
| LOW | 70–80% | Monitor; mostly normal diversity |
| MEDIUM | 80–90% | Likely masking validation issues |
| HIGH | >90% | Critical: code distribution is broken |

**Next Actions:**
- LOW: "Monitor reason code distribution"
- MEDIUM: "Investigate if concentration is genuine"
- HIGH: "Urgent: verify codes aren't masking issues"

---

#### 5. Abuse-Suspicious Escalations (integrity risk)

| Severity | Band | Interpretation |
|----------|------|---|
| LOW | 2 cases @ 5–10% of escalations | Watch; low volume |
| MEDIUM | 2–3 cases @ 10–15% of escalations | Investigate patterns |
| HIGH | 3+ cases @ 15%+ of escalations | Potential fraud signal |

**Next Actions:**
- LOW: "Monitor suspicious patterns"
- MEDIUM: "Investigate abuse cases; escalate if needed"
- HIGH: "Urgent: investigate fraud risk"

---

#### 6. Manager Load Imbalance (concentration of reviews)

| Severity | Band | Interpretation |
|----------|------|---|
| LOW | 60–70% of reviews by top manager | Watch for fatigue |
| MEDIUM | 70–80% of reviews by top manager | Imbalanced workload |
| HIGH | >80% of reviews by top manager | Severe concentration risk |

**Note:** Informational severity (not blocking). Indicates bus factor + bias risk.

**Next Actions:**
- LOW: "Consider load distribution"
- MEDIUM: "Distribute reviews across team"
- HIGH: "Urgent: check for manager fatigue or bias"

---

#### 7. Documentation Gap (notes on decisions)

| Severity | Band | Interpretation |
|----------|------|---|
| LOW | 40–50% reviews with notes | Weak audit trail; encourage docs |
| MEDIUM | 20–40% reviews with notes | Poor documentation; require notes |
| HIGH | <20% reviews with notes | Critical: missing audit trail |

**Next Actions:**
- LOW: "Encourage decision notes"
- MEDIUM: "Require notes for audit trail"
- HIGH: "Urgent: mandate notes on all decisions"

---

## Part 2: Risk Scoring

### Score Calculation

Each anomaly contributes points:
- LOW = 1 point
- MEDIUM = 2 points
- HIGH = 3 points

**Info-level anomalies (manager load, documentation) = 0 points** (excluded from score)

**Total Score = Sum of all anomaly points**

### Examples

**Clean Restaurant:**
- No anomalies → Score = 0

**Single High Anomaly:**
- 1 high escalation rate → Score = 3

**Mixed Portfolio:**
- 1 high (flagged rate) + 1 medium (backlog) + 1 low (concentration) = 3+2+1 = 6 points

**Multiple Issues:**
- 3 high anomalies + 2 medium = 3+3+3+2+2 = 13 points

### Score to Status Mapping

| Score | Status | Meaning | Action |
|-------|--------|---------|--------|
| 0 | ✅ OK | No issues | None; monitor |
| 1–3 | ⚠️ WATCH | Minor issues | Monitor closely |
| 4–7 | 🔴 RISK | Multiple issues | Action needed |
| 8+ | 🔴🔴 CRITICAL | Critical issues | Immediate action |

---

## Part 3: UI Display

### Overall Status Banner

Shown at top of dashboard if status ≠ OK:

```
┌─────────────────────────────────────────────────┐
│ 🔴 CRITICAL: Critical issues; immediate action │
│    Risk score: 9 (3 issues)                     │
└─────────────────────────────────────────────────┘
```

**Styling:**
- RED for CRITICAL (score 8+)
- ORANGE for RISK (score 4–7)
- YELLOW for WATCH (score 1–3)

### Prioritised Anomaly Alerts

Sorted by severity: **HIGH → MEDIUM → LOW → INFO**

Each alert shows:
1. **Icon + Message:** Clear description of the issue
2. **Severity Badge:** HIGH / MEDIUM / LOW / INFO (color-coded)
3. **Next Action Hint:** Actionable guidance

**Example Alert (HIGH Severity):**
```
🔴 Escalation rate: 75% (15/20 reviewed). 
   Critical: review process may be too strict.
   [HIGH BADGE]
   → Audit decision standards; may be too strict
```

**Example Alert (LOW Severity):**
```
⏱️ Flagged rate: 8% (8/100 orders). 
   Elevated: monitor closely.
   [LOW BADGE]
   → Monitor POS sync performance
```

---

## Part 4: Implementation Details

### Severity Scoring Module

**File:** `lib/offline-review-severity-scoring.js`

**Key Functions:**

```javascript
// Classify a rule's severity based on threshold bands
calculateRuleSeverity(ruleType, value)
  → 'low' | 'medium' | 'high' | null

// Convert severity to numeric score
severityScore(severity)
  → 1 | 2 | 3 | 0

// Sum all anomaly scores
calculateTotalScore(anomalies)
  → number

// Map score to operational status
scoreToStatus(score)
  → {status: 'ok'|'watch'|'risk'|'critical', description: string}

// Get action hint for a rule + severity
getNextAction(ruleType, severity)
  → string

// Normalize raw anomaly with severity + next action
normalizeAnomaly(rawAnomaly)
  → {...anomaly, severity: 'low'|'medium'|'high'|'info', score: number, nextAction: string}

// Full enrichment: sort, score, status
enrichAnomaliesWithScoring(detectionResult)
  → {...detectionResult, anomalies: [...sorted], totalScore: number, status: string, description: string}
```

### Health Indicator Integration

**File:** `components/restaurant/OfflineReviewHealthIndicator.jsx`

**Changes:**
1. Imports `enrichAnomaliesWithScoring`
2. Enriches anomalies in useMemo
3. Displays overall status banner
4. Sorts alerts by severity
5. Shows next action for each alert

---

## Part 5: Backward Compatibility

### Old Severity Levels → New Levels

```javascript
// Old format (from anomaly rules)
anomaly.severity = 'critical' | 'high' | 'warning' | 'elevated' | 'ok' | 'info'

// Mapped to new format (via normalizeAnomaly)
anomaly.severity = 'high' | 'medium' | 'low' | 'info'

// Mapping logic:
{
  'critical': 'high',
  'high': 'medium',
  'elevated': 'low',
  'warning': 'medium',
  'ok': null,
  'info': 'info'
}
```

All existing anomaly detection continues to work. Normalisation happens automatically during enrichment.

---

## Part 6: Configuration

All severity bands are editable in `lib/offline-review-severity-scoring.js`:

```javascript
export const SEVERITY_BANDS = {
    flagged_rate: {
        low: { min: 5, max: 15 },    // ← adjust
        medium: { min: 15, max: 25 }, // ← adjust
        high: { min: 25, max: 100 }   // ← adjust
    },
    // ... other rules ...
};
```

After changes:
1. Update thresholds
2. Run smoke tests: `npm run test:offline-severity-scoring`
3. Update this documentation
4. Deploy

---

## Part 7: Testing & Coverage

### Automated Tests (45+ cases)

File: `scripts/smoke/suites/offlineReviewSeverityScoring.smoke.js`

**Coverage:**
- ✅ All 7 rules × 3 severity levels (21 tests)
- ✅ Score calculation (5 tests)
- ✅ Status mapping (6 tests)
- ✅ Next action hints (3 tests)
- ✅ Normalisation & enrichment (5 tests)
- ✅ Full integration (3 tests)

### Manual Tests (5 scenarios)

1. Severity badge display (colors match severity)
2. Overall status banner for CRITICAL
3. Overall status banner for WATCH
4. Next action hints present and appropriate
5. Info-level anomalies excluded from score

---

## Part 8: Limitations & Honesty

### What This System Does

✅ Prioritises alerts by operational impact  
✅ Provides guidance (next actions)  
✅ Aggregates multiple signals into one score  
✅ Highlights most urgent issues first  

### What It Does NOT Do

❌ Predict problems  
❌ Classify user behavior  
❌ Automate decisions  
❌ Provide certainty  
❌ Replace human judgment  

### Still Required

**Human investigation.** Even CRITICAL alerts are signals, not proofs. A score of 10 means "investigate urgently," not "fraud detected."

---

## Part 9: Examples

### Example 1: Clean Restaurant

```
Anomalies: 0
Score: 0
Status: ✅ OK — No issues detected
```

No alerts shown. Manager sees green indicator.

---

### Example 2: Watch Restaurant

```
Anomalies:
  - Flagged rate: 8% (LOW, 1 point)
  
Score: 1
Status: ⚠️ WATCH — Minor issues; monitor

Overall Banner:
[Yellow banner] "WATCH: Minor issues; monitor. Risk score: 1 (1 issue)"

Alerts (sorted):
[LOW badge] Flagged rate: 8% → Monitor POS sync performance
```

Manager sees yellow banner, one low-priority alert. Continue normal operations with monitoring.

---

### Example 3: Risk Restaurant

```
Anomalies:
  - Escalation rate: 60% (MEDIUM, 2 points)
  - Unresolved backlog: 12 items, 36h old (MEDIUM, 2 points)
  - Documentation gap: 35% with notes (MEDIUM, 2 points)

Score: 6
Status: 🔴 RISK — Multiple issues; action needed

Overall Banner:
[Orange banner] "RISK: Multiple issues; action needed. Risk score: 6 (3 issues)"

Alerts (sorted):
[MEDIUM badge] Escalation rate: 60% → Audit decision standards
[MEDIUM badge] Unresolved backlog: 12 orders → Increase review capacity
[MEDIUM badge] Documentation gap: 35% → Require notes for audit trail
```

Manager sees orange banner, three medium-priority alerts. Take action this week.

---

### Example 4: Critical Restaurant

```
Anomalies:
  - Flagged rate: 30% (HIGH, 3 points)
  - Escalation rate: 75% (HIGH, 3 points)
  - Unresolved backlog: 18 items, 60h old (HIGH, 3 points)
  - Manager load: 85% by one manager (HIGH, 3 points) [info-level, counted as 0]

Score: 9 (info alert excluded)
Status: 🔴🔴 CRITICAL — Critical issues; immediate action required

Overall Banner:
[Red banner] "CRITICAL: Critical issues; immediate action required. Risk score: 9 (3 issues)"

Alerts (sorted):
[HIGH badge] Flagged rate: 30% → Urgent: investigate sync/validation issues
[HIGH badge] Escalation rate: 75% → Critical: review process may be broken
[HIGH badge] Unresolved backlog: 18 orders → Urgent: clear pending review queue
[INFO badge] Manager load: 85% → Urgent: check for manager fatigue or bias
```

Manager sees red banner, three urgent alerts. Take immediate action today.

---

## Part 10: Summary

**Severity Scoring transforms 7 independent signals into a clear, ranked priority list.**

- Normalised 3-level severity (LOW → MEDIUM → HIGH)
- Aggregated risk score (0–20+)
- Operational status (OK → WATCH → RISK → CRITICAL)
- Next action hints per alert
- Alerts sorted by urgency
- Info-level alerts excluded from scoring

**Zero automation. Pure prioritisation for human decision-making.**