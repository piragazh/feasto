# Payment System Release Gate Checklist

**Release Version:** Production v1.0  
**Date:** 2026-03-28  
**Sign-off Required:** Engineering Lead + QA Lead + Ops Lead  

---

## PRE-RELEASE READINESS (72 hours before release)

### Gate 1: Unit Test Coverage
- [ ] **Requirement:** All backend functions ≥95% line coverage
  - **Verification:** Run `vitest --coverage` on all functions/
  - **Pass Criteria:** Lines: ≥95%, Branches: ≥90%, Functions: ≥95%
  - **Evidence:** Screenshot of coverage report
  - **Owner:** Engineering Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Race condition tests pass without flakiness
  - **Verification:** Run RC-001 through RC-004 tests 5 consecutive times
  - **Pass Criteria:** 100% pass rate across all 5 runs
  - **Evidence:** CI log showing all 5 runs green
  - **Owner:** Engineering Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Webhook deduplication tests pass
  - **Verification:** Run WH-001 through WH-006 tests in isolation
  - **Pass Criteria:** All 6 tests pass, no race conditions detected
  - **Evidence:** Vitest report
  - **Owner:** Engineering Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Refund retry logic tests pass
  - **Verification:** Run BE-028 through BE-031 tests
  - **Pass Criteria:** All 4 tests pass, exponential backoff verified
  - **Evidence:** Vitest report + logs showing backoff timing
  - **Owner:** Engineering Lead
  - **Deadline:** Day -2

### Gate 2: Integration Test Execution
- [ ] **Requirement:** All 40 manual QA tests executed and documented
  - **Verification:** Manual test sign-off sheet (see below)
  - **Pass Criteria:** All 40 tests executed, ≥95% pass rate (max 2 failures)
  - **Failures allowed:** Only if non-critical (e.g., visual polish, not payment logic)
  - **Evidence:** Signed QA report with tester names
  - **Owner:** QA Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** All 28 frontend automated tests pass
  - **Verification:** Run `vitest run lib/__tests__/checkout-e2e.test.js`
  - **Pass Criteria:** 28/28 pass, no flaky tests
  - **Evidence:** CI log showing all green
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** All 31 backend function tests pass
  - **Verification:** Run `vitest run functions/__tests__/checkout-functions.test.js`
  - **Pass Criteria:** 31/31 pass
  - **Evidence:** CI log
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** All 12 webhook tests pass
  - **Verification:** Run `vitest run functions/__tests__/webhook.test.js`
  - **Pass Criteria:** 12/12 pass
  - **Evidence:** CI log
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** All 15 chaos tests pass
  - **Verification:** Run `vitest run lib/__tests__/chaos.test.js`
  - **Pass Criteria:** 15/15 pass (no "expected" failures)
  - **Evidence:** CI log
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

### Gate 3: Concurrency & Race Safety
- [ ] **Requirement:** Zero duplicate orders in 100 concurrent order creation tests
  - **Verification:** Load test: 100 simultaneous checkout requests for same restaurant
  - **Pass Criteria:** 100 orders created, 100 unique order IDs, 0 duplicates
  - **Command:** `artillery run checkout-load-test.yml --target=staging`
  - **Evidence:** Artillery report showing 100 successful requests, DB audit showing 100 unique orders
  - **Owner:** Ops Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Zero double-refunds in 50 concurrent refund scenarios
  - **Verification:** Load test: 50 simultaneous refund calls for same PI
  - **Pass Criteria:** 50 refunds initiated, only 1 actually created at Stripe per PI
  - **Command:** Custom test script that mocks concurrent refund requests
  - **Evidence:** Stripe logs showing 1 refund per PI, FailureLog showing no double-charge alerts
  - **Owner:** Ops Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Coupon usage limits strictly enforced
  - **Verification:** Load test: 10 concurrent orders from same user, coupon per_customer_limit=1
  - **Pass Criteria:** 1 order succeeds with coupon, 9 fail with "limit exceeded"
  - **Evidence:** DB audit showing coupon.usage_count = 1 for this customer, FailureLog showing 9 limit-exceeded errors
  - **Owner:** Engineering Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Distributed lock (WebhookEventLog) verified working
  - **Verification:** Concurrent webhook delivery (2 identical events, <1s apart)
  - **Pass Criteria:** 1 processed, 1 duplicate_ignored, only 1 order created
  - **Evidence:** WebhookEventLog showing status=processed and status=duplicate_ignored
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** PT dedup (75ms pause + re-check) verified working
  - **Verification:** Frontend submits order + webhook arrives 50ms later
  - **Pass Criteria:** Race resolved deterministically, exactly 1 order created
  - **Evidence:** PT records showing atomic write sequence, no duplicate PT entries
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

