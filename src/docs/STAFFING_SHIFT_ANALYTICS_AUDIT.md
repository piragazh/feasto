# Staffing & Shift Analytics Audit

**Date:** 2026-03-26  
**Scope:** Assess availability of shift/staffing data for offline risk correlation analysis  
**Goal:** Determine whether real shift analytics are possible or if proxy model needed

---

## Summary

| Question | Finding |
|----------|---------|
| **Do real shift schedules exist?** | ❌ No shift scheduling system in place |
| **Is operator identity captured?** | ✅ YES — `offline_created_by` (email, name, role) on Order entity |
| **Is manager reviewer tracked?** | ✅ YES — `offline_review_by` on Order entity |
| **Can we infer shift from time-of-day?** | ⚠️ Partial — opening_hours exist, but no shift definitions |
| **What's the safest model?** | **Hybrid:** Operator identity + explicit shift proxy based on opening hours |

---

## Part 1: Staffing Data Available

### A. StaffMember Entity

**Fields present:**
```json
{
  "restaurant_id": "...",
  "full_name": "John Doe",
  "email": "john@...com",
  "staff_number": "S001",
  "role": ["waiter", "cashier", "kitchen_staff", "manager"],
  "pin": "1234",
  "is_active": true,
  "invite_sent": false,
  "notes": "..."
}
```

**Analysis:**
- ✅ Staff roster exists (name, role, email, phone)
- ❌ NO shift schedule field
- ❌ NO start/end time fields
- ❌ NO days-of-week assignment
- ❌ NO scheduled shift windows

**Conclusion:** Staff members are defined but not scheduled.

### B. RestaurantManager Entity

**Fields present:**
```json
{
  "user_email": "manager@...com",
  "restaurant_ids": ["r1", "r2"],
  "full_name": "Jane Smith",
  "is_active": true
}
```

**Analysis:**
- ✅ Managers linked to restaurants
- ❌ NO shift assignments
- ❌ NO on-duty schedules

---

## Part 2: Operator Identity Tracking

### Order Entity — Offline Creation Tracking

**Fields on Order:**
```json
{
  "offline_created": true,
  "offline_created_by": "john@...com",           // ✅ Operator email
  "offline_created_by_name": "John Doe",         // ✅ Operator name (snapshot)
  "offline_created_by_role": "cashier",          // ✅ Operator role (snapshot)
  "offline_created_at": "2026-03-26T15:30:00Z",  // ✅ When created (local)
  "offline_synced_at": "2026-03-26T15:35:00Z"    // ✅ When synced (UTC)
}
```

**Analysis:**
- ✅ Operator identity captured (email, name, role)
- ✅ Order creation time stored
- ✅ Operator role snapshot (cashier, waiter, manager, kitchen_staff)
- ✅ Can attribute offline issues to specific operator

**Impact:** We CAN answer "who created this offline order" but NOT "what shift was this person working"

### Order Entity — Manager Review Tracking

**Fields on Order:**
```json
{
  "offline_review_by": "manager@...com",         // ✅ Reviewer email
  "offline_review_at": "2026-03-26T16:00:00Z",  // ✅ When reviewed (UTC)
  "offline_review_status": "acknowledged|resolved|escalated",
  "offline_review_reason_code": "...",
  "offline_review_notes": "..."
}
```

**Analysis:**
- ✅ Manager who reviewed order captured
- ✅ Review timestamp available
- ✅ Can track manager response patterns
- ❌ Cannot infer "was this manager on-duty at the time"

---

## Part 3: Time-of-Day Context

### Restaurant Entity — Opening Hours

**Fields on Restaurant:**
```json
{
  "opening_hours": {
    "monday": { "open": "09:00", "close": "22:00", "closed": false },
    "tuesday": { "open": "09:00", "close": "22:00", "closed": false },
    ...
    "sunday": { "closed": true }
  },
  "delivery_hours": { ... },        // Separate hours for delivery
  "collection_hours": { ... }       // Separate hours for collection
}
```

