# Terminal Payment Audit & Reconciliation

**Date:** 2026-03-26  
**Status:** Complete  
**Purpose:** Full audit trail and reconciliation for card terminal payments

---

## OVERVIEW

Every card terminal transaction is logged and reconciled:

1. **Audit Trail** — Per-transaction tracking from initiation to completion
2. **Failure Logging** — Structured reasons for declines, timeouts, cancellations
3. **Reconciliation** — Match transactions to orders, detect duplicates/orphans
4. **Compliance** — Traceability for chargeback disputes & regulatory audits

---

## 1. AUDIT STRUCTURE

### TerminalTransaction Entity

Stores the primary transaction record:

| Field | Type | Purpose |
|---|---|---|
| **order_id** | string | Links to Order (populated after order created) |
| **restaurant_id** | string | Which restaurant |
| **terminal_provider** | enum | stripe/ingenico/square/mock |
| **reader_id** | string | Hardware reader serial |
| **reader_label** | string | Human-readable reader name |
| **transaction_id** | string | Provider's transaction ID (for reconciliation) |
| **amount_cents** | number | Amount in cents (no float precision loss) |
| **status** | enum | initiated/awaiting_card/processing/authorized/declined/failed/timeout/cancelled |
| **initiated_at** | datetime | When terminal was asked to process |
| **completed_at** | datetime | When terminal returned final status |
| **duration_seconds** | number | Total time from initiation to completion |
| **failure_reason** | enum | card_declined/timeout/reader_disconnect/cancelled/etc |
| **error_code** | string | Provider error code (e.g., Stripe decline code) |
| **error_message** | string | Human-readable error from provider |
| **operator_email** | string | POS operator who initiated |
| **operator_name** | string | Staff name snapshot |
| **notes** | string | Internal notes (e.g., "Retry after first tap failed") |
| **reconciled** | boolean | Whether reconciliation has been run |
| **reconciled_at** | datetime | When reconciliation occurred |
| **reconciliation_note** | string | Outcome (matched_to_order/orphaned/duplicate) |

### TerminalTransactionLog Entity

Detailed event log for debugging:

| Field | Type | Purpose |
|---|---|---|
| **terminal_transaction_id** | string | FK to TerminalTransaction |
| **order_id** | string | FK to Order (if applicable) |
| **event_type** | enum | initiated/state_change/error/retry/cancelled/reconciliation_check/duplicate_detection |
| **state_before** | string | Terminal state before event |
| **state_after** | string | Terminal state after event |
| **message** | string | Human-readable event description |
| **metadata** | object | Provider-specific details (error codes, amounts, etc.) |
| **logged_at** | datetime | When event was logged |
| **operator_email** | string | Who triggered this event |

---

## 2. FAILURE LOGGING

All failure states are captured with structured reasons:

### Failure Reasons (Structured)

```
card_declined          - Card issuer declined (most common)
card_error             - Card read error (EMV/magnetic issue)
insufficient_funds     - Account has insufficient balance
expired_card           - Card date passed
lost_card              - Card marked lost
stolen_card            - Card marked stolen
reader_timeout         - Card not tapped within 60 seconds
reader_disconnect      - Reader lost connection to terminal
network_error          - Network failure during processing
user_cancelled         - Customer pressed cancel on device
invalid_amount         - Amount outside reader limits
configuration_error    - Terminal misconfigured
other                  - Uncategorized error
```

### Error Code Capture

Provider-specific codes stored alongside reason:

```javascript
// Stripe example
{
  failure_reason: "card_declined",
  error_code: "card_declined",  // Stripe decline code
  error_message: "Your card was declined"
}

// Timeout example
{
  failure_reason: "reader_timeout",
  error_code: "TIMEOUT",
  error_message: "Card was not detected within 60 seconds"
}
```

---

## 3. AUDIT API

### Log Transaction Initiated

Called BEFORE sending to terminal:

```javascript
import { logTerminalTransactionInitiated } from '@/lib/terminal-audit';

const transaction = await logTerminalTransactionInitiated({
    restaurantId: 'rest-123',
    terminalProvider: 'stripe',
    readerId: 'rdr_abc123',
    readerLabel: 'Kitchen Terminal 1',
    amountCents: 2999,  // £29.99
    operatorEmail: 'cashier@restaurant.com',
    operatorName: 'John Doe',
});

// Returns TerminalTransaction with id for later updates
console.log(transaction.id);  // → 'txn-uuid-here'
```

### Log State Change

Called on every terminal state change:

```javascript
import { logTerminalStateChange } from '@/lib/terminal-audit';

await logTerminalStateChange({
    transactionId: 'txn-uuid-here',
    stateBefore: 'initiated',
    stateAfter: 'awaiting_card',
    message: 'Terminal ready for card tap',
    metadata: {
        reader_ready: true,
        display_message: 'Please tap your card',
    },
    operatorEmail: 'cashier@restaurant.com',
});
```

### Log Failure

Called on DECLINED, FAILED, TIMEOUT, CANCELLED:

