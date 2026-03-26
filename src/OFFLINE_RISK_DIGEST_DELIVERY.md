# Offline Risk Digest — Delivery Summary

**Status:** ✅ Complete  
**Date:** 2026-03-26  
**Scope:** Lightweight operational alerting/digest layer for offline-risk analytics

---

## 1. Current Surfacing Gaps (Audit Results)

| Gap | Before | After |
|-----|--------|-------|
| **Overdue order visibility** | Buried in dashboard tables | Quick summary in digest |
| **Critical restaurant ranking** | Manual eyeballing | Automated risk score sort |
| **Worsening trends** | Hidden in metrics | Explicit "watch" section |
| **Manager focus** | Full analytics (overwhelming) | Scoped digest (actionable) |
| **Export/summary** | N/A | Plaintext copy-to-clipboard |
| **Pull-based awareness** | Dashboard fatigue | Check-in digest only |

---

## 2. Digest Model Implemented

### Portfolio Digest (SuperAdmin)

**Critical Now:**
- Overdue flagged orders (>4h unreviewed) + count + oldest age + order IDs
- Top 5 restaurants by risk score (formula: 60% flagged_rate + 40% escalation_rate)
- Abuse-related escalations count (potential_abuse, large_price_mismatch, repeated)

**Watch (Worsening):**
- Escalation rate trending up (>+10pts vs 7-day baseline)
- Operator outliers (>2x average flagged rate)

**Summary:**
- Total offline, flagged, escalated, rates, restaurant count with issues

### Restaurant Digest (Manager/Admin)

**Critical Now:**
- Overdue flagged orders (this restaurant only)
- Operator watch list (local outliers)

**Next Actions:**
- Top reason code (most common issue) + action hint

**Summary:**
- 24h metrics (offline, flagged, escalated, rates)

---

## 3. Files Changed

### Created (4)

| File | Purpose | Lines |
|------|---------|-------|
| `lib/offline-digest-logic.js` | Digest generation logic | 350 |
| `components/superadmin/OfflineRiskDigest.jsx` | SuperAdmin digest panel | 400 |
| `components/restaurant/RestaurantOfflineDigest.jsx` | Manager digest component | 250 |
| `scripts/smoke/suites/offlineDigest.smoke.js` | Unit tests | 250 |

### Modified (2)

| File | Change |
|------|--------|
| `pages/SuperAdmin.jsx` | Add risk-digest menu item + route |
| `docs/OFFLINE_RISK_DIGEST.md` | New comprehensive guide |

### Total LOC Added
~1,250 lines (logic + UI + tests + docs)

---

## 4. Tests/Smoke Coverage Added

**File:** `scripts/smoke/suites/offlineDigest.smoke.js`

**10 Tests:**

1. ✅ **Portfolio Digest Generation** — Structure and sections correct
2. ✅ **Restaurant Digest Generation** — Restaurant context populated
3. ✅ **Overdue Orders Detection** — >4h unreviewed correctly identified
4. ✅ **Critical Ranking (Risk Score)** — Restaurants ranked by formula
5. ✅ **Worsening Trend Detection** — Escalation rate up >10pts detected
6. ✅ **Abuse Spike Detection** — ≥2 abuse escalations identified
7. ✅ **Operator Outliers** — >2x avg flagged rate detected
8. ✅ **Plaintext Formatting** — Export includes sections
9. ✅ **Criticality Check** — Has critical items → critical flag
10. ✅ **Role Visibility Boundaries** — SuperAdmin vs manager scoping

**All tests pass.** Deterministic, no external dependencies.

---

## 5. Remaining Limitations

### What This DOES NOT Provide

❌ **Automated actions** — Digest is summary only, human review required  
❌ **Root cause** — Flags patterns, not explanations  
❌ **Real-time** — Summary at check-in time, not live  
❌ **Push notifications** — Pull-based dashboard panel only  
❌ **Scheduled emails** — Future enhancement, not included  
❌ **Historical trending** — Snapshot only, no time-series  
❌ **Performance measurement** — For investigation, not evaluation  

### What This DOES Provide

✅ **Portfolio summary** — SuperAdmin sees critical/worsening at a glance  
✅ **Restaurant focus** — Manager sees only their store's issues  
✅ **Actionable signals** — Overdue orders, outliers, trends  
✅ **Signal tightness** — High signal-to-noise ratio  
✅ **Role scoping** — Visibility boundaries enforced  
✅ **Plaintext export** — Copy-to-clipboard for team notes  
✅ **Honest framing** — "Signal for investigation" language throughout  

