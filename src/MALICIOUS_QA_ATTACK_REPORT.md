# Malicious QA: Checkout Payment System Attack Report

**Objective:** Force failures in the payment system by exploiting timing, state, and concurrency vulnerabilities.

**Risk Profile:** Production financial loss, duplicate charges, orphaned orders, stuck payments.

---

## ATTACK 1: Express Checkout Double-Confirmation via Rapid Tap

**Attack Scenario:**
1. User selects Apple Pay
2. Express Checkout element renders and wallet confirms (1st `onConfirm` fires)
3. Payment succeeds, `onSuccess(paymentIntentId)` called → triggers `handleStripeSuccess`
4. **BEFORE** `handleStripeSuccess` completes, user rapidly taps "Pay" button again
5. Second `onConfirm` fires (wallet permits re-tap in <100ms window)
6. Two concurrent `stripe.confirmPayment()` calls with same clientSecret

**Why It Breaks:**
- `expressConfirmFiredRef` is set to `true` at line 75 (ExpressCheckout.jsx), blocking second confirm
- BUT: `handleStripeSuccess` doesn't reset `expressConfirmFiredRef` after payment succeeds
- If handleStripeSuccess is slow (network delay to verifyAndCreateOrder), second onConfirm arrives before ref is reset
- Result: Two calls to `stripe.confirmPayment()` with same PI → second one may create duplicate charge attempt

**Vulnerable Code:**
```javascript
// ExpressCheckout.jsx:75
if (expressConfirmFiredRef) expressConfirmFiredRef.current = true;

// ... 100ms later in handleStripeSuccess() ...
// NO reset of expressConfirmFiredRef.current = false anywhere
```

**Why handleStripeSuccess Can't Reset It:**
- handleStripeSuccess sets `paymentSuccessHandledRef.current = true` (Checkout.jsx line ~something)
- But `expressConfirmFiredRef` lives in parent Checkout component, not in ExpressCheckout
- handleStripeSuccess can't access it to reset

**Impact:**
- Stripe may accept two confirmations in rapid succession (rate limit: ~1 per 30s, but under 100ms both fire synchronously)
- If Stripe permits, second PI confirms, triggering webhook
- Two orders created from same payment intent
- **Money Loss:** Double charge + one order will be refunded after manual review

**Root Cause:**
- `expressConfirmFiredRef` is passed down but never reset by parent
- No cross-component synchronization of confirm-fire state

**Exact Fix:**

In `pages/Checkout.jsx`, after `handleStripeSuccess` completes:

```javascript
const handleStripeSuccess = async (paymentIntentId) => {
    // ... existing code ...
    try {
        // ... createOrder() ...
    } finally {
        // CRITICAL: Reset so wallet tap is possible again (for retry scenarios)
        if (expressConfirmFiredRef) expressConfirmFiredRef.current = false;
    }
};
```

**OR** (Better): Move `expressConfirmFiredRef` to module-level in Checkout so it persists across component remounts:

```javascript
const expressConfirmFiredRef = useRef(false);  // Move to top of Checkout component
// Pass down to ExpressCheckout + reset after success
```

---

## ATTACK 2: Recovery Flow Creating Duplicate Order via Race Condition

**Attack Scenario:**
1. User payment succeeds (PI = `pi_123abc`)
2. pendingPayment.save() writes to sessionStorage
3. createOrder() starts but slow network (3s delay)
4. **BEFORE** createOrder() finishes, user refreshes page (Ctrl+R)
5. Checkout remounts, recovery flow detects pending payment
6. Recovery calls `recoverPayment()` with same PI + idempotencyKey
7. **Meanwhile**, slow original createOrder() finally returns (4s), also calls verifyAndCreateOrder
8. Both paths try to create order with SAME idempotencyKey

**Why It Breaks:**
- idempotencyKey is generated at render time in usePaymentInit: `ps_${Date.now()}_${random()}`
- When page reloads, new idempotencyKey is generated: `ps_${Date.now()}_${random()}` (different random)
- BUT: pendingPayment.save() captured the OLD idempotencyKey at time of payment success
- Recovery uses OLD key, but the slow createOrder() from before reload is STILL IN FLIGHT with original context
- If original createOrder() finally finishes AFTER recovery completes, it will try to create another order

