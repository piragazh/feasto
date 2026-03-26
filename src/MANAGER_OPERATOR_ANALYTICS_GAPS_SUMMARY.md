# Manager/Operator Analytics — Visibility Gaps & Solutions

**Date:** 2026-03-26

---

## Current Cross-Store Visibility Gaps (Addressed)

### Before This Delivery

| Gap | Severity | Example | Impact |
|-----|----------|---------|--------|
| Cannot identify manager causing high escalations | 🔴 HIGH | "Restaurant A: 70% escalation rate" — but which manager? | Admins blind to people-level issues |
| No visibility into review quality differences between managers | 🔴 HIGH | Both managers reviewed orders, but no way to compare them | Cannot identify training needs |
| Cannot track documentation/audit trail quality by person | 🟡 MEDIUM | No idea which managers skip notes | Audit trail opaque |
| Cannot detect patterns in reason code usage per manager | 🟡 MEDIUM | One manager may have blind spot for certain codes | Process gaps hidden |
| No visibility into review response times per manager | 🟡 MEDIUM | Cannot detect slow responders | No SLA enforcement |
| Cannot identify managers with abuse-related escalations | 🔴 HIGH | Cannot detect concentrated fraud signals | Fraud risk invisible |

### After This Delivery

| Gap | Status | Solution |
|-----|--------|----------|
| Manager escalation rate tracking | ✅ SOLVED | Manager Analytics shows escalation % per person |
| Manager review quality comparison | ✅ SOLVED | Ranking by metrics; identify best/worst performers |
| Documentation quality per manager | ✅ SOLVED | Documentation rate % per manager |
| Reason code patterns per manager | ✅ SOLVED | Distribution shown in detail modal |
| Review response time tracking | ✅ SOLVED | Avg review age per manager with outlier flag |
| Abuse escalation attribution | ✅ SOLVED | Flagged if manager has 2+ abuse escalations |

---

## Metrics Added

### Manager-Level Metrics (8 Total)

1. **Total Reviews** — Volume of work
2. **Escalation Rate** — % of reviews escalated (threshold: >50%)
3. **Resolution Rate** — % of reviews resolved
4. **Documentation Rate** — % with notes (threshold: <50%)
5. **Average Review Age** — Hours to review (threshold: >8h)
6. **Unresolved Backlog** — Pending reviews (threshold: >3)
7. **Abuse Escalations** — Fraud-like patterns (threshold: ≥2)
8. **Reason Code Distribution** — Top codes used per manager

### Outlier Rules Added (6 Types)

| Outlier | Threshold | Why It Matters |
|---------|-----------|----------------|
| Highest escalation rate | >50% | Unusually many orders escalated |
| Lowest documentation | <50% (min 3 reviews) | Audit trail gaps |
| Code concentration | >70% single code | Potential blind spot |
| Abuse escalations | ≥2 cases | Fraud signal concentration |
| Slowest review time | >8h avg (min 3 reviews) | Responsiveness issue |
| Largest backlog | >3 unresolved | Order accumulation |

---

## Files Changed

### Created (3)

```
lib/manager-operator-analytics.js        (410 lines)
  ├─ calculateManagerMetrics()
  ├─ rankManagersByRisk()
  ├─ flagManagerOutliers()
  └─ aggregateManagerMetricsAcrossRestaurants()

components/superadmin/ManagerOperatorAnalytics.jsx  (400 lines)
  ├─ Summary cards
  ├─ Outliers section
  ├─ Manager ranking table
  ├─ Sort/filter controls
  └─ Detail modal

scripts/smoke/suites/managerOperatorAnalytics.smoke.js  (320 lines)
  ├─ 20+ automated test cases
  └─ 5 manual UI scenarios
```

### Modified (1)

```
pages/SuperAdmin
  ├─ Added import: ManagerOperatorAnalytics
  ├─ Added menu item: "Manager Analytics"
  └─ Added route: manager-analytics → component
```

### Documentation (2)

```
docs/MANAGER_OPERATOR_ANALYTICS.md               (11.9 KB)
MANAGER_OPERATOR_ANALYTICS_DELIVERY.md           (11.1 KB)
MANAGER_OPERATOR_ANALYTICS_AUDIT.md              (9.0 KB)  [Initial audit]
MANAGER_OPERATOR_ANALYTICS_GAPS_SUMMARY.md       (This file)
```

---

## Tests & Smoke Coverage

### Test Count: 25+ Total

**Automated (20+):**
- Metrics calculation: 7 tests
- Ranking logic: 2 tests
- Outlier detection: 6 tests
- Cross-restaurant aggregation: 3+ tests

**Manual (5):**
- Ranking displays in correct order
- Filtering by restaurant works
- Sorting by different metrics works
- Outlier section shows all flags
- "View" button opens detail modal

---

## Remaining Limitations

### Phase 1 Scope (Current)
- ✅ Manager review attribution
- ✅ Manager metrics & ranking
- ✅ Outlier detection
- ✅ SuperAdmin visibility
- ✅ Drill-down investigation

### Phase 2 Scope (Requires Schema Change)
- ❌ Operator order creation tracking (needs `offline_created_by` field)
- ❌ Operator flagged rate metrics
- ❌ POS staff attribution
- ❌ Operator-level outliers

