# Scheduled Digest Snapshot Generation — Daily Operational Reporting

**Status:** ✅ Complete  
**Date:** 2026-03-26  
**Purpose:** Create reliable daily portfolio digest snapshots automatically, reducing dependency on manual dashboard access

---

## Overview

### The Problem
- Digest snapshots were only created when someone opened the dashboard (on-demand)
- If the platform was stable for 3 days, no snapshots existed
- Operations teams couldn't rely on "at least 1 snapshot per day"
- History looked patchy and unreliable

### The Solution
- Daily scheduled function runs at **09:00 UTC** to generate portfolio digest snapshot
- Hash-based dedup prevents duplicates if digest hasn't changed
- Snapshots stored persistently in `DigestSnapshot` entity
- Operations teams now have reliable daily summaries

---

## How It Works

### Daily Schedule

```
Every day at 09:00 UTC:
  1. Function: generateScheduledPortfolioSnapshot()
  2. Fetches all orders + restaurants (service role, no user auth)
  3. Calculates portfolio digest (same logic as on-demand)
  4. Hashes digest
  5. Checks if hash matches latest snapshot
     ├─ If match: Skip (no change, no noise)
     └─ If different: Create new snapshot, store to DB
  6. Logs result (created or skipped)
```

### Dedup Logic

Snapshots are only created if the digest **content** has changed:

```javascript
If today's digest_hash === yesterday's digest_hash:
  → Return "skipped" (no change, don't noise history)
Else:
  → Create snapshot, save to DB, increment seq in snapshot_id
```

**Result:** Portfolio digest history is clean, no duplicate entries for stable days.

---

## Files Changed

### Created (2)

| File | Purpose | LOC |
|------|---------|-----|
| `functions/generateScheduledPortfolioSnapshot.js` | Backend function, runs on schedule | 380 |
| `docs/SCHEDULED_DIGEST_SNAPSHOTS.md` | This documentation | ~150 |

### Modified (2)

| File | Change | Impact |
|------|--------|--------|
| `lib/offline-digest-snapshots.js` | Add `formatDigestSummaryForEmail()` helper | Summary formatting |
| `scripts/smoke/suites/offlineDigest.smoke.js` | Add 4 new smoke tests | Schedule + dedup coverage |

**Total New Code:** ~380 LOC backend + helpers + tests

---

## Setup: Creating the Automation

The scheduled function is now deployed. To activate the daily schedule, create a Base44 **scheduled automation**:

### Steps (Admin Dashboard)

1. Go: **Code → Automations**
2. Click: **Create Automation**
3. Configure:
   - **Name:** `Daily Portfolio Digest Snapshot`
   - **Type:** Scheduled
   - **Schedule Type:** Cron
   - **Cron Expression:** `0 9 * * *` (daily 09:00 UTC)
   - **Function:** `generateScheduledPortfolioSnapshot`
4. Save

### Cron Expression Explained
```
0 9 * * *
│ │ │ │ └─ Day of week (0-6, Sun-Sat) — * = every day
│ │ │ └─── Month (1-12) — * = every month
│ │ └───── Day of month (1-31) — * = every day
│ └─────── Hour (0-23) — 9 = 09:00 UTC
└───────── Minute (0-59) — 0 = on the hour
```

**For London time (UTC+0/+1):** 09:00 UTC = 09:00 GMT / 10:00 BST

---

## Snapshot Details

### Scope: Portfolio Only

- **Scope:** `scope='portfolio', scope_id=null`
- **Visibility:** SuperAdmin only
- **Created by:** `'system'` (not a user)
- **Frequency:** Once daily (if changed) + on-demand when dashboard accessed

**Why portfolio only?** To avoid N×restaurant overhead. Restaurant-level snapshots remain on-demand.

### Snapshot Contents

```json
{
  "snapshot_id": "snap-20260326-001",
  "timestamp": "2026-03-26T09:00:00Z",
  "scope": "portfolio",
  "scope_id": null,
  "digest_hash": "a1b2c3...",
  "critical_item_count": 5,
  "worsening_item_count": 2,
  "plaintext_summary": "...",
  "snapshot_data": { full digest object },
  "acknowledged": false,
  "created_by": "system",
  "scheduled": true
}
```

---

## Digest Contents

### Critical Now (🚨)
- **Overdue flagged orders** (>4h old, unreviewed)
- **Top risk restaurants** (ranked by risk score)
- **Abuse escalations** (potential_abuse, large_price_mismatch, repeated)

### Watch / Worsening (⚠️)
- **Escalation rate trending up** (24h vs 7d comparison)
- **Operator outliers** (flagged rate >2x average)

### Summary Metrics (📊)
- Total offline orders (24h)
- Flagged count + rate (%)
- Escalated count + rate (%)
- Restaurants with issues

---

## Dedup Examples