**Analysis:**
- ✅ Restaurant operates within known time windows (per day-of-week)
- ⚠️ Can infer "restaurant is open", but not "which shift is this"
- ❌ No shift definitions (morning shift, afternoon shift, night shift, etc.)

**Example problem:**
- Restaurant open: 09:00–22:00 (single opening period)
- Order at 15:00 → Is this "lunch shift" or "afternoon shift"?
- Without explicit shift definitions, we can only guess

---

## Part 4: Timezone Context

**Good news:** Timezone-aware analysis already deployed!

**Fields on Restaurant:**
```json
{
  "timezone": "Europe/London",      // IANA identifier
  "country": "GB"                   // ISO country code
}
```

**Impact:** All order timestamps (UTC) are convertible to restaurant's local time, so we CAN group by local-time dayparts (morning, lunch, afternoon, dinner, late).

---

## Part 5: Temporal Analytics Already Exist

### Existing Daypart Grouping

**From `lib/offline-temporal-analytics.js`:**
```javascript
// Local-time dayparts (from restaurant's timezone)
morning: 05–11
lunch: 11–14
afternoon: 14–17
dinner: 17–22
late: 22–05
```

**Analysis:**
- ✅ Already splits day into 5 buckets by local time
- ✅ Timezone-aware (converts UTC → local)
- ✅ Can correlate offline issues with time-of-day

**Limitation:** Dayparts are fixed 24h cycles; shift patterns are human-defined (varies by restaurant).

---

## Part 6: Manager & Operator Analytics Exist

### Manager-Level Analytics

**From `lib/manager-operator-analytics.js`:**
- Groups orders by `offline_review_by` (reviewer email)
- Calculates: escalation rate, documentation rate, review age
- Detects: outlier reviewers, high escalation rates

**Available metrics per manager:**
- Total reviews handled
- Escalations / resolutions
- Documentation quality
- Review time (how fast they respond)
- Reason code patterns

### Operator-Level Analytics

**Status:** STUB (not yet implemented)

**Code comment:**
```javascript
// Currently offline_created_by is not persisted on Order entity,
// so this is a stub awaiting schema change.
// This will be implemented in Phase 2 when Order schema is updated
```

**But:** `offline_created_by` DOES exist on Order! So this can be implemented now.

**Available operator data:**
- Who created each offline order
- Their role at creation time
- When they created it

---

## Part 7: What We CAN Do

### A. Operator → Offline Issue Correlation

**Possible:**
- "Cashier A created 80% of flagged orders during lunch"
- "Waiter B's orders are 30% more likely to have price mismatches"
- "Manager C takes 3x longer to review orders than manager D"

**Implementation:** Extend `calculateOperatorMetrics()` to group by `offline_created_by`

### B. Temporal Pattern by Operator

**Possible:**
- "Operator A has issues concentrated in afternoon daypart"
- "Operator B's errors spike at handover time (17:00)"
- "Different operators have different error patterns by hour"

**Implementation:** Combine operator identity + timezone-aware hour buckets

### C. Manager Review Patterns

**Already available:**
- Manager escalation rates per restaurant
- Manager documentation quality
- Manager review speed

### D. Daypart-Level Risk (No Shift Yet)

**Already available:**
- Offline issues by daypart (morning/lunch/afternoon/dinner/late)
- Flagged rate by daypart
- Escalations by daypart

---

## Part 8: What We CANNOT Do (Without New Data)

| Question | Why Not Available | Data Needed |
|----------|-------------------|-------------|
| "Was operator X on-duty when issue occurred?" | No shift schedule | StaffSchedule or ShiftAssignment entity |
| "Did this issue happen during shift change?" | No shift boundaries | Explicit shift start/end times |
| "Which shift has the most issues?" | No shift definitions | Shift templates (Morning 6–14, Afternoon 14–22, etc.) |
| "How many staff were on-duty at this time?" | No staffing level data | Schedule with concurrent staff counts |
| "Which manager was supervising?" | No manager schedule | Manager shift assignments |

---

## Part 9: Safest Minimal Model

### Decision Matrix

