# Rejection + Auto-Refund Workflow

**Last Updated:** 2026-03-27  
**Status:** Implemented  
**Priority:** CRITICAL — Money Safety

---

## Overview

When a restaurant rejects an already-placed order, this workflow ensures automatic refund for card-paid orders. No manual refund action is required; the system handles it automatically.

### Key Guarantee
> **If a customer paid by card and the restaurant rejects the order, a refund is issued immediately.**

---

## Behavior by Payment Method

| Payment Method | Order Rejected | Refund Action | Responsible Team |
|---|---|---|---|
| **Card (Stripe)** | → Cancelled | Auto-refund issued immediately | System (automatic) |
| **Cash** | → Cancelled | No refund | N/A (cash on delivery) |
| **Pay at Counter** | → Cancelled | No refund | N/A (payment pending) |

---

## Workflow Diagram

```
Restaurant Staff Clicks "Reject Order"
    ↓
[RejectOrderDialog shows auto-refund notification if card-paid]
    ↓
Staff confirms rejection reason → [rejectOrderWithRefund] function called
    ↓
├─ [A] Unpaid or Cash/Counter Payment?
│   └─ Set order.status = 'cancelled'
│   └─ Return success (no refund)
│
└─ [B] Card Payment (payment_intent_id exists)?
    ├─ Check idempotency: Is payment_intent_id already refunded?
    │  └─ YES: Return cached result (safe duplicate)
    │  └─ NO: Proceed to refund
    │
    ├─ Attempt Stripe refund
    │
    ├─ Refund Succeeded?
    │  ├─ YES: 
    │  │   ├─ PaymentTransaction.status = 'refunded'
    │  │   ├─ Order.status = 'cancelled'
    │  │   ├─ Customer notified (optional)
    │  │   └─ Return refund_id + success
    │  │
    │  └─ NO:
    │      ├─ PaymentTransaction.status = 'manual_review'
    │      ├─ Create FailureLog (severity=critical, alert=true)
    │      ├─ Create ReconciliationIssue (severity=critical, requires_escalation=true)
    │      ├─ Alert operations team for manual action
    │      └─ Return error + requires_manual_action=true
```

---

## Implementation

### 1. Backend Function: `rejectOrderWithRefund`

**Endpoint:** `POST /functions/rejectOrderWithRefund`

**Request:**
```json
{
  "order_id": "order-12345",
  "rejection_reason": "Item unavailable"
}
```

**Response (Unpaid/Cash):**
```json
{
  "success": true,
  "message": "Order rejected. No refund issued (unpaid or cash payment)",
  "refunded": false
}
```

**Response (Card Success):**
```json
{
  "success": true,
  "message": "Order rejected and refund issued automatically",
  "refunded": true,
  "refund_id": "re_ABC123"
}
```

**Response (Card Refund Failed):**
```json
{
  "success": false,
  "message": "Order rejected, but automatic refund failed: ... Manual review initiated.",
  "refunded": false,
  "requires_manual_action": true,
  "refund_error": "..."
}
```

### 2. Frontend Dialog: RejectOrderDialog

Shows a blue info banner if order was paid by card:

```
✓ Auto-Refund Enabled
  Since this order was paid by card, an automatic refund will be 
  issued immediately upon rejection.
```

### 3. Frontend Handler: OrderQueue.handleReject()

Calls `rejectOrderWithRefund` and shows appropriate toast:

- **Card Success:** "Order rejected and refunded (ID: re_ABC123)"
- **Unpaid:** "Order rejected. No refund issued."
- **Refund Failed:** "Order rejected. Refund failed — manual review required."

---

## Data Model Changes

### Order Entity
- `status`: 'pending' → 'cancelled'
- `rejection_reason`: String (reason provided by staff)
- `status_history`: Appended with rejection timestamp

### PaymentTransaction Entity
New optional fields (created on rejection):

| Field | Value | When |
|---|---|---|
| `status` | 'refunded' | Refund succeeded |
| `status` | 'manual_review' | Refund failed |
| `refund_id` | Stripe refund ID | Refund succeeded |
| `refund_amount` | Order.total | Always |
| `refund_attempted_at` | ISO timestamp | Always |
| `refund_confirmed_at` | ISO timestamp | Success only |
| `failure_reason` | Error message | Failure only |
| `failure_stage` | 'refund_initiate' | Failure only |

### FailureLog Entity
Created when refund fails:

```json
{
  "failure_type": "refund_initiate",
  "severity": "critical",
  "alert_triggered": true,
  "alert_condition": "payment_success_order_failed",
  "context": {
    "order_total": 12.50,
    "rejection_reason": "Item unavailable",
    "actor_email": "manager@restaurant.com"
  }
}
```

### ReconciliationIssue Entity
Created when refund fails:

```json
{
  "issue_type": "refund_failed",
  "severity": "critical",
  "status": "open",
  "requires_escalation": true,
  "suggested_action": "Manual refund via Stripe dashboard or contact support"
}
```

---

## Idempotency & Safety

### Duplicate Prevention
- **Key:** `payment_intent_id` (Stripe PaymentIntent ID)
- **Check:** Before refunding, query `PaymentTransaction` by PI
- **Logic:**
  - If PT exists with `status='refunded'` → Return cached refund_id
  - If PT exists with `status='manual_review'` → Block retry, return error
  - Otherwise → Attempt new refund

