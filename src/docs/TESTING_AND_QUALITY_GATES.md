# Testing & Quality Gates

**Last reviewed: 2026-03-26**

---

## Quick reference

```bash
npm run verify          # full local gate — run before every PR
npm run test:run        # Vitest single run
npm run check:mirror-sync  # drift guard for handler ↔ lib parity

# Backend smoke tests (requires .env.smoke — see scripts/smoke/README.md)
npm run smoke           # run all smoke suites
npm run smoke:manifest  # getManifest only (safe anywhere, no auth needed)
npm run smoke:order     # verifyAndCreateOrder (staging only)
npm run smoke:coupon    # validateCouponUsage (staging only)
npm run smoke:payment   # createPaymentIntent guard rails (no real Stripe call)
```

---

## Vitest test suite

**Config:** `vitest.config.js` (separate from `vite.config.js` — decoupled from browser plugins)  
**Scope:** `src/lib/__tests__/` — pure function layer only

| File | What it tests |
|---|---|
| `order-total-integrity.test.js` | `recomputeSubtotal`, `computeAndVerifyTotal` |
| `coupon-policy.test.js` | `validateCoupon`, `resolveCouponDiscount` |
| `promotion-discount-interaction.test.js` | `capPromotionDiscount`, coupon+promo combos |
| `abuse-controls.test.js` | `basketFingerprint`, `checkPerUserBurst`, `checkPlatformBurst` |
| `error-handling.test.js` | Error message safety — no internal details leaked |
| `happy-path-integration.test.js` | End-to-end pipeline: price → discount → verify total |
| `pwa-route-safety.test.js` | `isActiveTransactionalRoute` (SW reload blocking) |
| `mirror-sync-parity.test.js` | Behavioral parity between `src/lib/order-logic.js` and handler inline copies |

### What Vitest does NOT cover
- Deno handler I/O paths (Stripe API calls, Base44 entity reads, auth)
- Frontend React components
- Integration with real external services

Use the backend smoke tests (`npm run smoke`) for handler wiring — see `scripts/smoke/README.md`.

---

## The mirror pattern

`src/lib/order-logic.js` is the **canonical, tested source of truth** for all critical business logic. Because Deno handlers cannot import from `src/lib/`, the pure functions are copied verbatim into each handler.

### Functions and their mirrors

| Function in `order-logic.js` | Mirrored in handler |
|---|---|
| `recomputeSubtotal` | `functions/verifyAndCreateOrder` |
| `computeAndVerifyTotal` | `functions/verifyAndCreateOrder` |
| `validateCoupon` | `functions/verifyAndCreateOrder` |
| `capPromotionDiscount` | `functions/verifyAndCreateOrder` |
| `basketFingerprint` | `functions/orderVelocityThrottle` |
| `checkPerUserBurst` | `functions/orderVelocityThrottle`, `functions/enforceRateLimiting` |
| `checkPlatformBurst` | `functions/orderVelocityThrottle` |

### Sync rules

Each mirrored copy in a handler must:
1. Be **identical** to the `order-logic.js` version (same code, same behaviour)
2. Have a comment: `/** Mirrors order-logic.js: functionName */`

### Drift detection

Two layers catch drift:

**Layer 1 — `scripts/check-mirror-sync.js`** (structural check)  
Verifies that every exported function in `order-logic.js` has a matching inline definition + sync-marker comment in each expected handler. Fails CI if absent.

**Layer 2 — `mirror-sync-parity.test.js`** (behavioural check)  
Runs identical fixture inputs through both the canonical lib function and the handler's inlined copy. If the logic differs, the outputs will differ and the test fails.

### When you change a function

1. Edit `src/lib/order-logic.js`
2. Apply the exact same change to every mirror listed in the table above
3. Run `npm run check:mirror-sync` — must report ✓ for all functions
4. Run `npm run test:run` — `mirror-sync-parity.test.js` must pass
5. If you add a new function, update `scripts/check-mirror-sync.js` `MIRROR_MAP` and add parity test cases