```javascript
import { logTerminalFailure } from '@/lib/terminal-audit';

await logTerminalFailure({
    transactionId: 'txn-uuid-here',
    failureReason: 'card_declined',
    errorCode: 'card_declined',
    errorMessage: 'Your card was declined',
    operatorEmail: 'cashier@restaurant.com',
});
```

### Log Authorization (Success)

Called when AUTHORIZED state reached:

```javascript
import { logTerminalAuthorized } from '@/lib/terminal-audit';

await logTerminalAuthorized({
    transactionId: 'txn-uuid-here',
    providerTransactionId: 'pi_abc123def456',  // Stripe payment_intent ID
    operatorEmail: 'cashier@restaurant.com',
});
```

### Link Transaction to Order

Called after order is successfully created:

```javascript
import { linkTransactionToOrder } from '@/lib/terminal-audit';

await linkTransactionToOrder('txn-uuid-here', 'order-uuid-here');
```

---

## 4. RECONCILIATION LOGIC

### Reconciliation Process

For each authorized transaction:

1. **Check if already linked** → Done, skip
2. **Verify linked order exists** → If not, error
3. **Verify amount matches** → Check within ±1 cent tolerance
4. **Search for matching order** → By amount + timestamp (±5 min window)
   - 0 matches → Orphaned (warning)
   - 1 match → Auto-link (success)
   - 2+ matches → Ambiguous (manual review needed)

### Duplicate Detection

1. **Same provider transaction ID** → Possible double charge (critical)
2. **Multiple authorizations for same order** → Already charged multiple times (critical)
3. **Same amount within seconds** → Possible retry duplicate

### Orphaned Transaction Detection

Transaction authorized but:
- No order created
- Order created outside time window
- Order marked cancelled

Action: Manual reconciliation or create missing order

---

## 5. RECONCILIATION API

### Backend Function: reconcileTerminalTransactions

```javascript
// Call from admin dashboard or scheduled job
POST /functions/reconcileTerminalTransactions
{
    "restaurant_id": "rest-123",
    "start_date": "2026-03-20T00:00:00Z",
    "end_date": "2026-03-26T23:59:59Z"
}
```

Response:

```json
{
    "timestamp": "2026-03-26T10:00:00Z",
    "restaurant_id": "rest-123",
    "reconciliation": {
        "total_transactions": 45,
        "total_orders": 42,
        "summary": {
            "matched": 40,
            "already_reconciled": 0,
            "orphaned": 2,
            "ambiguous": 1,
            "errors": 2,
            "skipped": 0
        },
        "issues": {
            "orphaned": [
                {
                    "transaction_id": "txn-001",
                    "amount": 2999,
                    "reason": "no_matching_order"
                }
            ],
            "amount_mismatches": [
                {
                    "transaction_id": "txn-002",
                    "order_id": "order-001",
                    "transaction_amount": 3000,
                    "order_amount": 2999,
                    "delta_cents": 1
                }
            ]
        }
    },
    "duplicates": [
        {
            "type": "multiple_authorizations_same_order",
            "order_id": "order-005",
            "transactions": [
                {
                    "id": "txn-010",
                    "amount": 5000,
                    "created_date": "2026-03-25T14:30:00Z"
                },
                {
                    "id": "txn-011",
                    "amount": 5000,
                    "created_date": "2026-03-25T14:31:00Z"
                }
            ],
            "total_charged": 10000,
            "severity": "critical",
            "action": "Order was charged multiple times — refund duplicates"
        }
    ],
    "orphaned_transactions": [
        {
            "transaction_id": "txn-020",
            "amount_cents": 1500,
            "initiated_at": "2026-03-25T15:00:00Z",
            "action": "Create order manually or match to existing order"
        }
    ],
    "actions_taken": {
        "auto_linked": 38
    },
    "critical_issues": [
        {
            "type": "multiple_authorizations_same_order",
            "order_id": "order-005",
            "action": "Order was charged multiple times"
        }
    ]
}
```

---

## 6. EDGE CASES HANDLED

### 1. Double Submission Prevention

**Problem:** User clicks "Charge Card" twice, terminal receives payment twice

**Solution:**
- Audit logs every initiation attempt
- After first AUTHORIZED, UI blocks card button
- Reconciliation detects duplicate provider IDs → Critical alert
- Action: Refund duplicate charge

### 2. Reader Disconnect During Processing

**Problem:** Reader loses connection mid-transaction

**Captured:**
- status: "failed"
- failure_reason: "reader_disconnect"
- error_message: "Connection lost to reader"

**Reconciliation:** Checks if provider has authorization → if yes, transaction succeeded server-side but UI didn't know

### 3. Timeout During Card Tap

**Problem:** Customer too slow tapping card (>60 sec)

**Captured:**
- status: "timeout"
- failure_reason: "reader_timeout"
- error_message: "Card was not detected within 60 seconds"

**Reconciliation:** No charge occurred, safe to retry

### 4. Operator Never Creates Order After Auth

**Problem:** Terminal authorized but POS operator closed terminal without submitting order