### Gate 4: Error Handling & Recovery
- [ ] **Requirement:** All payment failures automatically refund
  - **Verification:** 10 test payments that fail (declined, expired, etc.)
  - **Pass Criteria:** All 10 auto-refunded within 30s, FailureLog created for each
  - **Evidence:** Stripe refund API logs, FailureLog audit
  - **Owner:** Engineering Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** All compensation incidents logged to FailureLog
  - **Verification:** Trigger 5 order failures: item unavailable, coupon disabled, restaurant closed, price mismatch, item deleted
  - **Pass Criteria:** All 5 incidents in FailureLog with severity=critical, alert_condition set, alert_triggered=true
  - **Evidence:** FailureLog query results
  - **Owner:** Engineering Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Recovery path (pending_payment detection) functional
  - **Verification:** Simulate: PI succeeded, payment persistent, page refresh
  - **Pass Criteria:** Recovery flow triggered, order created from pending record, user redirected to Orders
  - **Evidence:** Session recording of recovery flow
  - **Owner:** QA Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** No payment success without order creation
  - **Verification:** Check: for every PaymentTransaction with status=order_created, does an Order exist with payment_intent_id?
  - **Pass Criteria:** 100% match (0 orphaned PT records without orders)
  - **Command:** `SELECT pt.* FROM PaymentTransaction pt LEFT JOIN Order o ON pt.payment_intent_id = o.payment_intent_id WHERE pt.status = 'order_created' AND o.id IS NULL`
  - **Evidence:** DB query result showing 0 rows
  - **Owner:** Ops Lead
  - **Deadline:** Day 0 (right before release)

- [ ] **Requirement:** Manual review queue (needs_review status) functional
  - **Verification:** Trigger a refund failure (max retries), check PT status and FailureLog
  - **Pass Criteria:** PT.status = needs_review, FailureLog.compensation_status = manual_review_required, alert_triggered = true
  - **Evidence:** DB records and Slack alert (if configured)
  - **Owner:** Engineering Lead
  - **Deadline:** Day -2

### Gate 5: Data Integrity
- [ ] **Requirement:** Price calculation verified (subtotal + delivery + surcharge - discount = total)
  - **Verification:** Audit sample of 100 random orders
  - **Pass Criteria:** 100% of orders satisfy formula (tolerance ±2% for floating point)
  - **Command:** `SELECT id, subtotal, delivery_fee, small_order_surcharge, discount, total FROM Order LIMIT 100` then verify math for each
  - **Evidence:** Spreadsheet showing verification for all 100
  - **Owner:** QA Lead
  - **Deadline:** Day 0

- [ ] **Requirement:** Coupon usage_count incremented atomically
  - **Verification:** Use 1 coupon 10 times, check usage_count
  - **Pass Criteria:** usage_count = 10 (no missed increments or duplicates)
  - **Evidence:** DB record showing usage_count = 10
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** Loyalty points awarded correctly
  - **Verification:** Create 10 orders with loyalty_program_enabled=true, multiplier=1, totals = [10, 25, 50, 100, ...]
  - **Pass Criteria:** Each order.loyalty_points_earned = floor(total * multiplier), points appear in LoyaltyPoints entity
  - **Evidence:** Order records showing correct points, LoyaltyPoints entity showing user points balance updated
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** Idempotency keys prevent duplicate order creation
  - **Verification:** Submit same order 3 times with same idempotency_key
  - **Pass Criteria:** 1 order created, 2 requests return duplicate (or same order ID)
  - **Evidence:** Order table showing single order for this idempotency key
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** Payment intent amount in pence matches order total
  - **Verification:** Verify 10 PIs created for orders with totals [10.50, 25.99, 100.00, ...]
  - **Pass Criteria:** Each PI.amount_pence = floor(order.total * 100), no rounding errors
  - **Evidence:** Stripe API responses vs. Order records
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

