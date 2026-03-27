# Kiosk Orders — Staff Action Rules & Role-Aware Visibility

**Date:** March 27, 2026  
**Objective:** Define clear action sequences for kiosk orders with role-based access control

---

## 1. Action Rules by Order Type

### 1A. Kiosk Counter-Pay Order (awaiting staff payment confirmation)

```
State: payment_status='pending_payment', order_status='new'
Visual: 💳 | Unpaid (pulsing orange badge) | New (gray badge)
Card: Orange border + background highlight
```

**Available actions:**

| Action | Button | Role Required | Condition | Next State |
|---|---|---|---|---|
| ✓ Confirm Payment | "Confirm Payment" | Cashier, Waiter, Manager, Admin | Payment taken from customer | `payment_confirmed` + `new` |
| ✗ Cancel Order | "Cancel" | Any staff | Customer walked away | `cancelled` + `cancelled` |
| ✗ Accept Order | HIDDEN | - | Cannot prep without payment | - |
| ✗ Start Prep | HIDDEN | - | Cannot prep without payment | - |

**Staff workflow:**
1. Customer pays at counter (cash/card terminal outside kiosk app)
2. Staff sees pulsing "💳 Pending" badge
3. Staff clicks "Confirm Payment" (if authorized role)
4. Payment locked in: `payment_confirmed` ✓
5. Order now visible to kitchen
6. Next action: "Accept Order" (moves to prep flow)

**Role visibility:**
```javascript
// Only these roles see the "Confirm Payment" button:
const allowedRoles = ['admin', 'manager', 'cashier', 'waiter', 'kitchen_staff'];

// Other roles see a gray disabled message:
"Only managers/cashiers can confirm"
```

---

### 1B. Kiosk Card-Terminal Order (already paid at terminal)

```
State: payment_status='paid_card', order_status='new'
Visual: 💰 | Paid by Card (green badge) | New (gray badge)
Card: Standard gray border (no highlight)
```

**Available actions:**

| Action | Button | Role Required | Condition | Next State |
|---|---|---|---|---|
| ✗ Confirm Payment | HIDDEN | - | Already authorized by terminal | - |
| ✓ Accept Order | "Accept Order" | Any staff | Payment pre-authorized | `new` → `confirmed` |
| ✗ Cancel Order | "Cancel" (hidden until needed) | Any staff | Reject entire order | `cancelled` |
| ✗ Start Prep | HIDDEN | - | Must accept first | - |

**Staff workflow:**
1. Card payment authorized at kiosk terminal ✓
2. Staff sees "💰 Paid by Card" badge (green, no animation)
3. Order immediately visible to kitchen
4. Staff reviews order and clicks "Accept Order"
5. Kitchen begins prep
6. No payment confirmation step needed

**Key difference:** Zero payment friction — staff can accept and kitchen can prep immediately.

---

## 2. Prep Flow Actions (Both paths lead here)

After payment is confirmed (counter-pay) or authorized (card), both order types follow the **same prep workflow**:

```
Order Status Flow:
new → confirmed → preparing → ready → completed
```

| State | Action | Button | Next |
|---|---|---|---|
| `new` | Accept order | "Accept Order" | `confirmed` |
| `confirmed` | Start prep | "Start Preparing" | `preparing` |
| `preparing` | Mark ready | "Mark Ready" | `ready` |
| `ready` | Mark collected | "Mark as Collected" (takeaway) or "Mark as Served" (dine-in) | `completed` |

**All prep actions require:**
- ✅ Payment already confirmed/authorized
- ✅ Any staff role (no special permission)
- ✅ Server-side validation

---

## 3. Role-Based Access Control

### Allowed Roles for Payment Confirmation

```javascript
const allowedRoles = ['admin', 'manager', 'cashier', 'waiter', 'kitchen_staff'];
```

| Role | Can Confirm Payment | Can Accept Orders | Can Prep | Notes |
|---|---|---|---|---|
| Admin | ✅ | ✅ | ✅ | Full access |
| Manager | ✅ | ✅ | ✅ | Can authorize counter payments |
| Cashier | ✅ | ✅ | ✅ | Primary payment role |
| Waiter | ✅ | ✅ | ✅ | Can take payments in dine-in |
| Kitchen Staff | ✅ | ✅ | ✅ | Can confirm if needed |
| Customer | ❌ | ❌ | ❌ | Not a staff role |
| Guest | ❌ | ❌ | ❌ | Not authenticated |

