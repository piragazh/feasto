# Shift Window Proxy Analytics — Phase B Implementation

**Status:** ✅ Complete  
**Date:** 2026-03-26  
**Scope:** Estimated shift-window analytics using opening_hours + timezone (proxy only, no real staffing)

---

## Overview

Phase B adds **estimated shift-window context** to offline order analysis by mapping timestamps to simple, rules-based shift windows derived from:

- **Restaurant opening_hours** (stored per-day, HH:MM format)
- **Restaurant timezone** (IANA identifier, e.g., Europe/London)

**Honest labeling:** All windows labeled "Estimated Shift Window Proxy" — no actual staffing data.

---

## Data Sources

### From Restaurant Entity

```javascript
opening_hours: {
  monday: { open: "09:00", close: "22:00", closed?: false },
  tuesday: { open: "09:00", close: "22:00" },
  // ... wednesday through sunday
}

timezone: "Europe/London"  // IANA identifier
country: "GB"              // Fallback for timezone inference
```

### From Order Entity

```javascript
offline_synced_at: "2026-03-26T18:30:00Z"  // UTC timestamp
offline_created_at: "2026-03-26T18:25:00Z" // Local timestamp (ignored, use synced_at)
```

---

## Estimated Shift Windows (Fixed, Not Configurable)

| Window | Local Time | Label | Use Case |
|--------|-----------|-------|----------|
| **Morning** | 05:00–12:00 | 🌅 Morning Shift | Early ops, prep |
| **Afternoon** | 12:00–17:00 | ☀️ Afternoon Shift | Lunch service |
| **Evening** | 17:00–22:00 | 🍽️ Evening Shift | Dinner service |
| **Late** | 22:00–05:00 | 🌙 Late Shift | Late night/overnight |

**Rationale:** Fixed windows work for all restaurants. No configuration drift risk.

---

## Mapping Logic

### Step 1: Convert Timestamp to Local Time

```javascript
const utcTimestamp = order.offline_synced_at;
const timezone = restaurant.timezone || inferFromCountry(restaurant.country);
const local = convertUtcToLocal(utcTimestamp, timezone);
// Returns: { hour, day, month, year, dayOfWeek, ... }
```

### Step 2: Assign to Shift Window

```javascript
const hour = local.hour; // 0-23

if (hour >= 5 && hour < 12) return 'morning';
if (hour >= 12 && hour < 17) return 'afternoon';
if (hour >= 17 && hour < 22) return 'evening';
if (hour >= 22 || hour < 5) return 'late'; // Wraps midnight
```

### Step 3: Detect Boundary Closeness

Orders within ±30 minutes of a window boundary are flagged as `boundaryOrder`:

- 11:45–12:15 = boundary (morning ↔ afternoon)
- 16:45–17:15 = boundary (afternoon ↔ evening)
- 21:45–22:15 = boundary (evening ↔ late)
- 04:45–05:15 = boundary (late ↔ morning)

**Purpose:** Detect clustering near handover times (legitimate workflow or concerning concentration).

---

## Metrics Calculated

### Per-Window Metrics

| Metric | Calculation | Purpose |
|--------|-------------|---------|
| **totalOrders** | Count of orders in window | Volume |
| **flaggedCount** | Orders where `needs_review=true` | Issue volume |
| **flaggedRate** | `(flagged / total) * 100` | Quality indicator |
| **escalatedCount** | Orders `offline_review_status='escalated'` | Severity |
| **escalationRate** | `(escalated / flagged) * 100` | Manager concern level |
| **resolvedCount** | Orders `offline_review_status='resolved'` | Non-escalated count |
| **reasonCodes** | Frequency map of issue types | Pattern types |
| **operatorEmails** | List of active operators in window | Who worked |
| **boundaryOrderCount** | Orders within ±30 min of boundary | Handover clustering |

### Aggregation

Metrics can be aggregated:
- **Per-restaurant:** One set of window metrics per restaurant
- **Platform-wide:** Merge all restaurants' window metrics for cross-venue patterns

---

## Outlier Rules (Comparative)

### Rule 1: High Flagged Rate in Window

**Trigger:** Window has ≥10 orders AND flagged rate > 2x platform average

**Signal:** This shift window has proportionally more validation-flagged orders.

**Example:** Evening has 40% flagged vs. 15% average across all windows.

**Possible factors:**
- Different POS configuration in evening
- Evening orders inherently more complex
- Evening staff still ramping up
- Peak time stress
- Legitimate business operation

### Rule 2: High Escalation Rate in Window

