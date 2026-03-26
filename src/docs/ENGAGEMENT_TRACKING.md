# Engagement Tracking — Lightweight Adoption Signals

**Date:** 2026-03-26  
**Purpose:** Track adoption WITHOUT surveillance  
**Status:** Ready for Phase 0 rollout

---

## 1. WHAT IS TRACKED

**5 High-Value Events:**

| Event | When | Dedup? | Purpose |
|-------|------|--------|---------|
| `view_control_center` | SuperAdmin opens control center | Yes (per session) | Adoption signal: is admin checking the system? |
| `view_overview` | Manager opens restaurant overview | Yes (per session) | Adoption signal: is manager checking their store? |
| `view_digest` | User opens digest snapshot | No | Engagement: how many times reviewed digest? |
| `acknowledge_digest` | Manager acknowledges digest | No | Intent: confirmed manager saw message |
| `review_action` | Manager resolves/escalates order | No | Outcome: action was taken |

**Storage:**
```javascript
EngagementEvent {
  user_email: string,           // Who did this?
  role: 'manager' | 'superadmin', // Their role
  restaurant_id: string | null, // Store (null for SuperAdmin)
  event_type: enum,             // What happened?
  event_subtype?: string,       // Additional context (resolve/escalate/acknowledge)
  session_id: string,           // Browser session (dedup views)
  timestamp: ISO date,          // When
}
```

---

## 2. WHAT IS NOT TRACKED

**Explicitly excluded (no surveillance):**

- ❌ Individual card clicks / button interactions
- ❌ Time spent on page
- ❌ Scroll depth
- ❌ Feature-level drill-downs (which card clicked?)
- ❌ Keystroke / input behavior
- ❌ IP address / device fingerprint
- ❌ Session duration or idle time

**Reasoning:** Prevents invasive surveillance; focuses only on high-level adoption signals.

---

## 3. SESSION DEDUPLICATION

**Problem:** Page reload = duplicate "view" event  
**Solution:** Session-level deduplication for view events

**How it works:**
1. On page load, generate random `session_id` (stored in sessionStorage)
2. For "view" events, check if already recorded in this session
3. If yes → skip (browser reload, same view)
4. If no → record once, mark in sessionStorage

**Code example:**
```javascript
// On page load: view_control_center triggered
const key = `engagement_view_control_center_${sessionId}`;
if (sessionStorage.getItem(key)) {
  return; // Already recorded this session
}
sessionStorage.setItem(key, 'true');
// Now record event
```

**Result:**
- ✅ Page load = 1 event
- ✅ Page reload = same 1 event (deduplicated)
- ✅ New tab = new session_id = new event

---

## 4. AGGREGATION QUERIES

**Simple, low-cost queries for adoption visibility:**

### Query 1: Inactive Stores (7+ days)
```javascript
getInactiveStores(days = 7)
→ Returns: restaurants with ZERO overview views in past X days
→ Use: "Which stores need a manager call?"
```

### Query 2: Daily Engagement Rate
```javascript
getDailyEngagementRate()
→ Returns: % of restaurants with ≥1 manager view today
→ Use: "What's the daily engagement rate? (target ≥80%)"
```

### Query 3: Time to View
```javascript
getDigestTimeToView()
→ Returns: median time (minutes) from digest creation → first view
→ Use: "How fast do managers open digests? (target ≤120 min)"
```

### Query 4: Review Action Rate
```javascript
getReviewActionRate(hours = 24)
→ Returns: % of restaurants with ≥1 review action in past X hours
→ Use: "What % of stores took action on flagged orders?"
```

---

## 5. USAGE EXAMPLES

### SuperAdmin Daily Review

**File:** `pages/OfflineRiskControlCenter.jsx`

```javascript
import { trackPageView } from '@/lib/engagement-tracking';

// On component mount:
useEffect(() => {
  trackPageView('view_control_center');
}, []);
```

**What happens:**
1. SuperAdmin opens control center
2. `trackPageView` called on page load
3. Session ID created if needed
4. Checks: already recorded this session?
   - If yes: skip
   - If no: record + mark in sessionStorage
5. `EngagementEvent` created in DB

---

### Restaurant Manager Overview

**File:** `pages/RestaurantOfflineRiskOverview.jsx`

```javascript
import { trackPageView } from '@/lib/engagement-tracking';

// On component mount + when scopedRestaurantId changes:
useEffect(() => {
  if (scopedRestaurantId) {
    trackPageView('view_overview', scopedRestaurantId);
  }
}, [scopedRestaurantId]);
```

**What happens:**
1. Manager opens local overview
2. `trackPageView('view_overview', 'rest_123')` called
3. Session tracking + DB record same as above
4. `restaurant_id` included for scoping

---

### Review Actions

**File:** `lib/engagement-tracking.js`

```javascript
// When manager resolves a flagged order:
await trackAction('review_action', restaurantId, 'resolve');

// When manager escalates:
await trackAction('review_action', restaurantId, 'escalate');
```

**What happens:**
- Action events are NOT deduplicated (each action matters)
- `event_subtype` captures the decision

---

## 6. BACKEND VALIDATION

**File:** `functions/recordEngagementEvent.js`

