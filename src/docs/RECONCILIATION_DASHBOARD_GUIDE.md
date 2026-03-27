# Payment Reconciliation Dashboard

**Status:** Complete  
**Last Updated:** 2026-03-27  
**Access:** SuperAdmin only

---

## Overview

The Reconciliation Dashboard provides operations teams a unified interface to detect, triage, and resolve payment/order mismatches. All issues are **automatically detected** by scheduled functions, persisted in the `ReconciliationIssue` entity, and presented as an auditable queue.

**Key principle:** No dangerous manual edits. Every action is logged and audited.

---

## Issue Types

| Type | Meaning | Action |
|------|---------|--------|
| **orphan_payment** | Payment succeeded, order never created. PT stuck in authorized/needs_review | Issue refund or link to late-created order |
| **refund_failed** | Payment succeeded → order failed → refund attempt failed | Contact customer; manual refund via Stripe |
| **unpaid_order** | Order exists in database but no PaymentTransaction linked | Search Stripe for payment; link if found |
| **duplicate_payment** | Same payment_intent_id created 2+ orders | Investigate which order is correct; cancel duplicate |
| **duplicate_order** | Same order_id linked to 2+ payments | Investigate which payment is correct; cancel duplicate |
| **amount_mismatch** | PT.amount ≠ Order.total | Check coupon/discount logic; reconcile manually |
| **ambiguous_match** | Payment & order exist but relationship unclear | Manual investigation required |
| **payment_timeout** | Payment authorization pending >10 min | Verify status with Stripe; refund or link |
| **order_timeout** | Order created but stuck in pending >1 hour | Check kitchen system; reissue or cancel |

---

## Severity Levels

| Level | Meaning | SLA |
|-------|---------|-----|
| **critical** | Customer charged, money missing | Respond within 15 min |
| **warning** | Potential financial impact | Respond within 1 hour |
| **info** | Detected but low financial risk | Respond within 24 hours |

---

## Dashboard Sections

### 1. Summary Cards (Top)

Quick-glance metrics:
- **Critical:** Unresolved critical issues
- **Refund Failed:** PT.status = needs_review
- **Orphaned:** Payment with no order
- **Duplicates:** Duplicate payment/order
- **Reviewed:** Issues marked as reviewed (in progress)
- **Resolved:** Resolved in last 24h

### 2. Trends (Charts)

- **Last 24h:** Issue counts by type
- **Last 7d:** Weekly trends; up/down indicator

### 3. Issue Queue (Left Panel)

Sortable, filterable queue of all issues:
- **Sort:** Critical → warning → info; open → reviewed → resolved; oldest first
- **Filters:**
  - Status: open, reviewed, resolved, escalated, closed
  - Severity: critical, warning, info
  - Type: all issue types
- **Display:** Amount, payment intent ID (first 12 chars), customer email/phone

### 4. Issue Detail Panel (Right Side)

When you click an issue, see:

**Issue Details:**
- Detected date/time
- Current status
- Amount
- Type
- Suggested action

**Payment Transaction:** (if PT exists)
- Payment Intent ID (link to Stripe)
- Status
- Customer email/phone
- Failure reason
- Link to Stripe dashboard

**Order:** (if order exists)
- Order number
- Total
- Status

**Resolution:** (if open/reviewed)
- Text field for resolution notes (required)
- "Mark as Reviewed" button
- "Resolve & Close" button
- "Escalate to Support" button

**Resolution Summary:** (if resolved/closed)
- Resolved by (email)
- Resolution action (enum)
- Notes

---

## Workflows

### Workflow A: Refund Failed (Critical)

**Indicator:** Issue type = `refund_failed`, severity = critical

**Steps:**
1. Click issue to open detail panel
2. Note customer email/phone
3. Note payment intent ID
4. Click "View in Stripe" button → opens Stripe dashboard
5. In Stripe, search payment intent, verify refund status
6. If not refunded:
   - Click "Issue Refund" in Stripe
   - Confirm amount
   - Wait for confirmation
7. Back to dashboard, type resolution notes (e.g., "Manual refund issued via Stripe, refund ID re_xxx")
8. Click "Resolve & Close"
9. ✅ Issue marked resolved; audit trail created

**Customer Follow-up:**
- Send SMS/email: "Your refund of £X has been processed to [card]. Should appear in 1-3 business days."

---

### Workflow B: Orphaned Payment

**Indicator:** Issue type = `orphan_payment`, severity = warning or critical

**Steps:**
1. Click issue; review PT details
2. Check "Failure Reason" — why did order creation fail? (hours_check, coupon_validation, etc.)
3. If fixable (e.g., coupon expired):
   - Note the reason
   - Type: "Order creation failed due to [reason]. Customer has been informed. Issuing refund."
   - Click "Resolve & Close"
4. If uncertain:
   - Click "Escalate to Support"
   - Let support team investigate
