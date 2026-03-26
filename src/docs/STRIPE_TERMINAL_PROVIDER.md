# Stripe Terminal Provider Implementation

**Date:** 2026-03-26  
**Status:** Implemented - Ready for production integration  
**Provider:** Stripe Terminal (real hardware)

---

## 1. OVERVIEW

Real provider implementation for Stripe Terminal hardware readers (Verifone M440, Wisepad, etc.).

Maps Stripe Terminal API → standard `TerminalProvider` interface.
No provider-specific logic leaks to UI or TerminalService.

---

## 2. IMPLEMENTATION

**File:** `lib/providers/stripe-terminal-provider.js`

**Key features:**
- Connection token management
- Reader discovery & connection
- Payment intent creation/processing
- Edge case handling (double-submit, disconnect, timeout, cancel)
- Error normalization

---

## 3. INITIALIZATION

```javascript
import { StripeTerminalProvider } from '@/lib/providers/stripe-terminal-provider.js';

const provider = new StripeTerminalProvider({
  publishableKey: 'pk_live_...',
  deviceSerialNumber: 'chipper_abc123' // optional
});

await provider.init();
```

**Requirements:**
- Stripe Terminal SDK loaded in HTML: `<script src="https://js.stripe.com/terminal/v3/"></script>`
- Connection token endpoint available on backend
- Reader powered on and nearby

---

## 4. MAPPING LOGIC

### Payment Flow

```
UI: "Charge £10 to card"
  ↓
TerminalService.startPayment({ amount: 1000, currency: 'GBP', orderId: 'POS-123' })
  ↓
StripeTerminalProvider.startPayment()
  1. Check init/reader/processing state
  2. Double-submit check (recent transaction for same orderId?)
  3. Create PaymentIntent (server-side API call)
  4. Collect payment method via reader (terminal waits for card tap)
  5. Process PaymentIntent (server confirms)
  6. Normalize response:
     - status: 'authorized' (if succeeded)
     - transaction_id: charge ID
     - receipt_reference: receipt number
  ↓
TerminalService: State → AUTHORIZED
  ↓
UI re-renders (success screen)
```

### Error Mapping

Stripe errors → Standard format:

| Stripe Error | → | Standard Status | Error Code |
|---|---|---|---|
| `card_error` (declined) | `declined` | `CARD_ERROR` | Card was rejected |
| `cancel_error` | `failed` | `CANCELLED` | User cancelled |
| `api_connection_error` | Throw `TerminalError` | `CONNECTION_ERROR` | Lost connection |
| Generic API error | Throw `TerminalError` | `PAYMENT_ERROR` | Provider error |

---

## 5. EDGE CASE HANDLING

### Double Submit Protection

**Problem:** User taps "Charge £10" twice rapidly → could create 2 charges

**Solution:** Before creating new PaymentIntent, check if same orderId was just processed
```javascript
const recentTx = await this._checkRecentTransaction(orderId);
if (recentTx) {
  return recentTx; // Return cached result
}
```

### Reader Disconnected

**Problem:** Reader unplugs during payment

**Solution:** Unexpected disconnect listener catches event, cleans up state
```javascript
_handleReaderDisconnect() {
  this.currentReader = null;
  this.isProcessing = false;
  this.currentPaymentIntent = null;
}
```

### Already Processing

**Problem:** User starts 2nd payment before 1st completes

**Solution:** Guard in `startPayment()`
```javascript
if (this.isProcessing) {
  throw new TerminalError('A payment is already in progress', 'ALREADY_PROCESSING');
}
```

### Timeout Handling

Stripe Terminal SDK has built-in timeout. If user doesn't tap card in time:
- `collectPaymentMethod()` throws error
- Mapped to `PAYMENT_ERROR`
- TerminalService → FAILED state
- UI shows retry button

### Cancel During Processing

User clicks "Cancel" while payment in flight:
```javascript
await cancelPayment()
  ↓
stripeTerminal.cancelCollectPaymentMethod()  // Stop reader from waiting
await _cancelPaymentIntent(id)                 // Cancel PaymentIntent server-side
isProcessing = false
```

---

## 6. RESTAURANT CONFIGURATION

**Stored in Restaurant entity:**

```javascript
restaurant.printer_config = {
  card_terminal: {
    provider: 'stripe',           // 'stripe' | 'mock'
    reader_label: 'Chipper M440', // Human-readable
    reader_serial: 'chipper_abc123',
    
    // Provider-specific config
    stripe_config: {
      publishableKey: 'pk_live_...',
      deviceSerialNumber: 'chipper_abc123'
    }
  }
}
```

**Factory resolves provider:**
```javascript
import { createTerminalProvider } from '@/lib/providers/terminal-provider-factory.js';

const provider = createTerminalProvider(restaurant.printer_config?.card_terminal);
// Returns StripeTerminalProvider if provider='stripe'
// Returns MockTerminalProvider if not set or provider='mock'
```

---

## 7. DYNAMIC PROVIDER SWITCHING

**POSPayment component:**

