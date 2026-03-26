# Contributing & Quality Gate

## Local quality check (run before every PR)

```bash
npm run verify
```

This runs the full local gate in one command:
1. **Lint** — ESLint on `src/`
2. **Typecheck** — `tsc --noEmit` (skipped if no tsconfig)
3. **Tests** — Vitest (all `src/**/*.test.*` files)
4. **Mirror sync check** — drift guard for handler ↔ lib parity
5. **Build** — Vite production build

Each step must pass. The CI workflow runs the same sequence on every push and PR.

---

## Scripts reference

| Script | What it does |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint (fails on any warning or error) |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run typecheck` | TypeScript check (no-emit) |
| `npm run test` | Vitest in watch mode |
| `npm run test:run` | Vitest single run (used in CI) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run check:mirror-sync` | Mirror drift guard (see below) |
| `npm run verify` | Full local gate (all of the above) |

**Adding scripts:** merge the contents of `scripts/package-scripts.json` into `package.json`.

---

## CI (GitHub Actions)

Workflow: `.github/workflows/ci.yml`  
Triggers: every push and every pull request on all branches.

Jobs (sequential, fast-fail):
1. `npm ci` — clean install with lock file
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:run`
5. `npm run check:mirror-sync`
6. `npm run build`

A PR cannot be merged if any step fails.

---

## What must pass before deploy

- [ ] CI workflow green (all 5 jobs pass)
- [ ] No new ESLint errors
- [ ] All Vitest tests pass
- [ ] Mirror sync check reports 0 issues
- [ ] Production build succeeds

---

## The mirror pattern — how to stay in sync

Because Deno backend functions are deployed independently and cannot import
from `src/lib/`, critical pure business logic is duplicated:

| Canonical (tested) | Mirrored in handler |
|---|---|
| `src/lib/order-logic.js` | `functions/verifyAndCreateOrder` |
| `src/lib/order-logic.js` | `functions/orderVelocityThrottle` |
| `src/lib/order-logic.js` | `functions/enforceRateLimiting` |

### When you change a pure function

1. Edit the function in `src/lib/order-logic.js`
2. Find the matching handler(s) from the table above
3. Apply the **exact same change** to the handler's inline copy
4. Verify the `/** Mirrors order-logic.js: functionName */` comment is present in the handler
5. Run `npm run check:mirror-sync` — it must report ✓ for all functions
6. The Vitest test `src/lib/__tests__/mirror-sync-parity.test.js` runs both implementations against the same inputs — update the handler copy there too

### When you add a new pure function to the lib

1. Add it to `src/lib/order-logic.js` with an `export`
2. Add the inline copy to the relevant handler with the sync marker comment
3. Add an entry to `MIRROR_MAP` in `scripts/check-mirror-sync.js`
4. Add parity test cases to `src/lib/__tests__/mirror-sync-parity.test.js`

### When you rename a function

Same steps as above. Also update:
- The `MIRROR_MAP` in `scripts/check-mirror-sync.js`
- The parity test imports

---

## Test files

| File | Covers |
|---|---|
| `order-total-integrity.test.js` | `recomputeSubtotal`, `computeAndVerifyTotal` |
| `coupon-policy.test.js` | `validateCoupon`, `resolveCouponDiscount` |
| `promotion-discount-interaction.test.js` | `capPromotionDiscount`, coupon+promo combos |
| `abuse-controls.test.js` | `basketFingerprint`, `checkPerUserBurst`, `checkPlatformBurst` |
| `error-handling.test.js` | Handler error message safety (no info leakage) |
| `happy-path-integration.test.js` | End-to-end pipeline: price → discount → verify total |
| `pwa-route-safety.test.js` | `isActiveTransactionalRoute` |
| `mirror-sync-parity.test.js` | **Behavioral parity between lib and handler copies** |

---

## Known remaining weak points

- **Deno handlers have no unit tests of their own** — only the pure-function
  layer is tested via Vitest. IO paths (Stripe, DB reads, auth) are not mocked.
  Use `test_backend_function` from the Base44 platform for smoke-testing handlers.

- **Mirror pattern still requires discipline** — the automation catches absent
  functions and missing sync markers, but cannot detect subtle logic drift in
  the function body itself. The parity test in `mirror-sync-parity.test.js`
  mitigates this by running identical fixtures through both implementations.

- **No per-IP rate limiting** — noted in `functions/orderVelocityThrottle`.
  True IP-level controls require a CDN/proxy layer or storing IP on the Order entity.

- **ESLint does not cover `functions/`** — Deno handlers use a different runtime
  and import syntax (`npm:`, `jsr:`). ESLint would flag these as errors.
  Linting is scoped to `src/` only.