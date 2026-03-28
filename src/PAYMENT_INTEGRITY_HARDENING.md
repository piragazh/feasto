# Production-Safe Payment Integrity Hardening Implementation

**Scope:** Exactly-once order creation, atomic webhook deduplication, stale payment detection, frontend request versioning, robust confirmation guards.

---

## Files to Change

### Backend Changes

1. **entities/PaymentTransaction.json** - Add unique constraint on `payment_intent_id`
2. **entities/WebhookEventLog.json** - Add unique constraint on `stripe_event_id`
3. **entities/Order.json** - Add unique constraint on `payment_intent_id` + `idempotency_key`
4. **functions/verifyAndCreateOrder** - Already implements core logic; add payment fingerprint validation
5. **functions/createPaymentIntent** - Add request version nonce to PI metadata
6. **functions/stripeWebhook** - Atomic event dedup + webhook-to-order convergence
7. **functions/recoverPayment** - Validate recovery idempotency + fingerprint

### Frontend Changes

1. **hooks/usePaymentInit.js** - Add request version nonce, fingerprint validation, PI init debounce
2. **pages/Checkout.jsx** - Add confirm guards (`confirmInFlightRef`, `paymentHandledRef`), terminal ref handling
3. **components/checkout/StripePaymentForm.jsx** - Add submit dedup guard
4. **components/checkout/ExpressCheckout.jsx** - Add explicit confirmation guard
5. **lib/pendingPayment.js** - Minimal sessionStorage (PI ID only, no totals)

---

## Schema Changes

### PaymentTransaction.json
Add unique constraint on `payment_intent_id` (database-level):

```sql
CREATE UNIQUE INDEX idx_payment_transaction_pi_id ON PaymentTransaction(payment_intent_id)
WHERE payment_intent_id IS NOT NULL;
```

### WebhookEventLog.json
Add unique constraint on `stripe_event_id`:

```sql
CREATE UNIQUE INDEX idx_webhook_event_log_id ON WebhookEventLog(stripe_event_id);
```

### Order.json
Add composite unique constraint:

```sql
CREATE UNIQUE INDEX idx_order_pi_idempotency ON Order(payment_intent_id, idempotency_key)
WHERE payment_intent_id IS NOT NULL AND idempotency_key IS NOT NULL;
```

---

## Core Changes by Component

### 1. Payment Fingerprint Generation (Server-Authoritative)

**Purpose:** Detect stale PI + prevent address/cart/fee changes from being applied to old PI.

**Implementation (in verifyAndCreateOrder):**

```javascript
// Generate server-authoritative fingerprint from ORDER DATA
function generatePaymentFingerprint(orderData, restaurant) {
    const items = (orderData.items || [])
        .map(i => `${i.menu_item_id}:${i.quantity}:${Number(i.price).toFixed(2)}`)
        .sort()
        .join('|');
    
    const address = orderData.order_type === 'delivery'
        ? `${orderData.delivery_address}:${orderData.delivery_coordinates?.lat}:${orderData.delivery_coordinates?.lng}`
        : 'collection';
    
    return [
        `items:${items}`,
        `addr:${address}`,
        `type:${orderData.order_type}`,
        `restaurant:${orderData.restaurant_id}`,
        `subtotal:${Number(orderData.subtotal || 0).toFixed(2)}`,
        `fee:${Number(orderData.delivery_fee || 0).toFixed(2)}`,
        `scheduled:${orderData.is_scheduled ? orderData.scheduled_for : 'no'}`,
    ].join('__');
}

// Store fingerprint in PI metadata during creation
const piMetadata = {
    restaurant_id: restaurantId,
    order_type: orderType,
    address: fullAddress,
    fingerprint: fingerprint,  // Full fingerprint as dedup key
    total_pence: Math.round(total * 100),
};

// In verifyAndCreateOrder, validate PI fingerprint matches order data
const serverFingerprint = generatePaymentFingerprint(orderData, restaurant);
if (paymentIntent.metadata?.fingerprint && paymentIntent.metadata.fingerprint !== serverFingerprint) {
    console.error(`[verifyAndCreateOrder] Stale PI detected. PI fingerprint=${paymentIntent.metadata.fingerprint} but current=${serverFingerprint}`);
    await compensate('payment_fingerprint_validation', 'STALE_PAYMENT_INTENT', 'Address or items changed after payment authorization');
    return { error: 'Payment authorization expired due to cart/address changes. Please start a new checkout.', success: false, code: 'STALE_PAYMENT_INTENT' };
}
```