**Example Timeline:**
```
T=0ms:   User clicks "Pay"
T=100ms: paymentIntentId = pi_123, idempotencyKey = ps_1000_abc123 
T=150ms: pendingPayment.save({ pi_123, idempotencyKey: ps_1000_abc123 })
T=200ms: createOrder(pi_123) invoked, makes HTTP call to verifyAndCreateOrder
T=500ms: (Network slow) createOrder request still in-flight
T=600ms: User refreshes page (Ctrl+R)
T=610ms: Checkout remounts, recovery detects pending payment
T=620ms: Recovery calls verifyAndCreateOrder with ({ pi_123, idempotencyKey: ps_1000_abc123 })
T=700ms: Original slow createOrder finally returns, ALSO calls verifyAndCreateOrder
         BOTH calls use SAME paymentIntentId + idempotencyKey
         **Order created twice if backend doesn't strictly enforce idempotency**
```

**Vulnerable Code:**
```javascript
// pages/Checkout.jsx: createOrder()
const createOrder = async (paymentIntentId = null) => {
    // ...
    const currentSessionKey = getSessionKey(); // Different on reload!
    await base44.functions.invoke('verifyAndCreateOrder', {
        orderData,
        paymentIntentId,
        idempotency_key: currentSessionKey  // NEW KEY post-reload
    });
};

// But recovery uses OLD idempotencyKey from pendingPayment:
// recoverPayment in functions/ uses pending.idempotencyKey (from before reload)
```

**Impact:**
- If backend idempotency check is timing-based (not truly atomic), both orders accepted
- Two orders in DB for single payment
- One refunded later
- **Money Loss:** Customer double-charged, admin manual cleanup required

**Root Cause:**
- idempotencyKey is session-based (changes on reload), but recovery replays old key
- No strict atomic idempotency in verifyAndCreateOrder (check lines in functions/)

**Exact Fix:**

In `functions/recoverPayment.js`, validate that the recovered order's idempotencyKey matches the recovered PI (prevent cross-contamination):

```javascript
export async function recoverPayment(req) {
    const { paymentIntentId, idempotencyKey, orderData } = JSON.parse(await req.text());
    
    // CRITICAL: Verify PI + idempotencyKey are uniquely bound
    const piRecord = await db.PaymentTransaction.filter({ 
        payment_intent_id: paymentIntentId 
    });
    
    if (piRecord?.idempotency_key && piRecord.idempotency_key !== idempotencyKey) {
        // Another recovery attempt with DIFFERENT idempotencyKey for same PI
        return { error: 'Idempotency key mismatch — possible replay attack' };
    }
    
    // Proceed with recovery...
}
```

Also: Make `verifyAndCreateOrder` strictly idempotent by using distributed lock:

```javascript
export async function verifyAndCreateOrder(req) {
    const { paymentIntentId, idempotency_key } = req;
    
    // Atomic lock: only ONE caller per idempotencyKey
    const lock = await acquireDistributedLock(`order_creation_${idempotency_key}`, 5000);
    if (!lock) return { error: 'Order creation in-flight, retry later' };
    
    try {
        // ... create order ...
    } finally {
        releaseDistributedLock(lock);
    }
}
```

---

## ATTACK 3: sessionStorage Corruption via Malicious Browser Extension

**Attack Scenario:**
1. Attacker installs browser extension (or app runs on compromised machine)
2. Extension modifies sessionStorage during checkout
3. Modifies `app_payment_active_session` to valid-looking key: `ps_1234567_xyz9999`
4. usePaymentInit checks: `if (otherTabSession && otherTabSession !== oldKey)` (line 223)
5. Extension's fake key ≠ real key → blocks legitimate session rotation
6. User's real payment gets stuck in stale session

**Why It Breaks:**
```javascript
// hooks/usePaymentInit.js:222-231
const otherTabSession = sessionStorage.getItem('app_payment_active_session');
if (otherTabSession && otherTabSession !== oldKey) {
    console.warn('[usePaymentInit] Another tab has active payment session...');
    return; // BLOCKS rotation
}
```

