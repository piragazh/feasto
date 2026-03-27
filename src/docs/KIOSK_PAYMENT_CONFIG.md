# Kiosk Payment Configuration

## Config Fields (stored in `restaurant.kiosk_config`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `payment_card_enabled` | boolean | `false` | Enable card payment on kiosk. Card is only shown if this is `true` AND a terminal is configured. |
| `payment_counter_enabled` | boolean | `true` | Enable "Pay at Counter" option. Customer brings order number to counter. |
| `card_terminal.reader_id` | string | `""` | Reader/device ID from provider dashboard. **Required** for card payment to activate. |
| `card_terminal.provider` | string | `"stripe_terminal"` | Terminal provider (stripe_terminal, sumup, square, izettle, worldpay, other). |
| `card_terminal.reader_label` | string | `""` | Friendly label shown to customers on the payment screen. |
| `card_terminal.test_mode` | boolean | `true` | If true, no real payments processed. Must be `false` in production. |
| `terminal_unavailable` | boolean | `false` | Runtime flag — set to `true` to temporarily disable card without removing terminal config. |

## Payment Visibility Rules

```
card visible = payment_card_enabled === true
              AND card_terminal.reader_id is non-empty
              AND terminal_unavailable !== true

counter visible = payment_counter_enabled !== false
                 OR (payment_card_enabled === true AND card_terminal.reader_id is empty)
                 ↑ automatic fallback: if card is "wanted" but hardware missing, show counter
```

## Fallback Behaviour

| Scenario | Card shown | Counter shown | Checkout blocked |
|----------|-----------|---------------|-----------------|
| Card enabled + terminal configured | ✅ | Depends on `payment_counter_enabled` | No |
| Card enabled + NO terminal | ❌ | ✅ (forced fallback) | No |
| Card disabled + counter enabled | ❌ | ✅ | No |
| Card disabled + counter disabled | ❌ | ❌ | ✅ — "No payment methods available" screen |
| Card enabled + `terminal_unavailable=true` | ❌ | ✅ (if counter enabled) | Only if counter also off |
| Runtime terminal error | N/A — order not created | Shows error + retry | Only post-authorization failures show staff-help block |

## Order Status by Payment Method

| Method | `payment_method` field | `status` on creation |
|--------|------------------------|----------------------|
| Card (terminal authorized) | `"card"` | `"confirmed"` |
| Pay at Counter | `"cash"` | `"pending"` |

Staff must manually mark counter-payment orders as confirmed once payment is received.

## No Fake Card Path

Card payment **never** proceeds unless:
1. `payment_card_enabled === true`
2. `card_terminal.reader_id` is non-empty in config
3. `processCardTerminal` backend function returns `{ success: true, status: "approved" }`

There is no "simulate card" or bypass. A misconfigured terminal routes to counter payment.

## Config UI Warnings

The Kiosk Settings panel shows:

- 🟡 **Card enabled but no terminal configured** — warning banner; card hidden from customers until reader_id is set
- 🔴 **Both payment methods disabled** — error banner; customers will be blocked at checkout
- ✅ **Terminal configured** — green status badge with provider/mode info
- ⚫ **No terminal configured** — grey "not configured" status

## Smoke Test Coverage Matrix

| Scenario | Expected UI | Expected order.status |
|----------|------------|----------------------|
| `payment_card_enabled=true`, `reader_id` set | Card + Counter (if enabled) | card→confirmed, counter→pending |
| `payment_card_enabled=true`, `reader_id` empty | Counter only (forced fallback) + yellow warning | pending |
| `payment_card_enabled=false`, `payment_counter_enabled=true` | Counter only | pending |
| `payment_card_enabled=false`, `payment_counter_enabled=false` | Blocked screen | N/A |
| `terminal_unavailable=true`, `payment_counter_enabled=true` | Counter only + yellow notice | pending |
| `terminal_unavailable=true`, `payment_counter_enabled=false` | Blocked screen | N/A |
| Runtime terminal call fails (network/backend) | Error screen with retry | No order created |
| Post-auth order creation fails | Error with transaction ref, no retry button | No order (payment taken — staff recovery) |