### Gate 6: Webhook Reliability
- [ ] **Requirement:** Duplicate webhook events ignored
  - **Verification:** Replay same webhook event 3 times
  - **Pass Criteria:** Event 1 processed, Events 2-3 marked duplicate_ignored
  - **Evidence:** WebhookEventLog showing status values
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** Non-recoverable errors logged, recoverable errors return 500
  - **Verification:** Send 2 webhook events: one with invalid PI (non-recoverable), one that triggers DB timeout (recoverable)
  - **Pass Criteria:** Invalid PI: status=200 (acked), FailureLog created. DB timeout: HTTP 500 (Stripe retries)
  - **Evidence:** Webhook response codes, FailureLog records
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** Webhook event log 100% coverage
  - **Verification:** Send 20 webhook events (various types), count WebhookEventLog records
  - **Pass Criteria:** 20 records in log
  - **Evidence:** DB count query
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** Signature validation rejects invalid signatures
  - **Verification:** Send webhook with tampered signature
  - **Pass Criteria:** HTTP 401, error message includes "signature"
  - **Evidence:** Response code and error message
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** Event replay: same event 5 times = 1 order
  - **Verification:** Replay successful payment_intent.succeeded event 5 times
  - **Pass Criteria:** 1 order in DB, WebhookEventLog shows 1 processed + 4 duplicate_ignored
  - **Evidence:** Order count, WebhookEventLog records
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

### Gate 7: Load & Performance
- [ ] **Requirement:** Payment intent creation latency <2s p95
  - **Verification:** Artillery load test: 100 concurrent createPaymentIntent calls
  - **Pass Criteria:** p95 latency < 2000ms
  - **Command:** `artillery run pi-creation-load.yml --target=staging`
  - **Evidence:** Artillery report showing p95 latency
  - **Owner:** Ops Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Order verification latency <3s p95
  - **Verification:** Artillery load test: 50 concurrent verifyAndCreateOrder calls (different orders)
  - **Pass Criteria:** p95 latency < 3000ms
  - **Evidence:** Artillery report
  - **Owner:** Ops Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Webhook processing latency <1s p95
  - **Verification:** Artillery load test: 100 webhook deliveries
  - **Pass Criteria:** p95 latency < 1000ms
  - **Evidence:** Artillery report
  - **Owner:** Ops Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Zero timeouts under 100 concurrent checkouts
  - **Verification:** Load test: 100 concurrent full checkout flows (cart → payment → order)
  - **Pass Criteria:** 100/100 success, 0 timeouts, 0 errors
  - **Evidence:** Load test report
  - **Owner:** Ops Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** DB connection pooling (no leaks after 1000 API calls)
  - **Verification:** Monitor DB connection count during load test, after test completes
  - **Pass Criteria:** Connections released, no orphaned connections (should return to baseline ±5)
  - **Evidence:** DB monitoring graphs before/after test
  - **Owner:** Ops Lead
  - **Deadline:** Day -2

### Gate 8: Monitoring & Alerts
- [ ] **Requirement:** FailureLog created for every compensation event
  - **Verification:** Trigger 5 compensation scenarios (item unavailable, coupon limit, restaurant closed, price mismatch, refund failure), check FailureLog
  - **Pass Criteria:** 5 FailureLog records created, each with compensation_status set
  - **Evidence:** FailureLog query results
  - **Owner:** Engineering Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Alert rule: critical failure → email to ops
  - **Verification:** Create a critical FailureLog record manually, check ops email
  - **Pass Criteria:** Email received within 1 minute
  - **Evidence:** Email screenshot
  - **Owner:** Ops Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Alert rule: refund failure rate >5% → Slack alert
  - **Verification:** Manually update 5 FailureLog records with type=refund_initiate, severity=critical, verify Slack alert
  - **Pass Criteria:** Slack alert posted to #ops-alerts (or configured channel)
  - **Evidence:** Slack message screenshot
  - **Owner:** Ops Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Alert rule: PT needs_review count >10 in 1hr → page on-call
  - **Verification:** Create 11 PT records with status=needs_review within 1 hour, check if page triggered
  - **Pass Criteria:** PagerDuty incident created (or alert system of choice)
  - **Evidence:** PagerDuty incident screenshot
  - **Owner:** Ops Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Alert rule: payment success without order >0% → immediate page
  - **Verification:** Manually insert a PaymentTransaction with status=order_created but no matching Order
  - **Pass Criteria:** PagerDuty incident triggered within 2 minutes
  - **Evidence:** PagerDuty incident screenshot
  - **Owner:** Ops Lead
  - **Deadline:** Day -2

- [ ] **Requirement:** Manual review queue monitored (SLA: acknowledged within 30 min)
  - **Verification:** Create a needs_review PT record, confirm process for ops to acknowledge
  - **Pass Criteria:** Process documented, runbook available, on-call trained
  - **Evidence:** Runbook document + team acknowledgment
  - **Owner:** Ops Lead
  - **Deadline:** Day -1

