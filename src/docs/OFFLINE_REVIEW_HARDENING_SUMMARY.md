# Offline Review Workflow — Hardening Implementation

**Completed:** 2026-03-26  
**Status:** Hardened — Stronger accountability, meaningful states, time-based enforcement

---

## SEMANTIC GAPS IDENTIFIED & CLOSED

| Gap | Before | After | Impact |
|-----|--------|-------|--------|
| **No mandatory notes for decisions** | All actions optional notes | Resolved/Escalated REQUIRE notes | Prevents rubber-stamping; forces rationale |
| **No time-based pressure** | Flagged orders could sit indefinitely | Overdue flag at 4h; audit captures age | Ensures reviews within shift |
| **No state distinction in visibility** | Acknowledged = Resolved visually | Escalated highlighted red; overdue pulsing | Managers quickly identify what needs action |
| **No review quality metrics** | Unknown % documented/reasoned | Dashboard shows % with notes | Enables quality tracking |
| **Weak audit trail** | Basic state change logged | Includes age, overdue flag, review duration | Full accountability history |

---

## POLICY CHANGES IMPLEMENTED

### 1. Mandatory Notes for Terminal Decisions

**Resolved action:**
- ✅ Notes **required** (server-side validation)
- Returns 400 if empty
- Failure message: "Notes are required when marking order as 'resolved'. Please explain your decision."

**Escalated action:**
- ✅ Notes **required** (server-side validation)
- Returns 400 if empty
- Failure message: "Notes are required when marking order as 'escalated'. Please explain your decision."

**Acknowledge action:**
- ✅ Notes **optional** (interim state)
- Can submit blank
- Placeholder text guides but doesn't enforce

### 2. Frontend Validation & UX Hardening

**Dialog label shows required/optional:**
```
Review notes *required  [for resolved/escalated]
Review notes           [for acknowledge]
```

**Field styling:**
- Red border + red background if terminal action with empty notes
- Prevents submission (confirmAction early return)
- Toast error if attempted with empty

**Placeholder text changes:**
- Acknowledge: "Optional: add context..."
- Resolved: "Explain your decision..."
- Escalated: "Explain what needs investigation..."

### 3. Server-Side Enforcement

**offlineOrderReview.js now:**
- Validates `review_notes` on resolve/escalate
- Checks `!review_notes || !review_notes.trim()` before action
- Returns 400 with clear policy message
- Prevents any bypass (frontend + backend combined)

### 4. Overdue Calculation & Visibility

**Definition:** Orders in "new" status >4 hours

**Calculation:**
- `reviewAgeHours = (now - offline_synced_at) / 3600000`
- `isOverdue = reviewAgeHours > 4`
- Calculated at review action time
- Captured in audit trail

**UI Indicators:**
- Red badge "OVERDUE" (pulsing animation)
- Red background on card
- Shows pending time: "5h ago", "2d ago"
- Sorted to top (overdue first)

**Audit Trail:**
- `was_overdue: true/false`
- `review_age_hours: 5.2`
- Enables historical reporting

### 5. Dashboard Stats & Quality Metrics

**New OfflineReviewStats component:**
- Shows counts by state: new, acknowledged, resolved, escalated
- Highlights overdue count separately
- Shows average review age for pending orders
- Displays documentation quality: "75% with notes (15/20)"
- Visual indicator: green (90%+), yellow (70-89%), red (<70%)

**Grid layout:**
- Pending Review | Acknowledged | Resolved | Escalated | Documented
- Each card color-coded
- Quick overview of review queue health

### 6. Enhanced Review History

**Order card now shows:**
- Creation time, sync time, review age (if pending)
- Overdue flag if >4h pending
- Review status + who + when (if reviewed)
- Escalated orders highlighted in orange

**Sorting:**
- Overdue pending orders first
- Then by sync time (newest first)
- Ensures managers see most urgent work first

---

## FILES CHANGED

### Backend
- **functions/offlineOrderReview.js**
  - Added mandatory notes validation for resolved/escalated
  - Added overdue calculation & audit capture
  - Returns 400 with policy message for empty notes

### Frontend Components
- **components/restaurant/OfflineOrderReviewAction.jsx**
  - Added frontend validation for required notes
  - Dynamic label: "*required" for resolved/escalated
  - Red highlighting for empty terminal actions
  - Changed placeholders by action type
  - Early return if validation fails

- **components/restaurant/OfflineOrdersReview.jsx**
  - Added `getReviewAge()` helper (e.g., "5h ago")
  - Added `isOverdue()` helper (>4h pending)
  - Sorting: overdue first, then newest
  - Card styling: red for overdue, orange for escalated
  - Shows pending time in timestamps
  - Integrated OfflineReviewStats component

- **components/restaurant/OfflineReviewStats.jsx** (NEW)
  - Summary stats: new, acknowledged, resolved, escalated counts
  - Overdue indicator + count
  - Average review age for pending
  - Documentation quality % with color coding
  - Enables quick queue assessment

### Testing
- **scripts/smoke/suites/offlineOrderReview.smoke.js**
  - Added test: `resolveRequiresNotes` (400 if empty)
  - Added test: `escalateRequiresNotes` (400 if empty)
  - Added test: `acknowledgeNotesOptional` (success with empty)
  - Added test: `overdueCalculation` (audit captures was_overdue)
  - Added test: `auditCapturesReviewAge` (review_age_hours logged)
  - Added test: `documentationQualityTracking` (stats visible)

