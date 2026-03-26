# Staffing & Shift Analytics Audit — Summary

**Date:** 2026-03-26  
**Status:** ✅ Audit Complete  
**Recommendation:** Proceed with hybrid operator + shift proxy model

---

## 1. Staffing/Shift Data Available

| Data | Available | Detail |
|------|-----------|--------|
| **Operator identity** | ✅ YES | `offline_created_by` (email, name, role) on Order |
| **Manager reviewers** | ✅ YES | `offline_review_by` on Order with timestamp |
| **Staff roster** | ✅ YES | StaffMember entity (name, role, email) |
| **Staff schedules** | ❌ NO | No shift assignments or schedule |
| **Opening hours** | ✅ YES | Restaurant.opening_hours (per day-of-week) |
| **Shift definitions** | ❌ NO | No shift windows/boundaries defined |
| **Timezone** | ✅ YES | Restaurant.timezone (IANA) for local-time conversion |
| **Manager analytics** | ✅ YES | Already calculated (escalation, docs, speed) |
| **Operator analytics** | 🟡 STUB | Code exists but not implemented (can do now) |

---

## 2. Chosen Shift Model

### **HYBRID: Real Operator Data + Honest Shift Proxy**

**NOT:** Pretending staff schedules exist  
**NOT:** False precision about who was on duty  
**YES:** Using real operator identity + estimated shift windows + clear labeling

**Three Layers:**

1. **Operator Identity** (REAL — `offline_created_by`)
   - Who created the order
   - Their role at creation time
   - When they created it

2. **Temporal Context** (REAL — timezone-aware)
   - Local time (converted from UTC)
   - Daypart (morning/lunch/afternoon/dinner/late)
   - Day-of-week

3. **Shift Proxy** (HONEST — estimated from opening_hours)
   - Standard shift windows:
     - **Morning:** open → 12:00
     - **Afternoon:** 12:00 → 17:00
     - **Evening:** 17:00 → close
     - **Late:** 22:00 → close (if applicable)
   - Clearly labeled as "estimated" not "actual"
   - Optional override per restaurant

---

## 3. Metrics/Indicators to Add

### Operator Level

- **Orders created by operator**
- **Flagged rate per operator** (% of their orders that are flagged)
- **Escalation concentration** (% of flagged orders escalated by this operator)
- **Common reason codes** for this operator
- **Time-of-day pattern** (which dayparts have highest error rate for this operator)
- **Peer comparison** (vs. other operators in same role/restaurant)

### Shift Level

- **Orders by shift** (estimated)
- **Flagged rate by shift** (vs. restaurant average)
- **Escalation rate by shift**
- **Overdue review rate by shift**
- **Operator concentration** (1 operator creating most issues in this shift?)
- **Handover anomalies** (spike in issues ±30min of shift boundary?)

### Manager Review Level

- **Review speed by shift** (does manager review slower in evenings?)
- **Escalation patterns by shift** (different reason codes by shift?)
- **Backlog growth by shift** (which shift has most unresolved?)

---

## 4. Files to Change/Create

### Files to CREATE

| File | Purpose |
|------|---------|
| `lib/shift-proxy-analytics.js` | Shift mapping, operator↔shift correlation |
| `lib/operator-analytics.js` | Operator-level metrics (extend existing stub) |
| `components/superadmin/OperatorAnalytics.jsx` | Operator dashboard |
| `components/superadmin/ShiftAnalytics.jsx` | Shift-level dashboard |
| `entities/ShiftProxyConfig.json` | Per-restaurant shift customization |
| `docs/SHIFT_PROXY_MODEL.md` | Complete guide to shift proxy model |
| `docs/OPERATOR_ANALYTICS.md` | Operator tracking guide |
| `scripts/smoke/suites/operatorAnalytics.smoke.js` | Operator metrics tests |
| `scripts/smoke/suites/shiftProxyAnalytics.smoke.js` | Shift proxy tests |