- No cryptographic validation of the key format
- Extension can inject any string that looks like `ps_1234567_xyz`
- If false positive, user's payment session hangs

**Vulnerable Code:**
- Line 222-236: Session key is just a string, not validated cryptographically

**Impact:**
- User payment hangs (session rotation blocked indefinitely)
- User must close tab / browser to recover
- Payment intent expires (10 min window)
- **Money Loss:** Potential duplicate charges if user retries in another tab

**Root Cause:**
- sessionStorage is globally writable by any code on the domain
- No validation of session key source

**Exact Fix:**

Add cryptographic signature to session key:

```javascript
function generateSessionKey() {
    const baseKey = `ps_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    // Sign with API signature — prevents forgery
    const signature = CryptoJS.SHA256(baseKey + CSRF_TOKEN).toString();
    return `${baseKey}.${signature.slice(0, 16)}`;
}

function validateSessionKey(key) {
    const [baseKey, sig] = key.split('.');
    const expectedSig = CryptoJS.SHA256(baseKey + CSRF_TOKEN).toString().slice(0, 16);
    return sig === expectedSig;
}

// In usePaymentInit:
const otherTabSession = sessionStorage.getItem('app_payment_active_session');
if (otherTabSession && !validateSessionKey(otherTabSession)) {
    // Invalid signature — ignore malicious entry
    sessionStorage.removeItem('app_payment_active_session');
}
```

---

## ATTACK 4: Address Modification Mid-Payment (clientSecret Mismatch)

**Attack Scenario:**
1. User enters delivery address: "123 Main St, London"
2. Zone check passes, payment form renders
3. User begins card entry (stripe.confirmPayment in progress)
4. **WHILE TYPING CARD**, user (or malicious script) changes address: "999 Hack Lane"
5. usePaymentInit fingerprint changes (line 158-201)
6. New PaymentIntent created with NEW address
7. Old clientSecret now orphaned
8. stripe.confirmPayment() confirms OLD PI with OLD address
9. verifyAndCreateOrder() runs with NEW address from formData
10. Address mismatch between PI metadata + Order record

**Why It Breaks:**
```javascript
// hooks/usePaymentInit.js:159-163
const deliveryAddress = orderType === 'delivery'
    ? (isExistingAddress ? (formData.delivery_address || '') : ...)
    : '';

// If formData.delivery_address changes → fingerprint changes → new PI created
// BUT: old confirm still in-flight with old PI
```

- StripePaymentForm is re-keyed when clientSecret changes (good!)
- BUT: If user confirms JUST BEFORE address change, the confirm is queued in Stripe
- Stripe doesn't validate address in PI metadata vs order address

**Vulnerable Code:**
```javascript
// pages/Checkout.jsx: createOrder()
const deliveryAddressString = orderType === 'delivery'
    ? sanitizeAddress(formData.delivery_address) // CURRENT address, not PI's
    : 'Address not provided';

// verifyAndCreateOrder receives formData.delivery_address (CURRENT)
// But PaymentIntent metadata has OLD address
// No validation that they match
```

**Impact:**
- Order created with different address than what user authorized in payment
- Potential fraud detection bypass (IP/address mismatch)
- Delivery to wrong location
- **Money Loss:** Refund dispute (customer claims wrong address), chargeback

**Root Cause:**
- PaymentIntent metadata address vs Order delivery_address not validated for equality

**Exact Fix:**

In `functions/verifyAndCreateOrder.js`, validate PI metadata matches order:

```javascript
export async function verifyAndCreateOrder(req) {
    const { paymentIntentId, orderData } = req;
    
    // Fetch PI from Stripe to get authorized address
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const authorizedAddress = pi.metadata?.delivery_address || '';
    
    // Validate order address matches PI metadata
    if (authorizedAddress && orderData.delivery_address !== authorizedAddress) {
        console.error('ADDRESS MISMATCH', { 
            authorized: authorizedAddress, 
            actual: orderData.delivery_address 
        });
        // Refund and reject
        await refundWithRetry(paymentIntentId, orderData.total);
        return { 
            error: 'Delivery address changed after authorization', 
            refunded: true 
        };
    }
    
    // Proceed...
}
```

---

## ATTACK 5: Webhook Arriving BEFORE Frontend createOrder Completes

**Attack Scenario:**
1. User clicks "Pay"
2. stripe.confirmPayment() succeeds locally, returns paymentIntentId
3. handleStripeSuccess() starts: `createOrder(paymentIntentId)`
4. HTTP call to verifyAndCreateOrder queued
5. **Meanwhile**, Stripe's webhook (payment_intent.succeeded) arrives at backend INSTANTLY
6. stripeWebhook handler processes webhook, calls createIdempotentOrder
7. Order is created via webhook handler BEFORE verifyAndCreateOrder completes
8. verifyAndCreateOrder returns, tries to create order AGAIN with same paymentIntentId

**Why It Breaks:**
```javascript
// functions/stripeWebhook.js (if it exists)
// Webhook arrives and calls createIdempotentOrder(paymentIntentId)

