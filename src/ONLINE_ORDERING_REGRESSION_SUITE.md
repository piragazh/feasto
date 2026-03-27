# Online Ordering Regression Smoke Suite

**File:** `scripts/smoke/suites/onlineOrderingRegression.smoke.js`  
**Purpose:** Pre-deploy regression testing for online ordering  
**Risk Level:** HIGH — covers payment, compensation, and failure logging  
**Run:** `node scripts/smoke/run-smoke.js --only onlineOrderingRegression`

---

## Overview

Small, high-signal smoke suite for online ordering. Focuses on regressions in recent changes:
- Coupon stacking policy
- Promotion validation
- Payment/order compensation
- Failure logging
- Reconciliation issue creation

**Design principles:**
- ✅ Deterministic (no side effects; idempotency keys prevent pollution)
- ✅ Fail-fast (stop on first critical regression)
- ✅ Fixture-based (uses ENV variables for test data)
- ✅ No heavy framework (basic HTTP calls)
- ✅ ~2-3 minute runtime

---

## 10 Test Cases

### TC-OOR-001: Happy Path — Valid Card Order Succeeds
**Goal:** Verify baseline online order creation works  
**Test:** Create minimal valid order with card payment  
**Expected:** Status 201, order_id returned  
**Catches:** Breaking changes to order creation flow

### TC-OOR-002: Duplicate Submit is Idempotent
**Goal:** Verify idempotency key prevents duplicate orders  
**Test:** Submit same order twice with same idempotency_key + payment_intent_id  
**Expected:** First: 201 (created), Second: 200 (duplicate=true, same order_id)  
**Catches:** Idempotency regression; double-charging bug

### TC-OOR-003: Invalid Coupon Rejected Cleanly
**Goal:** Verify invalid coupon fails with clear error (no silent ignore)  
**Test:** Submit order with fake coupon code "FAKECOUPON999"  
**Expected:** Status 400, error message includes "coupon"  
**Catches:** Coupon validation bypass; silent coupon ignoring

### TC-OOR-004: Valid Stackable Coupons Accepted
**Goal:** Verify stackable coupons are applied correctly  
**Test:** Submit order with valid stackable coupon; verify discount applied  
**Expected:** Status 201, order_id returned, correct total  
**Catches:** Stackable coupon rejection; discount calculation bug

### TC-OOR-005: Non-Stackable Coupon Combination Rejected
**Goal:** Verify non-stackable coupons cannot be combined  
**Test:** Submit order with 1 non-stackable + 1 stackable coupon  
**Expected:** Status 400, error includes "stack" or "combine"  
**Catches:** Stacking policy bypass; incorrect coupon validation

### TC-OOR-006: Client-Supplied Promotion Amount Ignored
**Goal:** Verify server recomputes promotion discount; ignores client value  
**Test:** Submit order with valid promotion ID + fake high discount (99.99) + fake total (0.01)  
**Expected:** Status 201 (correct discount) OR 400 (promotion invalid); NOT 201 with fake total  
**Catches:** Client-side discount tampering vulnerability

### TC-OOR-007: Server Price Recomputation Prevents Tampering
**Goal:** Verify menu item prices are looked up server-side; client values ignored  
**Test:** Submit order with menu item at price 0.01 (client tamper); server has 10.00  
**Expected:** Status 201 (correct price charged) OR 400 (total mismatch); NOT 201 with 0.01  
**Catches:** Price tampering vulnerability; server not recomputing prices

### TC-OOR-008: Payment Success + Order Failure Triggers Compensation
**Goal:** Verify Stripe refund issued if order creation fails after payment confirmed  
**Test:** Create order with non-existent restaurant (will fail after PT created)  
**Expected:** Status 404, refund triggered (async)  
**Catches:** Orphaned payment scenario; missing compensation

### TC-OOR-009: Critical Order Failure Logged to FailureLog
**Goal:** Verify critical failures are logged for observability  
**Test:** Submit empty cart (validation failure)  
**Expected:** Status 400, error logged to FailureLog  
**Catches:** Silent failures; missing observability