**Prevents:**
- Spam (duplicate view events <5 sec apart)
- Invalid event types
- Scope leaks (manager can't record for other restaurants)
- Missing required fields

**Validation:**
```javascript
// Check event_type is valid
if (!VALID_EVENT_TYPES.includes(event_type)) {
  return 403; // Invalid
}

// Check session dedup for view events
if (isViewEvent && sessionId) {
  const recent = await db.filter({
    user_email,
    event_type,
    session_id,
  });
  if (recent && timeSinceLastEvent < 5000) {
    return 'deduplicated'; // Skip
  }
}

// Check manager scope
if (restaurantId && role === 'manager') {
  const manager = await db.RestaurantManager.get(userEmail);
  if (!manager.restaurant_ids.includes(restaurantId)) {
    return 403; // Access denied
  }
}
```

---

## 7. DATA PRIVACY & MINIMALISM

**What we collect:**
- Email address (to know who)
- Role (manager vs SuperAdmin)
- Restaurant ID if applicable (for scoping)
- Event type (5 options only)
- Timestamp

**What we DON'T collect:**
- Device info
- Location
- Behavior details
- Session duration
- Time between actions

**Retention:** 
- Suggested: 90 days (covers rollout phases + analysis)
- Older records can be archived

**Access:**
- SuperAdmin can view all events
- Managers cannot see other managers' events (role-based in future queries)

---

## 8. SMOKE TEST COVERAGE

**File:** `scripts/smoke/suites/engagementTracking.smoke.js`

**8 Tests:**

1. ✅ Page view event recorded (once per session)
2. ✅ Session deduplication working (reload = no new event)
3. ✅ Scope isolation (restaurant_id present for manager, null for SuperAdmin)
4. ✅ Action events recorded (not deduplicated)
5. ✅ Inactive stores query working
6. ✅ Daily engagement rate calculation
7. ✅ Review action rate calculation
8. ✅ Spam detection logic

**Run tests:**
```bash
node scripts/smoke/run-smoke.js engagementTracking
```

---

## 9. METRICS EXPOSED TO ADMINS

**Not a dashboard — just simple signals.**

### SuperAdmin Dashboard (future expansion)

```
📊 Engagement Summary

Daily Engagement Rate: 82% (target ≥80%)
  • 82 of 100 stores had manager view today

Inactive Stores (7+ days): 5
  • Store A (last view: 8 days ago)
  • Store C (last view: 12 days ago)
  • ...

Digest Time-to-View: 45 min (median)
  • 50% of managers view digest within 45 min
  • 90% within 120 min

Review Action Rate (24h): 65%
  • 65 of 100 stores took action on flagged orders
```

**That's it.** No granular dashboards. Just these 4 metrics for operational awareness.

---

## 10. ROLLOUT PHASES

### Phase 0 (Weeks 1–2): Internal Validation
- SuperAdmin team uses control center
- Verify view_control_center events recorded correctly
- Check session dedup working

### Phase 1 (Weeks 3–6): Pilot
- 2–3 volunteer restaurants access overview
- Verify view_overview + review_action events recorded
- Check engagement queries returning valid data
- Monitor false positives in aggregation

### Phase 2 (Weeks 7–12): Regional Expansion
- 5–10 regional stores
- Start checking "Daily Engagement Rate"
- Identify inactive stores; call managers
- Validate time-to-view metric useful

### Phase 3 (Week 13+): Full Rollout
- All restaurants
- Weekly monitoring of 4 metrics
- Tune if needed

---

## 11. TESTING CHECKLIST

Before rolling out to Phase 1:

- [ ] EngagementEvent entity created + accessible
- [ ] recordEngagementEvent backend function working
- [ ] view_control_center event recorded on page load
- [ ] Session dedup tested (reload = no duplicate)
- [ ] scope isolation verified (restaurant_id correct)
- [ ] 4 aggregation queries working + accurate
- [ ] Smoke tests passing (8/8)
- [ ] No performance impact (event recording <50ms)
- [ ] Spam detection working (<5s duplicate skipped)
- [ ] Data privacy doc reviewed + approved

---

## 12. FILES ADDED/CHANGED

**New Files:**
- `entities/EngagementEvent.json` — Entity schema
- `lib/engagement-tracking.js` — Frontend tracking lib + aggregation queries
- `functions/recordEngagementEvent.js` — Backend validation + recording
- `scripts/smoke/suites/engagementTracking.smoke.js` — Smoke tests
- `docs/ENGAGEMENT_TRACKING.md` — This doc

**Modified Files:**
- `pages/OfflineRiskControlCenter.jsx` — Added `trackPageView('view_control_center')`
- `pages/RestaurantOfflineRiskOverview.jsx` — Added `trackPageView('view_overview', restaurantId)`

---

## 13. REMAINING WORK

**For Phase 1 rollout:**
- [ ] Update offline review workflow to call `trackAction('review_action', restaurantId, 'resolve')`
- [ ] Update digest acknowledgement to call `trackAction('acknowledge_digest', restaurantId)`
- [ ] Create simple SuperAdmin dashboard widget showing 4 metrics
- [ ] Document how to query inactive stores (for manager calls)
- [ ] Add monitoring alert: if Daily Engagement drops <70%, notify SuperAdmin

---

## Summary

**What we're doing:**
- Track 5 high-value adoption signals
- Aggregate into 4 simple metrics
- No invasive surveillance
- Session-level deduplication for views
- Strong scope isolation (manager can only see own restaurant)

**What we're NOT doing:**
- Fine-grained behavior tracking
- Time-on-page / session duration
- Device fingerprinting
- Real-time user monitoring

**Outcome:**
- SuperAdmin has visibility into adoption
- Managers aren't being watched
- System respects privacy
- Metrics guide rollout decisions