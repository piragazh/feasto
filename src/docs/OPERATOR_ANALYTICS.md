# Operator Analytics — Phase A Implementation

**Status:** ✅ Complete  
**Date:** 2026-03-26  
**Scope:** Real operator-level offline risk analytics using captured data only

---

## Overview

Operator Analytics surfaces operational patterns in offline order creation using real captured data:
- **Operator identity** (`offline_created_by`) 
- **Order flags** (`needs_review`)
- **Manager escalations** (`offline_review_status`)
- **Issue types** (`offline_review_reason_code`)

**What it does:** Identifies operators with unusual flagged order patterns and escalation rates.

**What it does NOT do:** 
- ❌ Prove who is at fault (shared terminals)
- ❌ Track shift assignments (not in system)
- ❌ Attribute workload per operator
- ❌ Measure individual performance

---

## Data Fields Used

### Order Entity Fields (Real Data)

```javascript
offline_created: boolean              // Is this an offline order?
offline_created_by: "email@..."      // Operator identity (email)
offline_created_by_name: "John"      // Operator name (snapshot at creation)
offline_created_by_role: "cashier"   // Role at creation (cashier|waiter|kitchen_staff|manager)
offline_created_at: "2026-03-26..."  // When created (local timestamp)
offline_synced_at: "2026-03-26..."   // When synced (UTC)

needs_review: boolean                 // Was order flagged?
offline_review_status: "escalated"   // Outcome (new|acknowledged|resolved|escalated)
offline_review_reason_code: "..."    // What was the issue? (price_mismatch, abuse, etc.)
```

**NO other data sources.** Everything derived from these fields only.

---

## Metrics Calculated

### Per-Operator Metrics

| Metric | Calculation | Meaning |
|--------|-------------|---------|
| **Total Orders** | Count where `offline_created=true && offline_created_by=email` | Volume of orders created |
| **Flagged Count** | Count where `needs_review=true` | Number of validation-flagged orders |
| **Flagged Rate %** | `flagged_count / total_orders * 100` | % of their orders that triggered validation |
| **Escalated Count** | Count where `offline_review_status='escalated'` | Number of issues escalated by manager |
| **Escalation Rate %** | `escalated_count / flagged_count * 100` | % of their flagged orders that manager escalated |
| **Resolved Count** | Count where `offline_review_status='resolved'` | Number resolved without escalation |
| **Reason Code Distribution** | Frequency table of `offline_review_reason_code` | What types of issues (price mismatch, abuse, etc.) |
| **Risk Score (0-100)** | Composite: flagged rate (40pts) + escalation rate (40pts) + abuse escalations (20pts) | Operational risk indicator |

---

## Outlier Rules (Rule-Based Detection)

### Rule 1: High Flagged Rate
**Trigger:** Operator has 2x+ the restaurant average flagged rate AND ≥5 orders

**Signal:** This operator creates proportionally more validation-flagged orders than peers.

**Possible factors:**
- Training/onboarding gap
- Different POS terminal (faster order entry, less care)
- Working during busy times (time pressure)
- Shared terminal with high-traffic use
- Legitimate process difference (special operations)

### Rule 2: High Escalation Rate
**Trigger:** > 60% of their flagged orders are escalated AND ≥5 flagged orders

**Signal:** When this operator's orders ARE flagged, managers escalate them more often.

**Possible factors:**
- More severe issue types
- Systematic pricing errors
- Legitimate edge cases
- Interaction with validation rules

### Rule 3: Abuse-Related Escalations
**Trigger:** ≥2 escalations with abuse codes (potential_abuse, large_price_mismatch, repeated_offline_issues)

**Signal:** Manager flagged orders as potentially fraudulent or highly suspicious.

**Note:** Rare, requires investigation. May indicate actual abuse or false positives.

### Rule 4: Reason Code Concentration
**Trigger:** > 70% of their flagged orders have same reason code AND ≥5 flagged orders

**Signal:** Systematic, repeating issue type.

**Example:** 15 out of 20 flagged orders are "price_adjusted_on_sync" = systematic pricing mismatch