| Option | Pros | Cons | Recommendation |
|--------|------|------|-----------------|
| **Wait for real shift DB** | Accurate, complete | Takes months, blocks analysis | ❌ Too slow |
| **Use only operator + daypart** | Works now, honest, no fake data | Limited shift context | ⚠️ Partial solution |
| **Proxy shift from opening_hours** | Works now, adds structure, honest about limitations | Hardcoded defaults, not per-staff | ✅ **BEST** |
| **Fake roster from opening_hours + assumptions** | Lots of data | Misleading, false precision | ❌ No |

### **CHOSEN: Hybrid Model**

**Layers:**

1. **Operator Identity** (real data)
   - Who created order: `offline_created_by`
   - Who reviewed it: `offline_review_by`
   - Their role at creation: `offline_created_by_role`

2. **Temporal Grouping** (real data)
   - Daypart bucketing: morning/lunch/afternoon/dinner/late (timezone-aware)
   - Hour-of-day: local time
   - Day-of-week: weekday vs weekend

3. **Shift Proxy** (explicit, honest)
   - **Define standard shifts** based on opening_hours:
     - Morning: open → 12:00 (or opening_hours.open → 12:00)
     - Afternoon: 12:00 → 17:00
     - Evening: 17:00 → close (or 17:00 → opening_hours.close)
     - Late/Night: if open > 22:00, add 22:00 → close
   - **Label clearly:** "Proxy shifts based on restaurant hours (not actual staff schedules)"
   - **Allow override:** Restaurants can set custom shift windows in settings

---

## Part 10: Implementation Plan

### Phase A: Operator Identity Analytics (Week 1)

**Goal:** Surface operator-level patterns in offline issues

**Changes:**
1. Update `calculateOperatorMetrics()` to group by `offline_created_by`
2. Calculate per-operator metrics:
   - Orders created
   - Flagged rate
   - Escalation rate (of flagged orders)
   - Common reason codes
3. Add UI to SuperAdmin dashboard to show operator risk
4. Add smoke tests for operator grouping

**Files:**
- `lib/manager-operator-analytics.js` — implement operator metrics
- `components/superadmin/OperatorAnalytics.jsx` — new dashboard
- `scripts/smoke/suites/operatorAnalytics.smoke.js` — tests

### Phase B: Shift Proxy Analytics (Week 2)

**Goal:** Correlate offline issues with shift windows

**Changes:**
1. Create `lib/shift-proxy-analytics.js`:
   - Define standard shifts (morning/afternoon/evening/late)
   - Map order time to shift window
   - Assign operator to shift based on order creation time
2. Calculate shift-level metrics:
   - Orders by shift
   - Flagged rate by shift
   - Escalation rate by shift
   - Operator concentration by shift
3. Detect handover-window anomalies (orders ±30min of shift change)
4. Add shift proxy config to Restaurant entity (optional override)

**Files:**
- `lib/shift-proxy-analytics.js` — shift mapping & metrics
- `entities/ShiftProxyConfig.json` — per-restaurant shift customization
- `components/superadmin/ShiftAnalytics.jsx` — new dashboard
- `scripts/smoke/suites/shiftProxyAnalytics.smoke.js` — tests

### Phase C: UI Integration (Week 3)

**Goal:** Visibility of shift patterns in existing dashboards

**Changes:**
1. Update `OfflineTemporalAnalytics` to show shift overlay
2. Update `OfflineReviewPortfolio` to flag shift-specific risk
3. Add shift context to `ManagerOperatorAnalytics`
4. Label all proxy shifts honestly ("Estimated based on restaurant hours")

**Files:**
- `components/superadmin/OfflineTemporalAnalytics.jsx` — add shift tab
- `components/superadmin/OfflineReviewPortfolio.jsx` — add shift filter
- `components/superadmin/ManagerOperatorAnalytics.jsx` — add shift column

### Phase D: Documentation & Testing (Week 4)

**Goal:** Explain model, limitations, and proper usage

**Files:**
- `docs/SHIFT_PROXY_MODEL.md` — complete guide
- `docs/OPERATOR_ANALYTICS.md` — operator tracking guide
- Smoke tests for all new metrics
- Operator & shift boundary test cases

---

## Part 11: What Data Exists NOW