**Captured:**
- Transaction status: "authorized"
- order_id: null
- reconciliation_note: "orphaned"

**Reconciliation Report:** Highlights orphaned transaction, operator email for investigation

### 5. Amount Mismatch (Rounding)

**Problem:** Transaction amount £29.99 (2999¢) but order total £30.00 (3000¢)

**Solution:**
- Store in cents (no floats)
- Reconciliation allows ±1 cent tolerance
- If >1 cent difference → error reported with delta

### 6. Network Error During Authorization

**Problem:** Terminal succeeded but network failure prevented response

**Captured:**
- Last known state: "processing"
- Waiting for provider reconciliation

**Reconciliation:** Call provider's API to check if payment exists

### 7. Multiple Orders at Same Time, Same Amount

**Problem:** Restaurant charged £50 to two customers at same second

**Reconciliation:**
- status: "ambiguous"
- multiple_candidates: [order-001, order-002]
- manual_review_required: true
- Operator must manually specify which order

### 8. Refund Without Audit Trail

**Problem:** Refund issued but no link back to original transaction

**Solution:**
- Refund entity should reference original transaction_id
- Reconciliation can trace refund back to charge
- No orphaned refunds

### 9. Reader Misconfiguration

**Problem:** Terminal configured with wrong amount limits

**Captured:**
- status: "failed"
- failure_reason: "configuration_error"
- error_message: "Amount exceeds terminal limit"

**Recovery:** Fix config, retry

### 10. Silent Failures (NO MORE)

**Before:** Some failures not logged  
**After:** Every attempt logged:
- INITIATED (before terminal)
- STATE_CHANGE (every state)
- ERROR (every failure)
- AUTHORIZED (every success)

No silent failures possible.

---

## 7. PRODUCTION CHECKLIST

### Pre-Launch

- [ ] TerminalTransaction entity created & accessible
- [ ] TerminalTransactionLog entity created & accessible
- [ ] terminal-audit.js imported in POSPayment
- [ ] logTerminalTransactionInitiated called before startPayment()
- [ ] logTerminalStateChange called in subscription
- [ ] logTerminalAuthorized called on AUTHORIZED
- [ ] logTerminalFailure called on all failures
- [ ] linkTransactionToOrder called after order creation
- [ ] reconcileTerminalTransactions backend function deployed
- [ ] Test: Authorize card → Check TerminalTransaction created
- [ ] Test: Decline card → Check failure_reason captured
- [ ] Test: Timeout → Check error_code captured
- [ ] Test: Reconciliation → Run function on sample data

### Live Operations

- [ ] Daily reconciliation run (scheduled job)
- [ ] Weekly report generation (orphaned/duplicates)
- [ ] Monthly audit of critical issues
- [ ] Chargeback handling references transaction audit
- [ ] Refund process includes transaction ID

---

## 8. EXAMPLE AUDIT TRAIL

```
Transaction: txn-uuid-001
Restaurant: rest-123
Amount: £29.99 (2999 ¢)
Operator: john@restaurant.com (John Doe)

2026-03-26 14:30:00Z - INITIATED
  Reader: Kitchen Terminal 1
  Provider: stripe
  Status: initiated

2026-03-26 14:30:05Z - STATE_CHANGE: initiated → awaiting_card
  Message: Terminal ready for card tap

2026-03-26 14:30:08Z - STATE_CHANGE: awaiting_card → processing
  Message: Card detected, processing

2026-03-26 14:30:12Z - STATE_CHANGE: processing → authorized
  Message: Payment authorized by terminal
  Provider Transaction: pi_abc123
  Duration: 12 seconds

2026-03-26 14:30:15Z - TRANSACTION_LINKED
  Linked Order: order-uuid-001
  Order Total: £29.99

2026-03-26 14:30:20Z - RECONCILIATION_CHECK
  Status: matched
  Note: Transaction matched to order by ID and amount
```

---

## 9. COMPLIANCE & DISPUTES

### Chargeback Dispute

Customer claims they weren't charged but account shows £50 debit:

**Query:** TerminalTransaction where order_id = null and amount_cents = 5000  
**Result:** Found orphaned transaction txn-999  
**Evidence:** Timestamp, operator email, provider transaction ID  
**Action:** Refund customer, investigate operator

### PCI Compliance

Auditor asks: "Trace every payment from initiation to settlement"

**Query:** TerminalTransaction where initiated_at > 2026-01-01  
**Response:** Complete audit trail showing:
- Every initiated payment
- Every state change
- Every failure reason
- Every success with provider ID
- Every link to order
- Every reconciliation result

No gap in traceability.

---

## 10. SUMMARY

✅ **Audit Trail:** Every transaction logged from initiation to completion  
✅ **Failure Logging:** Structured reasons for all failure modes  
✅ **No Silent Failures:** Every state change logged, every error captured  
✅ **Reconciliation:** Automatic detection of orphans, duplicates, mismatches  
✅ **Compliance:** Full traceability for disputes & audits  
✅ **Edge Cases:** All 10+ edge cases handled & logged