### Documentation
- **docs/OFFLINE_REVIEW_WORKFLOW_GUIDE.md**
  - Updated state definitions with "REQUIRED" for notes
  - Added "Overdue & Time-Based Accountability" section
  - Defined 4-hour threshold + rationale
  - Enhanced action descriptions with notes requirements
  - Added examples for each terminal action

- **docs/OFFLINE_REVIEW_HARDENING_SUMMARY.md** (NEW)
  - This file — comprehensive hardening summary

---

## POLICY TABLE: WHICH ACTIONS REQUIRE NOTES?

| Action | State | Notes | Terminal? | When Use |
|--------|-------|-------|-----------|----------|
| **Acknowledge** | acknowledged | Optional | No (interim) | Manager confirmed flag; needs more time |
| **Resolved** | resolved | **REQUIRED** | Yes | Manager investigated; order acceptable |
| **Escalate** | escalated | **REQUIRED** | Yes | Manager flagged for investigation |

---

## OVERDUE RULES SUMMARY

| Rule | Value | Rationale |
|------|-------|-----------|
| **Overdue threshold** | 4 hours | One manager shift |
| **Calculation** | `now - offline_synced_at > 4h` | Automatic at review action time |
| **Visual indicator** | Red badge "OVERDUE" (pulsing) | Draws attention |
| **Sorting** | Overdue first in list | Forces action on oldest items |
| **Audit capture** | `was_overdue: true/false` | Historical accountability |
| **Expected behavior** | Acknowledge/resolve/escalate within 4h | Prevents accumulation |

---

## AUDIT TRAIL ENHANCEMENTS

**New fields captured:**

```json
{
  "order_id": "...",
  "restaurant_id": "...",
  "action": "resolved|escalated|acknowledge",
  "new_status": "...",
  "review_notes": "manager's explanation",
  "sync_validation_notes": "original reason flagged",
  "review_age_hours": 5.2,
  "was_overdue": true|false
}
```

**Enables reporting:**
- Which managers review fastest
- Which orders are routinely overdue
- Quality of documented decisions
- Patterns in escalations

---

## DASHBOARD STATS: AT A GLANCE

**Example snapshot:**

```
Pending Review: 2    (avg 2.5h, 0 overdue)
Acknowledged:   1    (interim state)
Resolved:       15   (80% documented)
Escalated:      2    (needs follow-up)
---
Documented:     85%  (14/16 orders have notes)
```

**What manager learns:**
- Queue size & urgency (2 pending = manageable)
- None overdue = healthy cadence
- 85% documented = strong accountability culture
- 2 escalated = specific items need attention

---

## ENFORCEMENT LAYERS

### Layer 1: Frontend
- Form validation: required field check
- Visual feedback: red border, placeholder text
- Early return: prevent submission if empty
- UX guidance: "Notes required for this action"

### Layer 2: Backend
- Validation: `if (requiresNotes && !notes.trim()) return 400`
- Policy message: clear error explaining requirement
- Prevents any client bypass

### Layer 3: Audit
- Captured: whether notes provided
- Tracked: documentation quality %
- Historical: enables accountability reporting

---

## TESTING COVERAGE ADDED

**Automated tests (6 new):**
1. ✅ Resolve without notes → 400 error
2. ✅ Escalate without notes → 400 error
3. ✅ Acknowledge with empty notes → 200 success
4. ✅ Overdue calculation (>4h) → audit shows was_overdue=true
5. ✅ Audit captures review_age_hours
6. ✅ Dashboard shows documentation quality %

**Manual tests (existing coverage applies):**
- Review UI buttons functional
- State transitions persist
- Unresolved badge updates
- Tab filtering works
- Escalated orders highlighted
- Audit trail queryable

---

## REMAINING LIMITATIONS & TRADE-OFFS

| Limitation | Why | Acceptable? |
|---|---|---|
| Notes required but no length min | Risk: single character notes | Yes — at least requires thought |
| Overdue 4h globally, not per-restaurant | Complexity vs benefit | Yes — covers typical shift |
| No automatic escalation on overdue | Could create noise | Yes — manager decides escalation |
| Cannot un-escalate (terminal state) | Prevents flip-flopping | Yes — escalation is decision |

---

## DEPLOYMENT CHECKLIST

- ✅ Backend validation implemented
- ✅ Frontend UX hardened
- ✅ Overdue calculation working
- ✅ Audit trail captures new fields
- ✅ Stats component displays quality metrics
- ✅ Tests written and documented
- ✅ Docs updated with new policies
- ✅ Ready for production

---

## SUMMARY

**Before hardening:**
- Review states existed but lacked accountability
- Notes optional for all actions → rubber-stamping possible
- No time pressure → orders could accumulate
- No quality metrics → blind to review process health

**After hardening:**
- Mandatory notes for terminal decisions → forces rationale
- Overdue flag at 4h → time-based accountability
- Stats dashboard → visibility into review queue
- Enhanced audit → historical accountability
- Frontend + backend validation → no bypass

**Result:** Review workflow now carries meaningful operational weight; states represent real management decisions with documented reasoning.