### Limitations by Design (Not Planned)
- ❌ No automated enforcement (signals only for human review)
- ❌ No ML/predictions (deterministic rules only)
- ❌ No real-time alerts (manual dashboard check)
- ❌ No surveillance beyond review actions
- ❌ No restrictions on existing roles (visibility-only)

---

## Role Visibility Boundaries

### SuperAdmin ✅
```
Can see:
  ├─ All managers across all restaurants
  ├─ Manager metrics & rankings
  ├─ Outlier flags
  ├─ Reason code distributions
  └─ Drill-down per manager

Cannot see:
  └─ (N/A — full access at this role)
```

### Restaurant Admin (Future)
```
Will see:
  ├─ Managers at own restaurant only
  ├─ Own restaurant metrics
  └─ Drill-down per manager

Cannot see:
  ├─ Other restaurants' managers
  ├─ Cross-restaurant comparisons
  └─ Platform-wide rankings
```

### Regular Users ❌
```
No access to manager analytics
```

---

## Data Quality & Reliability

### ✅ Highly Reliable
- Manager identity (email) — persisted on Order.`offline_review_by`
- Review decisions — captured in Order.`offline_review_status`
- Reason codes — structured enum in Order.`offline_review_reason_code`
- Review notes — persisted in Order.`offline_review_notes`
- Timestamps — database timestamps on Order.`offline_review_at`
- Audit trail — logged in DashboardActivity

**Data Loss Risk:** ❌ NONE — all fields required for metrics are persisted

### ⚠️ Partial (Captured After Implementation)
- Review age — requires both sync_at and review_at timestamps (both captured)
- Abuse escalations — requires code enumeration (codes defined in offlineOrderReview function)

### ❌ Unavailable (Phase 2)
- Operator who created order — logged to console, not persisted
- POS staff identity — not linked at order creation
- Staff member role at time of creation — not captured

---

## Practical Usage Examples

### Example 1: Identify High-Risk Manager

```
Outliers shows:
  🔴 Highest escalation rate: alice@restaurant.com (75%)

Manager Analytics shows:
  Alice: 20 reviews | 75% escalation | 40% documentation | 12h avg review

Investigation:
  1. View detail modal → reason codes
  2. Check recent escalations
  3. Determine if legitimate (strict process) or problematic (pattern abuse)
  4. Discuss with Alice or restaurant owner
```

### Example 2: Document Quality Issue

```
Outliers shows:
  🟡 Lowest documentation: bob@restaurant.com (20%)

Manager Analytics shows:
  Bob: 10 reviews | 50% escalation | 20% documentation | 2h avg

Investigation:
  1. Remind Bob to add contextual notes
  2. Provide template/guidelines
  3. Check if time pressure
  4. Verify policy understanding

Result:
  Better audit trail for future decisions
```

### Example 3: Abuse Signal

```
Outliers shows:
  🔴 Most abuse escalations: carol@restaurant.com (3)

Manager Analytics shows:
  Carol: 12 reviews | 45% escalation | 70% documentation

Investigation:
  1. Review the 3 abuse-flagged orders
  2. Check for patterns
  3. Determine if fraud signal or false positive
  4. Escalate if needed

Result:
  Risk awareness + targeted fraud investigation
```

---

## Comparison: Before vs After

### Before

```
Restaurant Dashboard (per-restaurant):
  ├─ 25% of orders flagged as offline
  ├─ 60% escalation rate
  ├─ 5 unresolved orders
  └─ (No breakdown by person)

Platform Admin:
  ├─ Can see which restaurants have problems
  ├─ Cannot identify which managers caused them
  └─ Must manually investigate per restaurant
```

### After

```
Manager Analytics (cross-manager):
  ├─ 5 managers across 3 restaurants
  ├─ Manager A: 75% escalation (OUTLIER)
  ├─ Manager B: 30% documentation (OUTLIER)
  ├─ Manager C: 12h avg review time (OUTLIER)
  ├─ Manager D: Normal
  └─ Manager E: Normal

Platform Admin:
  ├─ Can identify problematic managers immediately
  ├─ Can rank by severity/risk
  ├─ Can drill down to manager detail
  ├─ Can make targeted coaching/training decisions
  └─ Can spot patterns across restaurants
```

---

## Summary Table

| Aspect | Status | Details |
|--------|--------|---------|
| **Audit Complete** | ✅ | Identity data mapped, Phase 1 scope determined |
| **Manager Metrics** | ✅ | 8 metrics calculated per manager |
| **Outlier Rules** | ✅ | 6 types flagged with clear thresholds |
| **SuperAdmin UI** | ✅ | Dashboard with sort, filter, drill-down |
| **Tests** | ✅ | 20+ automated + 5 manual scenarios |
| **Documentation** | ✅ | 4 guides covering implementation & usage |
| **Role Visibility** | ✅ | SuperAdmin access, future phases scoped |
| **Production Ready** | ✅ | No data loss, deterministic logic, tested |
| **Phase 2 Scoped** | ✅ | Operator tracking requires schema change |
| **Limitations Documented** | ✅ | Clear about signals vs proof; no surveillance |

---

## Next Steps

1. **Deploy Phase 1** — Manager analytics goes live
2. **Train SuperAdmins** — How to interpret metrics & investigate outliers
3. **Monitor in Production** — Collect feedback; refine thresholds if needed
4. **Plan Phase 2** — Operator-level tracking (requires `offline_created_by` field)
5. **Expand Access** — Restaurant Admin access in future phase

---

**Ready for Production Deployment** ✅