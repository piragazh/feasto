# Offline Review Reason Codes

Structured decision codes for resolving/escalating flagged offline orders. Mandatory for terminal actions, enables audit and pattern reporting.

---

## RESOLVED Codes (Order is Acceptable)

Use when the flagged order is acceptable as-is after review.

### `price_adjusted_on_sync`
The sync recalculation was fair and correct.

**Use when:**
- Discount was capped per policy → correct behavior
- Item price changed during sync → legitimate repricing
- Coupon was rejected → expected per policy

**Notes:** Optional. Quick review → no note needed.

---

### `acceptable_policy_override`
A manual action (discount, adjustment, refund) was justified and needed.

**Use when:**
- Manager manually adjusted price for customer satisfaction
- Loyalty discount was manually applied
- Small refund was justified per discretionary authority

**Notes:** Optional (but recommended to document reason).

---

### `customer_already_served`
Customer has been satisfied; no action needed.

**Use when:**
- Customer called and issue was resolved verbally
- Previous refund/credit already compensated them
- Order was delivered as-is and customer accepted

**Notes:** Optional.

---

### `minor_discrepancy`
Price or quantity variance is within acceptable tolerance.

**Use when:**
- £0.20–£0.50 difference due to rounding/tax
- Item quantity off by 1 but customer satisfied
- Delivery fee variance within system tolerance

**Notes:** Optional.

---

### `other`
Unique case that doesn't fit standard codes.

**Use when:** You must document why the order was acceptable.

**Notes:** **REQUIRED** — minimum 10 characters. Describe the specific circumstances.

**Example:**
> "Customer pre-paid via bank transfer; order served same day as confirmation."

---

## ESCALATED Codes (Needs Investigation)

Use when the flagged order requires further action or investigation.

### `potential_abuse`
Suspicious pattern detected (exploit attempt, refund abuse, fraud).

**Use when:**
- Same customer requesting refunds repeatedly
- Order total wildly different from historical patterns
- Coupon/discount combination looks like an exploit
- Timing suggests bot activity

**Notes:** Optional (but recommended). Link to other suspicious orders if pattern exists.

---

### `large_price_mismatch`
Price variance exceeds acceptable tolerance.

**Use when:**
- Sync recalculation caused >£2.00 discrepancy
- Item price changed significantly during offline → sync
- Commission/earnings mismatch suggests pricing error

**Notes:** Optional. Detail the mismatch.

---

### `repeated_offline_issues`
This restaurant has a recurring offline validation problem.

**Use when:**
- 3rd flagged order this week from same restaurant
- Same error pattern repeating (e.g., coupons always rejected)
- POS configuration or sync logic issue suspected

**Notes:** Optional. Reference previous orders if pattern known.

---

### `needs_refund_followup`
Customer requires refund or compensation follow-up.

**Use when:**
- Order was damaged/never arrived → refund workflow needed
- Customer dispute → requires investigation + resolution
- Partial refund warranted pending further review

**Notes:** Optional. Describe refund action needed.

---

### `other`
Unique escalation reason not covered above.

**Use when:** You need to escalate for reasons outside standard categories.

**Notes:** **REQUIRED** — minimum 10 characters. Explain why this requires escalation.

**Example:**
> "Customer claims order was short 2 items; unable to verify from offline POS. Requires manager inspection."

---

## Note Requirements

### If `reason_code != "other"`
- **Notes:** Optional
- **No minimum length**
- Use for context: "Reviewed 3 prior orders from this customer; pattern is normal"

### If `reason_code == "other"`
- **Notes:** **REQUIRED**
- **Minimum 10 characters**
- Must explain the specific situation

**Why?** "Other" means you're making a decision outside structured guidelines. Documentation is essential for audit trail and training.

---

## Backend Validation Rules

1. **Reason code required** for `resolved` and `escalated` actions
2. **Reason code must match action type:**
   - `resolved` → only resolved codes allowed
   - `escalated` → only escalated codes allowed
3. **"Other" requires notes ≥10 chars** (enforced both frontend + backend)
4. **All reason codes logged** in audit trail (DashboardActivity)

---

## Reporting & Insights

Dashboard groups reviewed orders by reason code:

```
Resolved Orders:
  ✓ 8 × price_adjusted_on_sync
  ✓ 4 × acceptable_policy_override
  ✓ 2 × customer_already_served

Escalated Orders:
  ⚠ 2 × potential_abuse (repeated customer)
  ⚠ 1 × needs_refund_followup
```

**Use to:**
- Identify restaurants with patterns (e.g., high "potential_abuse" rate)
- Track decision quality (ratio of resolved vs. escalated)
- Spot process issues (e.g., too many "customer_already_served" = refund leaks)

---

## Quick Reference

| Situation | Resolved Code | Escalated Code |
|-----------|---------------|---|
| Policy correctly applied | `discount_capped_correct` | — |
| Manual override justified | `acceptable_policy_override` | — |
| Customer satisfied verbally | `customer_already_served` | — |
| Price difference <£0.50 | `minor_discrepancy` | — |
| Price difference >£2.00 | — | `large_price_mismatch` |
| Suspicious pattern | — | `potential_abuse` |
| Recurring restaurant issue | — | `repeated_offline_issues` |
| Refund needed | — | `needs_refund_followup` |
| Unique case | `other` (required notes) | `other` (required notes) |

---

## Migration Notes

**Previous system** used 11 vague codes. **New system** narrows to 5 + 5 focused codes:

| Old Code | Maps To |
|----------|---------|
| sync_validation_acceptable | price_adjusted_on_sync |
| discount_capped_correct | price_adjusted_on_sync |
| price_reconciled_fair | price_adjusted_on_sync |
| customer_contacted_satisfied | customer_already_served |
| others | other (with required documentation) |

Existing orders keep their original codes; new reviews use narrowed set.