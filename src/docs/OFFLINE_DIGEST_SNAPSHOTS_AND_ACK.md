# Digest Snapshots & Acknowledgement — Operational Follow-Up Layer

**Status:** ✅ Complete  
**Date:** 2026-03-26  
**Purpose:** Track digest history and prevent "seen but ignored" digest items

---

## Overview

The digest was a **live summary** without history or follow-up. Now it's an **operational record**:

- **Snapshots:** Auto-saved digests with hash-based dedup
- **Acknowledgement:** Users mark digests as "reviewed" with optional notes
- **History:** See past digests and what was done about them
- **No tickets:** Simple true/false flag, not a state machine

---

## What Changed

### Before
- Digest generated live only
- No history (previous digests lost)
- No way to record "I saw this"
- Same critical issue appears every refresh

### After
- Digests auto-snapshot when accessed (server-side)
- Hash dedup (only save if content changed)
- "Acknowledge" button to mark reviewed
- History tab shows past snapshots + ack status
- Recurring concern flag for monitoring

---

## Models

### DigestSnapshot Entity

```json
{
  "snapshot_id": "snap-20260326-001",
  "timestamp": "2026-03-26T10:15:00Z",
  "scope": "portfolio" | "restaurant",
  "scope_id": null | "restaurant-id",
  "digest_version": 1,
  "digest_hash": "a1b2c3...",
  "critical_item_count": 3,
  "worsening_item_count": 1,
  "plaintext_summary": "=== OFFLINE RISK DIGEST ===...",
  "snapshot_data": { ...full digest object },
  "acknowledged": false,
  "acknowledged_by": "admin@test.com",
  "acknowledged_at": "2026-03-26T10:30:00Z",
  "acknowledged_note": "Overdue orders reviewed. Store A manager contacted.",
  "recurring_concern": false,
  "action_taken": "contacted_manager",
  "created_by": "system"
}
```

**Key Fields:**
- `snapshot_id` — Stable identifier (snap-YYYYMMDD-NNN)
- `digest_hash` — Dedup key (only save if hash changed)
- `critical_item_count`, `worsening_item_count` — Quick severity scan
- `plaintext_summary` — Copy-to-clipboard friendly
- `acknowledged` — Boolean (all or nothing)
- `recurring_concern` — Flag for ongoing monitoring

---

## Workflow

### 1. Auto-Snapshot (Server)

When digest component mounts:
1. Generate digest (live calc)
2. Hash it
3. Check if hash matches last snapshot
   - **Yes:** Return existing snapshot (no write)
   - **No:** Create new snapshot, save to DB
4. Return snapshot with `acknowledged=false`

**Why:** Only saves when digest content actually changed (no noise)

### 2. User Reviews Digest

User scans digest:
- Sees critical items
- Optionally clicks "Acknowledge This Digest"

### 3. Acknowledge Dialog

Modal asks:
- ✏️ "Review note?" (optional)
- 🎯 "Action taken?" (contacted_manager / escalated / no_action / null)
- ⚠️ "Recurring concern?" (checkbox)

User submits → snapshot updated:
- `acknowledged: true`
- `acknowledged_by: user.email`
- `acknowledged_at: now`
- `acknowledged_note: text`
- `action_taken: code`
- `recurring_concern: boolean`

### 4. History Tab

Shows last 10 snapshots (portfolio or restaurant scoped):
- Timestamp
- Critical/worsening counts (badges)
- ✅ Ack status (when, by whom, note if present)
- ⚠️ Recurring flag
- Copy button (plaintext export)
- Ack button (if not yet acked)

---

## Files

### Created (5)

| File | Purpose | Lines |
|------|---------|-------|
| `entities/DigestSnapshot.json` | Entity schema | 60 |
| `lib/offline-digest-snapshots.js` | Snapshot helpers | 180 |
| `functions/createDigestSnapshot.js` | Backend: persist snapshots | 90 |
| `functions/acknowledgeDigestSnapshot.js` | Backend: ack handler | 65 |
| `components/superadmin/AcknowledgeDigestModal.jsx` | Ack UI | 130 |
| `components/superadmin/DigestSnapshotHistory.jsx` | History panel | 150 |

### Modified (2)

| File | Change |
|------|--------|
| `components/superadmin/OfflineRiskDigest.jsx` | Add auto-snapshot + tabs (current/history) |
| `scripts/smoke/suites/offlineDigest.smoke.js` | Add 5 snapshot + ack tests |

### Total LOC
~675 lines (entities + logic + backends + UI)

---

## Permissions & Scoping

### Portfolio Snapshots
- Scope: `scope='portfolio', scope_id=null`
- Visible to: SuperAdmin only
- Can acknowledge: SuperAdmin

### Restaurant Snapshots
- Scope: `scope='restaurant', scope_id='r1'`
- Visible to: Manager of that restaurant + SuperAdmin
- Can acknowledge: Manager of that restaurant

**Enforcement:** Checked in backend functions + UI filter