| Item | Exists? | Detail |
|------|---------|--------|
| **Staff Members** | ✅ | Name, role, email, phone |
| **Staff Schedules** | ❌ | No shift assignments |
| **Operator Identity on Orders** | ✅ | `offline_created_by`, name, role |
| **Manager Reviewers** | ✅ | `offline_review_by` with timestamp |
| **Opening Hours** | ✅ | Per day-of-week, per restaurant |
| **Shift Definitions** | ❌ | No shift windows defined |
| **Timezone** | ✅ | Restaurant.timezone (IANA) |
| **Local-time Grouping** | ✅ | Dayparts (morning/lunch/afternoon/dinner/late) |
| **Manager Analytics** | ✅ | Escalation, documentation, review speed |
| **Operator Analytics** | 🟡 | Stub (can implement now) |

---

## Part 12: Remaining Limitations

### What We'll Still NOT Know

1. **Actual shift assignment:** We can't prove "operator X was working 14:00–22:00 on this day"
2. **Concurrent staffing:** We can't say "only 2 people on duty when this happened"
3. **Supervisor context:** We can't identify "who was supervising this operator"
4. **Break/handover timing:** We can only guess shift changes from time-of-day
5. **Actual workload:** We can't know "operator had 50 orders that hour"

### What We CAN Infer (Honestly)

1. **Operator patterns:** "This operator has 2x error rate compared to peers"
2. **Shift-window patterns:** "Afternoon shift has higher escalation rate than morning"
3. **Handover-window issues:** "Many issues occur ±30min of shift boundaries"
4. **Role-level patterns:** "Cashiers have different error patterns than kitchen staff"
5. **Temporal concentration:** "One operator creates 60% of issues in lunch shift"

---

## Part 13: Honest Labeling

**Dashboard must clearly state:**

```
📊 SHIFT ANALYTICS (ESTIMATED)

⚠️ NOTE: These shifts are estimated from restaurant opening hours,
not actual staff schedules. They show patterns within estimated
shift windows, not proof of staffing causation.

Estimated Shifts:
• Morning: [open] → 12:00
• Afternoon: 12:00 → 17:00  
• Evening: 17:00 → [close]
• Late: 22:00 → [close] (if applicable)

To enable actual shift tracking, restaurants would need to set
staff schedules. These estimates are proxy patterns only.
```

---

## Part 14: Example: Honest vs. Misleading

### ❌ Misleading

"**Shift manager John Smith caused 50% of Friday escalations**"
- Problem: We don't know if John was even on duty
- False precision: Looks like proof, but is guess

### ✅ Honest

"**During the estimated evening shift (17:00–close), escalations spiked 40% on Fridays. Operator emails in this window show J.Smith created 60% of flagged orders. This may indicate**:
- John was likely on duty and had high error rate, OR
- Evening shift is busy and error-prone generally, OR
- Different error types happen at that time
- → Recommend: Ask manager about Friday evening staffing patterns"

---

## Conclusion

### Data Available NOW

✅ Operator identity (email, name, role)  
✅ Manager reviewers (who reviewed, when)  
✅ Time-of-day (timezone-aware local time)  
✅ Daypart grouping (morning/lunch/afternoon/dinner/late)  
✅ Opening hours (define shift windows)  
✅ Staff roster (but no schedules)  

### Safest Model to Implement

**Hybrid:**
1. **Operator analytics** — real data, group by `offline_created_by`
2. **Shift proxy** — estimated shifts from opening_hours, clearly labeled
3. **Correlation** — surface operator + shift patterns, with honest caveats
4. **Override** — allow restaurants to customize shift windows

### Next Steps

1. Implement operator metrics (extend `calculateOperatorMetrics()`)
2. Create shift proxy library (`lib/shift-proxy-analytics.js`)
3. Add UI layer with clear "estimated/proxy" labels
4. Document limitations & honest usage guidelines
5. Add comprehensive smoke tests

---

**Status:** Audit complete ✅  
**Recommendation:** Proceed with hybrid model (Phase A-D outlined above)  
**Risk Level:** Low (using real data + honest proxy, no false precision)