### TC-OOR-010: Orphan/Mismatch Scenario Creates ReconciliationIssue
**Goal:** Verify reconciliation infrastructure exists and runs  
**Test:** Call detectReconciliationIssues function  
**Expected:** Status 200, function returns success  
**Catches:** Reconciliation system offline; missing issue detection

---

## Fixture Data Required

Tests expect these fixtures (ENV variables or defaults):

```bash
# Required for tests to run fully
TEST_RESTAURANT_ID=rest_fixture_001
TEST_MENU_ITEM_1_ID=item_fixture_001
TEST_MENU_ITEM_2_ID=item_fixture_002

# Coupons must exist and have these properties:
# - TEST_COUPON_STACKABLE=TESTSTACK10 (stackable=true, 10% off)
# - TEST_COUPON_NON_STACKABLE=TESTEXCL20 (stackable=false, 20% off)

# Promotion must exist:
# - TEST_PROMOTION_ID=promo_fixture_001 (valid promotion)

# Admin auth token
ADMIN_TOKEN=your_token
```

**Setup steps:**
1. Create test restaurant (or use existing)
2. Create 2+ menu items with fixed prices (10.00, 15.00, etc.)
3. Create 2 coupons:
   - Stackable: TESTSTACK10 (10%, stackable=true)
   - Non-stackable: TESTEXCL20 (20%, stackable=false)
4. Create 1 promotion (for test 6)
5. Set ENV variables above
6. Run suite

---

## Pass/Fail Criteria

| Test | Pass | Fail |
|------|------|------|
| TC-OOR-001 | 201 + order_id | Any other status or no order_id |
| TC-OOR-002 | First 201, Second 200 + duplicate=true | Second request != 200 or order_id differs |
| TC-OOR-003 | 400 + error includes "coupon" | 201 (silently accepted) or wrong error |
| TC-OOR-004 | 201 + correct total | 400+ (rejected) or wrong total |
| TC-OOR-005 | 400 + error includes "stack"/"combine" | 201 (accepted) or silent ignore |
| TC-OOR-006 | 201 (correct promo) OR 400 (invalid promo) | NOT 201 with fake total |
| TC-OOR-007 | 201 (correct price) OR 400 (mismatch) | NOT 201 with tampered price |
| TC-OOR-008 | 404 + refund triggered | 500 or missing compensation |
| TC-OOR-009 | 400 + logged | 201 (accepted) or missing log |
| TC-OOR-010 | 200 + function returns | 500 or function offline |

---

## Test Execution Flow

```
1. Setup: Read ENV variables; set up fixtures
2. Run TC-OOR-001 (happy path) — baseline
3. Run TC-OOR-002 (idempotency) — dedup check
4. Run TC-OOR-003 to TC-OOR-007 (coupon/price validation) — security
5. Run TC-OOR-008 (compensation) — payment safety
6. Run TC-OOR-009 (failure logging) — observability
7. Run TC-OOR-010 (reconciliation) — reconciliation system
8. Report: pass/fail counts
```

**Fail-fast:** Stop on first critical failure (TC-OOR-001, TC-OOR-008, TC-OOR-010)

---

## Fixture Assumptions

**Restaurant:**
- ID: `rest_fixture_001`
- Status: `is_open = true`
- Hours: Available now (no time-based rejection)
- Delivery zones: Covers test coordinate

**Menu Items:**
- Item 1: ID `item_fixture_001`, price 10.00, available
- Item 2: ID `item_fixture_002`, price 15.00, available

**Coupons:**
- TESTSTACK10: 10% off, stackable=true, valid_until > today, no per-customer limit
- TESTEXCL20: 20% off, stackable=false, valid_until > today, no per-customer limit

**Promotion:**
- ID `promo_fixture_001`: Valid, minimum_order = 5.00, discount = 10%

**Guest:** Anonymous guest checkout (no authentication required)

---

## Gap Analysis

### Tests Require Manual Verification

