# Kiosk Order State Model — Clean Separation

## Overview

Kiosk orders now use **explicit, separate state fields** to eliminate confusion between payment state and order preparation state.

---

## State Fields

### `payment_status` — Payment State (KIOSK ONLY)

Tracks whether payment has been collected or authorized.

| Value | Meaning | Kitchen Action | Staff Action |
|---|---|---|---|
| `pending_payment` | Awaiting staff confirmation (counter-pay) | ⛔ DO NOT PREPARE | Confirm payment button visible |
| `payment_confirmed` | Staff confirmed counter payment | ✅ BEGIN PREP | Button hidden, order proceeds |
| `paid_card` | Card terminal authorized | ✅ BEGIN PREP | Button hidden, order proceeds |
| `failed_payment` | Payment failed or was declined | ⛔ DO NOT PREPARE | Show recharge/cancel options |
| `cancelled_payment` | Customer cancelled at counter | ⛔ DO NOT PREPARE | Order is voided |

### `order_status` — Preparation State (KIOSK ONLY)

Tracks preparation workflow, independent of payment.

| Value | Meaning | When Used |
|---|---|---|
| `new` | Order received, not yet confirmed by staff | Right after kiosk creation |
| `confirmed` | Payment confirmed (if counter-pay), kitchen acknowledged | After payment confirmed or card authorization |
| `preparing` | Kitchen actively preparing items | Staff marks when starting prep |
| `ready` | All items ready, waiting for customer/delivery | Staff marks when prep complete |
| `completed` | Order collected/delivered | After handoff to customer |
| `cancelled` | Order voided (rejection or timeout) | When staff cancels or customer walks away |

---

## Order Lifecycle Examples

### Card-Terminal Kiosk Order

```
CREATION (card authorized)
  payment_status: paid_card
  order_status: new
    ↓
KITCHEN ACCEPTS
  payment_status: paid_card (unchanged)
  order_status: confirmed (staff acknowledged)
    ↓
KITCHEN PREPARES
  payment_status: paid_card (unchanged)
  order_status: preparing
    ↓
KITCHEN READY
  payment_status: paid_card (unchanged)
  order_status: ready
    ↓
CUSTOMER COLLECTS
  payment_status: paid_card (unchanged)
  order_status: completed
```

### Counter-Pay Kiosk Order

```
CREATION (pay_at_counter)
  payment_status: pending_payment
  order_status: new
    ↓ [STAFF MUST CONFIRM PAYMENT FIRST]
PAYMENT CONFIRMED
  payment_status: payment_confirmed
  order_status: new → confirmed (staff can advance to confirmed)
    ↓
KITCHEN PREPARES
  payment_status: payment_confirmed (unchanged)
  order_status: preparing
    ↓
KITCHEN READY
  payment_status: payment_confirmed (unchanged)
  order_status: ready
    ↓
CUSTOMER COLLECTS
  payment_status: payment_confirmed (unchanged)
  order_status: completed
```

---

## Staff Actions Map

| Staff Action | Field Changed | Valid States Before | Valid States After |
|---|---|---|---|
| **"Confirm Payment"** | `payment_status` only | `pending_payment` | `payment_confirmed` |
| **"Accept Order"** | `order_status` only | `new` | `confirmed` |
| **"Start Preparing"** | `order_status` only | `confirmed` | `preparing` |
| **"Mark Ready"** | `order_status` only | `preparing` | `ready` |
| **"Collect/Deliver"** | `order_status` only | `ready` | `completed` |
| **"Cancel Order"** | `order_status` + `payment_status` | any | `cancelled` |

### Key Rules

✅ **Payment actions ONLY change `payment_status`**
- Confirming payment does NOT auto-advance order prep

✅ **Kitchen actions ONLY change `order_status`**
- Accepting an order does NOT change payment state
- Prepping an order does NOT require payment confirmation (payment_status checked separately)

✅ **Payment check before kitchen prep**
- UI shows "Pending Payment" badge prominently
- Kitchen can see order but should NOT start until payment confirmed

---

## UI Display

### Order Card Header

```
KIOSK | Pending Payment | New
KIOSK | Payment Confirmed | Confirmed
KIOSK | Paid by Card | Ready
```

### Badge Styling

```
Source:    🖥️ KIOSK (indigo badge)
Payment:   💳 Pending Payment (yellow) | ✓ Confirmed (green) | Paid by Card (green)
Prep:      New | Confirming | Preparing | Ready | Completed
```

---

## Filtering Examples

### Unpaid Kiosk Orders

```javascript
orders.filter(o => 
  o.order_source === 'kiosk' && 
  o.payment_status === 'pending_payment'
)
```

### Ready Kiosk Orders

```javascript
orders.filter(o => 
  o.order_source === 'kiosk' && 
  o.order_status === 'ready'
)
```

### All Active Kiosk Orders

```javascript
orders.filter(o => 
  o.order_source === 'kiosk' && 
  !['completed', 'cancelled'].includes(o.order_status)
)
```

---

## Non-Kiosk Orders

**Legacy `status` field remains unchanged for online/POS/third-party orders.**

Existing code uses:
- `status: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'ready_for_collection', 'delivered', 'collected', 'cancelled', 'refund_*']`

**No migration needed.** Kiosk orders use new fields; all others use legacy `status`.

---

## Error Cases

### Payment Failed After Timeout

```
payment_status: failed_payment
order_status: new
```

→ Staff can retry or cancel. Kitchen does not see order.

### Customer Walks Away

```
payment_status: cancelled_payment
order_status: cancelled
```

→ Order voided. Kitchen notified via auto-cancel.

### Rare: Kitchen Started Before Payment Confirmed

```
payment_status: pending_payment
order_status: preparing
```

→ **System prevents this via UI gatekeeping:**
  - "Start Preparing" button hidden if `payment_status === 'pending_payment'`
  - Or backend rejects if staff tries to progress without payment

---

## Backward Compatibility

✅ **Fully compatible:**
- Existing orders use legacy `status` field
- Kiosk orders use new `payment_status` + `order_status`
- No migration of old orders needed
- Live Orders UI queries both (legacy OR kiosk)

---

## Testing Checklist

- [ ] Card kiosk order created with `paid_card` + `new`
- [ ] Counter-pay kiosk order created with `pending_payment` + `new`
- [ ] Confirm payment updates only `payment_status` to `payment_confirmed`
- [ ] Kitchen action updates only `order_status` (not `payment_status`)
- [ ] UI shows separate payment/prep badges
- [ ] Confirm button hidden for `paid_card` orders
- [ ] Kitchen cannot start prep if `payment_status === 'pending_payment'`
- [ ] Filter "unpaid kiosk" works correctly
- [ ] Status history logs both fields independently