**Possible factors:**
- Specific POS configuration
- Specific workflow they use
- Specific validation rule interaction
- Legitimate business operation

### Rule 5: High Volume + Quality Issues
**Trigger:** > 50 orders AND flagged rate > restaurant average

**Signal:** High-visibility operator with above-average issue rate.

**Possible factors:**
- Works peak hours (higher stress, higher errors)
- High throughput role (more orders = more noise)
- Training opportunity

---

## Dashboard Features

### Summary Cards
- **Total Operators:** How many have created offline orders
- **Offline Orders:** Total orders created offline
- **Flagged Count:** Total flagged orders across all operators
- **Outliers:** How many flagged patterns detected

### Operator Table
- **Risk Score:** Composite 0-100 indicator (red >60, orange >40, green <40)
- **Operator Name & Role:** Identity and position
- **Volume:** Total orders created
- **Flagged %:** Proportion flagged
- **Escalation %:** Of flagged, % escalated
- **Top Code:** Most common issue type

### Outlier Alerts
Displays detected patterns with context:
- "Operator X: 60% flagged rate (15/25), vs. 15% average"
- "Operator Y: 75% escalation rate of flagged orders"
- "Operator Z: 3 abuse-related escalations out of 5 total"

### Detail Modal
Click operator for breakdown:
- All metric values
- Reason code distribution (histogram)
- Raw counts

### Filters
- **Restaurant:** View single restaurant or all
- **Sort by:** Risk Score, Flagged Rate, Escalation Rate, Order Volume

---

## Important Limitations

### ❌ What This Does NOT Show

1. **Shared Terminals**
   - Multiple staff may use same POS terminal under one user account
   - Pattern may reflect group behavior, not individual
   - Orders created under "john@test.com" may have been entered by john, jane, or someone else

2. **No Actual Shift Context**
   - We don't know which shift operator was working
   - We don't know how many people were on duty
   - We don't know workload distribution

3. **No Fault Attribution**
   - High flagged rate ≠ operator fault
   - May reflect validation rules, POS config, or legitimate business operations
   - Requires human investigation before taking action

4. **No Performance Metrics**
   - Speed of order entry
   - Accuracy (what % of manual entries match final prices)
   - Customer satisfaction
   - Compliance with procedures

5. **No Context**
   - Peak hour vs. quiet time
   - New vs. experienced operator
   - Specific product categories
   - Special order types

### ⚠️ What Could Be Misinterpreted

**Wrong interpretation:**
> "Operator A has 50% flagged rate. Operator A is bad."

**Correct interpretation:**
> "Operator A creates orders that trigger validation flags 50% of the time, vs. 15% average. This may indicate: training gap, different POS configuration, peak-hour workload, legitimate business process, or shared terminal usage. Requires investigation."

---

## Usage Guidelines

### For Operations Managers

**Good use:**
- "This operator's orders have a different error pattern. Let's review training."
- "These two operators have similar issue rates. Is their POS config the same?"
- "This operator escalates rare issue types. Can we learn from their vigilance?"

**Bad use:**
- Blame individual for high flagged rate
- Punish operator without understanding context
- Use as performance metric (insufficient data)

### For Incident Investigation

**Good use:**
- "Order X was created by operator Y. What was Y doing at that time?"
- "These 5 orders share same issue type and same operator. Is there a pattern?"
- "Operator Z escalated this as abuse. Is that a false positive or real concern?"

**Bad use:**
- "Operator Z flagged this. Operator Z is flagging too much."
- Use outlier detection as sole basis for action

---

## Example Report

### Hypothetical Operator Summary

**Name:** John (Cashier)  
**Restaurant:** Pizza Palace  
**Period:** Last 30 days  

**Metrics:**
- Total offline orders: 45
- Flagged orders: 9 (20% flagged rate)
- Escalated orders: 4 (44% escalation rate of flagged)
- Abuse escalations: 0
- Top reason code: "price_adjusted_on_sync" (5 occurrences)

**Peer Comparison:**
- Restaurant average flagged rate: 12%
- Restaurant average escalation rate: 35%
- John's escalation rate: 44% (slightly above average)

