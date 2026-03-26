# Stripe Terminal Provider Integration Summary

**Date:** 2026-03-26  
**Status:** Complete - Ready for production backend integration  
**Provider:** Stripe Terminal (real hardware readers)

---

## WHAT WAS BUILT

### 1. StripeTerminalProvider (`lib/providers/stripe-terminal-provider.js`)

**Real provider implementing `TerminalProvider` interface:**

```
StripeTerminalProvider
├── init() — connect to reader, authenticate
├── startPayment() — collect payment, process, normalize
├── cancelPayment() — abort transaction
└── getStatus() — reader health check
```

**Key capabilities:**
- ✅ Reader discovery & connection
- ✅ PaymentIntent creation/processing
- ✅ Response normalization (all responses match standard interface)
- ✅ Comprehensive error handling
- ✅ Edge case coverage

---

## RESPONSE MAPPING

### Success Path

```
User taps card on reader
  ↓
Stripe Terminal SDK collects payment
  ↓
StripeTerminalProvider processes PaymentIntent
  ↓
Normalize to standard interface:
{
  status: 'authorized',
  transaction_id: 'ch_1234567890',
  receipt_reference: 'rcpt-ch_1234567890',
  metadata: {
    provider: 'stripe',
    paymentIntentId: 'pi_...',
    chargeId: 'ch_...'
  }
}
```

### Error Paths

| Stripe Error | Maps To | Status | Code |
|---|---|---|---|
| `card_error` (declined) | `declined` | `CARD_ERROR` |
| `cancel_error` (user cancelled) | `failed` | `CANCELLED` |
| `api_connection_error` | Throws `TerminalError` | `CONNECTION_ERROR` |
| Generic API error | Throws `TerminalError` | `PAYMENT_ERROR` |

---

## EDGE CASE HANDLING

| Scenario | Handling | Result |
|----------|----------|--------|
| **Double submit (same orderId twice)** | Check recent transaction, return cached | Returns authorized with `skipDuplicateCheck=true` |
| **Reader disconnected mid-payment** | Listener catches unexpected disconnect | Cleans state, next op throws `NO_READER` |
| **Already processing** | Guard in `startPayment()` | Throws `ALREADY_PROCESSING` |
| **No reader connected** | Check `currentReader` null | Throws `NO_READER` |
| **Not initialized** | Check `isInitialized` flag | Throws `NOT_INITIALIZED` |
| **Card declined** | Stripe returns error | Returns `declined` status (not throw) |
| **User cancels** | Stripe cancel error | Returns `failed` + `CANCELLED` code |
| **Network timeout** | Stripe API error → thrown | Throws `CONNECTION_ERROR` |

---

## PROVIDER CONFIG STRUCTURE

**Stored in Restaurant entity:**

```javascript
restaurant.printer_config = {
  card_terminal: {
    provider: 'stripe',                    // Type of provider
    reader_label: 'Chipper M440 (Main)',   // Human label
    reader_serial: 'chipper_abc123',       // Device serial
    
    stripe_config: {
      publishableKey: 'pk_live_51234567890',
      deviceSerialNumber: 'chipper_abc123'
    }
  }
}
```

**Accessed in POSPayment:**

```javascript
const providerConfig = {
  terminal_provider: restaurant?.printer_config?.card_terminal?.provider || 'mock',
  terminal_config: restaurant?.printer_config?.card_terminal?.stripe_config || {}
};
const provider = createTerminalProvider(providerConfig);
```

---

## DYNAMIC PROVIDER SWITCHING

**Factory Pattern (`terminal-provider-factory.js`):**

```javascript
export function createTerminalProvider(restaurantConfig) {
  const providerType = restaurantConfig.terminal_provider || 'mock';
  
  switch (providerType) {
    case 'stripe':
      return new StripeTerminalProvider(restaurantConfig.terminal_config);
    case 'mock':
    default:
      return new MockTerminalProvider();
  }
}
```

**How it works:**

