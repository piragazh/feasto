# Terminal Provider Architecture Refactor — Audit & Roadmap

## Status: REFACTORED ✅

Replaced simulated card terminal with production-grade provider-based architecture.

---

## Part 1: Current Fake Terminal Dependencies

### Location: `functions/processCardTerminal`

**BEFORE (Lines 144-177 — REMOVED):**
```javascript
// ❌ FAKE LOGIC
async function processTerminalTransaction({ amount, terminal, transactionRef, provider }) {
    const processingDelayMs = 1500 + Math.random() * 2000;  // Random delay
    
    return new Promise((resolve) => {
        setTimeout(() => {
            const approved = Math.random() < 0.95;  // ❌ Math.random in production
            
            if (approved) {
                // Return fake approval
            } else {
                // Return fake decline (5% rate)
            }
        }, processingDelayMs);
    });
}
```

**Problems:**
1. ❌ **Math.random() in production path** — Non-deterministic, breaks tests
2. ❌ **Hardcoded 95% approval** — Not real-world, no provider abstraction
3. ❌ **Random delay** — No purpose, adds unpredictability
4. ❌ **No provider routing** — All providers use same fake logic
5. ❌ **No support for real providers** — Stripe, SumUp, Square, Worldpay commented out

### Callers of `processCardTerminal`:

| Component | Path | Line | Purpose |
|-----------|------|------|---------|
| KioskPayment | `components/kiosk/KioskPayment.jsx` | 195 | Initiates card payment |
| KioskPayment (backend) | (via `base44.functions.invoke`) | - | Routes through backend function |

### Depends On:

- `KioskTerminalTransaction` entity (for storing trusted records)
- `Restaurant` entity (for tenant validation)

### Downstream Consumers:

1. **kioskCreateOrder** — Validates approved transactions before order creation (line 221-300)
   - Looks up `KioskTerminalTransaction` by `transaction_ref`
   - Verifies `status === 'approved'`
   - Prevents double-redemption
   - **This validation STILL WORKS** — no changes needed

2. **KioskPayment UI** — Receives result and transitions state
   - Handles approved/declined/failed states
   - **UI unchanged** — still works with normalized response

---

## Part 2: New Architecture Added

### Files Created:

| File | Purpose | Type |
|------|---------|------|
| `lib/terminal/TerminalProvider.js` | Provider interface + states | Interface definition |
| `lib/terminal/MockTerminalProvider.js` | Deterministic mock for dev/test | Provider implementation |
| `lib/terminal/TerminalService.js` | Orchestrator (not used in Deno yet) | Service layer |
| `scripts/smoke/suites/terminalProviderArchitecture.smoke.js` | New test suite (9 tests) | Test coverage |

### Architecture Diagram:

```
┌─────────────────────────────────────────────────────────────┐
│                     processCardTerminal()                    │
│              (Deno serverless function)                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
         ┌───────────────────────────┐
         │ processTerminalWithProvider│
         │   (new router function)   │
         └────┬────────────────────┬─┘
              │                    │
    ┌─────────┴──────┐     ┌──────┴──────────┐
    │ Simulated      │     │ Real Providers  │
    │ (Deterministic)│     │ (TODO)          │
    └────┬───────────┘     └──────┬──────────┘
         │                        │
    processMockTerminal()    processStripeTerminalProvider()
    (no Math.random)        processSquareProvider()
    (input-driven)          processSumUpProvider()
                            processWorldpayProvider()

    ↓ (all return normalized response)
    
┌──────────────────────────────────────────┐
│ KioskTerminalTransaction record written  │
│ (trusted server-side evidence)           │
└──────────────────────────────────────────┘

    ↓ (kioskCreateOrder verifies via DB lookup)
    
┌──────────────────────────────────────────┐
│ Order created (card payment confirmed)   │
└──────────────────────────────────────────┘
```

---

## Part 3: Files Changed

### `functions/processCardTerminal` (REFACTORED)

**Changes:**
1. **Removed** `processTerminalTransaction()` — fake randomized function (Lines 122-178)
2. **Added** `processTerminalWithProvider()` — provider router
3. **Added** `processMockTerminal()` — deterministic mock
4. **Added** Placeholder functions for real providers (Stripe, SumUp, Square, Worldpay)

**Key improvements:**
- ✅ **No Math.random()** in production path
- ✅ **Deterministic behavior** — input controls output
- ✅ **Clear provider abstraction** — easy to add real providers
- ✅ **Marked non-production** — clear warnings on mock usage

**Response shape (unchanged):**
```javascript
{
    success: boolean,
    status: 'approved' | 'declined' | 'failed' | 'timeout',
    transactionRef: string,
    amount: number,
    provider: string,
    terminal: string,
    timestamp: string,
    error?: string
}
```

### `scripts/smoke/run-smoke.js`

**Changes:**
- Imported new test suite: `terminalProviderArchitecture`
- Registered in `SUITES` object
- Run with: `node scripts/smoke/run-smoke.js --only terminalProviderArchitecture`

