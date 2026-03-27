# Kiosk Idle Media Mode

## Overview

Idle Media Mode transforms an inactive kiosk into a promotional/media display screen. After a configured period of inactivity, the kiosk automatically switches to fullscreen media content (promotions, ads, menu highlights, etc.), maximizing in-store engagement during quiet periods.

## Architecture

### Mode Model

The kiosk operates in two distinct modes:

- **`ordering`** — Standard ordering interface (welcome, menu, cart, payment, confirmation)
- **`idle_media`** — Fullscreen media/promotions display (reuses existing `ScreenDisplay` component)

### Key Design Principles

1. **Clean state transition** — Media mode is a separate overlay, not interwoven with ordering logic
2. **Immediate exit** — Any touch/click exits media mode instantly and resumes ordering
3. **Reuses existing infrastructure** — Leverages `ScreenDisplay`, `PromotionalContent`, and media screen configuration
4. **Safe during payment** — Never enters media mode while payment is in progress
5. **Preserves customer context** — When exiting media mode, cart and session are preserved (customer can resume)
6. **Configuration-driven** — Fully configurable via kiosk settings; can be disabled entirely

## Configuration

### Fields in `restaurant.kiosk_config`

```javascript
{
  // Enable/disable idle media mode entirely
  kiosk_idle_media_enabled: true,           // default: true
  
  // Seconds until promotions appear after inactivity
  kiosk_idle_media_timeout_seconds: 60,     // default: 60 (range: 10–300)
  
  // Total seconds until kiosk resets to welcome (after media timeout)
  idle_timeout_seconds: 120,                // default: 120 (range: 30–600)
  
  // Name of the media screen configured in Media Management
  idle_media_screen_name: 'Kiosk Promotions'  // default: 'Kiosk Promotions'
}
```

### Timeline Example

With defaults:
```
t=0s     User orders → mode = 'ordering', timer starts
t=60s    No interaction → mode = 'idle_media', media screen shown
t=120s   Still idle → screen resets to welcome, mode = 'ordering', cart cleared
t=0s     Cycle repeats
```

If user touches during media (t=75s):
```
t=0s     User orders → mode = 'ordering', timer starts
t=60s    No interaction → mode = 'idle_media'
t=75s    User touches → mode = 'ordering', timer resets, cart preserved
```

## Behavior

### Entering Idle Media Mode

1. User is on menu, cart, or anywhere except welcome/confirmation/payment
2. No interaction for `kiosk_idle_media_timeout_seconds`
3. Kiosk switches to `idle_media` mode
4. `ScreenDisplay` renders fullscreen with media from the configured screen name
5. Cart and session state are preserved in memory (not cleared yet)

### Exiting Idle Media Mode

**On touch/click:**
- Instantly switches back to `ordering` mode
- Returns to the last screen (menu, cart, etc.)
- Preserves cart, order type, table selection
- Resets inactivity timer

**On extended idle:**
- After `idle_timeout_seconds` total elapsed time:
  - Reset kiosk to welcome screen
  - Clear cart, order type, session state
  - Return to `ordering` mode with fresh session

### Payment Screen Safety

The inactivity timer **skips entirely** if the user is on:
- `payment` screen (prevents media during active payment)
- `confirmation` screen (prevents media during order receipt)
- `welcome` screen (no timer needed; already at safe state)

## Integration

### KioskDashboard Changes

**Before:**
```jsx
// Single inactivity timeout → reset to welcome
useEffect(() => {
  if (screen === 'welcome' || screen === 'confirmation') return;
  // ... timer that resets to welcome after 120s
}, [screen]);

return (
  <div>
    {screen === 'welcome' && <KioskWelcome />}
    {screen === 'menu' && <KioskMenu />}
    ...
  </div>
);
```