---

## Snapshot Lifecycle

```
[Digest Generated Live]
    ↓
[Hash Digest]
    ↓
[Check if Hash Matches Last Snapshot]
    ├─ Yes → Return Existing (no write)
    └─ No → Create New Snapshot
            ↓
            [snapshot_id generated]
            [timestamp = now]
            [acknowledged = false]
            [created_by = system]
            ↓
            [Saved to DB]
            ↓
[UI Shows: "1 new critical item" if unacked]
    ↓
[User Clicks "Acknowledge"]
    ↓
[Modal: Note + Action + Recurring]
    ↓
[Update Snapshot]
    ├─ acknowledged: true
    ├─ acknowledged_by: user.email
    ├─ acknowledged_at: now
    ├─ acknowledged_note: text
    ├─ recurring_concern: boolean
    └─ action_taken: code
        ↓
        [Saved to DB]
        ↓
[History Tab Shows Acked Snapshot with ✅]
```

---

## What This DOES

✅ **Track digest history** — See what was reported when  
✅ **Record reviews** — Who reviewed, when, what they said  
✅ **Recurring flag** — Mark issues to monitor over time  
✅ **Prevent silent ignores** — Badge shows unacked critical digests  
✅ **Plaintext export** — Copy digest for email/docs  
✅ **Dedup on hash** — Only save when content changes  
✅ **Role scoping** — Manager sees only their restaurant  

---

## What This DOES NOT

❌ **Enforce action** — Acknowledge ≠ issue resolved  
❌ **Assign blame** — Just tracks "reviewed by"  
❌ **Resolve issues** — No auto-close, no ticket integration  
❌ **Generate notifications** — No alerts, push, or emails  
❌ **Track time-to-action** — Just "was reviewed" + optional note  
❌ **Predict future** — No trending/forecasting  

---

## Example: Overdue Order Scenario

**Digest A (9am):**
- 🚨 5 overdue orders
- ✅ Manager acknowledges: "Contacting Store A"
- Result: `acknowledged=true, action_taken='contacted_manager'`

**Digest B (11am):** Same 5 orders still overdue
- Hash changes (time diff), new snapshot created
- 🚨 Shows as unacked again (new snapshot)
- ✅ Manager acknowledges again: "Still working on it, expected by noon"
- Result: New snapshot with updated note

**History shows:**
1. Snapshot B (11am) ✅ "Still working on it..."
2. Snapshot A (9am) ✅ "Contacting Store A"

---

## Tests (15 total)

**Existing (10):**
- Portfolio/restaurant digest generation
- Overdue order detection
- Critical ranking
- Worsening trends
- Abuse detection
- Operator outliers
- Plaintext formatting
- Criticality check
- Role visibility

**New (5):**
- ✅ Snapshot ID generation (snap-YYYYMMDD-NNN)
- ✅ Hash dedup (identical digests = same hash)
- ✅ Item counting (critical + worsening)
- ✅ Ack permissions (SuperAdmin vs manager)
- ✅ History ordering (latest first)

All deterministic, no external deps.

---

## UI Changes

### OfflineRiskDigest Component

**Tabs:**
1. **Current Digest** (existing view)
   - Critical/worsening/summary cards
   - Copy plaintext
   - ✅ Auto-snapshots on load

2. **History** (new)
   - Snapshot list (last 10, latest first)
   - Ack status + badge
   - Ack button + copy button
   - Reviewer name + timestamp + note if present

### AcknowledgeDigestModal (new)

Simple dialog:
- Review note field (optional)
- Action dropdown
- Recurring concern checkbox
- Ack button

### DigestSnapshotHistory (new)

Compact list:
- Timestamp + item counts
- Ack status (✅ or ⚠️)
- Reviewer info + note (if acked)
- Copy/Ack buttons

---

## Limitations

### By Design (Not Missing)

- **No time-to-action tracking** — Just "reviewed yes/no"
- **No trending** — Just "is critical" snapshot-by-snapshot
- **No automation** — Ack is manual only
- **No escalation** — No ticket auto-creation

### Future Enhancements (Not In Scope)

- Scheduled digest email (Phase 2)
- Worsening trend (snapshot A > B > C shows escalation)
- Recurring concern report (list items flagged >3 times)
- Slack integration (post unacked digests)
- Action deadline reminder (send email if unacked >4h)

---

## Summary

| Item | Details |
|------|---------|
| **Solves** | "Digest was only live, no history, no follow-up" |
| **Adds** | Auto-snapshots + ack flag + history + optional notes |
| **Keeps lightweight** | Boolean ack, not state machine |
| **Scope respects** | Portfolio/restaurant visibility boundaries |
| **Server-side** | Snapshots created/acked on backend |
| **Tests** | 15 smoke tests, all passing |
| **Production ready** | Yes |

**Status:** ✅ Complete  
**Delivery Date:** 2026-03-26  
**Next Phase (Optional):** Scheduled email digest, recurring concern report, action deadlines