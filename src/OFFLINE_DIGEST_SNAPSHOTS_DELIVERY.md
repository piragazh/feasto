# Digest Snapshots & Acknowledgement — Delivery Summary

**Status:** ✅ Complete  
**Date:** 2026-03-26  
**Scope:** Digest history + lightweight acknowledgement workflow

---

## 1. Identified Gaps (Pre-Implementation)

| Gap | Impact | Solution |
|-----|--------|----------|
| **No history** | Previous digests lost on refresh | Auto-snapshot with hash dedup |
| **No stable IDs** | Can't track specific digest items | `snapshot_id` field + array position tracking |
| **No acknowledgement** | "I saw this" not recorded | Boolean `acknowledged` flag |
| **Silent ignores** | Critical issues disappear if not addressed | UI badge shows unacked critical digests |
| **One-way visibility** | Only visible when dashboard open | Snapshot stored server-side for query |

---

## 2. Minimum Models Implemented

### DigestSnapshot Entity
- Core fields: `snapshot_id`, `timestamp`, `scope`, `digest_hash`, `critical_item_count`
- Ack fields: `acknowledged`, `acknowledged_by`, `acknowledged_at`, `acknowledged_note`
- Metadata: `recurring_concern`, `action_taken`, `plaintext_summary`
- Full digest object stored for replay

**Design:** Simple boolean ack, not state machine. One ack per snapshot (no multiple ack states).

### Snapshot Dedup Logic
- Hash digest (critical_now + watch_worsening + summary_metrics)
- Compare to last snapshot hash
- Only create if hash differs
- Result: No duplicates when digest unchanged

### Minimal Ack Workflow
1. User sees critical digest
2. Clicks "Acknowledge"
3. Modal: note (optional) + action (dropdown) + recurring (checkbox)
4. Backend updates snapshot with ack metadata
5. History shows acked snapshot with reviewer + timestamp

---

## 3. Files Created (6)

| File | Purpose | LOC |
|------|---------|-----|
| `entities/DigestSnapshot.json` | Snapshot schema | 60 |
| `lib/offline-digest-snapshots.js` | Helpers (hash, count, ack) | 180 |
| `functions/createDigestSnapshot.js` | Backend: auto-snapshot | 90 |
| `functions/acknowledgeDigestSnapshot.js` | Backend: ack handler | 65 |
| `components/superadmin/AcknowledgeDigestModal.jsx` | Ack UI dialog | 130 |
| `components/superadmin/DigestSnapshotHistory.jsx` | History panel | 150 |

**Total New:** 675 LOC

### Files Modified (2)

| File | Change | Impact |
|------|--------|--------|
| `components/superadmin/OfflineRiskDigest.jsx` | Add auto-snapshot + tabs (current/history) | UI integration |
| `scripts/smoke/suites/offlineDigest.smoke.js` | Add 5 snapshot tests | Test coverage |

---

## 4. Key Design Decisions

### ✅ Lightweight Ack

Single boolean flag: `acknowledged: true/false`

**Not:** "pending" → "in-progress" → "resolved" → "reopened"  
**Why:** Prevents "ticket creep", respects that ack ≠ issue closed

### ✅ Hash-Based Dedup

Only snapshot when digest content changes.

**Logic:**
```
hash(critical_now + watch_worsening + summary)
If hash == last_snapshot.hash:
  return last_snapshot (no DB write)
Else:
  create new snapshot
```

**Why:** No noise, only saves when something actually different

### ✅ Server-Side Snapshots

Snapshots created by backend on `createDigestSnapshot()` call.

**Why:**
- Consistent timestamps
- No client clock skew
- Audit trail of who accessed
- Role visibility enforced server-side

### ✅ Scope Visibility

- Portfolio snapshots: SuperAdmin only
- Restaurant snapshots: Manager + SuperAdmin

**Enforced at:**
- Backend function (403 if unauthorized)
- Frontend query (client-side filter)

---

## 5. Smoke Test Coverage (15 tests)

**Original 10:**
- ✅ Portfolio/restaurant digest generation
- ✅ Overdue order detection
- ✅ Critical ranking
- ✅ Worsening trends
- ✅ Abuse detection
- ✅ Operator outliers
- ✅ Plaintext formatting
- ✅ Criticality check
- ✅ Role visibility

**New 5:**
- ✅ **Snapshot ID generation** — snap-YYYYMMDD-NNN format
- ✅ **Hash dedup** — Identical digests produce same hash
- ✅ **Item counting** — Critical/worsening counts correct
- ✅ **Ack permissions** — SuperAdmin vs manager role checks
- ✅ **History ordering** — Latest snapshot first

**All deterministic, no external deps, all passing.**

---

## 6. Workflow Clarity

### Current Digest Tab
1. Live digest auto-snapshots on component mount
2. Digest shows critical/worsening/summary
3. User clicks "Acknowledge This Digest"
4. Modal: note + action + recurring
5. Backend updates snapshot
6. UI refreshes (button disabled, ack info shown)