// Simultaneously, frontend's verifyAndCreateOrder also calls createIdempotentOrder
// Both have SAME paymentIntentId but DIFFERENT idempotencyKey (webhook won't have one)
```

- If idempotency check is based ONLY on paymentIntentId (not idempotencyKey), both succeed
- Two orders created

**Vulnerable Code:**
```javascript
// If verifyAndCreateOrder relies on paymentIntentId for dedup:
const existingOrder = await Order.filter({ payment_intent_id: paymentIntentId });
if (existingOrder.length > 0) return { order: existingOrder[0] };

// But webhook handler ALSO creates order with same PI
// Race: both check filter, both see 0 results, both insert
```

**Impact:**
- Duplicate order from single payment
- **Money Loss:** Double charge, manual refund

**Root Cause:**
- No atomic synchronization between webhook handler + frontend order creation
- Both use same dedup key (paymentIntentId) without locking

**Exact Fix:**

Use distributed lock keyed on paymentIntentId in BOTH paths:

```javascript
// functions/verifyAndCreateOrder.js
export async function verifyAndCreateOrder(req) {
    const { paymentIntentId } = req;
    
    // Atomic lock: only one path can create order per PI
    const lock = await acquireDistributedLock(`pi_${paymentIntentId}`, 10000);
    if (!lock) return { error: 'Order creation in-flight' };
    
    try {
        // Check again after acquiring lock
        const existing = await Order.filter({ payment_intent_id: paymentIntentId });
        if (existing.length > 0) return { order: existing[0], duplicate: true };
        
        // Create...
    } finally {
        releaseDistributedLock(lock);
    }
}

// functions/stripeWebhook.js (webhook handler)
// ALSO use same distributed lock
const lock = await acquireDistributedLock(`pi_${pi_id}`, 10000);
```

---

## ATTACK 6: Stale clientSecret Reuse via Fast Network Recovery

**Attack Scenario:**
1. User network goes offline during payment init
2. usePaymentInit calls createPaymentIntent, times out after 5s
3. clientSecret = null, user sees "Network error"
4. Network comes back online
5. User refreshes page
6. New createPaymentIntent call succeeds, NEW clientSecret issued
7. **BUT**: if old createPaymentIntent call's response arrives (late delivery), sessionStorage is overwritten
8. Old clientSecret stored alongside new idempotencyKey

**Why It Breaks:**
```javascript
// hooks/usePaymentInit.js:417-422
if (response?.data?.clientSecret) {
    checkoutTrace.log('create_payment_intent_succeeded', { piId: response.data.paymentIntentId });
    activeSecretFingerprintRef.current = currentFingerprint;
    setClientSecret(response.data.clientSecret);  // No timestamp validation
    setShowStripeForm(true);
}
```

- No timestamp validation on response
- Late response from old PI creation overwrites fresh clientSecret
- User now has stale PI bound to fresh idempotencyKey

**Vulnerable Code:**
- No nonce/version check on createPaymentIntent response

**Impact:**
- User confirms payment with stale PI
- Stripe rejects confirm (PI already used, or other PI's key)
- User sees error, retries
- Potential duplicate confirms if retries aren't rate-limited

**Root Cause:**
- createPaymentIntent response not versioned against active sessionKey

**Exact Fix:**

Include nonce in PI creation request + validate in response:

```javascript
// usePaymentInit.js
const activeSessionKey = sessionKeyRef.current;
const payload = {
    // ...
    idempotency_key: activeSessionKey,  // Already doing this
    // Add: version nonce
    request_nonce: `${activeSessionKey}_${Date.now()}`,
};

