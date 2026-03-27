# Kiosk Idle-to-Media Implementation Summary

## Audit Results

### Current Kiosk Behavior (Before Implementation)

1. **Inactivity Tracking:** Kiosk had a hardcoded 2-minute (120s) inactivity timer that reset the session
2. **Reset Mechanism:** On timeout, cleared cart, order type, and reset screen to 'welcome'
3. **Media Screen:** Existing `ScreenDisplay` component renders promotional/media content (used in `pages/MediaScreen`)
4. **Reusability:** `ScreenDisplay` is a full-featured component with caching, scheduling, and content rotation
5. **State Management:** Cart and order state kept in component state; no persistent session
6. **Payment Safety:** No explicit check preventing inactivity during payment (gap identified)

---

## Implementation: Mode Model

### Added to KioskDashboard

```javascript
const [mode, setMode] = useState('ordering'); // 'ordering' | 'idle_media'
```

**Rules:**
- Kiosk starts in `'ordering'` mode
- After 60s inactivity (configurable), transitions to `'idle_media'`
- Any touch/click in `'idle_media'` immediately returns to `'ordering'` + welcome screen
- Payment/confirmation screens block idle_media transitions (safety gate)

---

## Configuration Fields Added

**In `restaurant.kiosk_config`:**

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `kiosk_idle_media_enabled` | Boolean | `true` | Master switch for idle media mode |
| `kiosk_idle_media_timeout_seconds` | Number | `60` | Inactivity duration before showing media |
| `idle_media_screen_name` | String | `'Kiosk Promo'` | Media screen name to display |

**UI Controls:** Added in `KioskSettings` component with validation (30–300 second range).

---

## Files Changed

### Modified

1. **pages/KioskDashboard**
   - Added `mode` state and import for `ScreenDisplay`
   - Refactored inactivity handler to support dual timers (idle_media + order_reset)
   - Added payment/confirmation safety check (prevent media during payment)
   - Added conditional render: if `mode === 'idle_media'`, show fullscreen ScreenDisplay
   - Added touch/click handler to exit media mode immediately

2. **components/kiosk/KioskSettings**
   - Added default values for idle media config fields
   - Added "Idle Media Mode" settings card with:
     - Enable/disable toggle
     - Timeout input (30–300s range)
     - Media screen name field
   - All changes integrated into existing save flow

### Created

3. **scripts/smoke/suites/kioskIdleMedia.smoke.js**
   - 8 smoke tests covering:
     - Inactivity → media mode transition (60s)
     - Touch in media mode → exit to ordering
     - Activity timer resets
     - Payment blocks media mode
     - Config disabled behavior
     - Session clearing before media
     - Configured screen name usage
     - Confirmation timeout flow

4. **docs/KIOSK_IDLE_MEDIA_MODE.md**
   - Complete user guide covering:
     - Behavior and state transitions
     - Configuration instructions
     - Media screen requirements
     - Inactivity reset triggers
     - Safety mechanisms (payment/confirmation)
     - Implementation details
     - Testing guide
     - Troubleshooting

---

## Timer Architecture

### Dual-Timer System

```
Activity Event (touch/click)
  └─ Reset both timers
     ├─ __kioskIdleMediaTimer → idle_media_timeout (default 60s)
     │  └─ On timeout: Clear session → setMode('idle_media')
     │     └─ Set __kioskResetTimer → order reset timeout (default 120s)
     │        └─ On timeout: Return to ordering
     └─ __kioskResetTimer → full reset (default 120s)
        └─ On timeout: Reset screen to welcome (if not in media mode)
```

### Interaction Handlers

- **Touch/Click:** Resets both timers, exits media mode if active
- **Menu/Cart:** Managed automatically by React state changes (component re-renders reset timers via useEffect)
- **Payment/Confirmation:** Timers disabled entirely (conditionally returned from useEffect)

---

## Safety Mechanisms

### Payment & Confirmation Protection

```javascript
const isPaymentOrConfirm = screen === 'payment' || screen === 'confirmation';
if (isPaymentOrConfirm || !idleMediaEnabled) return; // Skip inactivity timers entirely
```

**Result:** Media mode cannot trigger during:
- Card terminal interaction
- Payment screen display
- Confirmation screen countdown

### Session Clearing

Before entering idle_media mode:
- Cart cleared
- Placed order cleared
- Printer error state reset
- Order type reset to 'takeaway'
- Selected table cleared
- Screen reset to 'welcome'

**Rationale:** Prevents stale customer data on public promo display.

---

## Reuse of Existing Media Screen

✅ **No new component created.** Uses existing `ScreenDisplay` fully:
- Content rotation (images, videos, widgets)
- Schedule filtering (time-based content)
- Caching and offline fallback
- Weather widget integration
- Multi-zone layouts (if configured)
- Orientation/rotation support

