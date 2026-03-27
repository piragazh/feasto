# Kiosk Order Status Model — Separate Payment & Preparation States

## Overview

Kiosk orders now use **explicit, independent `payment_status` and `status` fields** to clearly separate payment confirmation from order preparation. This eliminates ambiguity: kitchen staff can always see whether payment has been confirmed, and staff updating kitchen state won't accidentally affect payment tracking.

---

## Core Design Principle

✅ **Two independent fields — No mixed states:**
- `payment_status` — payment confirmation only
- `status` — order preparation/fulfillment only

🚫 **Never:**
- Mark an order "paid" before payment is confirmed
- Use `status` to represent payment state
- Create hybrid states like "pending_payment_preparing"

---

## Field Definitions

### `payment_status` (Kiosk Orders Only)

**Type:** `string enum`

**Values:**

| Value | Meaning | Kitchen Should Prep? | When Set | Notes |
|-------|---------|---------------------|----------|-------|
| `pending_payment` | Staff must confirm cash/card at counter | ❌ NO | Kiosk pay-at-counter order created | Customer left kiosk without paying |
| `payment_confirmed` | Staff confirmed cash/card was collected | ✅ YES | Staff clicked "Confirm Payment" | Kitchen can now start prep |
| `paid_card` | Terminal authorized kiosk card payment | ✅ YES | Kiosk card order created | Already paid, kitchen can start immediately |
| `failed_payment` | Card terminal declined payment | ❌ NO | Card authorization failed | Customer must retry or cancel |
| `cancelled_payment` | Customer cancelled payment before auth | ❌ NO | Customer hit "Back" during card flow | Order never completed |

**Rules:**
- Only kiosk orders (`order_source='kiosk'`) have `payment_status`
- Online/POS/third-party orders: `payment_status` is unused/null
- `payment_status` changes only during payment confirmation, never during kitchen prep

### `status` (All Orders — Now Independent of Payment)

**Type:** `string enum`

**Preparation workflow:**

| Value | Meaning | Kiosk Usage |
|-------|---------|-------------|
| `pending` | Awaiting kitchen acknowledgment | ✓ Kitchen: do NOT start until payment_status is confirmed or paid_card |
| `confirmed` | Kitchen acknowledged and ready to prep | ✓ Kitchen: start prep now |
| `preparing` | Active kitchen preparation | ✓ Normal prep flow |
| `ready_for_collection` | Done, awaiting collection | ✓ Normal completion |
| `out_for_delivery` | Delivery assigned | ✓ Delivery orders only |
| `delivered` | Delivered to customer | ✓ Delivery complete |
| `collected` | Collected by customer | ✓ Collection complete |
| `cancelled` | Order cancelled | ✓ Can cancel at any stage |
| `refund_*` | Refund workflows | ✓ Standard refund states |

**Key rule for kiosk:**
- Kitchen **must check** `payment_status` before starting prep
- If `payment_status = pending_payment`, kitchen waits for staff confirmation
- If `payment_status = payment_confirmed` or `paid_card`, kitchen can prep

---

## Kiosk Order State Machines

### Card Terminal Payment (Pre-Authorized)

**State flow:**

```
[Customer at kiosk] → [Tap/swipe card] → [Terminal authorizes]
                                          ↓
                    Order created: status='confirmed', payment_status='paid_card'
                                          ↓
                                   [Kitchen preps immediately]
                                          ↓
                    status → 'preparing' → 'ready' → 'collected'/'delivered'
```

**Invariants:**
- ✅ Never `pending_payment` or `payment_confirmed`
- ✅ Starts at `confirmed` (payment proof exists)
- ✅ Manual "Confirm Payment" button is hidden
- ✅ No payment confirmation step needed

### Counter Payment (Manual Confirmation)

**State flow:**

```
[Customer at kiosk] → [Select "Pay at Counter"] → [Order placed]
                                                   ↓
                    Order created: status='pending', payment_status='pending_payment'
                                                   ↓
                                       [Display in Live Orders]
                         with "⏳ Pending Payment" + "Confirm Payment" button
                                                   ↓
                              [Staff takes cash/card from customer]
                              [Staff clicks "Confirm Payment"]
                                                   ↓
                    Order updated: status='confirmed', payment_status='payment_confirmed'
                                                   ↓
                                   [Kitchen preps from here]
                                                   ↓
                    status → 'preparing' → 'ready' → 'collected'/'delivered'
```

**Invariants:**
- ✅ Starts at `pending_payment`
- ✅ Manual confirmation required before kitchen prep
- ✅ Button only shown when `pending_payment`
- ✅ Kitchen sees ⏳ badge until confirmed
- ✅ Only staff (not customer) can confirm

---

## Live Orders UI Representation

### Order Card Header

**Kiosk paid by card:**
```
Order #1234 | 🖥️ Kiosk | 🥡 Takeaway | 💳 Paid by Card | confirmed
```

**Kiosk awaiting counter payment:**
```
Order #5678 | 🖥️ Kiosk | 🥡 Takeaway | ⏳ Pending Payment | pending
```

**After staff confirms counter payment:**
```
Order #5678 | 🖥️ Kiosk | 🥡 Takeaway | ✓ Payment Confirmed | confirmed
```

**Kiosk preparation state:**
```
Order #5678 | 🖥️ Kiosk | 🥡 Takeaway | ✓ Payment Confirmed | preparing
```

### Badge Colors