### Files to MODIFY

| File | Change |
|------|--------|
| `lib/manager-operator-analytics.js` | Implement `calculateOperatorMetrics()` (currently stub) |
| `components/superadmin/OfflineTemporalAnalytics.jsx` | Add shift overlay tab |
| `components/superadmin/OfflineReviewPortfolio.jsx` | Add shift-level risk flagging |
| `components/superadmin/ManagerOperatorAnalytics.jsx` | Add shift column to manager table |

---

## 5. Tests/Smoke Coverage

### Operator Analytics Tests

- Operator grouping by `offline_created_by`
- Flagged rate calculation per operator
- Escalation rate per operator
- Role-level pattern detection
- Peer comparison

### Shift Proxy Analytics Tests

- Shift window mapping (order time → shift)
- Handover window detection (±30min of boundary)
- Operator concentration per shift
- Escalation spike detection
- Shift override (custom windows) validation

### Integration Tests

- Operator + shift correlation
- Manager review patterns by shift
- Temporal anomalies with operator+shift context

---

## 6. UI Visibility

**All labeled honestly:**

```
⚠️ SHIFT ANALYTICS (ESTIMATED)

These shifts are calculated from restaurant opening hours,
not actual staff schedules. They show patterns within estimated
shift windows, not proof of staffing causation.

Estimated Shifts:
• Morning: [open] → 12:00
• Afternoon: 12:00 → 17:00
• Evening: 17:00 → [close]

To enable actual shift tracking, set staff schedules.
```

**Where visible:**
- Operator dashboard: Operator + shift + daypart grid
- Shift analytics: Shift-level risk + operator concentration
- Temporal analytics: Shift overlay on daypart chart
- Portfolio: Shift-specific flagged rate
- Manager review: Manager response speed by shift

---

## 7. Remaining Limitations

### What We Still DON'T Know

- ❌ Actual shift assignment (only estimate from time)
- ❌ Concurrent staffing level (how many people on duty?)
- ❌ Supervisor identity (who was managing this shift?)
- ❌ Break/handover exact timing (only ±30min guess)
- ❌ Workload per operator (how many orders did they handle?)

### What We CAN Honestly Infer

- ✅ Operator error patterns (this operator has 2x error rate)
- ✅ Shift-window patterns (afternoon has more escalations)
- ✅ Handover concentration (issues cluster near shift changes)
- ✅ Role patterns (cashiers vs. kitchen staff differences)
- ✅ Temporal concentration (one person creating 60% of issues in lunch)

---

## 8. Implementation Order

**Phase A (Week 1):** Operator identity analytics
- Implement `calculateOperatorMetrics()`
- Create operator dashboard
- Add operator smoke tests

**Phase B (Week 2):** Shift proxy analytics
- Create `lib/shift-proxy-analytics.js`
- Create shift dashboard
- Add shift proxy tests
- Create ShiftProxyConfig entity

**Phase C (Week 3):** UI integration
- Add shift overlay to temporal analytics
- Add shift filter to portfolio
- Add shift column to manager analytics
- Honest labeling on all views

**Phase D (Week 4):** Documentation & testing
- Complete guides
- Comprehensive smoke tests
- Limitation documentation

---

## Recommendation

✅ **PROCEED with hybrid model:**

1. Use real operator identity data (we have it)
2. Use timezone-aware temporal grouping (we have it)
3. Add honest shift proxy from opening_hours (estimated, clearly labeled)
4. NO false precision — be explicit about what's real vs. estimated
5. Add option for restaurants to override with custom shifts

**Why safe:**
- Uses real data (operator email, timestamps)
- Honest about limitations
- Clearly labeled as "proxy/estimated"
- No false confidence
- Can upgrade to real shifts later when available

**Risk level:** LOW (truthful proxy + real data, no pretense)

---

**Status:** ✅ Ready to begin implementation  
**Next:** Proceed to Phase A (operator metrics)