**Invocation:**
```jsx
<ScreenDisplay
  restaurantId={restaurantId}
  screenName={restaurant?.kiosk_config?.idle_media_screen_name || 'Kiosk Promo'}
/>
```

---

## Exit Media Mode on Interaction

### Touch Handler
```jsx
onTouchStart={() => {
  setMode('ordering');
  setScreen('welcome');
}}
```

### Click Handler
```jsx
onClick={() => {
  setMode('ordering');
  setScreen('welcome');
}}
```

**No special button required.** Media mode wraps ScreenDisplay in a clickable div that exits on any touch/click.

---

## Smoke Test Coverage (8 Tests)

1. ✓ Inactivity triggers media mode after 60s
2. ✓ Touch in media mode exits to ordering
3. ✓ Interaction resets inactivity timer
4. ✓ Payment-in-progress blocks media mode
5. ✓ Config disabled → no media mode
6. ✓ Media mode uses configured screen name
7. ✓ Session state cleared before media
8. ✓ Confirmation timeout flow → welcome → media

**Run:** `npm run test:smoke kioskIdleMedia`

---

## Known Limitations & Edge Cases

### 1. ScreenDisplay Event Consumption
**Issue:** If ScreenDisplay internally consumes touch/click events (e.g., for content interaction), the exit handler may not trigger.
**Workaround:** ScreenDisplay is read-only (no interactive widgets in promo mode), so this is unlikely. If it becomes an issue, add a transparent overlay with higher z-index.

### 2. Multi-Tab/Window Inactivity
**Current:** Inactivity tracked per-window. Opening multiple tabs may confuse timers.
**Status:** Acceptable. Each kiosk instance is single-purpose; multi-tab scenario is not a supported use case.

### 3. Mobile Long-Press or Hold Gestures
**Current:** Single tap exits media mode.
**Status:** Works as designed. Customer can't "hold" to stay in media mode.

### 4. Scheduled/Timezone Media Content
**Current:** ScreenDisplay handles schedule filtering. Idle media mode respects configured schedules.
**Status:** Works. If media screen is scheduled "offline" (9pm–6am), media won't show.

### 5. No Media Screen Configured
**Fallback:** If `idle_media_screen_name` doesn't exist, ScreenDisplay shows "No content" screen.
**Status:** Acceptable. Admin can fix by creating the screen or adjusting the config.

---

## Configuration Example

### Restaurant Admin Sets Up Idle Media

**Step 1: Create Media Screen**
- Go to Media Screens
- Create screen named `"Kiosk Promo"`
- Add 3 rotating promotional images (10s each)
- Add 1 video with product showcase (20s loop)
- Publish

**Step 2: Configure Kiosk**
- Go to Kiosk Settings
- Enable "Idle Media Mode"
- Set timeout to 60 seconds
- Set media screen name to "Kiosk Promo"
- Save

**Step 3: Test**
- Open kiosk
- Wait 60 seconds without interaction
- Promo screen appears automatically
- Touch screen → back to welcome
- Works!

---

## Files Summary

| File | Type | Change |
|------|------|--------|
| pages/KioskDashboard | Modified | Mode model, dual-timer inactivity, safety gates, media render |
| components/kiosk/KioskSettings | Modified | Config fields, idle media settings UI card |
| scripts/smoke/suites/kioskIdleMedia.smoke.js | New | 8 smoke tests for idle media behavior |
| docs/KIOSK_IDLE_MEDIA_MODE.md | New | Complete user guide and troubleshooting |
| KIOSK_IDLE_MEDIA_IMPLEMENTATION_SUMMARY.md | New | This file |

---

## Remaining Considerations

### Future Enhancements
- Gesture-based exit (long-press instead of tap)
- Analytics: Track impressions, dwell time, exits
- A/B testing: Show different promos by time/day
- Scheduled media: Disable idle mode during specific hours
- Kiosk analytics dashboard: Monitor idle media performance

### Monitoring
- Add logs/metrics for: mode transitions, timeout hits, media impressions
- Alert if media screen goes down (fallback to static "no content" screen)
- Track customer re-engagement rate (how many touch to exit media?)

### Compliance
- GDPR: Idle media doesn't collect data. Session cleared before showing.
- Accessibility: ScreenDisplay has text/captions; media mode is non-interactive (accessible)
- Localization: Promo content inherits from media screen (localized content can be scheduled per-region)

---

## Conclusion

✅ **Idle-to-media mode fully implemented and tested.**

- Clean mode model (ordering ↔ idle_media)
- Configurable 60s timeout (30–300s range)
- Immediate touch/tap exit
- Payment/confirmation safety gates
- Session clearing before media
- Reuses existing ScreenDisplay (no new media player)
- 8 smoke tests covering all scenarios
- Complete documentation

The kiosk now maximizes screen time during inactivity while remaining instantly accessible to customers.