### 2. Request Versioning (Frontend → Backend)

**Purpose:** Reject late PI init responses that arrive after fingerprint has rotated.

**Implementation (in createPaymentIntent):**

```javascript
// Frontend generates request nonce
const requestNonce = `${sessionKey}_${Date.now()}`;

// Backend stores nonce in PI metadata
const piMetadata = {
    request_nonce: requestNonce,  // Versioning key
    ...otherMetadata
};

// Frontend validates response nonce matches request
const activeSessionKey = sessionKeyRef.current;
const responseNonce = response?.data?.request_nonce;
if (responseNonce !== `${activeSessionKey}_${/* timestamp from response */}`) {
    console.warn('Late PI response discarded — session has rotated');
    return;  // Ignore stale response
}
```

### 3. Atomic Webhook Deduplication

**Purpose:** Only process Stripe webhook event once, ever.

**Implementation (in stripeWebhook):**

```javascript
// 1. Write to WebhookEventLog FIRST (with unique constraint)
try {
    await base44.asServiceRole.entities.WebhookEventLog.create({
        stripe_event_id: event.id,  // UNIQUE
        event_type: event.type,
        status: 'processing',
        processed_at: new Date().toISOString(),
        details: { ...event },
    });
} catch (duplicateErr) {
    // Unique constraint violation = duplicate webhook
    console.log(`[stripeWebhook] Duplicate event ignored: ${event.id}`);
    return Response.json({ status: 200, duplicate: true });
}

// 2. Process event (order creation, refunds, etc.)
// If this crashes, the log entry stays as 'processing' so manual review is possible

// 3. Update status to 'processed' after success
await base44.asServiceRole.entities.WebhookEventLog.update(
    logEntry.id,
    { status: 'processed', details: { ...event, result: successResult } }
);
```

### 4. Frontend Confirmation Guards

**Purpose:** Prevent double-confirm, double-click, double-submit across all payment flows.

**Implementation (in Checkout.jsx):**

```javascript
// Top-level refs (persist across component remounts)
const confirmInFlightRef = useRef(false);         // Prevent concurrent confirms
const paymentSuccessHandledRef = useRef(false);   // Prevent duplicate success handling
const paymentHandledRef = useRef(false);          // Terminal flag: never process payment again

const handleStripeSuccess = async (paymentIntentId) => {
    // Guard 1: Already handled success?
    if (paymentSuccessHandledRef.current) {
        console.warn('[Checkout] Payment success already handled');
        return;
    }
    paymentSuccessHandledRef.current = true;
    
    // Guard 2: Already in-flight?
    if (confirmInFlightRef.current) {
        console.warn('[Checkout] Confirm already in-flight');
        return;
    }
    confirmInFlightRef.current = true;
    
    // Guard 3: Terminal success?
    if (paymentHandledRef.current) {
        console.warn('[Checkout] Payment already processed');
        return;
    }
    
    try {
        await createOrder(paymentIntentId);
        paymentHandledRef.current = true;  // TERMINAL: Never reset this
    } finally {
        // NOTE: Do NOT reset paymentSuccessHandledRef — keep it true forever
        confirmInFlightRef.current = false;  // Only reset in-flight, not success flag
    }
};

// Handle form submit (cash payment)
const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Guard: Double-click on "Place Order" button
    if (confirmInFlightRef.current) {
        console.warn('[Checkout] Form submit already in-flight');
        return;
    }
    confirmInFlightRef.current = true;
    
    if (paymentHandledRef.current) {
        console.warn('[Checkout] Order already placed');
        return;
    }
    
    try {
        await createOrder();
        paymentHandledRef.current = true;
    } finally {
        confirmInFlightRef.current = false;
    }
};
```

### 5. Debounced PI Initialization

**Purpose:** Prevent 3 PIs from being created when user rapidly changes coupon + address + payment method.

**Implementation (in usePaymentInit.js):**

```javascript
// In Effect 2, wrap runInit() in debounce
useEffect(() => {
    if (paymentMethod !== 'card') return;
    
    // ... pre-flight validation ...
    
    // Already have valid clientSecret for this fingerprint
    if (clientSecret && activeSecretFingerprintRef.current === currentFingerprint) {
        return;
    }
    
    // DEBOUNCE: wait 300ms for fingerprint to stabilize
    const timeoutId = setTimeout(() => {
        if (paymentInitInFlightRef.current) return;
        runInit();
    }, 300);
    
    return () => clearTimeout(timeoutId);
}, [currentFingerprint, zoneCheckComplete]);
```

