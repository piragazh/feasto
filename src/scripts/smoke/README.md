# Backend Smoke Tests

Live wiring tests for deployed Base44 backend functions.  
These tests call **real deployed endpoints** — they are NOT unit tests.

## Quick start

```bash
# 1. Copy the env template and fill in your values
cp scripts/smoke/.env.smoke.example scripts/smoke/.env.smoke

# 2. Run the full smoke suite against staging
node scripts/smoke/run-smoke.js

# 3. Run a single module
node scripts/smoke/run-smoke.js --only verifyAndCreateOrder
node scripts/smoke/run-smoke.js --only validateCouponUsage
node scripts/smoke/run-smoke.js --only auditLog
node scripts/smoke/run-smoke.js --only getManifest
node scripts/smoke/run-smoke.js --only createPaymentIntent
node scripts/smoke/run-smoke.js --only enforceRestaurantPermissions
```

## Required environment variables

| Variable | Description |
|---|---|
| `SMOKE_BASE_URL` | Base URL of the deployed app (e.g. `https://your-app.base44.app`) |
| `SMOKE_ADMIN_TOKEN` | Auth token for an admin user (from browser DevTools → Application → Cookies) |
| `SMOKE_USER_TOKEN` | Auth token for a regular (non-admin) test user |
| `SMOKE_TEST_RESTAURANT_ID` | ID of a dedicated smoke-test restaurant entity |
| `SMOKE_TEST_COUPON_ID` | ID of a dedicated active test coupon entity |
| `SMOKE_TEST_COUPON_CODE` | Code string of that coupon (e.g. `SMOKETEST10`) |
| `SMOKE_TEST_MENU_ITEM_ID` | ID of a menu item belonging to the test restaurant |

See `.env.smoke.example` for the full template.

## Required fixture data

Before running smoke tests you need these entities in your **staging** database:

### Test Restaurant
- **name**: `[SMOKE] Test Restaurant`
- **cuisine_type**: `Test`
- **is_open**: `true`
- **minimum_order**: `0`
- One active MenuItem with a known ID

### Test Coupon
- **code**: `SMOKETEST10`
- **discount_type**: `percentage`
- **discount_value**: `10`
- **is_active**: `true`
- **usage_limit**: `9999` (won't be exhausted)
- **per_customer_limit**: `9999`

### Test Menu Item
- `restaurant_id` → smoke test restaurant
- `name`: `[SMOKE] Test Burger`
- `price`: `10.00`
- `is_available`: `true`

### Test Admin Account
- `role`: `admin`
- Used for `SMOKE_ADMIN_TOKEN`

### Test User Account
- `role`: `user`
- Used for `SMOKE_USER_TOKEN`

## Environment safety

| Environment | Safe to run? | Notes |
|---|---|---|
| **Local dev** | ✅ Yes | Uses cloud Base44 staging DB |
| **Staging** | ✅ Yes | Intended target |
| **Production** | ⛔ Never run automatically | Only `getManifest` (read-only) is safe in production |

## Test categories

- **A – Structural (no auth)**: No token needed, tests HTTP/JSON shape
- **B – Authenticated read**: Requires a valid token, reads only
- **C – Authenticated write**: Creates/mutates data; writes are to smoke fixtures only
- **D – Auth rejection**: Tests that unauthenticated or unauthorized calls are blocked

## Destructive vs non-destructive

| Test | Destructive? | Notes |
|---|---|---|
| `getManifest` – default | ❌ No | Pure read |
| `getManifest` – with restaurantId | ❌ No | Read only |
| `auditLog` – valid event | ⚠️ Minor | Creates a DashboardActivity record |
| `auditLog` – unauthenticated | ❌ No | Rejected before write |
| `validateCouponUsage` – valid | ❌ No | Read-only check |
| `validateCouponUsage` – expired | ❌ No | Read-only check |
| `enforceRestaurantPermissions` – unauthorized | ❌ No | Rejected |
| `enforceRestaurantPermissions` – admin | ❌ No | Read-only |
| `createPaymentIntent` – validation rejection | ❌ No | Rejected before Stripe call |
| `verifyAndCreateOrder` – invalid coupon stack | ❌ No | Rejected before entity write |
| `verifyAndCreateOrder` – happy path | ⚠️ Yes | Creates an Order record (smoke fixture) |

## Cleanup

Orders created during smoke tests will have `notes: "[SMOKE_TEST] safe to delete"`.  
To clean up:

```
In the Admin Dashboard → Orders → filter by notes containing "[SMOKE_TEST]" → delete.
```

Or run:
```bash
node scripts/smoke/cleanup-smoke-orders.js
``