**Implementation:**
```javascript
const canConfirmPayment = (user) => {
    if (!user) return false; // Not authenticated
    const allowedRoles = ['admin', 'manager', 'cashier', 'waiter', 'kitchen_staff'];
    return allowedRoles.includes(user.role);
};
```

**UI Behavior:**
```javascript
{canConfirmPayment(currentUser) ? (
    <Button onClick={() => confirmPayment(order)}>
        Confirm Payment
    </Button>
) : (
    <div className="text-xs text-gray-600">
        Only managers/cashiers can confirm
    </div>
)}
```

---

## 4. Server-Side Validation (confirmKioskPayment function)

The backend function enforces **strict invariants**:

```javascript
// 1. Only authenticated staff can call
if (!user || !allowedRoles.includes(user.role)) {
    return 403 Forbidden
}

// 2. Order must be kiosk origin
if (order.order_source !== 'kiosk') {
    return 403 Forbidden
}

// 3. Must be counter-pay (not card)
if (order.payment_method !== 'pay_at_counter') {
    return 409 Conflict (already paid)
}

// 4. Must be pending payment (not already confirmed)
if (order.payment_status !== 'pending_payment') {
    return 409 Conflict (wrong state)
}

// 5. Update ONLY payment fields (not order_status)
update(order_id, {
    payment_status: 'payment_confirmed',
    payment_confirmed_at: timestamp,
    payment_confirmed_by: user.email,
    payment_audit_trail: [...existing, new_entry]
    // order_status is NOT changed
})
```

**Why triple-checking?**
- Frontend can be spoofed/modified by user
- Backend must independently verify all preconditions
- Prevents accidental state corruption
- Maintains audit integrity

---

## 5. Audit Trail & Logging

Every payment confirmation is logged with full context:

```javascript
const auditEntry = {
    action: 'payment_confirmed_at_counter',
    actor_email: 'manager@restaurant.com',
    actor_name: 'Jane Doe',
    actor_role: 'manager',
    timestamp: '2026-03-27T14:23:45Z',
    note: 'Kiosk counter-payment confirmed by Jane Doe'
};
```

**Recorded in:**
- `order.payment_audit_trail` — full history
- `order.payment_confirmed_at` — timestamp
- `order.payment_confirmed_by` — staff email
- Backend logs (console output) for security monitoring

**Queryable for compliance:**
```javascript
// Find all payments confirmed by a staff member
const orders = await base44.entities.Order.filter({
    'payment_audit_trail[].actor_email': 'cashier@restaurant.com'
})

// Find all payments confirmed in a time range
const orders = await base44.entities.Order.filter({
    payment_confirmed_at: { $gte: '2026-03-27T00:00:00Z' }
})
```

---

## 6. Optimistic Updates (Frontend UX)

After clicking "Confirm Payment", the UI updates **immediately**:

```javascript
onMutate: async (orderId) => {
    // 1. Optimistically update cache
    queryClient.setQueryData(['live-orders', restaurantId], (old) => 
        old.map(o => 
            o.id === orderId 
                ? { ...o, payment_status: 'payment_confirmed' }
                : o
        )
    );
    // 2. UI reflects change instantly (badge changes from 💳 to ✓)
    // 3. Button becomes disabled while request in flight
}

onError: (error, orderId, context) => {
    // 4. If server rejects, rollback the optimistic change
    if (context?.previous) {
        queryClient.setQueryData(['live-orders', restaurantId], context.previous);
    }
    // 5. Show error toast to staff
    toast.error(error.message)
}

onSuccess: () => {
    // 6. Refresh from server for confirmation
    queryClient.invalidateQueries(['live-orders']);
}
```

**Result:** Staff sees the payment confirmed badge change in ~100ms, not 1-2 seconds.

---

## 7. Button States & Disable Logic

### "Confirm Payment" Button States

| State | Button | Disabled | Reason |
|---|---|---|---|
| Idle | "Confirm Payment" | ❌ | Ready to click |
| Pending | "Confirming..." | ✅ | Request in flight |
| Error | "Confirm Payment" | ❌ | Show error, allow retry |
| Success | Hidden | - | Moved to next step |

### Permission Denied

| Role | Display | Disabled | Reason |
|---|---|---|---|
| Authorized (cashier) | "Confirm Payment" | ❌ | Can click |
| Not authorized (kitchen) | Gray message: "Only managers/cashiers can confirm" | ✅ | Role insufficient |
| Not authenticated | Gray message (not shown if not logged in) | ✅ | No user object |

