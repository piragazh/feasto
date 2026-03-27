# Kiosk Idle Media Mode — UX Transitions

## Overview

The idle media mode UX prioritizes smooth, non-disruptive transitions with minimal visual jarring. The implementation uses fade animations, clean screen lifecycle management, and immediate exit capabilities.

---

## Transition Architecture

### 1. Entry to Idle Media Mode

**Timing:** After 60 seconds of inactivity (configurable)

**Sequence:**
```
Active Screen (menu/cart)
    ↓ (0.3s fade)
Idle Media Screen (fullscreen, interactive)
```

**Implementation:**
- `KioskDashboard` sets `mode: 'idle_media'`
- Session cleared immediately (cart, order state, etc.)
- Screen reset to 'welcome' (but not displayed yet)
- `KioskIdleMediaOverlay` mounts with fade-in animation
- `ScreenDisplay` starts playing configured media content

**No white flash.** The fade is smooth and dark (gray-950 background).

---

### 2. Exit from Idle Media Mode

**Trigger:** Any touch, click, or keyboard interaction

**Sequence:**
```
Idle Media Screen
    ↓ (0.3s fade-out)
Welcome Screen (ordering interface ready)
```

**Implementation:**
- User touches/clicks anywhere on screen
- `onExit` callback fires immediately
- `KioskIdleMediaOverlay` unmounts with fade-out animation
- `ScreenDisplay` stops playing (cleanup)
- `mode: 'ordering'` restores, `screen: 'welcome'` displays
- Welcome screen fades in with staggered animations

**Instant responsiveness.** No delay between touch and exit.

---

### 3. Screen-to-Screen Transitions (Ordering Mode)

**All transitions use 0.2–0.3s fade for consistency.**

```
Welcome ↔ Menu ↔ Cart ↔ Payment ↔ Confirmation
```

Each screen wrapped in `<AnimatePresence mode="wait">` with motion.div:
- `initial={{ opacity: 0 }}`
- `animate={{ opacity: 1 }}`
- `exit={{ opacity: 0 }}`
- `transition={{ duration: 0.2 }}`

**Result:** Smooth cross-fades between screens, no jarring flashes.

---

## Welcome Screen Animation

Welcome screen has a **staggered entry** to guide customer focus:

```
1. Logo fades in + scales (delay: 0.1s)
   ↓ 0.1s
2. Restaurant name fades in (delay: 0.2s)
   ↓ 0.1s
3. Description text fades in (delay: 0.3s)
   ↓ 0.1s
4. Cuisine badge fades in (delay: 0.4s)
   ↓ 0.1s
5. "How would you like to order?" fades in (delay: 0.5s)
   ↓ 0.1s
6. Order type buttons fade in (delay: 0.6s)
   ↓ 0.2s
7. Pulse indicator animates (delay: 0.8s, continuous)
```

**Total intro:** ~800ms. Looks professional and guides user to read content before tapping.

---

## Idle Media Mode Lifecycle

### Mount (Entry)
```javascript
<KioskIdleMediaOverlay
    restaurantId={restaurantId}
    screenName="Kiosk Promo"
    onExit={() => { setMode('ordering'); setScreen('welcome'); }}
/>
```

**Happens:**
1. Fade-in animation (300ms)
2. ScreenDisplay initializes
3. Media content starts playing (from configured schedule)
4. Invisible exit overlay ready (z-index: 50)

### Unmount (Exit)
```javascript
// User touches/clicks
handleExit() → onExit() → setMode('ordering'); setScreen('welcome')
```

**Happens:**
1. Fade-out animation (300ms)
2. ScreenDisplay stops (cleanup)
3. Welcome screen mounts
4. Welcome staggered animations play

**Duration:** ~300ms + welcome stagger (~800ms) = ~1.1s total for full exit-and-welcome

---

## ScreenDisplay Lifecycle

### Start (Idle Media Enters)
- `ScreenDisplay` component mounts
- Key includes `restaurantId` + `screenName` to ensure fresh instance
- Media cache loads (or offline fallback)
- Content playlist begins

### Stop (Idle Media Exits)
- `KioskIdleMediaOverlay` unmounts
- `ScreenDisplay` unmounts (cleanup triggered)
- Media playback stops
- No lingering content or state