5. ✅ Issue marked resolved or escalated; audit trail created

---

### Workflow C: Unpaid Order

**Indicator:** Issue type = `unpaid_order`, severity = warning

**Steps:**
1. Click issue; review order details
2. Note payment intent ID (if any) from metadata
3. Search Stripe for payments matching:
   - Customer email
   - Order total
   - Created date (±1 day)
4. If found:
   - Copy payment intent ID
   - Type: "Found payment intent pi_xxx in Stripe. Linking to order."
   - Escalate to engineering to link the PT record
5. If not found:
   - Type: "Payment not found in Stripe. Customer may have abandoned checkout. Will contact."
   - Click "Escalate to Support"
6. ✅ Issue marked escalated; support team investigates further

---

### Workflow D: Amount Mismatch

**Indicator:** Issue type = `amount_mismatch`, severity = warning

**Steps:**
1. Click issue; note difference (PT.amount vs Order.total)
2. Common causes:
   - Coupon/discount applied after payment
   - Delivery fee calculation error
   - Menu price changed after order
3. Decide:
   - If customer overpaid: Issue small refund
   - If customer underpaid: Contact customer (but unlikely)
   - If price justified: Type explanation + click "Resolve & Close"
4. ✅ Issue marked resolved; audit trail created

---

## Role Access

| Role | Access | Notes |
|------|--------|-------|
| **SuperAdmin** | Full access to all restaurants | Can see all issues |
| **Restaurant Manager** | Own restaurant only | Future: scoped to restaurant_id |
| **Staff** | None | Contact manager to review |

---

## Actions & Audit Trail

Every action is logged:

| Action | Effect | Audit Trail |
|--------|--------|-------------|
| Mark as Reviewed | Status → "reviewed" | Timestamp, who, when |
| Resolve & Close | Status → "resolved" + notes + action + resolved_by | Full trail captured |
| Escalate | Status → "escalated" + notes | Forwarded to support team |

---

## Limitations

1. **No linking UI:** Cannot manually link PT to order from UI (requires backend). Escalate to engineering.
2. **No refund UI:** Dashboard doesn't call Stripe API directly. Open Stripe in separate tab for manual refund.
3. **No customer contact:** Cannot send SMS/email from dashboard. Use external system or note in resolution.
4. **Issue source:** Issues only detected by automated functions (`detectReconciliationIssues` every 1h). Manual issues must be reported via escalation.

---

## FAQ

**Q: What if I see an issue but can't resolve it?**
A: Click "Escalate to Support" — support team gets notified and handles it.

**Q: How often are issues detected?**
A: `detectReconciliationIssues` runs every 1 hour. New issues appear within 1h of creation.

**Q: Can I delete an issue?**
A: No. Issues are immutable once created. You can only mark them resolved/escalated.

**Q: What if a customer gets refunded twice by accident?**
A: The `reconcileOrphanedPayments` function checks for existing refunds before issuing a new one. Duplicate refunds are very unlikely. If it happens, Stripe support can reverse the duplicate.

**Q: Do I need to notify the customer?**
A: Yes. Always include a note about customer contact in your resolution notes. Recommend sending SMS/email with refund confirmation.

---

## Monitoring

Check the dashboard:
- **Every morning:** Review overnight critical issues
- **Daily:** Trending to spot patterns (e.g., high coupon failure rate)
- **When notified:** Click alerts from `detectOrderingAlerts`

---

## Incident Response

### High volume of orphaned payments

**Trigger:** >5 orphaned payments in 1 hour

**Actions:**
1. Open Reconciliation Dashboard
2. Filter: issue_type = orphan_payment, status = open
3. Look for common failure_stage (e.g., coupon_validation)
4. If common cause:
   - Check Coupon entity for expired/misconfigured codes
   - Contact restaurant manager
   - Coordinate fix with engineering
5. Escalate critical-severity issues immediately

### Refund failures spike

**Trigger:** >3 refund_failed issues in 1 hour

**Actions:**
1. Check Stripe status page: https://status.stripe.com
2. If Stripe is down: notify customers, wait for recovery
3. If Stripe is up: likely configuration or network issue
4. Check function logs for `reconcileOrphanedPayments`
5. Contact engineering team

---

## Integration with Other Systems

- **detectReconciliationIssues:** Runs every 1h, creates ReconciliationIssue records
- **detectOrderingAlerts:** Runs every 5min, notifies ops of critical failures (separate from ReconciliationIssue)
- **reconcileOrphanedPayments:** Runs every 15min, auto-refunds stranded payments
- **Stripe webhooks:** Receive payment updates (future integration)

---

## Training

Before using the dashboard, operators should:
1. Understand issue types (see above)
2. Know how to open Stripe dashboard & find payments
3. Know how to contact customers (SMS/email system)
4. Know escalation path (support team email/Slack)
5. Practice on 1-2 test issues with senior operator supervising