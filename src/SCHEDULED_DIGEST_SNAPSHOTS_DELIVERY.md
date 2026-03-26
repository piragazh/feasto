# Scheduled Digest Snapshots — Delivery Summary

**Status:** ✅ Complete  
**Date:** 2026-03-26  
**Scope:** Daily scheduled portfolio digest snapshot generation

---

## 1. Current Scheduling Gaps (Pre-Implementation)

| Gap | Impact | Severity |
|-----|--------|----------|
| **No scheduled cadence** | Snapshots only exist when dashboard is opened | High |
| **Unreliable history** | 3-day silence if platform stable | High |
| **Manual dependency** | Ops teams must remember to check | Medium |
| **No system-level generation** | Can't create snapshots without user login | Medium |
| **No summary format** | No standardized report output | Low |

---

## 2. Scheduled Snapshot Model Implemented

### Simple Daily Job

```
Every day 09:00 UTC:
  └─ Function: generateScheduledPortfolioSnapshot()
      ├─ Fetch orders + restaurants (service role)
      ├─ Calculate portfolio digest
      ├─ Hash digest
      ├─ Check if hash = last snapshot hash
      │   ├─ Yes → Skip (no change)
      │   └─ No → Create new snapshot
      └─ Return success/duplicate result
```

### Dedup On Hash

- Same digest content → Same hash → No new snapshot
- Only creates snapshot when **content** changes
- Prevents spam in history from stable periods

### Scope: Portfolio Only

- Created: Daily 09:00 UTC
- Scope: Portfolio (SuperAdmin only)
- Created by: 'system' (no user auth)
- Frequency: Once per meaningful change (hash-dedup)

---

## 3. Files Changed

### Created (2)

| File | Purpose | LOC | Notes |
|------|---------|-----|-------|
| `functions/generateScheduledPortfolioSnapshot.js` | Daily scheduled backend function | 380 | Digest calc + dedup + snapshot creation |
| `docs/SCHEDULED_DIGEST_SNAPSHOTS.md` | Operational documentation | 400 | Setup, dedup examples, usage patterns |

### Modified (2)

| File | Change | Impact |
|------|--------|--------|
| `lib/offline-digest-snapshots.js` | Add `formatDigestSummaryForEmail()` | Email-ready summary formatter |
| `scripts/smoke/suites/offlineDigest.smoke.js` | Add 4 smoke tests | Schedule + dedup + scope + formatting |

**Total New Code:** ~380 LOC (backend function)  
**Total Test Code:** ~150 LOC (4 new tests)  
**Total Documentation:** ~550 LOC (new doc file)

---

## 4. Tests / Smoke Coverage Added

### 4 New Tests

| Test | Coverage | Status |
|------|----------|--------|
| `testScheduledPortfolioSnapshotGeneration` | Scheduled function creates snapshots with created_by='system' | ✅ |
| `testScheduledSnapshotDedup` | Hash dedup prevents duplicate creation | ✅ |
| `testScheduledSnapshotRoleScope` | All scheduled snapshots are portfolio-level | ✅ |
| `testSummaryFormatterEmail` | Email summary formatter produces compact output | ✅ |

### Existing 15 Tests

All existing tests still pass (no breaking changes):
- Portfolio/restaurant digest generation
- Overdue order detection
- Critical ranking
- Snapshot ID generation
- Hash dedup
- Item counting
- Ack permissions
- History ordering

**Total:** 19 smoke tests, all passing, deterministic

---

## 5. Remaining Limitations

### Explicit Non-Goals (Phase 1)

❌ **Weekly digest rollup** — Too early, keep daily  
❌ **Auto-email delivery** — Not yet, just generate  
❌ **Restaurant-level scheduling** — Too much overhead, keep on-demand  
❌ **Slack/notification integration** — No push, pull-based only  
❌ **Trending/prediction** — Just snapshot-by-snapshot, no forecasting  

### By Design

❌ **Not a replacement for on-demand** — Dashboard still triggers instant snapshots  
❌ **Not a ticket system** — Ack ≠ resolved, just "reviewed"  
❌ **Not a state machine** — Single boolean ack, no workflow  

### Why These Limits?

- **Keep lightweight:** Portfolio-level only, no N×restaurant math
- **Keep deterministic:** No job queue, no retries, simple cron
- **Keep operational:** Summary, not automation; report, not alerting
- **Keep separate phases:** Email/trends are Phase 2

---

## 6. How to Activate

Scheduled function is deployed. To enable daily execution:

### Step 1: Create Automation (Admin Dashboard)

1. Go: **Dashboard → Code → Automations**
2. Click: **+ Create Automation**
3. Configure:
   - **Type:** Scheduled
   - **Name:** `Daily Portfolio Digest Snapshot`
   - **Function:** `generateScheduledPortfolioSnapshot`
   - **Schedule Type:** Cron
   - **Cron Expression:** `0 9 * * *` (09:00 UTC daily)
4. Save & Enable

### Step 2: Verify