**After:**
```jsx
// Two-tier inactivity: 60s → media, 120s → reset
useEffect(() => {
  if (screen === 'welcome' || screen === 'confirmation') return;
  
  const idleMediaEnabled = kioskConfig.kiosk_idle_media_enabled !== false;
  const idleMediaTimeout = kioskConfig.kiosk_idle_media_timeout_seconds * 1000;
  const resetTimeout = kioskConfig.idle_timeout_seconds * 1000;
  
  const resetTimer = () => {
    setMode('ordering'); // Exit media mode if active
    
    if (idleMediaEnabled) {
      // 60s → media mode
      timer1 = setTimeout(() => setMode('idle_media'), idleMediaTimeout);
      // 120s → reset
      timer2 = setTimeout(() => {
        setScreen('welcome');
        setCart([]);
        setMode('ordering');
      }, resetTimeout);
    } else {
      // No media mode, just 120s → reset
      timer1 = setTimeout(() => {
        setScreen('welcome');
        setCart([]);
      }, resetTimeout);
    }
  };
  
  // Reset timer on any interaction
  window.addEventListener('touchstart', resetTimer);
  window.addEventListener('click', resetTimer);
}, [screen, restaurant]);

// Media mode rendering
if (mode === 'idle_media') {
  return (
    <div onClick={() => setMode('ordering')} onTouchStart={() => setMode('ordering')}>
      <ScreenDisplay
        restaurantId={restaurantId}
        screenName={kioskConfig.idle_media_screen_name || 'Kiosk Promotions'}
      />
    </div>
  );
}

// Standard ordering UI
return <div>...</div>;
```

### Media Screen Setup

Restaurants must create a media screen in **Media Management → Screens**:

1. Go to **Restaurant Dashboard → Media Management → Screens**
2. Create a new screen named **"Kiosk Promotions"** (or custom name)
3. Configure promotional content:
   - Add images, videos, widgets (menu previews, specials, etc.)
   - Set display durations and transitions
   - Use schedule rules if desired
4. Activate the screen
5. In **Kiosk Settings**, set **Media Screen Name** to match ("Kiosk Promotions")

The kiosk will automatically pull and display this content during idle periods.

## UX Flow

### Menu Screen → Idle Media Example

```
1. Customer on Menu, browsing items
   ↓ No interaction for 60s
2. Screen fades to fullscreen promotions
   • Shows restaurant specials, menu highlights
   • Customer can see happy hour deals, limited offers
   ↓ Customer touches screen
3. Instantly back to Menu (exact same state)
   • Cart preserved, selections preserved
   • Customer continues ordering
```

### Cart → Idle Media Example

```
1. Customer fills cart, decides to go to menu for more items
   ↓ No interaction for 60s (browsing or indecision)
2. Promotions appear fullscreen
   • Shows related items, combo deals
   ↓ Customer touches
3. Back to Cart
   • All items still there
   • Can continue to checkout or add more
```

## Safety & Edge Cases

### Active Payment

**Scenario:** Customer is on payment screen, terminal waiting for card.

**Behavior:**
- Inactivity timer is **skipped entirely** (return early from useEffect)
- Kiosk does NOT transition to idle_media
- Terminal remains responsive

**Rationale:** Payment is a critical operation; interrupting with media is unsafe.

### Confirmation Screen

**Scenario:** Order placed, confirmation screen showing order details + "Come back in X minutes" message.

**Behavior:**
- Inactivity timer is **skipped entirely**
- After 30 seconds (hardcoded in `KioskConfirmation`), automatically transitions back to welcome
- Media mode is **not triggered** during confirmation

**Rationale:** Confirmation is ephemeral; media would be confusing after a successful order.

### Stale Session

**Scenario:** Idle media runs for 60+ minutes (kiosk always showing media, no one touches it).

**Behavior:**
- Media screen continues to play indefinitely (respects its own playlist logic)
- Inactivity timers are cleared and reset every time the timer fires
- If someone touches, they return to a fresh ordering state

**Rationale:** Media screen has its own lifecycle; kiosk state is cleared, so no stale cart or payment data leaks.

### Rapid Interactions

**Scenario:** Customer taps many times during ordering.

**Behavior:**
- Each interaction resets the inactivity timer
- Kiosk stays in `ordering` mode
- Media mode never appears

**Rationale:** Frequent interactions indicate active use; media would be disruptive.

## Testing

Run smoke tests:

```bash
npm run smoke -- scripts/smoke/suites/kioskIdleMedia.smoke.js
```

