# Kiosk Live Order Integration

## Overview

Kiosk orders are fully integrated into the Live Orders workflow. Staff see them in the same stream as online orders, with clear visual identity and dedicated actions.

---

## 1. Order Source Field

All kiosk-created orders now include:

```json
{ "order_source": "kiosk" }
```

| `order_source` | Channel |
|---|---|
| `online` | Customer-facing web/app (default) |
| `kiosk` | Self-service kiosk terminal |
| `pos` | Staff POS terminal |
| `third_party` | Uber Eats, etc. |

This field is set server-side on order creation in `KioskPayment.jsx` and cannot be spoofed by the customer (no client UI to change it).

---

## 2. Live Order Visibility

Kiosk orders appear in the normal Live Orders stream alongside online orders. No orders are hidden from the default "All Orders" view.

### Source Filter Tabs

| Tab | Shows |
|---|---|
| All Orders | Every live order |
| 🖥️ Kiosk | Only `order_source === 'kiosk'` |
| Online / Other | All non-kiosk orders |

---

## 3. Visual Identity

### Order Card

- **Indigo badge** (`🖥️ Kiosk`) on every kiosk order card header
- **Indigo border + shadow** on kiosk orders awaiting counter payment
- **Pulsing yellow badge** (`💳 Awaiting Payment`) when `payment_method === 'pay_at_counter'` and `status === 'pending'`
- Normal red border for other pending orders (e.g. incoming online orders)

---

## 4. Payment Confirmation Workflow

### Two kiosk payment paths:

| Path | `payment_method` | `status` on creation | Staff action needed |
|---|---|---|---|
| Card terminal | `card` | `confirmed` | None — kitchen can start immediately |
| Pay at counter | `pay_at_counter` | `pending` | Staff must confirm payment before kitchen starts |

### Pay-at-Counter flow:

1. Customer places order at kiosk → order created with `status: pending`, `payment_method: pay_at_counter`
2. Staff sees order in Live Orders with indigo border + "💳 Awaiting Payment" badge
3. Staff takes physical payment (cash or card at desk)
4. Staff clicks **"Confirm Payment Received"** button
5. Order moves to `status: confirmed` with audit entry in `status_history`
6. Kitchen print is triggered automatically

### Security rules:

- The "Confirm Payment Received" button is only shown when:
  - `order_source === 'kiosk'` AND
  - `payment_method === 'pay_at_counter'` AND
  - `status === 'pending'`
- Already card-authorized kiosk orders (`payment_method: 'card'`, `status: 'confirmed'`) never show this button
- Audit trail written to `status_history` with note: `"Payment confirmed at counter by staff"`

---

## 5. Kitchen Printing

Kiosk orders print using the same path as all other orders via `printOrderDetails()` and `autoPrintOrder()`.

### Channel routing:

| `order_source` | Printer channel |
|---|---|
| `kiosk` | `kiosk_order` |
| `online` (delivery/collection) | `online_order` |
| `online` (dine_in) | `pos_order` |

If no printer has `kiosk_order` in its `assigned_channels`, the system automatically falls back to `online_order` — so kiosk orders always print even on unconfigured installations.

### Kitchen ticket label:

Browser print fallback and auto-print both include:

```
🖥️ KIOSK ORDER
```

as a prominent header block above the order details, so kitchen staff can immediately identify the channel.

### Print trigger:

- **Auto-print on arrival**: new kiosk orders with `status: pending` trigger auto-print when `printer_config.auto_print === true`
- **Manual reprint**: print icon button on every order card
- **On payment confirm**: `printOrderDetails` is called immediately after `confirmKioskPaymentMutation` succeeds

---

## 6. Role Restrictions

The "Confirm Payment Received" button is rendered in the `LiveOrders` component which is only accessible to authenticated restaurant managers and admin users. No additional role check is needed beyond the existing dashboard access control.

For higher-security deployments, this action can be wrapped behind a PIN or role check at the component level.

---

## 7. Post-Confirmation Status Workflow

After payment is confirmed (`status: confirmed`), kiosk orders follow the exact same workflow as all other orders:

```
confirmed → preparing → ready_for_collection / out_for_delivery → collected / delivered
```

No special status system is needed.

---

## 8. Files Changed

| File | Change |
|---|---|
| `entities/Order.json` | Added `order_source` enum field |
| `components/kiosk/KioskPayment` | Sets `order_source: 'kiosk'` on both pay_at_counter and card orders |
| `components/restaurant/LiveOrders` | Source tabs, kiosk badge, payment confirm button, print label, channel routing |
| `scripts/smoke/suites/kioskLiveOrders.smoke.js` | New smoke test suite |
| `docs/KIOSK_LIVE_ORDER_INTEGRATION.md` | This document |

---

## 9. Remaining Limitations

- **No server-side audit function**: payment confirmation is a direct entity update. For full audit trails, wrap it in a backend function that logs the acting staff member's email.
- **No role restriction on confirm button**: any authenticated dashboard user can click it. Add a PIN or role gate if the restaurant has cashier-only counter staff.
- **No customer SMS on payment confirm**: kiosk orders typically have no phone number. If phone is available, the existing `sendCustomerNotification` will fire on `confirmed`.
- **Kiosk printer channel**: `kiosk_order` channel is not yet surfaced in the Printer Configuration UI — admins cannot assign a dedicated printer to kiosk orders via the UI yet. The fallback to `online_order` handles this transparently.