---

## Part 4: Tests Added

### New Test Suite: `terminalProviderArchitecture.smoke.js` (9 tests)

| # | Test | Validates |
|---|------|-----------|
| 1 | `terminal_mock_default_approve` | Default scenario approves (deterministic) |
| 2 | `terminal_mock_writes_db_record` | Approved tx written to KioskTerminalTransaction |
| 3 | `terminal_mock_decline_scenario` | DECLINE_ prefix triggers decline |
| 4 | `terminal_mock_fail_scenario` | FAIL_ prefix triggers failure |
| 5 | `terminal_mock_timeout_scenario` | TIMEOUT_ prefix triggers timeout |
| 6 | `terminal_mock_magic_amount_decline` | Amount 6.66 triggers decline |
| 7 | `terminal_mock_magic_amount_fail` | Amount 9.99 triggers failure |
| 8 | `terminal_mock_deterministic` | No randomness — same input = same output |
| 9 | `terminal_mock_redeemable` | Approved tx passes kioskCreateOrder checks |
| 10 | `terminal_mock_declined_rejected` | Declined tx rejected by kioskCreateOrder |

**Run:**
```bash
node scripts/smoke/run-smoke.js --only terminalProviderArchitecture
```

**Expected output:**
```
✅ terminal_mock_default_approve
✅ terminal_mock_writes_db_record
✅ terminal_mock_decline_scenario
✅ terminal_mock_fail_scenario
✅ terminal_mock_timeout_scenario
✅ terminal_mock_magic_amount_decline
✅ terminal_mock_magic_amount_fail
✅ terminal_mock_deterministic
✅ terminal_mock_redeemable
✅ terminal_mock_declined_rejected
```

---

## Part 5: What Remains Before Wiring Real Providers

### Blocking Items:

| # | Item | Effort | Notes |
|---|------|--------|-------|
| 1 | **Stripe Terminal SDK** | Medium | Implement `processStripeTerminalProvider()` with Stripe SDK |
| 2 | **SumUp Integration** | Medium | Implement `processSumUpProvider()` with SumUp API |
| 3 | **Square Integration** | Medium | Implement `processSquareProvider()` with Square Terminal SDK |
| 4 | **Worldpay Integration** | Medium | Implement `processWorldpayProvider()` with Worldpay API |
| 5 | **Config per provider** | Small | Move provider config to Restaurant.kiosk_config |
| 6 | **Env var secrets** | Small | Store API keys in environment (STRIPE_API_KEY, etc.) |
| 7 | **Error handling** | Small | Normalize provider-specific errors to standard responses |
| 8 | **Retry logic** | Small | Handle idempotent retries for each provider |
| 9 | **Live testing** | Large | Test with real card terminals in staging |

### Deferred (Not Blocking):

- [ ] TerminalService.js (currently in lib/terminal, not used in Deno)
- [ ] MockTerminalProvider.js class (functionality inlined in processCardTerminal for Deno isolation)
- [ ] Provider registration system (placeholder comments ready)

---

## Part 6: Security Properties

| Property | Before | After |
|----------|--------|-------|
| **Production randomness** | ❌ Math.random in path | ✅ Deterministic behavior |
| **Test predictability** | ❌ Flaky (random outcomes) | ✅ Deterministic (input controls output) |
| **Provider abstraction** | ❌ None (all fake) | ✅ Clean interface |
| **Real provider support** | ❌ Hardcoded comments | ✅ Placeholder functions |
| **Trusted DB record** | ✅ Written | ✅ Still written |
| **kioskCreateOrder validation** | ✅ Checks DB record | ✅ Unchanged, still works |

---

## Part 7: Backward Compatibility

✅ **Full backward compatibility** — no changes to:
- `KioskPayment` UI component
- `kioskCreateOrder` function
- `KioskTerminalTransaction` entity
- Response shape or protocol

**Existing offline orders continue to work** — they use DB lookup, not terminal logic.

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Source of truth** | Hardcoded fake logic | Provider interface |
| **Randomness** | Math.random in production ❌ | Deterministic input-driven ✅ |
| **Provider routing** | None (all fake) | Clean router ✅ |
| **Real provider prep** | Commented stubs | Placeholder functions ✅ |
| **Test reliability** | Flaky (random) | Deterministic ✅ |
| **Trust chain** | Same | Still DB lookup ✅ |
| **Production ready** | No | For development/testing ✅ (not for live cards yet) |

---

## Next Steps

1. **Choose first real provider** (suggest Stripe Terminal)
2. **Implement `processStripeTerminalProvider()`** — ~2-3 hours
3. **Get Stripe Terminal SDK access** — 1-2 days approval
4. **Test with staging terminal** — 1 day integration
5. **Run full smoke suite** including new terminal tests
6. **Deploy to production** with real provider

**Timeline:** 1-2 weeks to first real provider live.