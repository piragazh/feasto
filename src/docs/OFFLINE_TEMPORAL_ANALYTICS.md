# Offline Order Temporal Analytics

**Status:** ✅ Phase 3 Complete (Temporal Insights)  
**Date:** 2026-03-26  
**Scope:** Time-based offline risk analysis (daypart, day-of-week, hourly patterns)

---

## Overview

Answers the critical question: **When do offline issues occur?**

While store-level and operator-level analytics answer *who* and *where*, temporal analytics reveals **if offline risk concentrates in specific operating windows** (lunch vs dinner, weekday vs weekend, specific hours).

**Problem:** Offline issue patterns were invisible by time. Could be temporary network outages, understaffing at certain shifts, or peak-time chaos.

**Solution:** Lightweight time-based bucketing and outlier detection to surface temporal patterns.

---

## Part 1: Time Model

### Available Timestamps

| Field | Source | Reliability | Used In Analytics |
|-------|--------|-------------|-------------------|
| `created_date` | Built-in (server) | ✅ High | Not used (created_by not captured) |
| `offline_synced_at` | Server (POS → sync) | ✅ High | **PRIMARY** |
| `offline_created_at` | Client (POS device) | ⚠️ Unreliable | Not used (no timezone info) |
| `offline_review_at` | Server (review action) | ✅ High | Not currently used |

**Why `offline_synced_at`?**
- Server-authoritative (UTC)
- Always present (required for offline sync)
- No timezone ambiguity
- Reliable order-creation proxy (synced within minutes of creation)

---

### Daypart Bucketing (5 Buckets)

**All times in UTC. No timezone conversion applied.**

| Daypart | Hour Range (UTC) | Use Case |
|---------|------------------|----------|
| **Morning** | 05:00–10:59 | Breakfast, opening prep, early orders |
| **Lunch** | 11:00–13:59 | Peak lunch period |
| **Afternoon** | 14:00–16:59 | Lunch-to-dinner gap, post-lunch slump |
| **Dinner** | 17:00–21:59 | Peak dinner period |
| **Late** | 22:00–04:59 | Late night, overnight operations |

**Why these boundaries?**
- Common restaurant operating windows (UK/Europe timezone reference)
- Equal distribution across 24 hours
- Easy to remember and explain
- Align with staff shift changes and traffic patterns

---

### Day-of-Week Grouping

**Sunday–Saturday (no aggregation, all 7 days reported separately)**

**Weekend vs Weekday Classification:**
- Weekend: Saturday, Sunday
- Weekday: Monday–Friday

---

## Part 2: Temporal Metrics

### Per-Daypart Metrics

| Metric | Calculation | Meaning |
|--------|-------------|---------|
| Total Orders | Count | Order volume in this daypart |
| Flagged Count | `needs_review=true` | How many flagged orders |
| Flagged Rate | Flagged / Total × 100 | % problematic orders |
| Escalated Count | `offline_review_status='escalated'` | How many escalated |
| Escalation Rate | Escalated / (Flagged + Escalated) × 100 | % of issues escalated |
| Hour Distribution | Count by hour within daypart | Peak hours within daypart |

### Per-Day-of-Week Metrics

Same as daypart metrics, grouped by calendar day.

### Hourly Trend (24-hour array)

| Metric | Range | Meaning |
|--------|-------|---------|
| Hour | 0–23 | UTC hour of day |
| Count | Integer | Orders at this hour |
| Flagged | Integer | Flagged at this hour |
| Flagged Rate | 0–100% | % flagged at this hour |

### Summary Aggregates

- Overall flagged rate (platform-wide)
- Overall escalation rate
- Busiest daypart (by volume)
- Busiest day of week
- Highest flagged rate by daypart/day
- Highest escalation rate

---

## Part 3: Temporal Outlier Rules (5 Types)

### Rule 1: High Flagged Rate in Daypart
- **Threshold:** >20% (min 3 orders)
- **Signal:** Daypart-specific flagged orders above normal
- **Possible causes:**
  - Network outages during specific shift
  - Understaffing in that daypart
  - POS misconfiguration at certain time
  - Shift-change chaos or hand-off issues
- **Action:** Check POS logs for shift; review training for time period

### Rule 2: High Escalation Rate in Daypart
- **Threshold:** >50% of flagged (min 2 escalated)
- **Signal:** Issues in this daypart are severe, not just minor flags
- **Possible causes:**
  - Manager stricter during certain hours
  - More complex/high-value orders at dinner
  - Accumulated stress/fatigue
- **Action:** Review escalated orders; verify manager judgment; assess workload

### Rule 3: Daypart Concentration
- **Threshold:** >40% of all offline orders in one daypart
- **Signal:** Operational pattern — most offline usage concentrated in one window
- **Possible causes:**
  - Network degradation during peak hours
  - System design (POS queuing at dinner rush)
  - Business model (takeaway-heavy, dine-in-light)