### Example 1: Stable Day
```
Mon 09:00: Portfolio digest generated
  - Hash: abc123
  - Creates snapshot → stored
  
Tue 09:00: Portfolio digest generated
  - Hash: abc123 (identical)
  - Skip creation (no change)
  - Return: is_duplicate=true

Wed 09:00: Portfolio digest generated
  - Hash: abc123
  - Skip creation

Thu 09:00: Portfolio digest generated
  - Hash: def456 (new critical order)
  - Create snapshot → stored
```

**Result:** History shows Mon, Thu (2 entries, not 4)

### Example 2: Escalating Week
```
Mon 09:00: Critical=2, Flagged=15%
  Hash: hash1 → Create snapshot
  
Tue 09:00: Critical=3, Flagged=18%
  Hash: hash2 (different) → Create snapshot
  
Wed 09:00: Critical=5, Flagged=22%
  Hash: hash3 (different) → Create snapshot
```

**Result:** History shows Mon, Tue, Wed (3 entries, clear escalation trend)

---

## Output Format

### Dashboard History

SuperAdmin → Risk Digest → History tab shows:
- Timestamp
- Critical/worsening counts (badges)
- Ack status
- Copy button (plaintext export)

### Plaintext Summary (Email-Ready)

```
Offline Risk Digest | 26-03-2026 09:00 UTC
────────────────────────────────────────────────

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

View full digest: [Dashboard → Super Admin → Risk Digest → History]
```

---

## Smoke Test Coverage (4 new tests)

| Test | Purpose | Passes |
|------|---------|--------|
| `testScheduledPortfolioSnapshotGeneration` | Scheduled function creates snapshots | ✅ |
| `testScheduledSnapshotDedup` | Hash dedup works for scheduled snapshots | ✅ |
| `testScheduledSnapshotRoleScope` | All scheduled snapshots are portfolio-level | ✅ |
| `testSummaryFormatterEmail` | Email summary formatter works | ✅ |

All tests are deterministic, no external deps.

---

## Combined Snapshot Model

### On-Demand (Existing)
- Trigger: User opens dashboard
- Function: `createDigestSnapshot()`
- User must auth
- Instant feedback

### Scheduled (New)
- Trigger: Daily 09:00 UTC
- Function: `generateScheduledPortfolioSnapshot()`
- System auth (no user needed)
- Reliable cadence

### Both Use Same Dedup
- Same hash algorithm
- Same `DigestSnapshot` entity
- Same history UI
- **Result:** Unified snapshot history

---

## Limitations & Design Constraints

### By Design

❌ **Not implemented:** Weekly rollup digest  
❌ **Not implemented:** Auto-email delivery  
❌ **Not implemented:** Restaurant-level scheduled snapshots (on-demand only)  
❌ **Not implemented:** Scheduled alerts/notifications  

**Why?** Keep initial scope tight. These are Phase 2 enhancements.

### Reliable Guarantees

✅ **At least 1 portfolio snapshot per day** (if any change occurred)  
✅ **No duplicate snapshots** for unchanged digests  
✅ **Consistent UTC timing** (09:00 UTC, consistent across regions)  
✅ **No user auth required** (system-level generation)  
✅ **Full audit trail** (created_by='system', timestamp recorded)  

---

## Operational Usage

### Monday Morning (9:05 UTC)

Operations team checks dashboard:
1. Go: **Super Admin → Offline Risk Digest → History**
2. See: Today's 09:00 UTC snapshot
   - If critical items: Badge shows count
   - If stable: Summary shows metrics
3. Click: **Acknowledge** (optional)
   - Add note if action taken
   - Flag as "recurring" if pattern
4. Leave: History auto-updates at 09:00 UTC tomorrow

### Friday Afternoon

Ops wants to review the week:
1. History tab shows: Mon, Tue, Wed, Fri (Thu was identical, skipped)
2. Trend visible: Escalation rate going up, top restaurant changing
3. Export plaintext: Copy for email/report
4. Plan next week: Based on patterns

---

## Next Steps (Optional, Phase 2)

If needed:
1. **Scheduled email digest** — Daily 09:00 → ops@company.com
2. **Recurring concern report** — Weekly list of flagged items >3 days
3. **Restaurant-level snapshots** — Daily per store (if scaling)
4. **Slack integration** — Post unacked critical to #ops
5. **Worsening trend** — Snapshot A > B > C shows escalation

---

## Summary

| Item | Details |
|------|---------|
| **Solves** | Digest snapshots now generated daily, no manual access needed |
| **Adds** | Reliable history, dedup on hash, consistent timing |
| **Keeps lightweight** | Portfolio only, simple hash dedup, no state machine |
| **Enforces** | Role scoping (portfolio level), UTC timing |
| **Tests** | 4 new smoke tests covering schedule, dedup, scope, formatting |
| **Deployment** | Backend function ready, requires 1-click automation setup |

**Status:** ✅ Complete  
**Next Phase:** Optional enhancements (email, trends, restaurant-level)  
**Operational Impact:** Daily snapshot history now reliable