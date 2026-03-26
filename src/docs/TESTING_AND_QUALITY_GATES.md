# Testing & Quality Gates

**Last reviewed: 2026-03-26**

---

## Quick reference

```bash
npm run verify          # full local gate — run before every PR
npm run test:run        # Vitest single run
npm run check:mirror-sync  # drift guard for handler ↔ lib parity
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

Use `test_backend_function` from the Base44 platform for handler smoke tests.

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

## Remaining gaps (honest)

- **No `tsconfig.json`** — `typecheck` step is a no-op. Adding a tsconfig would enable real TypeScript coverage.
- **ESLint does not cover `functions/`** — Deno import syntax (`npm:`, `jsr:`) causes false positives. Handler linting is manual.
- **No E2E tests** — no Playwright/Cypress coverage of the full checkout flow. Manual smoke testing is the current approach.
- **No handler unit tests** — Deno handler I/O is not mocked. Stripe/DB/auth paths are tested only via the Base44 `test_backend_function` tool.