- **Action:** Verify if operational/expected; monitor if new pattern

### Rule 4: Weekend vs Weekday Anomaly
- **Threshold:** >15 percentage point difference in flagged rate
- **Signal:** Weekend operates significantly different from weekday
- **Possible causes:**
  - Different staff on weekends
  - Higher volume overwhelms system
  - More casual/complex orders
  - Different customer demographics
- **Action:** Compare shift staffing; review if volume spike is the driver

### Rule 5: Specific Hour with High Flagged Rate
- **Threshold:** >30% flagged (min 2 orders at that hour)
- **Signal:** Specific hour(s) consistently problematic
- **Possible causes:**
  - Network outage window
  - Peak delivery rush (system overload)
  - Staff shift change at that hour
  - Known traffic spike (delivery surge)
- **Action:** Correlate with external events; check system health graphs

---

## Part 4: Code Changes

### New Files (3)

| File | Lines | Purpose |
|------|-------|---------|
| `lib/offline-temporal-analytics.js` | 340 | Metrics & outlier logic |
| `components/superadmin/OfflineTemporalAnalytics.jsx` | 360 | Dashboard UI |
| `scripts/smoke/suites/offlineTemporalAnalytics.smoke.js` | 280 | 30+ tests + 5 manual |

### Modified Files (1)

| File | Change |
|------|--------|
| `pages/SuperAdmin` | Added "Temporal Analytics" menu item + route |

### Exported Functions

```javascript
// Bucketing
hourToDaypart(hour) → 'morning'|'lunch'|'afternoon'|'dinner'|'late'
dayNumToName(dayNum) → 'Monday'|...|'Sunday'
classifyDay(dayNum) → 'weekend'|'weekday'

// Metrics
calculateTemporalMetrics(restaurantId, orders) → {
  byDaypart,        // {daypart: {metrics}}
  byDayOfWeek,      // {day: {metrics}}
  hourlyTrend,      // [24] array of {hour, count, flagged}
  summary           // {totals, concentrations}
}

// Outliers
detectTemporalOutliers(temporalMetrics) → {
  high_flagged_daypart,
  high_escalation_daypart,
  daypart_concentration,
  weekend_weekday_anomaly,
  high_flagged_hour
}

// Aggregation
aggregateTemporalMetricsAcrossRestaurants(byRestaurant) → {
  byDaypart, byDayOfWeek, hourlyTrend, restaurantCount, totalOrders
}
```

---

## Part 5: UI & Access

### SuperAdmin Dashboard

**Path:** SuperAdmin > Operations > Temporal Analytics

**Components:**

1. **Summary Cards** (4)
   - Total offline orders
   - Overall flagged rate
   - Active dayparts count
   - Temporal outlier count

2. **Outliers Section**
   - All 5 rule-based signals highlighted
   - Actionable messages
   - Specific metrics (rate %, order count)

3. **Daypart Chart** (Bar)
   - Orders per daypart
   - Flagged rate per daypart
   - Color-coded by risk

4. **Day-of-Week Chart** (Bar)
   - Orders per day
   - Flagged rate per day
   - Weekend vs weekday color distinction

5. **Hourly Trend** (Line)
   - Flagged rate by hour (UTC)
   - All 24 hours shown
   - Peak problem hours visible

6. **Notes Section**
   - Timestamp source: `offline_synced_at` (UTC)
   - No timezone conversion
   - Daypart definitions
   - Reminder: outliers are signals, not proof

### Role Visibility

- ✅ SuperAdmin: Full access
- ⚠️ Admin: Future (own restaurant only)
- ❌ Regular users: No access

---

## Part 6: Timezone Limitations

### Important Caveats

**No Timezone Awareness:**
- All times are UTC
- Daypart buckets are fixed UTC times
- No conversion to restaurant's local timezone
- Example: A UK restaurant at 23:00 local time (GMT) = 23:00 UTC ✓
- Example: Same UK restaurant at 23:00 local time (BST) = 22:00 UTC ✗

**Why Not Store Timezone?**
- Restaurant entity doesn't have timezone field (would require schema change)
- Most POS sync happens UTC anyway (server-authoritative)
- Temporal patterns often align with UTC hours for multi-region platforms

**Workaround:**
- Admins know their restaurant's UTC offset
- Can mentally adjust daypart interpretation
- Example: UK restaurant knows "dinner (17–22 UTC)" is actually "17–22 BST in summer"
- For precise timezone analysis, future phase could add restaurant.timezone field

**Impact:**
- Patterns may shift by hours for regional restaurants
- Daypart interpretation may not align with local business hours
- Weekend signal should still work (calendar days are timezone-agnostic)

**Documented:** Yes, notes in dashboard UI and docs.

---

## Part 7: Temporal Analytics Use Cases

### Case 1: Dinner Rush Chaos