### No Double-Refunds
- A Stripe PaymentIntent can only be refunded once (Stripe enforces this)
- Our idempotency check prevents even *attempting* a second refund
- If staff rejects the same order twice, second call is safe (idempotent)

---

## Staff Experience

### Rejection Dialog (Before Rejection)

**If order is card-paid:**
```
┌─────────────────────────────────────────┐
│ Reject Order #12345                  ✕ │
├─────────────────────────────────────────┤
│ Select a reason for rejecting this      │
│ order. The customer will be notified.   │
│                                         │
│ ✓ Auto-Refund Enabled                   │
│   Since this order was paid by card,    │
│   an automatic refund will be issued    │
│   immediately upon rejection.           │
│                                         │
│ ◯ Restaurant is too busy                │
│ ◯ Item(s) temporarily unavailable       │
│ ◯ Delivery address out of range         │
│ ◯ Unable to fulfill special requests    │
│ ◯ Kitchen closing soon                  │
│ ◯ Other (specify below)                 │
│                                         │
│              [Cancel] [Reject Order]    │
└─────────────────────────────────────────┘
```

**If order is unpaid/cash:**
```
(No auto-refund banner shown)
```

### Toast Notification (After Rejection)

**Success (Card):**
```
✓ Order rejected and refunded (ID: re_ABC123)
```

**Success (Unpaid):**
```
✓ Order rejected. No refund issued.
```

**Failure (Refund Failed):**
```
✗ Order rejected. Refund failed — manual review required.
```

---

## Operations Team Actions

### When Refund Fails

1. **Alert Trigger:** Critical FailureLog + ReconciliationIssue created
2. **Visibility:** Dashboard → ReconciliationDashboard shows `issue_type='refund_failed'`
3. **Action Required:**
   - Log in to Stripe Dashboard
   - Search for PaymentIntent by ID
   - Issue manual refund
   - Update ReconciliationIssue status to 'resolved'

### Monitoring

Monitor via **ReconciliationDashboard**:
- Filter: `issue_type = 'refund_failed'`
- Sort: `severity = 'critical'`
- Action: Click issue → view metadata → Stripe link

---

## Audit Trail

All rejections logged via `auditLog` function:

```json
{
  "action": "order_rejected_with_refund",
  "entity_type": "Order",
  "entity_id": "order-12345",
  "actor_email": "manager@restaurant.com",
  "actor_name": "John Doe",
  "actor_role": "manager",
  "restaurant_id": "rest-abc",
  "old_value": "pending",
  "new_value": "cancelled",
  "reason": "Item unavailable",
  "refund_status": "refunded" | "manual_review" | "not_applicable",
  "refund_id": "re_ABC123" | null,
  "timestamp": "2026-03-27T10:30:00Z"
}
```

---

## Test Coverage

### Unit Tests
- ✅ Unpaid order rejected → no refund
- ✅ Cash payment order rejected → no refund
- ✅ Card payment order rejected → refund attempted
- ✅ Refund success → PT status = 'refunded'
- ✅ Refund failure → PT status = 'manual_review'
- ✅ Repeated rejection → idempotent (no double-refund)
- ✅ PaymentTransaction created correctly
- ✅ ReconciliationIssue created correctly
- ✅ FailureLog created correctly

### Smoke Tests
- `rejectionRefundWorkflow.smoke.js`

### Manual Testing
1. Create order with Stripe test card
2. Confirm order
3. Click "Reject"
4. Select reason
5. Verify toast shows refund_id
6. Check Stripe dashboard → Refund appears

---

## Constraints & Limitations

### What This Handles
- ✅ Automatic refund on restaurant rejection
- ✅ Idempotent (safe duplicate rejection clicks)
- ✅ Critical alert if refund fails
- ✅ Audit trail of all rejections

### What This Does NOT Handle
- ⚠️ Customer-initiated refund requests (handled by separate `requestRefund` flow)
- ⚠️ Partial refunds for rejected orders (only full refund)
- ⚠️ Automatic customer notification (ops team must handle via message UI)
- ⚠️ Refund reversals (Stripe policy: refund is final, no undo)

---

## Troubleshooting

### Refund Says "Manual Review" Required

**Cause:** Automatic Stripe refund failed (timeout, auth error, etc.)

**Fix:**
1. Go to ReconciliationDashboard
2. Filter: `issue_type = 'refund_failed'`
3. Click issue → copy PaymentIntent ID
4. Go to Stripe Dashboard → search PI → issue refund manually
5. Update ReconciliationIssue status to 'resolved'

### Order Shows Cancelled But No Refund Visible

**Cause:** PT record may not exist yet, or refund is pending.

**Fix:**
1. Query PaymentTransaction by `payment_intent_id`
2. Check `status` field:
   - `refunded` = Refund complete (check Stripe for ID)
   - `manual_review` = Refund failed, see above
   - `authorized` or missing = No refund attempt yet (bug?)

### Customer Complains Refund Didn't Arrive

**Cause:** Refund succeeded in Stripe but Stripe is still processing.

**Fix:**
1. Stripe refunds take 3-5 business days
2. Direct customer to check Stripe status at https://stripe.com/docs/charges/managing-disputes-refunds
3. If 7+ days: escalate to Stripe support

---

## Future Improvements

- [ ] Partial refund support (allow rejection with partial refund reason)
- [ ] Automatic customer notification via SMS/email
- [ ] Refund status tracking in customer order history
- [ ] Bulk rejection with auto-refund (for restaurant closures)
- [ ] Refund webhook from Stripe → update PT status in real-time