### 6. Minimal SessionStorage Recovery

**Purpose:** Store only PI ID + metadata, never trust totals/address from sessionStorage.

**Implementation (in lib/pendingPayment.js):**

```javascript
export const pendingPayment = {
    save(payload) {
        // Store ONLY what we need to recover: PI ID + server-authoritative metadata
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            paymentIntentId: payload.paymentIntentId,
            idempotencyKey: payload.idempotencyKey,
            recoveryToken: payload.recoveryToken,  // Opaque token for server to validate recovery
            savedAt: new Date().toISOString(),
            recovery_attempts: 0,
            recovery_status: 'replayable',
        }));
        // DO NOT store: orderData, totals, address, cart items
    },

    read() {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // Validate minimum required fields
        if (!parsed?.paymentIntentId?.startsWith('pi_')) return null;
        return parsed;
    },
};

// In recovery handler (functions/recoverPayment):
export async function recoverPayment(req) {
    const { paymentIntentId, idempotencyKey, recoveryToken } = req;
    
    // Validate recovery token (server-signed)
    const expectedToken = crypto.hmac('sha256', SECRET_KEY, `${paymentIntentId}_${idempotencyKey}`);
    if (recoveryToken !== expectedToken) {
        return { error: 'Invalid recovery token', success: false };
    }
    
    // DO NOT use any sessionStorage data except PI ID + idempotency key
    // Fetch authoritative order data from Stripe + PaymentTransaction
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const orderData = reconstructOrderFromStripeMetadata(pi);  // Server-authoritative
    
    // Call verifyAndCreateOrder with reconstructed data
    await verifyAndCreateOrder(req, { orderData, paymentIntentId, idempotency_key: idempotencyKey });
}
```

---

## Test Cases

### Test 1: Frontend + Webhook Race

**Scenario:** Payment succeeds. Frontend calls createOrder. Webhook arrives simultaneously.

**Expected:** Exactly one order created, dedup flag prevents duplicate.

**Test:**
```javascript
// Simulate concurrent calls
const pi_id = 'pi_test123';
const idempotency_key = 'ps_1234567_abc123';

// Frontend calls verifyAndCreateOrder
const frontend = base44.functions.invoke('verifyAndCreateOrder', {
    paymentIntentId: pi_id,
    idempotency_key,
    orderData: {...}
});

// Webhook also calls verifyAndCreateOrder (via stripeWebhook handler)
const webhook = handlePaymentIntentSucceeded(event, { paymentIntentId: pi_id, ... });

const [frontendResult, webhookResult] = await Promise.all([frontend, webhook]);

assert(frontendResult.success === true);
assert(webhookResult.success === true);
assert(frontendResult.order_id === webhookResult.order_id);  // Same order
assert(await Order.count({payment_intent_id: pi_id}) === 1);   // Only one order
```

### Test 2: Duplicate Webhook Delivery

**Scenario:** Stripe sends same webhook event twice (network retry, race condition).

**Expected:** Second webhook is ignored, order not duplicated.

**Test:**
```javascript
const event = { id: 'evt_test123', type: 'payment_intent.succeeded', data: {...} };

// First webhook
const result1 = await stripeWebhook(event);
assert(result1.success === true);
assert(result1.duplicate === false);

// Second webhook (same event.id)
const result2 = await stripeWebhook(event);
assert(result2.duplicate === true);  // Recognized as duplicate

// Order count unchanged
assert(await Order.count({payment_intent_id: pi_id}) === 1);
```

### Test 3: Stale ClientSecret Late Response Overwrite

**Scenario:** User changes address mid-payment. Old PI response arrives after session key rotation.

**Expected:** Stale response rejected, fresh PI used.

**Test:**
```javascript
// Initial sessionKey = ps_1000_abc, create PI
const nonce1 = `ps_1000_abc_${Date.now()}`;
const pi1 = await createPaymentIntent({..., request_nonce: nonce1});
assert(pi1.clientSecret === 'pi_secret_1');

// User changes address → fingerprint changes → new sessionKey = ps_1001_def
// New PI created
const nonce2 = `ps_1001_def_${Date.now()}`;
const pi2 = await createPaymentIntent({..., request_nonce: nonce2});
assert(pi2.clientSecret === 'pi_secret_2');

// OLD response from pi1 arrives late
// Frontend rejects it because response.request_nonce !== nonce2
// clientSecret remains pi_secret_2 (fresh)
```

