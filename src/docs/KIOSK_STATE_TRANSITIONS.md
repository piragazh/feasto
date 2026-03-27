# Kiosk Order State Transitions — Complete Reference

## Overview

This document defines all valid state transitions for kiosk orders, ensuring staff actions are explicit and payment/preparation states never get mixed.

---

## Payment State Transitions

### Counter-Pay Kiosk Orders

```
INITIAL (after kiosk creation)
  payment_status: pending_payment
  order_status: new
        ↓ [Staff confirms counter payment]
STAFF CONFIRMS
  payment_status: payment_confirmed
  order_status: new (unchanged)
        ↓ [Order proceeds to kitchen acceptance]
KITCHEN ACCEPTS
  payment_status: payment_confirmed (unchanged)
  order_status: confirmed
        ↓ [Kitchen prepares]
PREPARING
  payment_status: payment_confirmed (unchanged)
  order_status: preparing
        ↓ [Kitchen marks ready]
READY
  payment_status: payment_confirmed (unchanged)
  order_status: ready
        ↓ [Customer collects/receives]
COMPLETED
  payment_status: payment_confirmed (unchanged)
  order_status: completed
```

### Card-Terminal Kiosk Orders

```
INITIAL (after card authorized)
  payment_status: paid_card
  order_status: new
        ↓ [Kitchen immediately accepts]
KITCHEN ACCEPTS
  payment_status: paid_card (unchanged)
  order_status: confirmed
        ↓ [Kitchen prepares]
PREPARING
  payment_status: paid_card (unchanged)
  order_status: preparing
        ↓ [Kitchen marks ready]
READY
  payment_status: paid_card (unchanged)
  order_status: ready
        ↓ [Customer collects/receives]
COMPLETED
  payment_status: paid_card (unchanged)
  order_status: completed
```

---

## Payment State Machine (payment_status only)

```
pending_payment
    ├─ [Staff confirms] → payment_confirmed
    ├─ [Card declined] → failed_payment
    └─ [Customer cancels] → cancelled_payment

payment_confirmed
    ├─ [Order voided] → cancelled_payment
    └─ [Proceeds normally] → (never changes)

paid_card
    ├─ [Order voided] → cancelled_payment
    └─ [Proceeds normally] → (never changes)

failed_payment
    ├─ [Retry payment] → pending_payment
    └─ [Cancel order] → cancelled_payment

cancelled_payment (terminal)
    └─ (no further transitions)
```

---

## Order Status Machine (order_status only)

```
new
    ├─ [Staff accepts] → confirmed
    └─ [Staff rejects] → cancelled

confirmed
    ├─ [Kitchen starts] → preparing
    └─ [Staff cancels] → cancelled

preparing
    ├─ [Kitchen finishes] → ready
    └─ [Staff cancels] → cancelled

ready
    ├─ [Customer collects/receives] → completed
    └─ [Staff cancels] → cancelled

completed (terminal)
    └─ (no further transitions)

cancelled (terminal)
    └─ (no further transitions)
```

---

## Staff Action Map — Allowed Transitions

### Confirm Payment (payment_status only)

| Current | New | Validation |
|---|---|---|
| `pending_payment` | `payment_confirmed` | ✅ Counter-pay kiosk only |
| `failed_payment` | `pending_payment` | ✅ Retry after card declined |
| **Any other** | ❌ | Forbidden |

**UI Gate:** Button visible **only** if:
```javascript
order.order_source === 'kiosk' && order.payment_status === 'pending_payment'
```

**Backend Validation:** Function rejects if `payment_status !== 'pending_payment'`

---

### Accept Order (order_status only)

| Current | New | Validation |
|---|---|---|
| `new` | `confirmed` | ✅ Payment must be ready first |
| **Any other** | ❌ | Forbidden |

**UI Gate:** Button visible only if:
```javascript
order.order_status === 'new' && 
(order.order_source !== 'kiosk' || order.payment_status !== 'pending_payment')
```

**Logic:** For kiosk orders, payment must be confirmed (or paid_card) before accepting.

---

### Start Preparing (order_status only)

| Current | New | Validation |
|---|---|---|
| `confirmed` | `preparing` | ✅ Order accepted |
| **Any other** | ❌ | Forbidden |

**UI Gate:** Button visible only if:
```javascript
order.order_status === 'confirmed'
```

---

### Mark Ready (order_status only)

| Current | New | Validation |
|---|---|---|
| `preparing` | `ready` | ✅ Kitchen finished prep |
| **Any other** | ❌ | Forbidden |

**UI Gate:** Button visible only if:
```javascript
order.order_status === 'preparing'
```

---

### Collect / Deliver (order_status only)

| Current | New | Validation |
|---|---|---|
| `ready` | `completed` | ✅ Customer collected or delivered |
| **Any other** | ❌ | Forbidden |

**UI Gate:** Button visible only if:
```javascript
order.order_status === 'ready'
```

---

### Cancel Order (both fields)

| Current | New | Validation |
|---|---|---|
| Any (except `completed`, `cancelled`) | `order_status: cancelled` + `payment_status: cancelled_payment` | ✅ Always allowed |
| **Any terminal state** | ❌ | Forbidden |

