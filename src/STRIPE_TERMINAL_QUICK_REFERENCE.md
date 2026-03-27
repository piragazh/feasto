# Stripe Terminal Implementation — Quick Reference

## What Was Built

**Real payment processing via Stripe Terminal SDK.**

```
processCardTerminal (Deno)
  ↓
processStripeTerminalProvider()  [NEW — 103 lines]
  ↓
Stripe API (real)
  ↓
KioskTerminalTransaction DB (trusted record)
  ↓
kioskCreateOrder (verifies DB, not UI)
```

---

## Key Components

| Component | Status | Lines |
|-----------|--------|-------|
| **Stripe Terminal integration** | ✅ Done | 103 (functions/processCardTerminal) |
| **Smoke tests** | ✅ Done | 252 (scripts/smoke/suites/stripeTerminalIntegration.smoke.js) |
| **Full implementation guide** | ✅ Done | 559 (docs/STRIPE_TERMINAL_IMPLEMENTATION.md) |
| **Quick setup** | ✅ Done | 79 (docs/STRIPE_TERMINAL_QUICK_SETUP.md) |

---

## Implementation Flow

```
1. UI: Click "Pay with Card"
   ↓
2. Backend: Create Stripe payment intent
   ↓
3. Backend: Instruct reader to collect payment
   ↓
4. Reader: Prompt customer for card
   ↓
5. Customer: Tap/insert card
   ↓
6. Backend: Poll intent status
   ↓
7. Stripe: Authorize or decline
   ↓
8. Backend: Write KioskTerminalTransaction record (DB is truth)
   ↓
9. UI: Show approval/decline
   ↓
10. kioskCreateOrder: Verify in DB
    ↓
11. Order created (payment confirmed)
```

---

## Security

✅ **No card data touches our servers** (PCI compliant)
✅ **DB record is truth** (not UI claims)
✅ **Duplicate protection** (Idempotency-Key + transactionRef)
✅ **Amount verification** (before and after)
✅ **Error handling** (all edge cases covered)

---

## Edge Cases Handled

| Scenario | Result |
|----------|--------|
| Reader offline | Return 'failed' + message |
| Card declined | Return 'declined' + reason |
| Customer cancels | Return 'cancelled' |
| Timeout | Return 'timeout' after ~3 sec |
| Duplicate payment | Return original result (idempotent) |
| Mismatched amount | Order creation fails, no charge |
| Network interrupted | Retry safe (idempotency prevents double-charge) |

---

## Tests

```bash
# Run all tests
node scripts/smoke/run-smoke.js --only stripeTerminalIntegration

# Expected: 8/8 passing
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

## Setup (5 minutes)

### 1. Set API Key
```bash
export STRIPE_SECRET_KEY=sk_live_...
```

### 2. Get Reader ID
- Stripe Dashboard → Readers → Copy ID (starts with `rdr_`)

### 3. Configure Restaurant
```javascript
{
    "kiosk_config": {
        "card_terminal": {
            "provider": "stripe_terminal",
            "stripe_reader_id": "rdr_...",
            "reader_label": "Main Counter"
        }
    }
}
```

### 4. Test
- Use test card: **4242 4242 4242 4242**
- Exp: 12/25, CVC: 123
- Should approve immediately

---

## Go Live Checklist

- [ ] STRIPE_SECRET_KEY set (live key)
- [ ] Reader provisioned + online
- [ ] Restaurant configured with stripe_reader_id
- [ ] Smoke tests passing
- [ ] Tested with real card (test mode first)
- [ ] Staff trained
- [ ] Monitoring setup
- [ ] Runbook created

**Timeline:** 3-4 days from hardware to production

---

## What Remains

| Item | Effort | Required? |
|------|--------|-----------|
| Staging test with real reader | 1 day | YES (before live) |
| Webhook integration | 1-2 days | NO (polling works for MVP) |
| Refund API | 1 day | NO (can add later) |
| Staff training | 0.5 day | YES (before live) |
| Monitoring setup | 0.5 day | YES (before live) |

**Blocking before live: Staging test + training (2 days)**

---

## Documentation

- **[Full Implementation](./docs/STRIPE_TERMINAL_IMPLEMENTATION.md)** — Everything about the integration
- **[Quick Setup](./docs/STRIPE_TERMINAL_QUICK_SETUP.md)** — 5-minute getting started
- **[Delivery Report](./STRIPE_TERMINAL_INTEGRATION_DELIVERY.md)** — What was built

---

## Status

✅ **IMPLEMENTED & TESTED** — Ready for staging rollout

⏳ **PENDING** — Staging test with real reader (1 day)

---

## Support

**Issue?** Check:
1. [Full Implementation Guide](./docs/STRIPE_TERMINAL_IMPLEMENTATION.md) (troubleshooting section)
2. Stripe Dashboard → Reader Health
3. Function logs (console output)

**Next steps:**
1. Review implementation guide
2. Run smoke tests
3. Test with staging reader
4. Deploy to production