**Trigger:** Window has ≥5 flagged orders AND escalation rate > 60%

**Signal:** When orders ARE flagged in this window, managers escalate them more often.

**Example:** Late window escalates 75% of flagged orders vs. 40% average.

**Possible factors:**
- More severe issue types in late window
- Fatigue-related decision-making
- Different manager on duty
- Systematic pricing errors

### Rule 3: Boundary Concentration

**Trigger:** >25% of all offline orders occur within ±30 min of any shift boundary

**Signal:** Unusual clustering at shift handover times.

**Example:** 28% of offline orders are within ±30 min of 17:00 (evening boundary).

**Possible factors:**
- Handover confusion between shifts
- Legitimate workflow (peak order entry time)
- POS terminal switching
- Staff coordination gaps

### Rule 4: Abuse-Related Spike in Window

**Trigger:** Window has ≥2 escalations with abuse codes (`potential_abuse`, `large_price_mismatch`, `repeated_offline_issues`)

**Signal:** Manager flagged multiple orders as fraudulent/suspicious in this window.

**Example:** Evening has 3 abuse escalations vs. 0 in other windows.

**Possible factors:**
- Actual fraud attempt
- False positive cascade
- Unusual order patterns
- Configuration issue

### Rule 5: Reason Code Spike in Window

**Trigger:** >60% of flagged orders in window have same reason code AND ≥5 flagged

**Signal:** Systematic, repeating issue type in this window.

**Example:** Morning: 8 out of 10 flagged are "price_adjusted_on_sync".

**Possible factors:**
- Specific POS workflow in morning
- Specific order type (e.g., group orders)
- Systematic pricing mismatch
- Legitimate operation

---

## UI & Dashboard

**Location:** SuperAdmin → Operations → Shift Window Analytics

### Summary Cards

- **Shift Windows:** How many windows analyzed
- **Offline Orders:** Total orders mapped to windows
- **Avg Flagged Rate:** Platform-wide baseline
- **Patterns Detected:** Number of outlier signals

### Honest Disclaimer

Displayed prominently:

> 🔍 **Estimated Shift Window Proxy**
> 
> These windows are estimated from opening_hours + timezone only.
> NO real staffing data, shift assignments, or manager presence information.
> 
> - Windows: Morning (05:00-12:00), Afternoon (12:00-17:00), Evening (17:00-22:00), Late (22:00-05:00)
> - Cannot determine who was actually working or on-duty manager
> - Boundary clustering may reflect legitimate workflow
> - Use for investigation signals, not staffing conclusions

### Window Table

Sortable by: Risk Score, Flagged Rate, Escalation Rate, Volume

Columns:
- **Window:** Label (e.g., 🍽️ Evening)
- **Risk:** 0-100 composite score
- **Volume:** Total orders
- **Flagged %:** Proportion flagged
- **Escalated %:** Of flagged, % escalated
- **Boundary %:** % near shift boundaries
- **Details:** Modal for breakdown

### Outlier Alerts

Displayed when detected:
- High flagged rate in window
- High escalation rate in window
- Boundary concentration signal
- Abuse-related escalations
- Reason code spike

Each with message explaining what was detected.

### Detail Modal

Click window for:
- All metrics (volume, flagged, escalated, boundary counts)
- Reason code distribution (histogram)
- Operators active in window

---

## Important Limitations (Explicit)

### ❌ What This Does NOT Provide

1. **Actual Shift Assignments**
   - We don't know scheduled shifts
   - We don't know who was assigned to each shift
   - We estimate windows from opening_hours only

2. **On-Duty Manager**
   - Cannot determine which manager was present
   - Cannot correlate issues with specific supervisor

3. **Concurrent Staffing**
   - Don't know how many staff working simultaneously
   - Don't know workload distribution

4. **Handover Context**
   - Boundary clustering could be legitimate (peak order time)
   - Could also indicate shift change confusion
   - Requires investigation to determine

5. **Staff Performance**
   - Cannot measure operator speed or accuracy per window
   - Cannot determine if window differences are workflow or competency

### ✅ What This IS Useful For

- Identifying time-of-day patterns in offline issues
- Detecting unusual concentration near shift boundaries
- Investigating whether specific shifts have systematic problems
- Correlation with opening_hours (e.g., "busiest hours = most issues?")
- Starting points for operational investigation

### ⚠️ Misinterpretation Risks

**Wrong:** "Late shift has high flagged rate, so late shift staff are bad."  
**Right:** "Late shift has high flagged rate. Investigate: Is it inherent to late orders, POS config, system load, or staffing factors?"

---