const response = await base44.functions.invoke('createPaymentIntent', payload);

// Validate response is for THIS session, not stale
if (response?.data?.request_nonce !== payload.request_nonce) {
    console.warn('Stale PI response discarded');
    return; // Don't apply clientSecret
}
```

---

## ATTACK 7: pendingPayment.save() Corrupted by Multiple Simultaneous Payments

**Attack Scenario:**
1. User opens checkout in 2 tabs (same session)
2. Tab A: Completes payment, calls pendingPayment.save({ pi_A, data_A })
3. Tab B: Completes payment at same millisecond, calls pendingPayment.save({ pi_B, data_B })
4. Both write to sessionStorage concurrently
5. Whichever write is last wins, overwriting the other
6. sessionStorage now has: `{ pi_B, data_A }` (mixed)
7. On recovery, system tries to recover with mismatched PI + order data

**Why It Breaks:**
```javascript
// lib/pendingPayment.js:37-50
save(payload) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...payload,
        savedAt: new Date().toISOString(),
        recovery_attempts: 0,
        recovery_status: 'replayable',
    }));
}
```

- sessionStorage.setItem is NOT atomic at JS level
- Two concurrent saves can interleave JSON stringification
- Browser's event loop may queue both writes, last one wins

**Vulnerable Code:**
- No mutex on pendingPayment writes
- sessionStorage is single-value (not a queue)

**Impact:**
- Order data mismatch (wrong items, wrong restaurant, wrong total)
- Recovery creates wrong order
- **Money Loss:** Wrong charge, manual correction required

**Root Cause:**
- pendingPayment uses single key, not a queue
- No versioning or locking

**Exact Fix:**

Use IndexedDB (transactional) instead of sessionStorage, or implement queue with versioning:

```javascript
// OPTION 1: Use IndexedDB (transactional)
export const pendingPayment = {
    async save(payload) {
        const db = await openDB('checkout');
        const tx = db.transaction('pendingPayments', 'readwrite');
        const store = tx.objectStore('pendingPayments');
        
        await store.put({
            id: payload.paymentIntentId, // Unique key
            ...payload,
            savedAt: new Date().toISOString(),
            recovery_status: 'replayable',
        });
        
        await tx.done;
    },
};

// OPTION 2: Add version + lock to sessionStorage
save(payload) {
    const version = Date.now();
    const record = {
        ...payload,
        version,
        savedAt: new Date().toISOString(),
    };
    
    const existing = this.read();
    if (existing && existing.version > version) {
        console.warn('Newer record exists, not overwriting');
        return; // Don't overwrite newer payment
    }
    
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}
```

---

## ATTACK 8: Rapid Coupon + Address + Payment Method Flips

**Attack Scenario:**
1. User applies coupon "SAVE10" (10% off)
2. **IMMEDIATELY** (same 100ms), user removes coupon
3. **SIMULTANEOUSLY**, user changes delivery address (triggers zone check + fee recalc)
4. **SIMULTANEOUSLY**, user switches from Card to Cash
5. All three state changes trigger usePaymentInit fingerprint updates
6. Fingerprint changes 3 times in 100ms
7. 3 separate PaymentIntents created at Stripe (one per fingerprint change)
8. All 3 clientSecrets returned
9. User confirms payment on clientSecret #2
10. Order created with address from change #3 + total from coupon state #1

**Why It Breaks:**
```javascript
// usePaymentInit.js:158-201
const currentFingerprint = useMemo(() => {
    // Recomputes if ANY dependency changes
    return buildPaymentFingerprint({
        // ...includes coupon state, address, payment method
    });
}, [
    paymentMethod,
    formData.delivery_address,
    discount,  // Coupon state
    // ... 20+ deps
]);

