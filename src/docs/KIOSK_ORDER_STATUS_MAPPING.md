# Kiosk Order & Payment Status Mapping

> **Last updated:** 2026-03-27

This document is the definitive reference for how kiosk orders flow through the system, what `status` and `payment_method` values are set at each stage, and how kitchen/front-counter workflows should interpret them.

---

## Status Mapping Table

| Scenario | `payment_method` | `status` on creation | Kitchen starts? | Staff action required |
|----------|-----------------|---------------------|----------------|----------------------|
| **Card — terminal authorized** | `card` | `confirmed` | ✅ Immediately | None — payment already taken |
| **Pay at Counter** | `pay_at_counter` | `pending` | ❌ Must wait | Staff collects payment → move to `confirmed` |
| Card — declined | *(order not created)* | — | — | Customer retries or pays at counter |
| Card — timeout / network error | *(order not created)* | — | — | Staff assists |
| Card — authorized but order save failed | *(order not created)* | — | — | **Staff recovery required** — transaction ref shown on screen |

---

## Payment Method Values

| `payment_method` | Meaning | Source |
|-----------------|---------|--------|
| `card` | Paid via card — either online Stripe checkout OR kiosk terminal authorization. `payment_intent_id` always set. | Online checkout / Kiosk card path |
| `pay_at_counter` | Kiosk order placed but **no payment taken**. Customer instructed to pay at counter before kitchen starts. | Kiosk counter path |
| `cash` | Cash-on-delivery for online orders only. Never used by kiosk. | Online delivery orders |
| `apple_pay` | Apple Pay via Stripe on online checkout. | Online checkout |
| `google_pay` | Google Pay via Stripe on online checkout. | Online checkout |

---

## Order Status Lifecycle

```
[Kiosk Card]
  kiosk UI → processCardTerminal → authorized
     └─→ Order created: status=confirmed, payment_method=card
              └─→ KDS picks up immediately
              └─→ Customer gets confirmation: "Your order is being prepared"

[Kiosk Pay at Counter]
  kiosk UI → order created: status=pending, payment_method=pay_at_counter
     └─→ Customer shown: "Go to counter to pay"
     └─→ KDS / Live Orders: order visible but marked PENDING PAYMENT
     └─→ Staff collects cash/card at counter
     └─→ Staff moves order → confirmed
              └─→ KDS picks up at confirmed
              └─→ Customer called when ready

[Online card / Apple Pay / Google Pay]
  Stripe webhook → verifyAndCreateOrder → status=confirmed, payment_method=card
     └─→ Standard delivery/collection flow
```

---

## Kitchen Workflow Rules

### Rule 1: `pending` + `pay_at_counter` = do NOT prepare

An order with `status=pending` AND `payment_method=pay_at_counter` means:
- Customer has placed the order at the kiosk
- **Payment has NOT been collected**
- Kitchen must NOT start preparing until staff confirms payment

Staff workflow:
1. See order in Live Orders / KDS with "Awaiting Counter Payment" label
2. Collect payment from customer (cash or card at counter terminal)
3. Press Confirm — order moves to `confirmed`
4. Kitchen starts

### Rule 2: `pending` + `cash` (legacy online orders) = awaiting restaurant confirmation

Legacy online cash-on-delivery orders use `pending` + `payment_method=cash`. These are waiting for the restaurant to accept, not waiting for payment.

> This distinction is why `pay_at_counter` is a separate value — it removes the ambiguity of `cash` for kiosk context.

### Rule 3: `confirmed` = paid, safe to prepare

Regardless of payment method, `status=confirmed` always means either:
- Payment was successfully taken (card/Apple Pay/Google Pay), or
- Staff has explicitly confirmed the order after collecting counter payment

---

## Security Invariants

1. **No fake confirmed card order.** Card orders are only created with `status=confirmed` after `processCardTerminal` returns `{ success: true, status: 'approved' }`. There is no client-side button to skip this.

2. **No ambiguous payment state.** `payment_method=pay_at_counter` is explicit and unambiguous — it cannot be confused with cash-on-delivery.

3. **Authorization evidence always stored.** Card kiosk orders store the terminal transaction ref in `payment_intent_id` and full audit detail in `notes`.

4. **Post-authorization save failure.** If card was authorized but order creation fails, the error screen shows the transaction ref and blocks any retry attempt — preventing double charging.

---

## Notes Field Convention

| Scenario | `notes` value |
|----------|--------------|
| Card (kiosk terminal) | `Kiosk order — terminal: {label} — provider: {provider} — auth: {timestamp}` |
| Pay at Counter | `Kiosk order — awaiting counter payment. Do not prepare until confirmed.` |

---

## Affected Files

| File | Change |
|------|--------|
| `entities/Order.json` | Added `pay_at_counter` to `payment_method` enum; added descriptions to `payment_method` and `status` fields |
| `components/kiosk/KioskPayment` | Counter path now uses `payment_method: 'pay_at_counter'` instead of `'cash'`; updated notes |
| `components/kiosk/KioskConfirmation` | Accepts `paymentMethod` prop; counter orders show "go to counter to pay" message instead of "being prepared" |
| `pages/KioskDashboard` | Passes `paymentMethod={placedOrder?.payment_method}` to KioskConfirmation; fixed `printerFailed` prop name |
| `docs/KIOSK_ORDER_STATUS_MAPPING.md` | This document |

---

## Edge Cases

| Edge case | Handling |
|-----------|---------|
| Customer walks away without paying at counter | Order stays `pending` indefinitely — staff can cancel from Live Orders |
| Counter staff accidentally confirms before collecting payment | Business/staff process issue — out of scope for kiosk software |
| Card terminal authorized but network drops before order save | Error screen with transaction ref shown — staff recovery required, no retry |
| Page reload during card payment | sessionStorage sentinel detected on reload — "Payment Interrupted" screen shown with ref |
| Both payment methods disabled in kiosk config | "Ordering temporarily unavailable" full-screen shown — no order created |
| `payment_method=pay_at_counter` order on KDS | KDS should filter/label these as awaiting payment — staff must confirm before kitchen starts |

---

## Future: Kitchen-Wait Config Flag

The system currently relies on the **staff workflow** to hold `pay_at_counter` orders at `pending` before confirming. If the business wants to make this automatic:

```json
// restaurant.kiosk_config
{
  "kitchen_holds_until_counter_payment": true
}
```

When `true`, KDS would only surface `pay_at_counter` orders once staff has moved them to `confirmed`. This flag is not yet implemented but the data model fully supports it — no schema changes required.