## Technical Implementation

### Core Files

**Location:** `lib/shift-window-proxy.js`

**Functions:**

```javascript
mapTimestampToEstimatedWindow(utcTimestamp, restaurant)
// → {window: 'morning'|'afternoon'|'evening'|'late', label, hour, boundaryInfo}

calculateShiftWindowMetrics(restaurantId, orders, restaurant)
// → {morning: {...}, afternoon: {...}, ...}

aggregateShiftWindowMetrics(windowsByRestaurant)
// → aggregated across all restaurants
```

**Location:** `lib/shift-window-outlier-rules.js`

**Functions:**

```javascript
detectShiftWindowOutliers(aggregatedMetrics, perRestaurant)
// → {high_flagged_window: {...}, boundary_concentration: {...}, ...}

calculateWindowRiskScore(windowMetrics)
// → 0-100 composite score
```

**Location:** `components/superadmin/ShiftWindowAnalytics.jsx`

**Component:** Full SuperAdmin UI with summary, outliers, table, detail modal.

---

## Testing

**File:** `scripts/smoke/suites/shiftWindowAnalytics.smoke.js`

**Tests (8):**

1. ✅ **Morning Window (05:00-12:00)** — Hours correctly mapped
2. ✅ **Afternoon Window (12:00-17:00)** — Hours correctly mapped
3. ✅ **Evening Window (17:00-22:00)** — Hours correctly mapped
4. ✅ **Late Window (22:00-05:00)** — Wraps midnight correctly
5. ✅ **Boundary Detection (±30 min)** — Correctly flags near-boundary orders
6. ✅ **Metrics Calculation** — Rates (flagged, escalation) calculated correctly
7. ✅ **Outlier Detection** — High flagged rate in window detected
8. ✅ **Aggregation** — Metrics correctly summed across restaurants

**All tests pass.** No external dependencies.

---

## Integration with Phase A

### Phase A (Operator Analytics)

- Per-operator metrics (email-based grouping)
- Operator identity, flagged rates, escalations
- No time context

### Phase B (Shift Window Proxy)

- Per-window metrics (time-based grouping)
- Window identity, flagged rates, escalations
- Estimated shift context

**Combined analysis:**
- "Operator X has high flagged rate in morning AND evening windows" → cross-window pattern
- "All operators in late window have higher flagged rate" → shift-wide issue, not operator-specific
- Helps distinguish operator patterns from shift patterns

---

## What Phase C Would Add (Future)

When real staffing roster data exists:

- **Actual shift assignments:** Who was scheduled when
- **Manager presence:** Which manager on-duty per shift
- **Concurrent staffing:** How many staff working
- **Shift gaps:** Detected understaffing
- **Supervisor correlation:** Manager coaching impact
- **Handover validation:** Actual staff transitions

**Phase B provides the foundation** to make Phase C actionable.

---

## Usage Guidelines

### For Operations Managers

**Good use:**
- "Late window has 40% flagged rate. Let's review late shift procedures."
- "Boundary orders cluster at 17:00. Is this handover confusion or peak time?"
- "Evening has 3 abuse escalations. Investigate what happened."

**Bad use:**
- Blame late shift without understanding context
- Use boundary clustering as sole evidence
- Assume staffing issues without investigation

### For Investigation

**Good use:**
- "Evening shift ordered have pattern X. Are evening orders more complex?"
- "Morning has systematic pricing mismatch. Check POS config used in morning."
- "Boundary concentration detected. When did shifts actually change?"

**Bad use:**
- "Managers on late shift aren't doing reviews properly" (unsupported)
- "This operator is bad because they worked the late shift" (context missing)

---

## Summary

**Phase B delivers:**

✅ Estimated shift windows (morning/afternoon/evening/late)  
✅ Local-time mapping (UTC → restaurant timezone → window)  
✅ Per-window metrics (volume, flagged, escalation rates)  
✅ Boundary detection (±30 min clustering)  
✅ Outlier rules (5 comparative rules)  
✅ SuperAdmin dashboard with honest labeling  
✅ Comprehensive tests (8 smoke tests)  
✅ Clear limitations documented  

**What it solves:**
Time-of-day visibility for offline order patterns without pretending staffing data exists.

**What it does NOT do:**
Attribute fault, measure performance, identify actual staff, or enable blame.

**Honest positioning:**
"We can see operational patterns by time-of-day, but we don't have real staffing context."

---

**Status:** ✅ Phase B Complete  
**Next:** Phase C (Real Staffing Context) when roster data exists  
**Delivery Date:** 2026-03-26