```javascript
// Get provider from restaurant config
const provider = createTerminalProvider(restaurant.printer_config?.card_terminal);

// Initialize service (provider is injected, not hardcoded)
const service = new TerminalService(provider);
await service.init();

// Rest of code unchanged — UI doesn't care which provider
// State machine works the same regardless of backend provider
```

**Adding a new provider later (e.g., Ingenico):**
1. Create `lib/providers/ingenico-provider.js` (implements `TerminalProvider` interface)
2. Add to factory:
   ```javascript
   case 'ingenico':
     return new IngenicoPOS(providerConfig);
   ```
3. No UI changes needed

---

## 8. BACKEND INTEGRATION

**Stripe Terminal requires backend endpoints:**

### 1. Connection Token (required by SDK)
```
POST /api/stripe/terminal/connection-token
Response: { secret: '...' }
```

### 2. Create Payment Intent
```
POST /api/stripe/payment-intents
Body: { amount, currency, orderId }
Response: { id, status, ... }
```

### 3. Confirm Payment Intent
```
POST /api/stripe/payment-intents/{id}/confirm
Response: { status: 'succeeded'|'failed', charges: [...] }
```

### 4. Cancel Payment Intent
```
POST /api/stripe/payment-intents/{id}/cancel
Response: { status: 'cancelled' }
```

### 5. Check Recent Transaction (double-submit check)
```
GET /api/transactions?orderId={orderId}&recent=true
Response: { id, status, ... } | null
```

---

## 9. ERROR HANDLING COVERAGE

| Scenario | Handled | Result |
|----------|---------|--------|
| Reader not found | ✅ | `READER_NOT_FOUND` error |
| Reader disconnected mid-payment | ✅ | State cleaned, `FAILED` on next op |
| Double submit same orderId | ✅ | Return cached transaction |
| Payment already in progress | ✅ | `ALREADY_PROCESSING` error |
| Card declined | ✅ | `declined` status |
| User cancels (taps X) | ✅ | `CANCELLED` code |
| Network timeout | ✅ | `CONNECTION_ERROR` thrown |
| Stripe API rate limit | ✅ | `RATE_LIMITED` thrown |
| No reader connected | ✅ | `NO_READER` error |
| Terminal not initialized | ✅ | `NOT_INITIALIZED` error |

---

## 10. TESTING

### Unit Test: Success Path
```javascript
const provider = new StripeTerminalProvider();
await provider.init();

const result = await provider.startPayment({
  amount: 1000,
  currency: 'GBP',
  orderId: 'TEST-001'
});

expect(result.status).toBe('authorized');
expect(result.transaction_id).toBeDefined();
```

### Unit Test: Decline
```javascript
// Stripe mock or test card 4000000000000002 (always declines)
const result = await provider.startPayment({ ... });
expect(result.status).toBe('declined');
expect(result.error_code).toBe('CARD_ERROR');
```

### Integration Test: Double Submit
```javascript
// First request
const r1 = await provider.startPayment({ orderId: 'ORDER-123' });
expect(r1.status).toBe('authorized');

// Second request (same orderId)
const r2 = await provider.startPayment({ orderId: 'ORDER-123' });
expect(r2.status).toBe('authorized');
expect(r2.metadata.skipDuplicateCheck).toBe(true); // Cached
```

---

## 11. PRODUCTION CHECKLIST

Before going live:

- [ ] Stripe Terminal SDK loaded in HTML (index.html)
- [ ] Backend endpoints implemented (connection token, payment intents, cancel)
- [ ] Stripe API keys configured (secret key for backend)
- [ ] Stripe account in live mode (not test)
- [ ] Reader hardware tested (tap, insert, contactless)
- [ ] Restaurant config updated: `printer_config.card_terminal`
- [ ] Error logging configured (to diagnose issues)
- [ ] Receipts printed after successful payment
- [ ] Refunds tested (separate backend endpoint)

---

## 12. CONFIG EXAMPLE

**In restaurant settings:**

```javascript
// Settings form saves to restaurant entity
restaurant.printer_config = {
  // ... other printer config ...
  
  card_terminal: {
    provider: 'stripe',
    reader_label: 'Chipper M440 (Main Counter)',
    reader_serial: 'chipper_abc123',
    stripe_config: {
      publishableKey: 'pk_live_51234567890',
      deviceSerialNumber: 'chipper_abc123'
    }
  }
}
```

**How POS uses it:**

```javascript
// From POSPayment.jsx
const terminalConfig = restaurant.printer_config?.card_terminal;
const provider = createTerminalProvider(terminalConfig);
const service = new TerminalService(provider);
await service.init();
// Ready to accept card payments
```

---

## 13. FUTURE: MULTIPLE PROVIDERS

Current design supports adding more:
- Ingenico
- PAX
- Square Terminal
- etc.

Each would:
1. Implement `TerminalProvider` interface
2. Be added to factory `switch` statement
3. Have own config schema in `getProviderConfigSchema()`
4. No changes to UI or TerminalService

---

## Summary

**Stripe Terminal Provider:**
- ✅ Full error handling + edge case coverage
- ✅ Double-submit protection
- ✅ Unexpected disconnect handling
- ✅ Complete response normalization
- ✅ No provider logic in UI
- ✅ Dynamic provider switching via config
- ✅ Ready for production integration