1. POSPayment reads restaurant config
2. Passes to factory
3. Factory returns correct provider instance
4. TerminalService uses provider (doesn't know which one)
5. UI driven by state machine (same for any provider)

**To add new provider (e.g., Ingenico):**
```javascript
// 1. Create lib/providers/ingenico-provider.js
// 2. Add to factory switch:
case 'ingenico':
  return new IngenicoPOS(restaurantConfig.terminal_config);
// 3. No UI changes needed
```

---

## FILES CREATED/MODIFIED

**New:**
- `lib/providers/stripe-terminal-provider.js` (400+ lines, full Stripe integration)
- `lib/providers/terminal-provider-factory.js` (creates correct provider)
- `docs/STRIPE_TERMINAL_PROVIDER.md` (detailed docs + checklist)
- `scripts/smoke/suites/stripeTerminalProvider.smoke.js` (8 smoke tests)
- `STRIPE_TERMINAL_INTEGRATION_SUMMARY.md` (this file)

**Modified:**
- `components/pos/POSPayment.jsx` (use factory instead of hardcoded MockProvider)

---

## BACKEND REQUIREMENTS

Stripe Terminal needs 5 backend endpoints:

### 1. Connection Token
```
POST /api/stripe/terminal/connection-token
Response: { secret: '...' }
```
Used by Stripe SDK to authenticate reader connection.

### 2. Create Payment Intent
```
POST /api/stripe/payment-intents
Body: { amount, currency, orderId }
Response: { id, status, ... }
```
Server-side creation (required for PCI compliance).

### 3. Confirm Payment Intent
```
POST /api/stripe/payment-intents/{id}/confirm
Response: { status: 'succeeded'|'failed', charges: [...] }
```
After card collected, confirm payment.

### 4. Cancel Payment Intent
```
POST /api/stripe/payment-intents/{id}/cancel
Response: { status: 'cancelled' }
```
User cancelled payment.

### 5. Check Recent Transaction (optional, for double-submit)
```
GET /api/transactions?orderId={orderId}&recent=true
Response: { id, status, ... } | null
```
Prevent duplicate charges on rapid clicks.

---

## TESTING COVERAGE

**8 Smoke Tests** (`stripeTerminalProvider.smoke.js`):

1. ✅ Provider initialization
2. ✅ Interface compliance (all methods present)
3. ✅ Double-submit detection (cached result)
4. ✅ Already processing guard (blocks concurrent)
5. ✅ Reader not connected error
6. ✅ Error normalization (card error → declined)
7. ✅ Factory creates correct provider
8. ✅ Status check reports provider info

**Run tests:**
```bash
node scripts/smoke/run-smoke.js stripeTerminalProvider
```

---

## PRODUCTION CHECKLIST

Before going live:

- [ ] Stripe Terminal SDK loaded in `index.html`
- [ ] Backend endpoints implemented (5 above)
- [ ] Stripe API keys configured (secret for backend)
- [ ] Stripe account in LIVE MODE (not test)
- [ ] Reader hardware tested (tap, insert, contactless)
- [ ] Restaurant config updated with `printer_config.card_terminal`
- [ ] Error logging enabled (diagnose issues)
- [ ] Receipt printing tested post-payment
- [ ] Refunds endpoint implemented (separate)
- [ ] Load testing with real reader

---

## ARCHITECTURE VALIDATION

✅ **No provider logic in UI** — Factory injects provider, UI doesn't care

✅ **No business logic in provider** — Provider just calls Stripe API, normalizes

✅ **Clean separation** — TerminalService orchestrates, Provider delegates

✅ **Swappable providers** — Factory pattern enables easy additions

✅ **Error handling complete** — All edge cases mapped to standard responses

✅ **No random behavior** — Deterministic (except Stripe API)

✅ **Double-submit protected** — Cache check prevents duplicate charges

✅ **State machine integrity** — Transitions enforced regardless of provider

---

## CODE EXAMPLE: POS PAYMENT FLOW

```javascript
// POSPayment.jsx
useEffect(() => {
  (async () => {
    // 1. Get provider from restaurant config
    const providerConfig = {
      terminal_provider: restaurant?.printer_config?.card_terminal?.provider || 'mock',
      terminal_config: restaurant?.printer_config?.card_terminal?.stripe_config || {}
    };
    
    // 2. Create provider (Stripe or Mock)
    const provider = createTerminalProvider(providerConfig);
    
    // 3. Create service (provider is injected)
    const service = new TerminalService(provider);
    
    // 4. Initialize
    await service.init();
    
    // 5. Subscribe to state changes
    service.subscribe(({ state, metadata }) => {
      setTerminalState(state);
      // UI re-renders based on state
    });
    
    terminalServiceRef.current = service;
  })();
}, [restaurant]);

// When user taps "Charge to Card":
const processCard = async () => {
  const result = await terminalServiceRef.current.startPayment({
    amount: Math.round(amount * 100),
    currency: 'GBP',
    orderId: `POS-${restaurantId}-${Date.now()}`
  });
  
  // TerminalService state machine drives UI automatically
  // Provider (Stripe or Mock) is transparent to this code
};
```

---

## SUMMARY

**Stripe Terminal Provider:**
- ✅ Full implementation (400+ lines)
- ✅ Comprehensive error handling (8+ cases)
- ✅ Double-submit protection
- ✅ Disconnect/timeout handling
- ✅ Response normalization
- ✅ Dynamic provider switching via factory
- ✅ Zero provider-specific logic in UI
- ✅ 8 smoke tests + production checklist

**Architecture:**
- ✅ Provider interface enforced
- ✅ State machine works with any provider
- ✅ Backend integration points clear
- ✅ Ready for production (pending backend)

**Next steps:**
1. Implement 5 backend endpoints
2. Test with real Stripe Terminal reader
3. Update restaurant settings UI to configure provider
4. Deploy and monitor