| Badge | Color | When Shown |
|-------|-------|-----------|
| 💳 Paid by Card | Blue | `order_source='kiosk'` + `payment_status='paid_card'` |
| ✓ Payment Confirmed | Green | `order_source='kiosk'` + `payment_status='payment_confirmed'` |
| ⏳ Pending Payment | Yellow (pulsing) | `order_source='kiosk'` + `payment_status='pending_payment'` |
| ✗ Payment Failed | Red | `order_source='kiosk'` + `payment_status='failed_payment'` |

---

## Kitchen Display System (KDS) Impact

**What kitchen sees:**

1. **Kiosk card-paid order arrives:**
   - Source: 🖥️ KIOSK
   - Payment: 💳 PAID BY CARD
   - Can start prep immediately

2. **Kiosk counter-pay order arrives:**
   - Source: 🖥️ KIOSK
   - Payment: ⏳ AWAITING PAYMENT AT COUNTER
   - DO NOT START PREP — wait for staff confirmation

3. **Staff confirms payment → kitchen notified:**
   - Payment badge updates to ✓ PAYMENT CONFIRMED
   - Kitchen now starts prep

---

## Staff Workflow

### For Counter-Pay Orders

```
1. Customer orders via kiosk → order appears in Live Orders with ⏳ Pending Payment
2. Customer brings order number to counter
3. Staff takes cash/card payment
4. Staff clicks "Confirm Payment Received" button
5. Order moves to status='confirmed', payment_status='payment_confirmed'
6. Kitchen print triggered (or reprinted)
7. Kitchen sees ✓ PAYMENT CONFIRMED and starts prep
8. Normal kitchen prep flow (preparing → ready → collected)
```

### For Card-Terminal Orders

```
1. Customer authorizes payment at kiosk terminal
2. Order created with payment_status='paid_card'
3. Order appears in Live Orders ready to accept
4. Staff clicks "Accept Order"
5. Order confirmed, kitchen starts prep
6. No payment step needed
```

---

## Backend Rules

### KioskPayment Component

**Card authorization:**
```javascript
const order = await base44.entities.Order.create({
  payment_method: 'card',
  payment_status: 'paid_card',      // ← EXPLICIT
  status: 'confirmed',              // ← Ready for kitchen
  order_source: 'kiosk',
  payment_intent_id: authResult.transaction_id,
  // ...
});
```

**Counter payment (initial):**
```javascript
const order = await base44.entities.Order.create({
  payment_method: 'pay_at_counter',
  payment_status: 'pending_payment', // ← EXPLICIT: awaiting confirmation
  status: 'pending',                 // ← Not ready for kitchen yet
  order_source: 'kiosk',
  // ...
});
```

### confirmKioskPayment Function

**Only updates payment state:**
```javascript
await base44.entities.Order.update(order_id, {
  payment_status: 'payment_confirmed',  // ← Changes payment only
  status: 'confirmed',                  // ← Also move to confirmed for kitchen
  payment_confirmed_at: timestamp,
  payment_confirmed_by: user.email,
  payment_audit_trail: [...],
});
```

**Validations:**
- Only `order_source='kiosk'`
- Only `payment_method='pay_at_counter'`
- Only `payment_status='pending_payment'`
- Only staff roles can call

---

## Filtering & Analytics

### Live Orders Tabs

**"⏳ Unpaid Kiosk"** – Shows only:
```
order_source='kiosk' AND payment_status='pending_payment'
```

This helps staff quickly spot orders needing payment confirmation.

### Order Counts

- Total kiosk orders: `order_source='kiosk'`
- Unpaid kiosk: `order_source='kiosk' AND payment_status='pending_payment'`
- Card-paid kiosk: `order_source='kiosk' AND payment_status='paid_card'`

---

## Edge Cases & Safety

### Cannot Happen (By Design)

🚫 Kiosk order with `payment_status='pending_payment'` AND `status='confirmed'`
- Payment must be confirmed before kitchen moves status forward

🚫 Kiosk order with `payment_status='paid_card'` AND manual "Confirm Payment" button shown
- Button hidden for card-paid orders

🚫 Non-kiosk order with `payment_status` set
- Field only populated for kiosk orders

### Backward Compatibility

✅ Existing online/POS orders unaffected
- `payment_status` left null/empty
- `status` workflow unchanged
- No breaking changes to kitchen or staff workflows

---

## Testing & Validation

### Unit Tests Required

- [ ] Kiosk card order: `payment_status='paid_card'` on creation
- [ ] Kiosk counter order: `payment_status='pending_payment'` on creation
- [ ] Manual confirmation: updates `payment_status` to `payment_confirmed` only
- [ ] `status` changes are independent of `payment_status`
- [ ] "Confirm Payment" button hidden for `paid_card`
- [ ] Kitchen prep unchanged when `payment_status` updates
- [ ] Non-kiosk orders: `payment_status` null/unused

### Integration Tests

- [ ] Full kiosk card flow (auth → order creation → kitchen print → prep)
- [ ] Full kiosk counter flow (creation → pending → confirmation → kitchen print → prep)
- [ ] Live Orders filtering by `payment_status`
- [ ] Payment badge display matches `payment_status` value

---

## Summary

✅ **Clean separation:** Payment and preparation states are independent fields
✅ **No ambiguity:** Kitchen knows exactly when to prep (payment_status confirmed OR paid_card)
✅ **Staff-friendly:** Simple button, clear badges, no mixed states
✅ **Auditable:** Payment confirmations tracked separately from status changes
✅ **Safe:** Rules prevent invalid state transitions
✅ **Backward compatible:** No impact on existing orders/workflows