- Check logs: First run should be next 09:00 UTC
- Check history: New snapshot appears in dashboard → Risk Digest → History
- Check dedup: If digest unchanged next day, no new snapshot created

---

## 7. Operational Impact

### Before
- Snapshots only exist if someone opens dashboard
- 3-day silence looks like 0 data (actually: no access)
- Ops must remember to check
- History is patchy

### After
- 1 snapshot guaranteed per day (if content changed)
- Ops can rely on daily cadence
- No manual intervention needed
- History is complete and reliable

### Day 1
```
09:00 UTC: Scheduled function runs
  → Calculates digest
  → Creates snapshot (hash different from last)
  → Stored in DB
  → Available in history immediately
```

### Day 2 (Stable)
```
09:00 UTC: Scheduled function runs
  → Calculates digest
  → Hash = yesterday's hash
  → Skips creation (no change, no noise)
  → Log: "Digest unchanged, skipping"
```

### Day 3 (Critical)
```
09:00 UTC: Scheduled function runs
  → Calculates digest
  → Hash different (new critical order)
  → Creates snapshot
  → History shows: Day 1, Day 3 (Day 2 stable, no entry)
```

---

## 8. Summary Output (Email-Ready)

New helper function: `formatDigestSummaryForEmail(digest)`

**Output:**
```
Offline Risk Digest | 26-03-2026 09:00 UTC
────────────────────────────────────────────────────

🚨 CRITICAL
  • 2 overdue (oldest 480m)
  • Top risk: Store A (45% flagged)
  • 1 abuse escalation

⚠️ WATCH
  • Escalation rate UP: 25% (was 15%)
  • 1 operator outlier(s)

📊 METRICS (24h)
  • Offline: 100
  • Flagged: 30 (30%)
  • Escalated: 10 (33%)
```

Compact, email-ready, suitable for daily reports.

---

## 9. Architecture Decisions

### Why Scheduled via Automation (Not Webhook/Scheduler)?

✅ **Base44 automations are simple** — Cron + function, no job queue  
✅ **Deterministic** — Same digest logic as on-demand  
✅ **Auditable** — Runs logged, created_by='system' tracked  
✅ **No external deps** — No Temporal, no Bull, no Kafka  

### Why Portfolio-Level Only?

✅ **Reduces overhead** — 1 snapshot/day instead of N×restaurant  
✅ **SuperAdmin use case** — Portfolio view is their primary dashboard  
✅ **Can scale later** — Add restaurant-level if needed (Phase 2)  

### Why Hash-Dedup?

✅ **No noise** — Stable days don't create history entries  
✅ **Deterministic** — Same hash = same content  
✅ **Works for both on-demand + scheduled** — Unified dedup logic  

---

## 10. Next Steps (Optional, Not Included)

If operations needs grow:

### Phase 2
1. **Scheduled email digest** — Generate + send daily summary at 09:00 UTC
2. **Recurring concern report** — Weekly list of items flagged >3 times
3. **Restaurant-level snapshots** — Daily per store (if scaling up)
4. **Slack/Teams posting** — Post unacked critical daily

### Later
- Worsening trend analysis (snapshots A→B→C showing escalation)
- Predictive signals (if X happens, Y likely to follow)
- Custom thresholds per team

---

## 11. Deployment Checklist

| Item | Status | Notes |
|------|--------|-------|
| Backend function created | ✅ | `generateScheduledPortfolioSnapshot.js` |
| Helper formatter added | ✅ | `formatDigestSummaryForEmail()` in lib |
| Smoke tests added | ✅ | 4 tests, all passing |
| Documentation written | ✅ | Setup, usage, dedup, examples |
| On-demand snapshots | ✅ | Still work, no breaking changes |
| Ack workflow | ✅ | Still works, no changes |
| History UI | ✅ | No changes needed |
| **Ready to activate?** | ✅ | Yes, create automation manually |

---

## Summary

| Item | Status |
|------|--------|
| **Current Gap** | Snapshots only on-demand, unreliable history |
| **Solution** | Daily scheduled function, hash dedup, portfolio-level |
| **Files** | 1 backend function + 1 doc + 1 helper + 4 tests |
| **Deployment** | Function ready, 1-click automation setup |
| **Tests** | 4 new smoke tests + 15 existing (all pass) |
| **Breaking changes** | None |
| **Operational gain** | Daily snapshot history, reliable cadence, no manual work |

**Status:** ✅ Complete, ready for activation  
**Activation:** Create 1 automation in dashboard  
**Next:** Phase 2 enhancements (email, trends, alerts)

---

## Quick Start

1. Deploy this code (auto-deployed)
2. Create automation: **Dashboard → Code → Automations**
   - Name: `Daily Portfolio Digest Snapshot`
   - Function: `generateScheduledPortfolioSnapshot`
   - Cron: `0 9 * * *`
3. Save & wait for 09:00 UTC
4. Check: **Super Admin → Risk Digest → History**
5. Done: Daily snapshots now reliably generated

Minimal changes, maximum operational reliability.