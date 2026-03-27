# Kiosk Idle Media Settings — Admin Configuration Guide

## Overview

Administrators configure idle media settings in the **Restaurant Dashboard → Kiosk Settings → Idle Promotional Display** section. These settings control when promotional media displays during periods of inactivity.

---

## Settings

### 1. Enable Idle Promotional Display

**Type:** Toggle (Switch)  
**Default:** Enabled (`true`)  
**Effect:** Turns idle media mode on/off

- **Enabled:** When kiosk is inactive for the configured timeout, media displays fullscreen
- **Disabled:** Idle media mode does not activate; kiosk returns to welcome screen after main inactivity timeout

---

### 2. Idle Timeout (seconds)

**Type:** Number input  
**Default:** `60` seconds  
**Range:** `15` – `600` seconds (inclusive)

**Validation Rules:**
- Minimum: **15 seconds** (allows promotional content to display meaningfully)
- Maximum: **600 seconds** (10 minutes, prevents overly long media periods)
- Non-numeric input: Reset to default `60`
- Out-of-range input: Auto-clamped to nearest valid bound

**Real-time validation:**
- Input accepts raw numbers; validation happens on blur/save
- If user enters `10`, auto-corrects to `15`
- If user enters `1000`, auto-corrects to `600`
- If user enters letters, field preserves previous valid value

**Example values:**
| Timeout | Use Case |
|---------|----------|
| 15s | Quick promo flash (testing only) |
| 30s | Fast transition to promotions |
| 60s | Default, balanced experience |
| 120s | Longer ordering window, slower promo transition |
| 300s | Very patient kiosk, late promo display |
| 600s | Maximum (10 minutes), promo displays rarely |

---

### 3. Media Screen Name

**Type:** Text input  
**Default:** `"Kiosk Promo"`  
**Required:** Yes (if idle media enabled)

**Rules:**
- Must match an existing Media Screen in the restaurant's Media Screens library
- Screen name is case-sensitive
- If the named screen doesn't exist, idle media silently falls back to offline content (cached)
- Screen can be changed without requiring kiosk restart (dynamically loaded)

---

## Admin Information Text

Display in the UI:

> **"When the kiosk is inactive, promotions will display automatically until the next customer touches the screen."**

This text explains the customer-facing behavior:
- Displays when idle timeout expires
- Continues until user interacts (touch/click/keyboard)
- No manual intervention required to exit

---

## Integration with Runtime Behavior

### KioskDashboard Reads Settings

```javascript
const kioskConfig = restaurant.kiosk_config || {};
const idleMediaEnabled = kioskConfig.kiosk_idle_media_enabled !== false;
const idleMediaTimeout = (kioskConfig.kiosk_idle_media_timeout_seconds ?? 60) * 1000;
const screenName = kioskConfig.idle_media_screen_name || 'Kiosk Promo';
```

### Settings Applied Immediately

1. **On mount:** Kiosk dashboard loads current `restaurant.kiosk_config`
2. **On user interaction:** Inactivity timer respects the timeout value
3. **On idle:** `KioskIdleMediaOverlay` component loads the named screen
4. **On exit:** Timers reset; new timeout applies on next idle cycle

**No kiosk restart required** — Settings take effect immediately.

---

## Validation at Save Time

When admin saves idle media settings:

1. **Timeout validation:**
   - Value must be between 15 and 600
   - If invalid, save is prevented; error toast shown
   - User corrects and retries

2. **Screen name validation:**
   - No strict validation (screen can be created later)
   - If screen missing at runtime, fallback to cached content
   - Admin notified via dashboard that screen should exist

3. **Database update:**
   ```javascript
   await base44.entities.Restaurant.update(restaurantId, {
       kiosk_config: {
           kiosk_idle_media_enabled: true,
           kiosk_idle_media_timeout_seconds: 60,
           idle_media_screen_name: 'Kiosk Promo',
           // ... other config
       }
   });
   ```

---

## Example Configurations

### Fast Promotions
```json
{
  "kiosk_idle_media_enabled": true,
  "kiosk_idle_media_timeout_seconds": 30,
  "idle_media_screen_name": "Quick Promo"
}
```
→ Shows promotions after 30 seconds of inactivity

### Balanced (Default)
```json
{
  "kiosk_idle_media_enabled": true,
  "kiosk_idle_media_timeout_seconds": 60,
  "idle_media_screen_name": "Kiosk Promo"
}
```
→ Shows promotions after 60 seconds (1 minute) of inactivity

### Slow Promotions
```json
{
  "kiosk_idle_media_enabled": true,
  "kiosk_idle_media_timeout_seconds": 300,
  "idle_media_screen_name": "Kiosk Promo"
}
```
→ Shows promotions after 5 minutes of inactivity (customer-focused, less interruption)

### Disabled
```json
{
  "kiosk_idle_media_enabled": false,
  "kiosk_idle_media_timeout_seconds": 60,
  "idle_media_screen_name": "Kiosk Promo"
}
```
→ No idle media; kiosk resets to welcome screen instead

---

## Interaction with Other Timeouts

### Kiosk Session Reset Timeout

Separate setting: **Inactivity Timeout (General Kiosk Settings)**

| Setting | Purpose | Default |
|---------|---------|---------|
| Inactivity Timeout | Main reset (welcome screen, cart cleared) | 120 seconds |
| Idle Media Timeout | Promo display activation | 60 seconds |

**Recommended sequence:**
1. Customer inactive 60s → **Promotional media displays** (idle media timeout)
2. Customer inactive 120s → **Session reset** (cart cleared, welcome screen shows) (main timeout)

If customer touches during media (0–60s), media exits and ordering interface returns.

---

## Staff Guidelines

### When to Adjust Idle Media Timeout

| Scenario | Recommended Timeout |
|----------|-------------------|
| High-traffic restaurant (many customers) | 30–60s (quick promo display) |
| Casual dining (customers take time deciding) | 120–180s (longer decision window) |
| Quiet times (fewer customers) | 60–120s (balanced) |
| Testing promotions | 15–30s (quick feedback cycle) |

### Best Practices

1. **Start with 60 seconds** (default) and adjust based on customer feedback
2. **Ensure media screen exists** before enabling idle media mode
3. **Test on actual kiosk** to verify media displays and exits correctly
4. **Monitor customer behavior** — if customers are interrupted too often, increase timeout
5. **Coordinate with marketing** — idle media timeout should match promotional campaign duration

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Media never displays | `kiosk_idle_media_enabled` is `false` | Enable toggle in settings |
| Media displays too late | Timeout value too high | Decrease timeout (minimum 15s) |
| Media displays too quickly | Timeout value too low | Increase timeout |
| Media shows "no content" | Screen name doesn't exist | Create media screen with matching name |
| Settings don't apply | Old kiosk browser cache | Clear browser cache or restart kiosk |
| Inactivity timeout overrides media | Main timeout (120s) fires before media exits | Increase idle media timeout or decrease main timeout |

---

## Files

| File | Purpose |
|------|---------|
| `components/kiosk/KioskSettings.jsx` | Admin settings UI with validation |
| `pages/KioskDashboard` | Reads config and enforces timeout |
| `components/kiosk/KioskIdleMediaOverlay.jsx` | Displays media and handles exit |
| `docs/KIOSK_IDLE_MEDIA_MODE.md` | Technical behavior guide |

---

## Related Documentation

- **KIOSK_IDLE_MEDIA_MODE.md** — Technical configuration and behavior
- **KIOSK_IDLE_MEDIA_UX_TRANSITIONS.md** — UX animations and transitions
- **KIOSK_STATE_TRANSITIONS.md** — Kiosk state machine overview