### History Tab
1. Queries DigestSnapshot with scope filter
2. Shows last 10 snapshots, latest first
3. Each snapshot shows:
   - Timestamp, item counts, ack status
   - Reviewer email + time + note (if acked)
   - Recurring concern flag (⚠️)
4. Buttons: Copy (plaintext), Ack (if unacked)

---

## 7. Role-Based Visibility

### SuperAdmin

**Can see:**
- Portfolio snapshots (all restaurants)
- Restaurant snapshots (specific restaurant view)

**Can acknowledge:**
- Any snapshot

### Restaurant Manager

**Can see:**
- Restaurant snapshots (their restaurant only)

**Can acknowledge:**
- Their restaurant snapshots only

**Enforcement:** Backend checks `user.role === 'admin'` or `snapshot.scope_id matches manager's restaurant`

---

## 8. Sample Workflow: Recurring Issue

**Monday 9am Digest:**
- 🚨 3 overdue orders at Store A
- Manager acks: "Investigating production issue"
- `recurring_concern: false`

**Monday 2pm Digest:**
- Still 2 overdue orders (1 resolved)
- New snapshot (different hash)
- Manager acks again: "Production fixed, should resolve in 30m"

**Tuesday 9am Digest:**
- 0 overdue, issue resolved
- No snapshot (issue gone, hash different)

**History shows:**
1. Tue 9am — ✅ (if manager ack'd it)
2. Mon 2pm — ✅ "Production fixed..."
3. Mon 9am — ✅ "Investigating..."

Manager can see trend: issue was caught, investigated, resolved within 24h.

---

## 9. Limitations (Explicit)

### What It Does NOT Do

❌ **Enforce resolution** — Ack just means "reviewed"  
❌ **Close issues automatically** — Must be done manually  
❌ **Prevent recurrence** — Recurring flag is manual only  
❌ **Generate alerts** — Snapshot is pull-based only  
❌ **Track time-to-action** — Just "acked yes/no"  
❌ **Integrate with tickets** — Stand-alone snapshot system  
❌ **Forecast worsening** — No trending/prediction  

### Why These Limits

Keep it lightweight, non-intrusive, and honest:
- "Reviewed" ≠ "resolved"
- "Flagged recurring" ≠ "will happen again"
- Snapshot is **signal only**, not enforcement

---

## 10. Next Steps (Optional, Not Included)

### Phase 2 (Future)

1. **Scheduled Digest Email** — Daily 9am plaintext to SuperAdmin
2. **Recurring Concern Report** — List items flagged >3 times
3. **Action Deadline Reminder** — Email if unacked >4 hours
4. **Worsening Trend** — Show snapshots A → B → C escalating
5. **Slack Integration** — Post unacked critical to #ops

---

## 11. Remaining Constraints Respected

| Constraint | How Met |
|-----------|---------|
| **Lightweight** | Single boolean ack, no state machine |
| **Server-side writes** | Snapshots created/acked on backend |
| **Role visibility** | SuperAdmin vs manager scoping enforced |
| **Non-intrusive** | Ack is optional, digest works without it |
| **Honest framing** | "Acknowledge you reviewed" ≠ "issue fixed" |
| **No incident system** | No tickets, no state transitions, no SLAs |

---

## 12. Production Readiness

### Tests
- ✅ 15 smoke tests, all passing
- ✅ Deterministic (no external deps)
- ✅ Snapshot dedup verified
- ✅ Ack permissions checked

### Deployment
- ✅ Entity schema created
- ✅ Backend functions deployed
- ✅ Frontend components ready
- ✅ UI integrated (tabs + modal)
- ✅ Documentation complete

### Data Safety
- ✅ No data migration needed (new entity)
- ✅ Backward compatible (digest works without snapshots)
- ✅ Snapshot data immutable (update only ack fields)

---

## Summary

| Item | Status |
|------|--------|
| **Snapshots** | ✅ Auto-created on digest access, hash dedup |
| **Acknowledgement** | ✅ Single boolean flag + optional note + action |
| **History** | ✅ Last 10 snapshots, latest first |
| **Permissions** | ✅ Role-scoped (SuperAdmin/manager) |
| **Tests** | ✅ 15 tests, all passing |
| **Documentation** | ✅ Complete (model, workflow, usage) |
| **Code** | ✅ 675 LOC (entities + logic + UI) |

**What it solves:**
- Digest is now a **persistent record**, not ephemeral
- Critical issues can be **tracked over time**
- Reviewers can record what they **did about it**
- "Seen but ignored" issues get a **badge**

**What it doesn't do:**
- Enforce resolution (ack ≠ fixed)
- Auto-ticket or escalate (manual only)
- Predict or trend (snapshot-by-snapshot only)

**Status:** ✅ Complete, ready for production  
**Next Phase:** Optional (email, trends, alerts)  
**Delivery Date:** 2026-03-26