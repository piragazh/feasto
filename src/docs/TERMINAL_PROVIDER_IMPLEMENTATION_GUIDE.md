# Terminal Provider Implementation Guide

## How to Add a Real Provider

This guide shows how to wire a real payment terminal (e.g., Stripe Terminal, SumUp) into the architecture.

---

## Step 1: Create Provider Function

**File:** `functions/processCardTerminal` (where placeholder exists)

**Example: Stripe Terminal**

```javascript
/**
 * Stripe Terminal Provider
 * 
 * Prerequisites:
 *   - npm install stripe
 *   - STRIPE_SECRET_KEY set in environment
 *   - Stripe Terminal reader created and registered
 *   - Reader location and device serial known
 */
async function processStripeTerminalProvider({ amount, transactionRef, terminal }) {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
        return {
            success: false,
            status: 'failed',
            transactionRef,
            amount,
            provider: 'stripe_terminal',
            error: 'Stripe API key not configured',
        };
    }

    try {
        // 1. Create a payment intent
        const intentResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${stripeKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'amount': Math.round(amount * 100), // Amount in pence
                'currency': 'gbp',
                'payment_method_types[]': 'card_present',
                'idempotency_key': transactionRef,
            }).toString(),
        });

        const intent = await intentResponse.json();

        if (!intent?.id) {
            return {
                success: false,
                status: 'failed',
                transactionRef,
                amount,
                provider: 'stripe_terminal',
                error: `Failed to create payment intent: ${intent?.error?.message}`,
            };
        }

        // 2. Instruct reader to process (simplified — real implementation more complex)
        const readerId = terminal.stripe_reader_id;
        const processResponse = await fetch(`https://api.stripe.com/v1/terminals/readers/${readerId}/process_payment_intent`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${stripeKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'payment_intent': intent.id,
            }).toString(),
        });

        const processResult = await processResponse.json();

        // 3. Poll for completion (or use webhook in production)
        // For now, assume completion based on response
        if (intent.status === 'succeeded' || processResult?.status === 'succeeded') {
            return {
                success: true,
                status: 'approved',
                transactionRef,
                amount,
                provider: 'stripe_terminal',
                terminal: terminal.reader_label || readerId,
                timestamp: new Date().toISOString(),
                providerRef: intent.id,
                message: 'Card approved via Stripe Terminal',
            };
        } else if (intent.status === 'requires_payment_method') {
            return {
                success: false,
                status: 'declined',
                transactionRef,
                amount,
                provider: 'stripe_terminal',
                error: 'Card declined',
            };
        } else {
            return {
                success: false,
                status: 'failed',
                transactionRef,
                amount,
                provider: 'stripe_terminal',
                error: `Payment intent status: ${intent.status}`,
            };
        }
    } catch (err) {
        console.error('[STRIPE-TERMINAL] Error:', err);
        return {
            success: false,
            status: 'failed',
            transactionRef,
            amount,
            provider: 'stripe_terminal',
            error: err.message,
        };
    }
}
```

---

## Step 2: Update Provider Router

**File:** `functions/processCardTerminal` (in `processTerminalWithProvider`)

**Before:**
```javascript
if (provider === 'stripe_terminal') {
    return await processStripeTerminalProvider({ amount, transactionRef, terminal });
}
```

Already in place! Just implement the function.

---

## Step 3: Set Environment Variable

```bash
# Add to your environment
export STRIPE_SECRET_KEY="sk_live_..."
```

---

## Step 4: Configure Terminal in Restaurant

**Update Restaurant.kiosk_config:**

```javascript
{
    "payment_card_enabled": true,
    "payment_counter_enabled": true,
    "card_terminal": {
        "provider": "stripe_terminal",
        "reader_id": "rdr_abc123...",
        "reader_label": "Main Counter Terminal",
        "stripe_reader_id": "rdr_stripe_..."
    }
}
```

---

## Step 5: Test with Smoke Suite

```bash
# Run terminal provider tests
node scripts/smoke/run-smoke.js --only terminalProviderArchitecture

# Run full kiosk card tests
node scripts/smoke/run-smoke.js --only kioskCardAuthTrust
```

---

## Step 6: Test with Real Card (Staging)

1. Deploy with real `STRIPE_SECRET_KEY`
2. Use Stripe test card in terminal
3. Verify `KioskTerminalTransaction` record created
4. Verify kiosk order created successfully
5. Check kitchen display shows order

---

## Provider Response Shape

All providers must return this normalized shape:

```javascript
{
    // Required
    success: boolean,                    // true if approved
    status: 'approved'|'declined'|'failed'|'timeout',
    transactionRef: string,              // original reference
    amount: number,                      // amount in GBP
    provider: string,                    // 'stripe_terminal', 'sumup', etc.
    terminal: string,                    // reader label
    timestamp: string,                   // ISO datetime
    
    // Optional
    error?: string,                      // if !success
    providerRef?: string,                // provider's transaction ID (for reconciliation)
    message?: string,                    // human-readable success message
}
```

---

## Handling Errors

Normalize provider-specific errors:

```javascript
// Stripe says "card_declined" → return status: 'declined'
// SumUp says "DECLINE" → return status: 'declined'
// Square says "TIMEOUT" → return status: 'timeout'
// Worldpay says "FAILED" → return status: 'failed'
```

---

## Idempotent Retries

If provider supports idempotency keys, always use `transactionRef`:

```javascript
const idempotencyKey = transactionRef; // Ensures safe retries
```

---

## Testing Checklist

- [ ] Provider function implements full interface
- [ ] Response shape matches required fields
- [ ] All status values (approved/declined/failed/timeout) tested
- [ ] Error handling for missing config
- [ ] Error handling for API failures
- [ ] Smoke tests pass
- [ ] kioskCreateOrder accepts approved transactions
- [ ] kioskCreateOrder rejects declined transactions
- [ ] KioskTerminalTransaction records written
- [ ] Test card works in staging
- [ ] Idempotent retry works (same transactionRef returns same result)

---

## Security Checklist

- [ ] API key in environment variable (never hardcoded)
- [ ] API responses validated (never trust provider blindly)
- [ ] Amount matched between request and response
- [ ] transactionRef unchanged in response
- [ ] No sensitive data logged (card numbers, tokens)
- [ ] Timeout configured (prevents hanging)
- [ ] DB record written before order created (atomic guard)

---

## Rollout Strategy

1. **Staging** — Deploy with real provider, test with test cards
2. **Production** — Enable for subset of terminals (10%)
3. **Monitor** — Watch error rates, response times
4. **Expand** — Roll out to all terminals (100%)
5. **Deprecate** — Disable mock provider after real provider stable

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Provider auth fails | Check API key in environment, check scope permissions |
| Timeout | Increase timeout, check network connectivity |
| Amount mismatch | Verify pence/pounds conversion (stripe uses pence, others use pounds) |
| Declined cards | Normal — test with Stripe test card if using Stripe |
| DB record not written | Check restaurant permissions, verify Restaurant.id in config |

---

## Real Providers Supported

Each provider has unique requirements. See separate implementation guides:
- [Stripe Terminal Implementation Guide](./STRIPE_TERMINAL_GUIDE.md)
- [SumUp Implementation Guide](./SUMUP_GUIDE.md)
- [Square Terminal Implementation Guide](./SQUARE_TERMINAL_GUIDE.md)
- [Worldpay POS Implementation Guide](./WORLDPAY_GUIDE.md)