### Restart (Next Idle Cycle)
- Inactivity timer resets
- After 60s timeout, new `ScreenDisplay` mounts
- Fresh media instance starts (clean slate)

---

## No UI Contamination Rules

**What is cleared before idle media shows:**
- ✓ Cart items
- ✓ Placed order state
- ✓ Printer error flags
- ✓ Order type (reset to 'takeaway')
- ✓ Selected table
- ✓ Screen (reset to 'welcome' state, but not displayed)

**What remains safe in memory:**
- Restaurant config (cached)
- Menu data (cached)
- Inactivity timers (reused, not leaked)

**Result:** No cart or payment UI visible during media mode. Clean separation.

---

## Touch/Click Exit Behavior

### Exit Overlay
```jsx
<div
    className="absolute inset-0 cursor-pointer"
    onClick={handleExit}
    onTouchStart={handleExit}
    role="button"
    tabIndex={0}
    aria-label="Tap to return to ordering"
/>
```

- Covers entire screen (inset-0 = top/bottom/left/right)
- Above media content (z-index implied by parent)
- Invisible (no visible button or UI)
- Any touch/click triggers exit

### Accessibility
- `role="button"` — Screen reader recognizes as clickable
- `aria-label` — Explains action to assistive tech
- `onKeyDown` — Keyboard support (Enter/Space keys)

---

## Fade Animation Timings

| Transition | Duration | Easing |
|-----------|----------|--------|
| Idle Media Entry | 0.3s | easeInOut |
| Idle Media Exit | 0.3s | easeInOut |
| Screen Cross-Fade | 0.2s | default (easeInOut) |
| Welcome Logo | 0.5s | default (delay: 0.1s) |
| Welcome Buttons | 0.5s | default (delay: 0.6s) |
| Pulse Indicator | 1.5–2.0s | repeat infinite |

**Rationale:** Fast enough to feel responsive, slow enough to avoid harsh flashes.

---

## No Flashing / Visual Glitches

### Potential Issues & Fixes

| Issue | Prevention |
|-------|-----------|
| White flash on entry | Dark background (gray-950) used throughout |
| Black flash on exit | Fade-out completes before new content shows |
| Route thrashing | AnimatePresence `mode="wait"` ensures exit before enter |
| Leftover cart UI | Session cleared immediately before media mode |
| ScreenDisplay lag | Key includes screen name for fresh instance |
| Media start lag | ScreenDisplay handles caching & preload |

---

## Media Content Playback Rules

### Start Cleanly
- ScreenDisplay mounts fresh (new key)
- Playlist respects configured schedules
- Content begins at natural start point (not mid-video)

### Stop Cleanly
- On unmount, media playback stops
- No audio leaks
- No background processes continue

### Restart Cleanly
- Next idle cycle creates new ScreenDisplay instance
- Media plays from beginning (fresh start)
- No state from previous cycle persists

---

## Testing Checklist

- [ ] Inactivity → media mode: Fade-in smooth, no flash
- [ ] Media → touch: Fade-out smooth, instant exit
- [ ] Welcome screen: Staggered animations present, professional feel
- [ ] Cart preserved (if exiting media before full reset): State intact
- [ ] Payment blocked: No idle media during payment flow
- [ ] ScreenDisplay restarts: Fresh media instance on next cycle
- [ ] No white/black flashes: Smooth dark transitions throughout
- [ ] Touch responsiveness: Immediate exit (no lag)
- [ ] Keyboard support: Enter/Space keys exit media mode
- [ ] Accessibility: Screen reader announces "Tap to return to ordering"

---

## Future Enhancements

1. **Swipe gestures** — Swipe down to exit (in addition to tap)
2. **Haptic feedback** — Vibration on exit (mobile devices)
3. **Audio cue** — Subtle beep on exit (optional, configurable)
4. **Transition themes** — Different fade styles (blur, scale, etc.)
5. **Progress indicator** — Show "X seconds until reset" during media
6. **Customizable timing** — Admin-configurable fade durations

---

## Related Files

- `pages/KioskDashboard` — Main orchestration, inactivity timers, mode switching
- `components/kiosk/KioskIdleMediaOverlay.jsx` — Fade animations, exit handler, ScreenDisplay wrapper
- `components/kiosk/KioskWelcome.jsx` — Staggered entry animations, pulse indicator
- `docs/KIOSK_IDLE_MEDIA_MODE.md` — Configuration and behavior guide