### Test Coverage

1. **Idle timeout triggers media mode** — No interaction for N seconds → media appears
2. **Touch exits media mode** — Click/touch in media → returns to ordering
3. **Interaction resets timer** — Each action resets the countdown
4. **Disabled config disables media** — `kiosk_idle_media_enabled: false` → no media
5. **Payment blocks media** — Payment screen skips inactivity logic
6. **Welcome skips timer** — Welcome screen returns early
7. **Config defaults** — Correct default values applied
8. **Cart preserved** — Cart still accessible after media exit
9. **Screen name used** — Correct media screen pulled from config
10. **Timeout hierarchy** — Total reset timeout > idle media timeout

## Troubleshooting

### Media mode never appears

**Check:**
1. Is `kiosk_idle_media_enabled` set to `true` in Kiosk Settings?
2. Is the media screen name correct? (Media Management → Screens)
3. Is the screen marked as **active**?
4. Has content been added to the screen?
5. Are you testing with sufficient inactivity (default: 60+ seconds)?

### Media mode appears but no content shows

**Check:**
1. Does the media screen have **active** promotional content?
2. Are schedules correct? (If using schedule rules, is the current time within range?)
3. Is the browser **online**? Media content requires network for initial load.
4. Check browser console for fetch errors.

### Kiosk won't exit media mode on touch

**Check:**
1. Is the touch event listener attached? (Check console for errors during `KioskDashboard` mount)
2. Is the `ScreenDisplay` consuming the click event? (Try touching an empty area)
3. Does `mode` state update properly in React DevTools?

### Payment interrupted by media

**This should never happen.** If it does:
1. Check that `screen === 'payment'` causes an early return in the inactivity useEffect
2. Ensure the condition is: `if (screen === 'welcome' || screen === 'confirmation' || !restaurant) return;`

## Configuration Reference

### Kiosk Settings Admin UI

**General Kiosk Settings** section includes:

- **Promotions/Media Mode** toggle
  - When enabled, shows additional fields
  - Default: **enabled**
  
- **Promotions Display Timeout** input
  - Seconds until promotions appear
  - Range: 10–300 seconds
  - Default: **60 seconds**
  - Note: This is the first timeout tier
  
- **Total Inactivity Timeout** input
  - Seconds until full reset (after media timeout)
  - Range: 30–600 seconds
  - Default: **120 seconds**
  - Note: This should be > display timeout
  
- **Media Screen Name** input
  - Name of the screen configured in Media Management
  - Default: **"Kiosk Promotions"**
  - Tip: Must match exactly with media screen created in dashboard

## Future Enhancements

1. **Playlist mode** — Instead of single screen, cycle through multiple media screens based on time of day
2. **Engagement tracking** — Log how often customers interact during media mode (analytics)
3. **A/B testing** — Different promotional content, measure engagement
4. **Dynamic content** — Pull promotions from real-time inventory or pricing
5. **Audio** — Optional background music or promotional audio during media mode
6. **Gesture detection** — Exit media mode on any gesture, not just tap (swipe, double-tap, etc.)

## FAQ

**Q: Will the cart be lost if idle media appears?**
A: No. Cart and session are preserved in memory. If customer touches, they return to the exact same cart state. Only after the total timeout (120s) is the cart cleared.

**Q: Can I disable idle media mode temporarily?**
A: Yes. Toggle **Promotions/Media Mode** off in Kiosk Settings. The kiosk will use the standard reset behavior (120s → welcome, no media).

**Q: What if there's no media screen content?**
A: The `ScreenDisplay` will show a fallback message ("No content configured"). Configure content in Media Management → Screens, then refresh the kiosk.

**Q: Does media mode work offline?**
A: Media content is cached locally by `ScreenDisplay`. If the network is unavailable, cached content will play. New content won't be fetched until the network is back online.

**Q: Can I customize the media screen name?**
A: Yes. In Kiosk Settings, change **Media Screen Name** to match the name of your media screen in the dashboard.

**Q: Does media mode affect payment processing?**
A: No. Media mode is explicitly skipped during payment and confirmation. The kiosk will never show media while a payment is in progress.