```
Dashboard shows:
  - Dinner (17:00–22:00): 35% flagged (vs 8% overall)
  - Escalations in dinner: 60% escalation rate

Investigation:
  1. Check POS logs for dinner shift
  2. Review order volume spike at 18:00–19:00
  3. Check staffing levels during dinner
  4. Verify if network degrades at peak (ISP issue?)

Possible fix:
  - Add staff during 18:00–19:00
  - Upgrade network for peak hours
  - Enable POS throttling to spread load
  - Train staff for high-volume periods
```

### Case 2: Weekend Problem

```
Dashboard shows:
  - Weekend flagged rate: 25%
  - Weekday flagged rate: 8%
  - Difference: 17 percentage points (anomaly)

Investigation:
  1. Compare weekend vs weekday staff roster
  2. Check if training gap (weekend staff undertrained?)
  3. Verify if order types differ (more complex weekend orders?)
  4. Check for delivery-service surges on weekends

Possible fix:
  - Improve weekend staff training
  - Adjust pricing/routing for complex weekend orders
  - Add experienced staff to weekend shifts
  - Temporary increase discount thresholds on weekends
```

### Case 3: Specific Hour Spike

```
Dashboard shows:
  - 14:00 UTC: 40% flagged rate (vs 10% overall)
  - Only 5 orders at 14:00

Investigation:
  1. Check if known external event (delivery platform surge?)
  2. Verify if POS maintenance window at 14:00
  3. Check for ISP outage at that specific hour
  4. Review order characteristics (all from one customer?)

Possible fix:
  - Schedule POS maintenance outside peak
  - Monitor ISP for pattern (recurring outage?)
  - Educate high-risk customers
  - Add circuit breaker for rapid-fire orders
```

---

## Part 8: Calculation Accuracy

### What's Reliable ✅

- **Daypart assignment:** Correct UTC hour → daypart mapping (no ambiguity)
- **Day-of-week:** Calendar days are timezone-agnostic (Mon=Mon everywhere)
- **Hourly trends:** Accurate counts by UTC hour
- **Aggregation:** Sum/average logic is deterministic
- **Percentages:** Simple division (no rounding errors)

### What's Limited ⚠️

- **Operational causation:** Temporal pattern ≠ root cause
- **Timezone interpretation:** UTC hours may not match local business hours
- **Weekend signal:** Relies on calendar day, not shift pattern
- **Concentration:** Could be legitimate operational choice (peak delivery times)

### Not Included ❌

- **Forecasting:** No ML, no predictions
- **Anomaly detection:** Only rule-based thresholds
- **Causality:** Correlation signals, not proof
- **Shift definitions:** Fixed dayparts, not flexible shift scheduling

---

## Part 9: Test Coverage

### Automated Tests (30+)

- Daypart bucketing (11 tests: each hour mapped correctly)
- Day-of-week grouping (7 tests)
- Temporal metrics calculation (10 tests)
- Outlier detection (5 tests: each rule separately)
- Cross-restaurant aggregation (3 tests)

### Manual Tests (5)

1. Daypart bucketing: Orders grouped into correct 5 buckets
2. Day-of-week grouping: Orders grouped by calendar day
3. Daypart outlier: High flagged rate (>20%) in one daypart flagged
4. Weekend anomaly: >15% difference between weekend/weekday
5. Hourly concentration: Specific hour shows correct flagged rate

---

## Part 10: Summary

**Temporal analytics adds the *when* dimension to offline risk monitoring.**

### Delivered

✅ Lightweight time model (5 dayparts + 7 days + 24 hours)  
✅ Per-daypart and per-day metrics calculated  
✅ 5 rule-based temporal outlier signals  
✅ SuperAdmin dashboard with charts and tables  
✅ 30+ automated tests + 5 manual test scenarios  
✅ Full documentation with examples  

### Not Invasive

✅ Uses existing `offline_synced_at` timestamp (no new fields)  
✅ No timezone conversion (honest about limitations)  
✅ Simple rule-based outliers (no ML, no predictions)  
✅ Signals for human judgment (visibility-only)  

### Ready for Production

✅ UTC-based (timezone-agnostic)  
✅ Deterministic calculations (repeatable)  
✅ Clear audit trail (all timestamps logged)  
✅ Limitations documented  
✅ Test coverage comprehensive  

---

## Next Steps

1. **Deploy** — Temporal analytics goes live in SuperAdmin
2. **Train** — Explain daypart model and outlier signals to admins
3. **Monitor** — Collect feedback on usefulness of time windows
4. **Iterate** — Refine thresholds if needed (Phase 3.5)
5. **Future** — Add restaurant.timezone field for local-time bucketing (Phase 4)

---

**Delivered:** 2026-03-26 ✅

**Status:** Phase 3 Complete. Temporal insights ready for SuperAdmin deployment.