**Outlier Status:** 🟡 WATCH
- Flagged rate 1.7x above restaurant average
- Escalation rate 9 percentage points above average

**Interpretation:**
> John creates more flagged orders than average (20% vs. 12%), suggesting either:
> - Different POS terminal configuration
> - Working during peak hours (inherently more errors)
> - Different order entry workflow
> - Legitimate business operation
> 
> His escalation rate is slightly high, but not extreme (44% vs. 35%).
> 
> Most issues are "price_adjusted_on_sync" (5 out of 9 flagged), suggesting
> a systematic pricing mismatch pattern worth investigating. Could be:
> - Specific menu item category he handles
> - Specific customer type
> - Specific order type (group orders, special discounts, etc.)
> 
> Recommendation: Review John's recent orders with manager to identify
> if pattern is training, config, or legitimate business context.

---

## Technical Implementation

### calculateOperatorMetrics()

**Location:** `lib/manager-operator-analytics.js`

**Function:** Groups orders by `offline_created_by`, calculates per-operator metrics

**Input:** 
- `restaurantId` (string)
- `orders` (array of Order entities)

**Output:**
```javascript
{
  "john@test.com": {
    operatorEmail: "john@test.com",
    operatorName: "John Doe",
    operatorRole: "cashier",
    totalOrders: 45,
    flaggedCount: 9,
    flaggedRate: 20,
    escalatedCount: 4,
    escalationRate: 44,
    reasonCodes: { "price_adjusted_on_sync": 5, ... },
    abuseEscalations: 0
  },
  ...
}
```

### detectOperatorOutliers()

**Location:** `lib/operator-outlier-rules.js`

**Function:** Applies rule-based outlier detection

**Returns:**
```javascript
{
  highest_flagged_rate: { operator, name, role, flagged_rate, message },
  highest_escalation_rate: { ... },
  abuse_related_escalations: { ... },
  reason_code_concentration: { ... },
  high_volume_with_issues: { ... }
}
```

### OperatorAnalytics Component

**Location:** `components/superadmin/OperatorAnalytics.jsx`

**Features:**
- Summary statistics
- Operator ranking by risk
- Outlier alerts
- Interactive table with sorting/filtering
- Detail modal per operator

---

## Testing

**Smoke tests:** `scripts/smoke/suites/operatorAnalytics.smoke.js`

**Coverage:**
- ✅ Operator grouping by `offline_created_by`
- ✅ Flagged rate calculation (flagged/total)
- ✅ Escalation rate calculation (escalated/flagged)
- ✅ Outlier detection (all 5 rules)
- ✅ Risk scoring (0-100)
- ✅ Role aggregation

**No external dependencies.** Tests use mock orders only.

---

## Future Enhancements (Phase B+)

### Shift Context (Phase B)
- Add estimated shift windows (morning/afternoon/evening)
- Correlate operator patterns with shift
- Detect handover-window anomalies

### Staffing Context (Phase C)
- When actual shift schedules exist:
  - Link operators to actual shift assignments
  - Correlate with supervisor on-duty
  - Calculate concurrent staffing level

### Deeper Analysis
- Time-series trends (is pattern improving or worsening?)
- Interaction effects (operator X + product category Y = higher issues?)
- Peer learning (how did this operator reduce flagged rate?)

---

## Honest Bottom Line

**What you can reliably conclude:**
- "This operator's orders have proportionally more validation flags"
- "When this operator's orders ARE flagged, escalation rate is higher"
- "This operator has repeating issues of type X"

**What you cannot conclude:**
- "This operator is causing errors"
- "This operator is committing fraud"
- "This operator is underperforming"
- "This operator should be coached/trained"

**Before taking action, investigate:**
- What is the operator's actual role/workflow?
- Are they using a different POS terminal?
- What shift/time-of-day do they work?
- Is there a legitimate business reason?
- Are multiple operators sharing the terminal?

---

**Status:** ✅ Ready for production  
**Limitations:** Documented & transparent  
**Blame risk:** LOW (if used as investigation signal, not judgment)