// Effect 2 (line 278-450) creates new PI whenever fingerprint changes
useEffect(() => {
    if (currentFingerprint !== activeSecretFingerprintRef.current) {
        // Create new PI...
    }
}, [currentFingerprint, ...]);
```

- Multiple rapid fingerprint changes = multiple PI creations
- Only the last clientSecret is shown to user
- But user may confirm middle PI (if UI lag)

**Vulnerable Code:**
- No debounce on fingerprint changes before creating PI
- All 3 PIs are created, charged, but only 1 order created

**Impact:**
- User charged for multiple PIs (2 phantom charges)
- Only 1 order created
- **Money Loss:** Duplicate charges (refund after 1-2 days)

**Root Cause:**
- No debounce / rate-limiting on PI creation

**Exact Fix:**

Debounce PI creation in usePaymentInit:

```javascript
// hooks/usePaymentInit.js
useEffect(() => {
    if (paymentMethod !== 'card') return;
    
    // Validation checks...
    if (!clientSecret || activeSecretFingerprintRef.current !== currentFingerprint) {
        // Debounce: wait 500ms for fingerprint to stabilize
        const timeoutId = setTimeout(() => {
            runInit();
        }, 500);
        
        return () => clearTimeout(timeoutId);
    }
}, [currentFingerprint, ...]);
```

Or: Batch multiple state changes into single render using `startTransition`:

```javascript
// pages/Checkout.jsx
const handleApplyCoupon = (coupon) => {
    startTransition(() => {
        setAppliedCoupons([...appliedCoupons, coupon]);
        // Multiple state updates batched into one render
    });
};
```

---

## ATTACK 9: WebhookEventLog Bypassed via Duplicate Event ID

**Attack Scenario:**
1. Attacker intercepts Stripe webhook (man-in-the-middle, or compromised network)
2. Webhook: `payment_intent.succeeded` for `pi_123` arrives
3. Backend processes, creates order via stripeWebhook handler
4. Order created successfully
5. Attacker re-sends SAME webhook with SAME event ID: `evt_123abc`
6. Backend checks WebhookEventLog for event ID
7. stripeWebhook should find existing record + skip processing
8. **BUT**: Attacker uses webhook timestamp from original (same Stripe_Signature)
9. Signature validates (attacker has no way to forge it, so webhook doesn't arrive twice)

**Alternative Attack: Attacker controls infrastructure, simulates Stripe webhook:**

**Attack Scenario (Alternative):**
1. Attacker compromises restaurant's webhook endpoint logs
2. Fetches original webhook payload + signature from logs
3. Replays same webhook payload + signature to endpoint
4. Endpoint validates signature (it matches, it's the original Stripe signature)
5. WebhookEventLog has event ID `evt_123`, but second request has SAME ID
6. Should be skipped, but if query is not strictly atomic, race condition

**Why It Breaks:**
```javascript
// functions/stripeWebhook.js (assumed implementation)
const existingLog = await WebhookEventLog.filter({ stripe_event_id: eventId });
if (existingLog.length > 0) return { duplicate: true };

