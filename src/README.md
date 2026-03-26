# MealDrop

A multi-tenant food ordering platform built on [Base44](https://base44.com). Restaurants get their own branded storefront, online ordering, POS, kitchen display, loyalty programme, and driver dispatch — all from a single codebase.

---

## Feature areas

| Area | What it covers |
|---|---|
| **Customer app** | Restaurant discovery, menu browsing, cart, checkout (card/cash/Apple Pay/Google Pay), order tracking, loyalty points, group orders |
| **Restaurant dashboard** | Live order queue, menu management, promotions, coupons, driver management, analytics, CRM, media screens |
| **POS / Kiosk** | In-store point-of-sale, kiosk self-service, kitchen display system (KDS), table management |
| **Admin / Super Admin** | Platform oversight, restaurant onboarding, commission management, refund arbitration, payout tracking |
| **Driver app** | Order assignment, live location tracking, route optimisation, earnings |
| **Notifications** | SMS (Twilio) and WhatsApp order alerts to restaurant and customer |

---

## Architecture

```
Browser / Mobile WebView
        │
        ▼
React + Vite SPA  (src/)
  pages/          ← route-level components
  components/     ← reusable UI components
  lib/            ← shared pure logic + utilities
  hooks/          ← React hooks
        │
        ▼
Base44 backend-as-a-service
  entities/       ← database schema (JSON Schema)
  functions/      ← Deno Deploy serverless handlers
  agents/         ← AI agents (chatbot, WhatsApp)
        │
        ▼
External services
  Stripe          ← card payments
  Twilio          ← SMS / WhatsApp
  Google Maps     ← delivery zone & geocoding
```

**Key architectural constraint:** Deno functions are deployed independently and cannot import from `src/lib/`. Critical pure business logic is maintained in `src/lib/order-logic.js` and mirrored verbatim into the relevant handlers. The CI quality gate enforces this. See [docs/TESTING_AND_QUALITY_GATES.md](docs/TESTING_AND_QUALITY_GATES.md).

---

## Local development

```bash
npm install
npm run dev        # Vite dev server
```

All backend functions and entity access run through the Base44 cloud — there is no local backend to start.

---

## Testing & CI

```bash
npm run verify     # full local gate: lint → typecheck → test:run → mirror-sync → build
npm run test:run   # Vitest single run
npm run check:mirror-sync  # handler drift guard
```

CI runs on every push and PR via `.github/workflows/ci.yml`.

See [docs/TESTING_AND_QUALITY_GATES.md](docs/TESTING_AND_QUALITY_GATES.md) for the full picture.

---

## Base44 platform constraints

- **Auth is managed by Base44.** The app cannot intercept login attempts, enforce signup rate limiting, or add CAPTCHA. These controls live at the platform level.
- **Deno functions cannot share code.** Each `functions/*.js` file is deployed independently. No local imports between function files.
- **No `package.json` direct editing.** The platform manages the dependency manifest. Use `npm run <script>` via the scripts defined in `scripts/package-scripts.json` (merge into `package.json` once).
- **Entity RLS.** Row-level security on entities is configured via Base44 settings, not in code.

---

## Key docs

| Doc | What it covers |
|---|---|
| [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) | Current readiness status, open items, deploy checklist |
| [docs/SECURITY_AND_ABUSE_CONTROLS.md](docs/SECURITY_AND_ABUSE_CONTROLS.md) | What protections exist, what doesn't, honest constraints |
| [docs/TESTING_AND_QUALITY_GATES.md](docs/TESTING_AND_QUALITY_GATES.md) | Vitest scope, CI checks, mirror sync rules |
| [docs/PWA_AND_CACHING.md](docs/PWA_AND_CACHING.md) | Service worker strategy, route safety, update behaviour |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Developer workflow, scripts, mirror pattern rules |

---

## Current status

**🟡 Conditionally production-ready.** Core payment, ordering, and abuse controls are hardened. Two gaps remain that require platform-layer support (brute force login protection, signup rate limiting). See [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) for the full assessment.