### Test 4: Cart/Address Change During Payment

**Scenario:** Items removed + address changed after PI created. User confirms payment.

**Expected:** Order creation fails with stale PI error, payment refunded.

**Test:**
```javascript
// Create PI for cart: [item1, item2], address: "123 Main"
const pi = await createPaymentIntent({
    items: [{...}, {...}],
    delivery_address: "123 Main",
});

// Change cart + address in UI
// Try to confirm payment with OLD PI but NEW orderData
const result = await verifyAndCreateOrder({
    paymentIntentId: pi.id,
    orderData: {
        items: [{...}],  // Item2 removed
        delivery_address: "999 Hack Lane",
    }
});

assert(result.success === false);
assert(result.code === 'STALE_PAYMENT_INTENT');
// Payment refunded automatically
assert(pt.status === 'refunded');
```

### Test 5: Double Click / Double Confirm

**Scenario:** User clicks "Pay" button twice rapidly.

**Expected:** Only one order created. Second click ignored.

**Test:**
```javascript
const form = document.querySelector('form');
const button = form.querySelector('button[type="submit"]');

// Simulate double-click
button.click();
button.click();  // Second click within 100ms

// Check: confirmInFlightRef prevents second confirm from reaching backend
// Only one order in DB
assert(await Order.count() === 1);
```

### Test 6: Recovery Retry After Refresh

**Scenario:** Payment succeeds. User refreshes before order created. Recovery runs on reload.

**Expected:** Same order not duplicated on retry.

**Test:**
```javascript
// Initial: PI succeeds, order creation slow, refresh happens
const pending = pendingPayment.read();
assert(pending.paymentIntentId === 'pi_test123');

// On reload, recovery runs
const recovered = await recoverPayment({
    paymentIntentId: pending.paymentIntentId,
    idempotencyKey: pending.idempotencyKey,
});

assert(recovered.success === true);
assert(await Order.count({payment_intent_id: 'pi_test123'}) === 1);

// Second recovery (user refreshes again)
const recovered2 = await recoverPayment({...});
assert(recovered2.duplicate === true);  // Recognized as retry
assert(await Order.count() === 1);  // Still one order
```

---

## Deployment Checklist

- [ ] Apply schema migrations (unique constraints on payment_intent_id, stripe_event_id)
- [ ] Deploy updated verifyAndCreateOrder (payment fingerprint validation)
- [ ] Deploy updated createPaymentIntent (request nonce versioning)
- [ ] Deploy updated stripeWebhook (atomic event dedup)
- [ ] Deploy updated recoverPayment (recovery token validation)
- [ ] Deploy updated usePaymentInit (debounce, request nonce)
- [ ] Deploy updated Checkout.jsx (confirmation guards)
- [ ] Deploy updated ExpressCheckout (explicit guard)
- [ ] Deploy updated pendingPayment (minimal storage)
- [ ] Run full test suite (6 test cases above)
- [ ] Monitor FailureLog for stale PI rejections (should be rare)
- [ ] Monitor WebhookEventLog for duplicate events (expected to be non-zero)
- [ ] Verify no duplicate orders in production (query: Order.count by payment_intent_id, max=1)

---

## Monitoring & Alerts

1. **Stale PI Detections:**
   - Query: `FailureLog.count({ failure_type: 'STALE_PAYMENT_INTENT' })`
   - Alert if > 5 per day (indicates address/cart changes mid-payment)

2. **Duplicate Webhooks:**
   - Query: `WebhookEventLog.count({ status: 'duplicate_ignored' })`
   - Expected: non-zero (Stripe retries happen). Alert if > 100 per day.

3. **Double-Compensation Attempts:**
   - Query: `PaymentTransaction.count({ status: 'refunded' }) where attempts > 1`
   - Should be 0 (logic prevents double-compensation)

4. **Order Dedup Hits:**
   - Query: `responses.count({ duplicate: true })`
   - Expected: some (recovery retries, webhook retries)

---

## Production Rollout Strategy

**Phase 1: Monitoring** (1 week)
- Deploy code with new validation
- Monitor FailureLog for validation failures
- No breaking changes yet

**Phase 2: Enforcement** (1 week)
- Ensure unique constraints are in place (DB-level)
- Enable refunds for stale PI detections
- Monitor duplicate orders (should drop to 0)

**Phase 3: Retirement** (ongoing)
- Monitor for any regressions
- Tune fingerprint sensitivity if false positives occur