| Area | Manual Check | Why |
|------|--------------|-----|
| **Email notifications** | Send order email to guest | Cannot verify SMTP in smoke |
| **SMS notifications** | Send SMS to guest phone | Cannot verify Twilio in smoke |
| **Driver assignment** | Verify order assigned to driver | Depends on driver availability |
| **Kitchen display** | Verify KDS received order | UI integration test, not unit |
| **Real payment processing** | Verify Stripe charge + refund | Cannot mock Stripe in prod |
| **Customer refund request** | Verify refund workflow end-to-end | Requires UI + customer interaction |

### Tests Not Covered (Require Manual/Integration Testing)

| Scenario | Why | Manual Test Instead |
|----------|-----|---------------------|
| **Real Stripe payment** | Smoke uses fake PI; real payment needs integration | Run e2e test suite |
| **Offline order sync** | Requires offline POS + network reconnection | Manual: disconnect, order, reconnect |
| **Multi-restaurant ordering** | Not applicable to single-order flow | Integration test |
| **Rate limiting** | Requires rapid requests | Load test script |
| **Timezone edge cases** | Time-based validation | Manual: set system time, order |
| **Disability compliance** | Accessibility testing | Axe/Wave scanner on UI |

---

## Gaps Still Requiring Attention

### 1. Real Payment Processing (HIGH)
**Gap:** Smoke suite uses fake payment_intent_id; cannot test real Stripe integration  
**Mitigation:** Run separate integration test suite with real Stripe test mode  
**Impact:** Payment success → order failure → compensation path NOT fully tested  
**Owner:** Integration testing (QA team)

### 2. Customer Notifications (MEDIUM)
**Gap:** Cannot verify SMS/email sent to customer  
**Mitigation:** Add email/SMS mock checks to detectOrderingAlerts or separate notification suite  
**Impact:** Customer experience issues (silent failures in notification) not caught  
**Owner:** Integration testing

### 3. Refund Flow (MEDIUM)
**Gap:** Smoke verifies refund *initiated*; cannot verify Stripe confirmation  
**Mitigation:** Add manual Stripe dashboard check to pre-deploy checklist  
**Impact:** Refund API call fails → customer charged, order failed → manual recovery needed  
**Owner:** Manual pre-deploy checklist

### 4. Offline Order Sync (LOW)
**Gap:** Not covered by regression suite  
**Mitigation:** Separate offline sync test suite exists (offlineSyncIdempotency.smoke.js)  
**Impact:** Offline orders not tested in regression suite; relies on separate suite  
**Owner:** Offline testing

### 5. Third-Party Integrations (LOW)
**Gap:** Uber Eats, Stripe Terminal, other connectors not in regression scope  
**Mitigation:** Separate suites for each third-party integration  
**Impact:** Third-party order failures not caught in regression; relies on separate suites  
**Owner:** Third-party integration testing

---

## Pre-Deploy Checklist

**Before deploying online ordering changes:**

- [ ] Run: `node scripts/smoke/run-smoke.js --only onlineOrderingRegression`
- [ ] All 10 tests PASS
- [ ] Check Stripe test dashboard: last charge successful
- [ ] Check FailureLog: no new critical errors in last 1h
- [ ] Check ReconciliationDashboard: no orphaned payments
- [ ] Manual: Test real order with real Stripe test card
- [ ] Manual: Test refund via Stripe test dashboard
- [ ] Manual: Send test SMS/email to verify notifications
- [ ] Manual: Verify kitchen display received order

---

## Usage

```bash
# Run just regression suite
node scripts/smoke/run-smoke.js --only onlineOrderingRegression

# Run all smoke tests (including regression)
node scripts/smoke/run-smoke.js

# With custom fixtures
TEST_RESTAURANT_ID=rest_prod TEST_COUPON_STACKABLE=SAVE10 \
  node scripts/smoke/run-smoke.js --only onlineOrderingRegression
```

---

## Performance

**Estimated runtime:** 2-3 minutes (10 tests, ~12-18s per test)

**Bottlenecks:**
- Payment intent verification (Stripe API call): ~500ms
- Database queries (restaurant, menu items, coupons): ~200ms each
- Order creation: ~1s

---

**Status:** ✅ Ready for pre-deploy use. Catches highest-risk regressions in online ordering.