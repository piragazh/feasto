# Stripe Terminal — Quick Setup Guide

## Prerequisites

1. **Stripe Account** with Terminal enabled
2. **Reader Provisioned** (Chipper 2X or Verifone P400)
3. **API Key** (from Stripe Dashboard)
4. **Reader ID** (from Stripe Dashboard → Readers)

---

## 5-Minute Setup

### Step 1: Set Environment Variable

```bash
# Set STRIPE_SECRET_KEY in your environment
export STRIPE_SECRET_KEY=sk_live_... # or sk_test_ for testing
```

**Find key:**
1. Log into Stripe Dashboard
2. Settings → API Keys
3. Copy Secret Key (starts with `sk_live_` or `sk_test_`)

### Step 2: Get Reader ID

1. Stripe Dashboard → Readers
2. Find your reader (e.g., "Main Counter Terminal")
3. Copy Reader ID (starts with `rdr_`)

### Step 3: Configure Restaurant

```javascript
// Update restaurant kiosk_config
{
    "kiosk_config": {
        "card_terminal": {
            "provider": "stripe_terminal",
            "stripe_reader_id": "rdr_AabCdEfGHiJkLm",
            "reader_label": "Main Counter"
        }
    }
}
```

### Step 4: Test

1. Open kiosk
2. Add items, click "Pay with Card"
3. Tap test card on reader: **4242 4242 4242 4242**
4. Verify approval notification
5. Check order created

---

## Test Card Numbers

| Intent | Card | Exp | CVC |
|--------|------|-----|-----|
| Approve | 4242 4242 4242 4242 | 12/25 | 123 |
| Decline | 4000 0000 0000 0002 | 12/25 | 123 |
| 3D Secure | 4000 0025 0000 3155 | 12/25 | 123 |

---

## Verify Integration

```bash
# Run smoke tests
node scripts/smoke/run-smoke.js --only stripeTerminalIntegration

# Expected output
✅ stripe_reader_configured
✅ stripe_intent_creation
✅ stripe_db_record_created
✅ stripe_idempotent_retry
✅ stripe_duplicate_blocked
✅ stripe_amount_verified
✅ stripe_ref_persisted
✅ stripe_error_handling
✅ stripe_response_shape
```

---

## Debugging

### Reader Not Online?

```bash
# Check Stripe Dashboard
# Settings → API Keys (verify key)
# Readers → Check reader status
```

### Card Declined?

```bash
# Use test card 4242 4242 4242 4242
# Exp: 12/25, CVC: 123
# Should approve immediately
```

### No Intent Created?

```bash
# Check logs
# Look for: [STRIPE-TERMINAL] Intent created
# If missing, check STRIPE_SECRET_KEY is set
```

---

## Go Live Checklist

- [ ] STRIPE_SECRET_KEY set (live key, not test)
- [ ] Reader provisioned and online
- [ ] Restaurant configured with stripe_reader_id
- [ ] Smoke tests passing
- [ ] Tested with real card (test mode first)
- [ ] Staff trained on kiosk payment flow
- [ ] Monitoring set up (check logs daily)

---

## Support

**Issues?** Check:
- [Full Implementation Guide](./STRIPE_TERMINAL_IMPLEMENTATION.md)
- Stripe Dashboard Status → Reader Health
- Function logs: `console.log` output in Deno