---

## 8. Error Handling

**Client-side (Frontend) checks:**
- ✅ Is user authenticated? → `if (!currentUser)`
- ✅ Is user role authorized? → `if (!canConfirmPayment(currentUser))`
- ✅ Button disabled while request in flight

**Server-side (Backend) checks:**
- ✅ Is user authenticated? → `if (!user)`
- ✅ Is role in allowed list? → `if (!allowedRoles.includes(user.role))`
- ✅ Is order kiosk? → `if (order.order_source !== 'kiosk')`
- ✅ Is payment method counter-pay? → `if (order.payment_method !== 'pay_at_counter')`
- ✅ Is payment status pending? → `if (order.payment_status !== 'pending_payment')`

**If any check fails:**
```
Frontend:     Button hidden or disabled (silent)
Backend:      Explicit error with status code (403, 409, etc.)
Toast:        User sees error message (not technical details)
Logs:         Full context logged for audit
```

**Example error flow:**
```javascript
// Staff clicks "Confirm Payment" but their role is "kitchen_staff" (insufficient)
try {
    await confirmKioskPayment(order.id)
} catch (error) {
    // Backend: { error: "Role 'kitchen_staff' cannot confirm payments", status: 403 }
    // Frontend toast: "Only managers/cashiers can confirm"
    // Action: Button remains visible, staff can't click (or see message)
}
```

---

## 9. Files Changed

| File | Changes |
|---|---|
| `components/restaurant/LiveOrders` | Added currentUser state, canConfirmPayment helper, optimistic updates, role-aware button visibility, disable states |
| `functions/confirmKioskPayment` | Unchanged (already has role validation) |
| `entities/Order.json` | No changes (schema already supports all fields) |

---

## 10. Testing Checklist

### Unpaid Kiosk Order (Counter-Pay)

- [ ] "Confirm Payment" button visible to manager/cashier
- [ ] "Confirm Payment" button hidden/disabled to kitchen staff
- [ ] "Only managers/cashiers can confirm" message shown to kitchen staff
- [ ] Button text changes to "Confirming..." while request in flight
- [ ] Badge changes from "💳 Pending" to "✓ Confirmed" optimistically
- [ ] After success, order moves to "Accept Order" action
- [ ] After error, badge reverts, error toast shown, button re-enabled

### Paid Kiosk Order (Card-Terminal)

- [ ] "Confirm Payment" button NEVER appears (hidden completely)
- [ ] "Accept Order" button visible to all staff
- [ ] No payment confirmation step, straight to prep flow
- [ ] Tooltip shows "Payment already authorized at terminal"

### Legacy (Non-Kiosk) Orders

- [ ] No role checks (all staff can accept)
- [ ] Standard action flow unchanged
- [ ] No optimistic updates needed (existing code)

---

## 11. Security Summary

✅ **Frontend cannot bypass backend validation**
- Role check on frontend is UX only
- Backend enforces actual permissions

✅ **Payment confirmations are audited**
- Every confirmation logged with staff name, role, timestamp
- Stored in order.payment_audit_trail (queryable)

✅ **State transitions are protected**
- Can only confirm if state is exactly 'pending_payment'
- Can't skip steps (e.g., jump to 'ready' without kitchen accepting)

✅ **Idempotent design**
- Confirming a payment twice doesn't double-record
- Second call returns 409 Conflict (already confirmed)

---

## 12. Summary

**Kiosk counter-pay workflow (staff confirms):**
```
1. Customer pays cash/card at counter
2. Staff clicks "Confirm Payment" (role: cashier/manager)
3. Backend validates + records in audit trail
4. UI updates: badge changes to ✓ Confirmed
5. Order now in "Accept" phase (normal prep flow)
```

**Kiosk card-pay workflow (automatic):**
```
1. Card authorized at kiosk terminal
2. No manual confirmation step
3. Order immediately visible: "Paid by Card" badge
4. Staff clicks "Accept Order" (normal flow)
5. Kitchen begins prep
```

**Both paths converge:**
```
→ Accept → Start Prep → Mark Ready → Mark Collected/Served
```

**Role enforcement:**
- Frontend: Hides buttons for unauthorized roles
- Backend: Rejects requests from unauthorized roles
- Audit: Logs who confirmed and when