// Race: two requests both check filter → both see 0 → both insert
await WebhookEventLog.create({ stripe_event_id: eventId, ... });
await createOrder(...);
```

- Check + insert is not atomic

**Vulnerable Code:**
- No distributed lock on event ID dedup

**Impact:**
- Duplicate order created from same webhook
- **Money Loss:** Double charge

**Root Cause:**
- WebhookEventLog dedup not atomic

**Exact Fix:**

Use distributed lock on event ID:

```javascript
// functions/stripeWebhook.js
export async function stripeWebhook(req) {
    const event = req.body;
    const eventId = event.id; // e.g., evt_123abc
    
    // Atomic check-and-insert
    const lock = await acquireDistributedLock(`webhook_${eventId}`, 5000);
    if (!lock) return { error: 'Webhook already processing' };
    
    try {
        const existing = await WebhookEventLog.filter({ stripe_event_id: eventId });
        if (existing.length > 0) {
            console.log('Duplicate webhook, skipping');
            return { duplicate: true };
        }
        
        // Insert first to prevent other processes from also checking
        await WebhookEventLog.create({ stripe_event_id: eventId, status: 'processing' });
        
        // Process webhook...
        await handlePaymentIntentSucceeded(event);
        
        // Mark complete
        await WebhookEventLog.update(eventId, { status: 'processed' });
    } finally {
        releaseDistributedLock(lock);
    }
}
```

---

## ATTACK 10: Session Key Collision via Clock Skew

**Attack Scenario:**
1. Device time is wrong (5 seconds behind actual time)
2. User A on device initiates payment, sessionKey = `ps_1704067200000_abc123`
3. Network latency: 2s delay
4. User B (same session, different tab) initiates payment while User A still in-flight
5. Device thinks it's still T=1704067200, generates sessionKey = `ps_1704067200000_def456` (same timestamp!)
6. Random suffix is different, but close enough
7. usePaymentInit collision detection (line 222-232) may not catch
8. Two PIs created with different idempotencyKeys but same fingerprint time
9. Both stored with overlapping session time

**Why It Breaks:**
```javascript
// hooks/usePaymentInit.js:101-103
function generateSessionKey() {
    return `ps_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// If Device.time is wrong, two calls within 1ms generate same timestamp
// Randomness saves us MOST of the time, but not if attacker controls sequence
```

- Date.now() can be the same across multiple rapid calls if system clock is slow
- Random suffix is only 7 chars (2.8M combinations), birthday paradox kicks in at ~1680 collisions expected

**Vulnerable Code:**
- sessionKey relies on Date.now() + weak random
- No cryptographic uniqueness guarantee

**Impact:**
- If two PIs get same idempotencyKey, Stripe's idempotency check treats second as retry of first
- Only first succeeds, second is rejected
- User sees error, retries
- Retry uses third idempotencyKey, succeeds
- First PI succeeded, first payment intent charged but no order (recovery detects)
- **Money Loss:** Phantom charge without order, recovery creates order later

**Root Cause:**
- Session key generation relies on timestamp precision + weak randomness
- No UUID-based generation

**Exact Fix:**

Use cryptographically strong UUID + timestamp:

```javascript
import { v4 as uuidv4 } from 'uuid';

function generateSessionKey() {
    // Format: ps_{timestamp}_{uuid}_{hash(csrf_token)}
    const uuid = uuidv4().replace(/-/g, '').slice(0, 12);
    const csrfHash = CryptoJS.SHA256(document.querySelector('[data-csrf]')?.value || '').toString().slice(0, 8);
    return `ps_${Date.now()}_${uuid}_${csrfHash}`;
}

// Validation: check format
function isValidSessionKey(key) {
    const pattern = /^ps_\d{13}_[0-9a-f]{12}_[0-9a-f]{8}$/;
    return pattern.test(key);
}
```

---

## Summary of Patches Required

| Attack | File | Line(s) | Severity | Fix Type |
|--------|------|---------|----------|----------|
| 1 | ExpressCheckout.jsx | 75, handleStripeSuccess | CRITICAL | Reset expressConfirmFiredRef after success |
| 2 | usePaymentInit.js, recoverPayment | 135-140 | CRITICAL | Distributed lock on idempotencyKey + PI binding validation |
| 3 | usePaymentInit.js | 222-236 | HIGH | Cryptographic signature on session key |
| 4 | verifyAndCreateOrder | create order | HIGH | Validate PI metadata vs Order address |
| 5 | verifyAndCreateOrder, stripeWebhook | order creation | CRITICAL | Distributed lock on paymentIntentId |
| 6 | usePaymentInit.js | 417-422 | HIGH | Nonce/version validation on PI response |
| 7 | pendingPayment.js | 37-50 | MEDIUM | Use IndexedDB or add versioning |
| 8 | usePaymentInit.js | 278-450 | MEDIUM | Debounce PI creation |
| 9 | stripeWebhook.js | webhook handler | CRITICAL | Distributed lock on event ID |
| 10 | usePaymentInit.js | 101-103 | MEDIUM | UUID-based session key |

---

## Release Hold

**DO NOT DEPLOY** until:
- [ ] All 10 attacks verified fixed
- [ ] Automated chaos tests added (matching each attack scenario)
- [ ] Load testing with concurrent payments (1000 concurrent)
- [ ] Webhook replay testing (duplicate webhook IDs)
- [ ] Clock skew testing (system time ±5 minutes)
- [ ] Full manual QA sign-off

All fixes require distributed lock infrastructure (Redis, DynamoDB, or database lock table).