### Gate 9: Rollback Plan
- [ ] **Requirement:** Stripe API version pinned
  - **Verification:** Check createPaymentIntent, refundWithRetry for Stripe(...) initialization
  - **Pass Criteria:** Explicit version specified (e.g., Stripe('...secret...'))
  - **Evidence:** Code review showing version pinning
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** Feature flag for refund auto-compensation exists
  - **Verification:** Check verifyAndCreateOrder for refund trigger logic
  - **Pass Criteria:** Flag accessible in SystemSettings or Deno env, can disable compensation
  - **Evidence:** Code showing flag usage
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** Rollback procedure documented
  - **Verification:** Review rollback runbook (deployment / operations doc)
  - **Pass Criteria:** Runbook exists, covers: revert code, disable features, restore DB (if needed)
  - **Evidence:** Runbook document link
  - **Owner:** Ops Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** Rollback tested in staging
  - **Verification:** Perform rollback test in staging environment
  - **Pass Criteria:** 1. Deploy v1.0, create orders, 2. Rollback to v0.9 (or prior), 3. Verify no data loss, existing orders queryable
  - **Evidence:** Test execution log + DB audit results
  - **Owner:** Ops Lead
  - **Deadline:** Day -2

### Gate 10: Security & Compliance
- [ ] **Requirement:** Stripe webhook secret not logged
  - **Verification:** Grep codebase for STRIPE_WEBHOOK_SECRET in logs
  - **Pass Criteria:** No logs contain secret value (check stripeWebhook, event handlers)
  - **Command:** `grep -r "STRIPE_WEBHOOK_SECRET" functions/ --exclude-dir=__tests__` (should return 0 results in log statements)
  - **Evidence:** Grep results showing only env variable references, no actual secret value
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** PCI-DSS: no card data stored
  - **Verification:** Audit Order, PaymentTransaction, any other entities for card data
  - **Pass Criteria:** No payment_method fields contain card details (only card/cash/apple_pay/google_pay string)
  - **Command:** `SELECT id, payment_method FROM Order LIMIT 1000` (should show only method names, not card numbers)
  - **Evidence:** DB query result
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** Input sanitization on user fields
  - **Verification:** Attempt XSS injection in guest_name, notes, delivery_address (e.g., "<script>alert('xss')</script>")
  - **Pass Criteria:** Injection blocked or sanitized (not executed)
  - **Evidence:** Order record showing sanitized value, no error in console
  - **Owner:** QA Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** CSRF protection on checkout form
  - **Verification:** Check POST /checkout for CSRF token validation
  - **Pass Criteria:** Frontend and backend both implement token check (e.g., X-CSRF-Token header)
  - **Evidence:** Code review showing CSRF middleware
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

- [ ] **Requirement:** Rate limiting on createPaymentIntent
  - **Verification:** Send 50 requests from same IP in 1 second
  - **Pass Criteria:** Requests after limit are rejected with 429 status
  - **Evidence:** Load test results showing 429 responses
  - **Owner:** Engineering Lead
  - **Deadline:** Day -1

---

## RELEASE SIGN-OFF

### Final Approval Checklist
- [ ] **Engineering Lead** sign-off: All code changes reviewed, all tests pass, no technical debt
  - **Name:** ________________  **Date:** ________________  **Signature:** ________________

- [ ] **QA Lead** sign-off: All manual tests pass, no blockers, system stable
  - **Name:** ________________  **Date:** ________________  **Signature:** ________________

- [ ] **Ops Lead** sign-off: Infrastructure ready, monitoring in place, runbooks documented
  - **Name:** ________________  **Date:** ________________  **Signature:** ________________

### Release Decision
- [ ] **Green Light:** All 10 gates PASS, all 3 leaders approve → **Proceed to production**
- [ ] **Yellow Light:** 1-2 gates FAIL (non-critical), documented exceptions approved → **Proceed with caution**
- [ ] **Red Light:** 3+ gates FAIL or critical security/payment issue → **STOP, fix issues, re-test**

**Release Status:** _______________  
**Date Released:** _______________  
**Deployed By:** _______________  
**Deployment Window:** _______________  

---

## POST-RELEASE MONITORING (72 hours)

### Day 1 Checklist
- [ ] Monitor FailureLog for any new incident patterns (target: 0 critical refund failures)
- [ ] Verify order throughput (should match staging baseline ±10%)
- [ ] Check webhook processing latency (should stay <1s p95)
- [ ] Review error rate (target: <0.1% payment failures)
- [ ] Confirm all alerts functional (test one alert manually)

### Day 2-3 Checklist
- [ ] Run full manual test suite again (10 tests, happy path + edge cases)
- [ ] Verify no orphaned PaymentTransaction records (query should return 0)
- [ ] Check manual review queue (any needs_review items? If yes, confirm acknowledged)
- [ ] Performance: confirm no degradation vs. baseline

**Release Successful:** _____ (all Day 1-3 checks pass)