**UI Gate:** Cancel visible for any non-terminal state.

**Logic:** Cancelling updates both fields atomically to ensure consistency.

---

## Guard Rails & Prevention

### ✅ Payment Before Prep

**For counter-pay kiosk:**
- UI prevents "Start Preparing" if `payment_status === 'pending_payment'`
- Backend rejects order prep if payment not confirmed

**For card-paid kiosk:**
- `paid_card` status means terminal is confirmed
- "Start Preparing" allowed immediately

### ❌ No Fake States

**Prevented:**
- ❌ `pending_payment` + `preparing` (kitchen cannot start without payment)
- ❌ `pending_payment` + `completed` (order cannot be delivered unpaid)
- ❌ `payment_confirmed` + `new` forever (staff must accept after confirming payment)

**Enforced by:**
- UI button gating (buttons only show for valid next states)
- Backend validation (functions reject invalid state transitions)

### ✅ Independent Fields

**Never:**
- Confirm payment → auto-advance `order_status`
- Accept order → change `payment_status`
- Prep kitchen items → alter payment fields

**Always:**
- Payment actions touch `payment_status` only
- Kitchen actions touch `order_status` only

---

## UI Behavior by State

### Counter-Pay Awaiting Payment

```
Badges:    🖥️ KIOSK | 💳 Pending Payment (pulsing yellow) | New
Buttons:   [Confirm Payment] [Cancel Order]
Kitchen:   ⛔ DO NOT PREPARE (order hidden or greyed out)
Actions:   Only payment confirmation allowed
```

### Counter-Pay After Confirmation

```
Badges:    🖥️ KIOSK | ✓ Confirmed | New
Buttons:   [Accept Order] [Reject]
Kitchen:   Can now start prep
Actions:   Staff accepts, kitchen begins
```

### Card-Paid (Already Authorized)

```
Badges:    🖥️ KIOSK | Paid by Card | New
Buttons:   [Accept Order] [Reject]
Kitchen:   ✅ Ready to prep immediately
Actions:   Staff accepts, kitchen begins (no payment step)
```

### Preparing

```
Badges:    🖥️ KIOSK | Paid by Card | Preparing
Buttons:   [Mark Ready]
Kitchen:   ⏳ In progress
Actions:   Only "Mark Ready" allowed
```

### Ready for Collection

```
Badges:    🖥️ KIOSK | Paid by Card | Ready
Buttons:   [Mark as Collected] [Print]
Kitchen:   ✅ Waiting for customer
Actions:   Staff confirms collection
```

---

## Error Cases & Recovery

### Payment Declined

```
payment_status: failed_payment
order_status: new
↓ (Staff retries)
payment_status: pending_payment
order_status: new
```

### Customer Walks Away (No Payment)

```
payment_status: cancelled_payment
order_status: cancelled
→ Order voided, kitchen notified
```

### Partial Refund After Delivered

```
payment_status: paid_card (unchanged)
order_status: completed (unchanged)
→ Refund handled separately (not state change)
```

### Order Rejected Mid-Prep

```
order_status: preparing
↓ (Staff cancels)
payment_status: cancelled_payment
order_status: cancelled
```

---

## Testing Checklist

### State Creation

- [ ] Counter-pay kiosk: creates with `pending_payment` + `new`
- [ ] Card kiosk: creates with `paid_card` + `new`
- [ ] No other combinations possible

### Staff Actions

- [ ] Confirm payment: updates only `payment_status` to `payment_confirmed`
- [ ] Accept order: updates only `order_status` to `confirmed`
- [ ] Start prep: updates only `order_status` to `preparing`
- [ ] Mark ready: updates only `order_status` to `ready`
- [ ] Collect: updates only `order_status` to `completed`
- [ ] Cancel: updates both fields to `cancelled`

### UI Gating

- [ ] Confirm button hidden for `paid_card` orders
- [ ] Start prep button hidden if `payment_status === 'pending_payment'`
- [ ] All buttons hidden for terminal states (`completed`, `cancelled`)

### Backend Validation

- [ ] `confirmKioskPayment` rejects if `payment_status !== 'pending_payment'`
- [ ] Kiosk order prep rejects if counter-pay and `payment_status === 'pending_payment'`
- [ ] Invalid transitions rejected with 409 Conflict

### Live Orders Display

- [ ] Separate payment + order status badges shown
- [ ] Unpaid kiosk orders filterable and sortable
- [ ] Badge colors match state (yellow=pending, green=confirmed/paid)

---

## Summary

✅ **Clean separation of concerns:**
- Payment state (collection/authorization) is independent
- Order state (preparation workflow) is independent
- No fake/confusing combined states
- Staff actions are explicit and reversible

✅ **Prevents common mistakes:**
- Kitchen cannot prep before payment confirmed
- Payment confirmation does not auto-advance order
- Payment button hidden for already-paid orders
- All transitions validated server-side

✅ **Live Orders UI reflects reality:**
- Shows actual payment + prep states
- Staff can filter by unpaid orders
- Clear visual cues for action items