---

## CI pipeline

**File:** `.github/workflows/ci.yml`  
**Triggers:** every push and every PR on all branches  
**Concurrency:** stale runs cancelled for the same git ref

| Step | Command |
|---|---|
| Install | `npm ci` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Tests | `npm run test:run` |
| Mirror sync | `npm run check:mirror-sync` |
| Build | `npm run build` |

All steps must pass. Failure in any step blocks the PR.

---

## Local verify workflow

`npm run verify` runs all CI steps locally in sequence. Run it before opening a PR.

Individual steps:
```bash
npm run lint              # ESLint on src/ (zero-warning policy)
npm run typecheck         # tsc --noEmit (no-op until tsconfig added)
npm run test:run          # Vitest single pass
npm run check:mirror-sync # drift guard
npm run build             # Vite production build
```

---

## Backend smoke tests

**Location:** `scripts/smoke/`  
**Purpose:** Validate live function wiring — auth context, entity reads, error shapes, input guards.  
These call **real deployed endpoints** and are run manually (or in a staging-only CI job).

| Suite | Auth needed | Destructive | Safe for prod? |
|---|---|---|---|
| `getManifest` | No | No | ✅ Yes |
| `auditLog` | Optional (admin for write) | Minor (creates 1 DashboardActivity row) | ✅ (auth tests only) |
| `validateCouponUsage` | Yes (user token) | No | ✅ |
| `enforceRestaurantPermissions` | Yes (admin + user) | No | ✅ |
| `createPaymentIntent` | No (tests only reject paths) | No | ✅ |
| `verifyAndCreateOrder` | No (happy path needs fixtures) | Yes (creates Order records) | ⛔ Staging only |

### Running smoke tests

```bash
# One-time setup: create .env.smoke from the example
cp scripts/smoke/.env.smoke.example scripts/smoke/.env.smoke
# Then fill in SMOKE_BASE_URL and any tokens/fixture IDs you have

# Run safe suites (no auth needed)
npm run smoke:manifest
npm run smoke:payment

# Run full suite against staging
npm run smoke
```

Required fixture data and cleanup instructions: `scripts/smoke/README.md`

### Money-control smoke suites (new)

| Suite | What it covers |
|---|---|
| `posApplyDiscount` | Auth required; reason mandatory; threshold gate (>20% blocked for manager); admin passes |
| `posVoidOrder` | Auth required; reason mandatory; status guard; cancellation blocked via posUpdateOrder |
| `approveRefund` | Auth required; manager tenant scope; amount cap; no-direct-entity-write |
| `platformRefundOverride` | Admin-only; reason required; non-admin 403 |
| `auditSensitiveAction` | Authenticated writes only; anonymous write 401; valid action required |

Run: `npm run smoke:moneycontrols`

### What smoke tests cover that Vitest does not

- **Auth wiring**: `base44.auth.me()` call actually works with a real token
- **Entity reads**: DB filter calls return expected shapes
- **Error shape safety**: no raw stack traces, no secret leakage in error responses
- **HTTP guards**: method checks, missing-field 400s, auth 401/403 gates
- **Idempotency**: duplicate submit returns existing order, not a new one
- **Input sanitization**: object injection, negative amounts, oversized limits all rejected cleanly

---

## Remaining gaps (honest)

- **No `tsconfig.json`** — `typecheck` step is a no-op. Adding a tsconfig would enable real TypeScript coverage.
- **ESLint does not cover `functions/`** — Deno import syntax (`npm:`, `jsr:`) causes false positives. Handler linting is manual.
- **No E2E tests** — no Playwright/Cypress coverage of the full checkout flow.
- **Smoke tests are manual** — not wired into CI (would require staging secrets in CI). Run them before production deploys.
- **`awardLoyaltyPoints` not smoke-tested** — it requires a completed order entity in the right status; a future smoke fixture could enable this.
- **`orderVelocityThrottle` not smoke-tested directly** — it is called internally by `verifyAndCreateOrder`. The happy-path smoke test exercises it transitively.