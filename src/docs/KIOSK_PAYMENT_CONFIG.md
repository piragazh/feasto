# Kiosk Payment Configuration

> **Location:** `components/kiosk/KioskSettings` → rendered via `components/kiosk/KioskPaymentSettings`
> **Last updated:** 2026-03-27

---

## Config Fields (stored in `restaurant.kiosk_config`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `payment_card_enabled` | boolean | `false` | Show "Pay by Card" on kiosk. Card only activates if this is `true` AND a `reader_id` is configured. |
| `payment_counter_enabled` | boolean | `true` | Show "Pay at Counter". Omitted/undefined treated as `true`. |
| `card_terminal.reader_id` | string | `""` | Device ID from provider dashboard. **Required** for card payment to work. |
| `card_terminal.provider` | string | `"stripe_terminal"` | Terminal provider: `stripe_terminal`, `sumup`, `square`, `izettle`, `worldpay`, `other`. |
| `card_terminal.reader_label` | string | `""` | Friendly name shown to staff and in the hardware readiness panel. |
| `card_terminal.test_mode` | boolean | `true` | No real payments in test mode. **Must be `false` in production.** |
| `card_terminal.connection_type` | string | `"wifi"` | `wifi`, `bluetooth`, `usb`, `manual`. |
| `card_terminal.location_id` | string | `""` | Stripe Terminal location ID (`tml_…`). Stripe only. |
| `terminal_unavailable` | boolean | `false` | Runtime flag — temporarily hides card payment without removing config. |
| `kiosk_printer` | object | `null` | Bluetooth printer config. `kiosk_printer.name` must be set for printer to show as configured. |
| `admin_pin` | string | `"0000"` | 4-digit PIN for staff access to the kiosk admin panel. |
| `idle_timeout_seconds` | number | `120` | Seconds of inactivity before kiosk resets to welcome screen (30–600). |
| `auto_print_receipt` | boolean | `false` | Automatically print receipt after order placed. |
| `show_allergens` | boolean | `false` | Show allergen labels on menu items. |

---

## Payment Visibility Rules (KioskPayment component)

```
card visible =
  payment_card_enabled === true
  AND card_terminal.reader_id is non-empty
  AND terminal_unavailable !== true

counter visible =
  payment_counter_enabled !== false          ← explicit opt-out only
  OR (card_enabled && reader_id is empty)    ← automatic fallback if card is "wanted" but hardware missing
```

---

## Fallback Behaviour Matrix

| Scenario | Card shown | Counter shown | Checkout blocked |
|----------|-----------|---------------|-----------------|
| Card enabled + terminal configured + available | ✅ | Depends on `payment_counter_enabled` | No |
| Card enabled + **no terminal** | ❌ | ✅ forced fallback | No |
| Card disabled + counter enabled | ❌ | ✅ | No |
| **Card disabled + counter disabled** | ❌ | ❌ | ✅ "Temporarily unavailable" screen |
| Card enabled + `terminal_unavailable=true` + counter on | ❌ | ✅ | No |
| Card enabled + `terminal_unavailable=true` + counter off | ❌ | ❌ | ✅ |
| Runtime terminal call fails (network/backend error) | Retryable error screen | N/A | Only if repeated failures |
| Post-auth order creation fails | Error with transaction ref, no retry | — | No (payment taken — staff recovery) |

---

## Order Status by Payment Method

| Method | `payment_method` field | `status` on creation |
|--------|------------------------|----------------------|
| Card (terminal authorized) | `"card"` | `"confirmed"` |
| Pay at Counter | `"cash"` | `"pending"` — staff must confirm after collecting payment |

---

## Terminal Status Meanings

| Status | What it means | What to do |
|--------|--------------|------------|
| **Configured** | `reader_id` is saved and `terminal_unavailable` is false | Nothing — card payment is active |
| **Not Configured** | No `reader_id` set | Go to Card Terminal section, enter Reader ID and save |
| **Unavailable** | `terminal_unavailable=true` | Reader is temporarily disabled. Toggle it back when fixed |
| **Test Mode** | `test_mode=true` | No real charges. Disable before going live |

---

## Config UI Warnings (KioskPaymentSettings)

| ID | Trigger | Banner type | Message |
|----|---------|-------------|---------|
| **A** | `payment_card_enabled=true` + `reader_id` empty | 🟡 Yellow warning | Card payment enabled but no reader configured — card hidden until Reader ID saved |
| **B** | Both methods disabled | 🔴 Red error | No payment methods enabled — customers will be blocked at checkout |
| **C** | `payment_card_enabled=true` + `reader_id` set + `terminal_unavailable=true` | 🟡 Yellow warning | Reader marked unavailable — kiosk falls back to counter if enabled |
| **D** | Card disabled + counter enabled | 🔵 Blue info | Counter-only mode — orders marked pending until staff confirm payment |

**Save guard:** If both methods are disabled, the Save button is disabled and a toast error is shown if somehow triggered.

---

## Recommended Safe Configurations

### Recommended: Card + Counter fallback (most resilient)
```json
{
  "payment_card_enabled": true,
  "payment_counter_enabled": true,
  "card_terminal": { "reader_id": "tmr_xxx", "test_mode": false }
}
```
If the card reader goes down, customers can still pay at the counter.

### Card-only kiosk
```json
{
  "payment_card_enabled": true,
  "payment_counter_enabled": false,
  "card_terminal": { "reader_id": "tmr_xxx", "test_mode": false }
}
```
⚠️ If the reader fails, set `terminal_unavailable=true` temporarily — checkout will block until fixed.

### Counter-only kiosk (no card reader)
```json
{
  "payment_card_enabled": false,
  "payment_counter_enabled": true
}
```
Simplest setup. Orders arrive as `pending` — staff must collect payment and confirm.

### ❌ Invalid (will block customers)
```json
{
  "payment_card_enabled": false,
  "payment_counter_enabled": false
}
```
The settings UI will block saving this configuration.

---

## No Fake Card Path

Card payment **never** proceeds unless:
1. `payment_card_enabled === true`
2. `card_terminal.reader_id` is non-empty
3. `terminal_unavailable !== true`
4. `processCardTerminal` backend function returns `{ success: true, status: "approved" }`

There is no "simulate card" bypass in production. A misconfigured terminal automatically routes to counter payment.

---

## Smoke Test Coverage

Run: `node scripts/smoke/run-smoke.js kioskPaymentSettings`

| Scenario | Covered |
|----------|---------|
| Card enabled + no reader → Warning A | ✅ |
| Both methods disabled → Warning B + save blocked | ✅ |
| Counter only → Info D | ✅ |
| Card on + reader + `terminal_unavailable` → Warning C | ✅ |
| Healthy config — no banners, save not blocked | ✅ |
| Card only, counter disabled | ✅ |
| `payment_counter_enabled` undefined treated as enabled | ✅ |

---

## Files

| File | Role |
|------|------|
| `components/kiosk/KioskPaymentSettings` | Payment method toggles + hardware readiness card |
| `components/kiosk/KioskSettings` | Parent settings page — hosts KioskPaymentSettings |
| `components/kiosk/KioskPayment` | Customer-facing payment flow (uses config at runtime) |
| `scripts/smoke/suites/kioskPaymentSettings.smoke.js` | Smoke tests for all warning/save rules |
| `docs/KIOSK_PAYMENT_CONFIG.md` | This document |