---

## 6. Usage

### SuperAdmin

**Path:** SuperAdmin → Core Management → Risk Digest

1. View portfolio digest at a glance
2. Scan critical now, watch, summary sections
3. Click restaurant name to drill into portfolio analytics
4. Copy plaintext for team distribution

### Restaurant Manager (Future)

**Location:** Restaurant Dashboard (not yet integrated, but component ready)

1. View store-specific digest
2. Action overdue orders immediately
3. Discuss operator outliers with team
4. Address top reason code systematically

---

## 7. Key Design Wins

| Item | Design | Benefit |
|------|--------|---------|
| **Deterministic Logic** | All thresholds explicit (4h, >10pts, >2x, ≥2) | Predictable, auditable, no surprises |
| **No Automation** | Human-reviewed signals | No blame, no unintended consequences |
| **Role Scoping** | SuperAdmin sees all, manager sees one | Respects organizational boundaries |
| **Plaintext Export** | Copy-to-clipboard summary | Easy to share, archive, discuss |
| **High Signal** | Only critical/worsening items | Dashboard fatigue prevention |
| **Comparative Thresholds** | vs average, vs baseline, vs 7d | Honest, relative ranking |

---

## 8. Sample Plaintext Output

```
=== OFFLINE RISK DIGEST ===
Generated: 2026-03-26 11:00 AM

🚨 CRITICAL NOW
  Overdue Flagged Orders: 5 orders (oldest: 320m)
    - order-abc123: 320m ago · Store A
    - order-def456: 180m ago · Store B
    - order-ghi789: 150m ago · Store A
    + 2 more
  
  Top Risk Restaurants
    - Store A: Risk 68 | 35% flagged | 65% escalated
    - Store C: Risk 52 | 28% flagged | 52% escalated
    - Store B: Risk 48 | 22% flagged | 48% escalated
  
  Abuse-Related Escalations: 2
    - order-jkl012 · potential_abuse · Store A
    - order-mno345 · large_price_mismatch · Store C

⚠️ WATCH (WORSENING)
  Escalation Rate: 55% (24h) vs 40% (7d) — UP 15pts
  
  Operator Outliers:
    - op1@store-a.com · 45% flagged (vs 20% avg)
    - op2@store-b.com · 38% flagged (vs 20% avg)

📊 SUMMARY (24h)
  Total Offline: 247
  Flagged: 62 (25%)
  Escalated: 25 (40%)
  Restaurants with Issues: 6
```

---

## 9. Integration Points

### Depends On

- `Order` entity (offline_created, offline_synced_at, needs_review, offline_review_status, etc.)
- `Restaurant` entity (name, id)
- Phase A: Operator Analytics
- Phase B: Shift Window Analytics (optional context)

### Feeds Into

- SuperAdmin dashboard (as panel)
- Restaurant dashboard (future)
- Scheduled email digest (future, optional)
- Team reports/summaries (plaintext export)

---

## 10. Next Steps (Optional)

### Phase 2 (Future)

1. **Scheduled Email Digest** — Daily 9am email to SuperAdmin with plaintext summary
2. **Restaurant Manager Digest** — Integrate into restaurant dashboard
3. **Custom Thresholds** — Allow operators to adjust "critical" thresholds
4. **Historical Tracking** — Track digest items over time (trending up/down)
5. **Slack Integration** — Post digest summary to admin Slack channel

### Not In Scope (Intentional)

- Automated alerts/notifications (would cause fatigue)
- Enforcement actions (human review only)
- Root cause analysis (outside digest scope)
- Real-time streaming (snapshot summary only)

---

## Summary

**What was built:**

✅ Portfolio digest (SuperAdmin) with critical/worsening/summary  
✅ Restaurant digest (Manager) with critical/actions  
✅ Plaintext export for team distribution  
✅ Role visibility boundaries (scope enforcement)  
✅ 10 smoke tests (all passing)  
✅ Comprehensive documentation  

**What it solves:**

Turns analytics dashboards into **actionable operational summaries** without dashboard fatigue.

**What it does NOT do:**

Make decisions, assign blame, or automate actions. Pure signal layer for human review.

**Production ready:** YES  
**Test coverage:** 10 tests, all passing  
**Deployment:** Add digest component to SuperAdmin (done)  

---

**Status:** ✅ Complete  
**Delivery Date:** 2026-03-26  
**Next Phase:** Optional (scheduled email, restaurant integration, custom thresholds)