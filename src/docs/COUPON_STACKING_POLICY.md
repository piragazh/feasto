# Coupon Stacking Policy

_Last updated: 2026-03-27_

## Summary

The platform allows up to **3 coupon codes per order** with explicit stacking rules.  
The server is the sole authority. Client-side validation is UX convenience only.

---

## 1. Max Coupons Per Order

- Hard limit: **3 coupon codes**
- More than 3 codes → order rejected with 400
- Duplicate codes on the same order → rejected with 400
- Codes are normalised to UPPERCASE and trimmed

---

## 2. `stackable` Field on the Coupon Entity

Each `Coupon` record now has a `stackable: boolean` field (default: `false`).

| stackable | Behaviour |
|-----------|-----------|
| `false` (default) | This coupon must be used **alone**. Cannot be combined with any other coupon on the same order. |
| `true` | This coupon **may** be combined with other stackable coupons (up to the 3-coupon limit). |

**Rule**: If more than 1 coupon is applied to an order, **all** coupons must have `stackable=true`.  
A single non-stackable coupon in a multi-coupon request will reject the entire order.

---

## 3. Per-Coupon Validation

Each coupon is independently validated server-side:

1. `is_active` must be `true`
2. `valid_from` ≤ now (if set)
3. `valid_until` ≥ now (if set)
4. `expires_at` ≥ now (if set) — used for reward coupons
5. `restaurant_id` must match the order's restaurant (or be empty for platform-wide)
6. `minimum_order` must be ≤ server-computed subtotal
7. `usage_limit` not exceeded (`usage_count < usage_limit`)
8. `per_customer_limit` not exceeded (see identity policy below)

---

## 4. Deterministic Discount Calculation Order

To ensure identical results regardless of submission order, discounts are applied in this fixed sequence:

1. **Percentage coupons** — sorted by `code` ascending
2. **Fixed / free_delivery / other coupons** — sorted by `code` ascending

Each coupon's contribution is computed against the **original server-computed subtotal** (not a running total).  
This prevents the application order from mattering for the individual coupon amounts.

---

## 5. Total Discount Cap

- Combined coupon discount is capped at **50% of the server-computed subtotal**
- Individual coupon contributions are curtailed in application order until the cap is reached
- Final order total is clamped to a minimum of **£0.00**
- Restaurant/system promotions (auto-applied) count on a separate track and are not included in the coupon cap

---

## 6. Order Storage

| Field | Type | Usage |
|-------|------|-------|
| `coupon_codes` | `string[]` | **Current**: full array of validated codes applied to this order |
| `coupon_code` | `string` | **Legacy**: first code in the array, kept for backward-compatible per-customer limit queries |

Per-customer limit checks query `coupon_code` (singular) for backward compat with older orders.

---

## 7. Usage Counting

- `usage_count` is incremented **server-side only** after successful order creation
- One increment per coupon per order
- Increments are fire-and-forget after order creation to avoid blocking the response
- **Known race condition**: if two orders are submitted simultaneously with the same coupon and the `usage_limit` is 1, both may pass the limit check before either increments the counter. This is an accepted limitation of non-transactional increment. For highly limited coupons, set `usage_limit` conservatively.

---

## 8. Identity Policy (Per-Customer Limits)

| Identity type | How enforced |
|---------------|-------------|
| Authenticated user | `created_by` (platform-set email) — authoritative, cannot be spoofed |
| Guest (email) | `guest_email` (self-reported) — weak signal |
| Guest (phone) | `phone` normalised to E.164 (self-reported) — stronger signal |

Guest per-customer limits are best-effort. A guest providing fresh email + phone on each order can bypass per-customer limits. This is a documented limitation.

---

## 9. Mutual Exclusion (POS)

On POS orders, coupon stacks and manual discounts are **mutually exclusive**:
- A POS order may have a coupon stack OR a manual discount, never both
- This is enforced in `posCreateOrder` and `posValidateCoupon`

---

## 10. POS Walk-In Limitation

POS walk-in orders without a customer phone or email: **only global `usage_limit` applies** per coupon.  
Per-customer limits cannot be enforced without an identity signal.  
This is a documented limitation (see `SECURITY_AND_ABUSE_CONTROLS.md`).

---

## 11. Files Changed

| File | Change |
|------|--------|
| `entities/Coupon.json` | Added `stackable: boolean` field (default `false`) |
| `entities/Order.json` | Added `coupon_codes: string[]` field; `coupon_code` retained for legacy compat |
| `functions/verifyAndCreateOrder.js` | Refactored coupon section: max 3, dedup, stackable check, deterministic order, 50% cap |
| `functions/posCreateOrder.js` | Same refactor for POS path |
| `components/checkout/DiscountCodeInput.jsx` | Updated UI: max 3 coupons, stackable UX hint, clear error messages |
| `components/checkout/CouponInput.jsx` | Minor cleanup (no stacking in simple widget) |
| `scripts/smoke/suites/couponStacking.smoke.js` | New smoke test suite covering all stacking cases |
| `docs/COUPON_STACKING_POLICY.md` | This file |

---

## 12. Remaining Limitations

1. **Race condition on `usage_count`**: Non-transactional read-modify-write. High-volume coupons with tight limits may slightly oversell.
2. **Guest identity is weak**: Self-reported email/phone. Per-customer limits are best-effort for guests.
3. **No cross-coupon minimum spend aggregation**: Each coupon's `minimum_order` is checked against the original subtotal independently. There is no combined "you must spend X to use all three" rule.
4. **POS walk-in**: No identity → per-customer limits unenforced.
5. **`coupon_code` legacy field**: Older orders only have `coupon_code`. The per-customer limit check queries both fields for new orders, but very old orders predate `coupon_codes` array. This creates a small gap for customers who used a coupon before the schema change.