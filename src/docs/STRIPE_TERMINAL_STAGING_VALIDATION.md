# Stripe Terminal Staging Validation — Pre-Pilot QA Checklist

## Objective

Validate operationally that Stripe Terminal flow is safe for controlled pilot rollout.

**Scope:** Real hardware, real card, operator workflow, failure recovery

**Timeline:** 1 day of testing with real Stripe Terminal reader

**Success Criteria:** All critical scenarios pass OR have acceptable mitigations

---

## Test Matrix

### Test Categories

1. **Happy Path** (authorization, order creation)
2. **Card Outcomes** (decline, expired, no funds, lost card)
3. **Customer Actions** (cancel, timeout, interrupt)
4. **Network Issues** (disconnect, retry, recovery)
5. **Reader Issues** (offline, unresponsive, reconnect)
6. **Data Integrity** (amount verification, dedup, reconciliation)
7. **POS/Kiosk Integration** (both workflows verified)
8. **UI/UX Operator Safety** (clear error messages, recovery paths)

### Test Cases (12+)

---

## TEST CASE MATRIX

### Category 1: Happy Path (Authorization + Order)

#### TC-001: Successful Card Authorization → Order Created

**Test Steps:**
1. Launch kiosk, add items (subtotal = £15.50)
2. Click "Pay with Card"
3. Terminal shows: "Insert/tap card"
4. Tap Stripe test card: **4242 4242 4242 4242**
5. Terminal shows: "Processing..."
6. Terminal shows: "Approved ✓"
7. Kiosk shows: "Payment confirmed ✓"
8. Kiosk shows: "Order #123 confirmed"

**Expected DB Records:**
- ✅ `KioskTerminalTransaction`: status='approved', amount=15.50, provider='stripe_terminal'
- ✅ `Order`: status='confirmed', payment_method='card', payment_status='paid_card', total=15.50

**Pass Criteria:**
- [ ] Terminal displays "Approved"
- [ ] UI shows green checkmark
- [ ] Order created immediately
- [ ] DB records exist within 2 seconds
- [ ] stripeIntentId present (reconciliation)

**Blocker Risk:** None
**Pilot Acceptable:** YES

---

#### TC-002: POS Card Order (Dine-In Table)

**Test Steps:**
1. Launch POS dashboard
2. Staff logs in, selects Table 5
3. Adds items (steak £18.00 + wine £8.50 = £26.50)
4. Click "Process Card Payment"
5. Terminal shows: "Processing payment..."
6. Tap card: **4242 4242 4242 4242**
7. Terminal shows: "Approved ✓"
8. POS shows: "Payment confirmed"
9. Order created: dine_in, payment='card', status='confirmed'

**Expected DB Records:**
- ✅ `KioskTerminalTransaction`: status='approved', amount=26.50, provider='stripe_terminal'
- ✅ `Order`: order_type='dine_in', table_id='5', payment_status='paid_card'

**Pass Criteria:**
- [ ] Terminal approves
- [ ] POS shows confirmation
- [ ] Order marked as dine_in (not delivery)
- [ ] Kitchen display receives order immediately

**Blocker Risk:** None
**Pilot Acceptable:** YES

---

### Category 2: Card Outcomes (Real Card Rejection)

#### TC-003: Card Declined (Insufficient Funds)

**Test Steps:**
1. Kiosk: select items (£20.00)
2. Click "Pay with Card"
3. Tap test card: **4000 0000 0000 0002** (Stripe test = decline)
4. Terminal shows: "Card declined"
5. Kiosk shows red error: "Card was declined. Try another card."

**Expected DB Records:**
- ✅ `KioskTerminalTransaction`: status='declined', amount=20.00, error='Card declined: generic_decline'
- ❌ NO Order created

**Pass Criteria:**
- [ ] Terminal displays "Card declined"
- [ ] Kiosk shows clear error message
- [ ] No order created
- [ ] DB record written with decline reason
- [ ] Customer can retry with different card

**Blocker Risk:** None
**Pilot Acceptable:** YES

---

#### TC-004: Expired Card

**Test Steps:**
1. Kiosk: select items (£15.00)
2. Click "Pay with Card"
3. Tap expired test card: **4000 0000 0000 0069** (Stripe test card)
4. Terminal shows: "Card expired"
5. Kiosk shows error: "Card expired. Use another card."

**Expected DB Records:**
- ✅ `KioskTerminalTransaction`: status='declined', error='Card declined: expired_card'
- ❌ NO Order

**Pass Criteria:**
- [ ] Error message mentions "expired"
- [ ] Staff/customer knows to try different card
- [ ] No partial charge

**Blocker Risk:** None
**Pilot Acceptable:** YES

---

#### TC-005: Lost Card / Stolen Card Decline

**Test Steps:**
1. Use Stripe test card indicating lost/stolen status
2. Terminal displays decline message
3. Kiosk shows error

**Expected:** Similar to TC-003 (declined, no order)

**Pass Criteria:**
- [ ] Declined clearly
- [ ] Message doesn't expose security reason (just "declined")
- [ ] Operator knows to ask customer to contact bank

**Blocker Risk:** None
**Pilot Acceptable:** YES

---

### Category 3: Customer Actions (Cancel, Timeout)

#### TC-006: Customer Cancels Payment (Before Card Tap)

**Test Steps:**
1. Kiosk: select items, click "Pay with Card"
2. Terminal shows: "Insert/tap card"
3. Customer presses CANCEL on reader
4. Terminal shows: "Cancelled"
5. Kiosk shows: "Payment cancelled"
6. Kiosk returns to cart (not cleared)

**Expected DB Records:**
- ✅ `KioskTerminalTransaction`: status='cancelled'
- ❌ NO Order
- ✅ Cart still has items (customer can continue shopping or leave)

**Pass Criteria:**
- [ ] Terminal responds to cancel button
- [ ] Kiosk shows "Payment cancelled"
- [ ] Cart not cleared (customer has second chance)
- [ ] No charge on card

**Blocker Risk:** None
**Pilot Acceptable:** YES

---

#### TC-007: Reader Timeout (No Card Inserted Within 30s)

**Test Steps:**
1. Kiosk: select items, click "Pay with Card"
2. Terminal waits for card...
3. Wait 35 seconds (no card inserted)
4. Terminal times out
5. Kiosk shows: "Card reader timed out. Try again."

**Expected DB Records:**
- ✅ `KioskTerminalTransaction`: status='timeout', error='Terminal did not respond'
- ❌ NO Order (no charge)

**Pass Criteria:**
- [ ] Timeout detected within reasonable time (~35 sec)
- [ ] Clear message shown to customer
- [ ] Kiosk allows retry
- [ ] No charge (partial or full)

**Blocker Risk:** MEDIUM (if timeout is too long, customer leaves)
**Pilot Acceptable:** YES (if message is clear, retry is easy)
**Mitigation:** Staff trained to prompt customer; clear signage above reader

---

#### TC-008: Customer Closes App During Payment (App Refresh)

**Test Steps:**
1. Kiosk: select items, click "Pay with Card"
2. Terminal: awaiting card
3. Admin closes kiosk app (or screen locks)
4. Admin reopens app / relaunches
5. Kiosk shows: cart (previous state)
6. What about the terminal intent?

**Expected:**
- Terminal still waiting for card (independent)
- Customer can close app and relaunch safely
- No double-charge

**Critical Question:** Does backend handle orphaned intent?

**Pass Criteria:**
- [ ] App can be safely closed without charge
- [ ] Intent is cleaned up or can be retried
- [ ] DB shows only ONE transaction record (idempotency key)

**Blocker Risk:** HIGH if double-charge possible
**Validation Needed:** Test with app close mid-payment

---

### Category 4: Network Issues

#### TC-009: Network Interrupt During Processing

**Test Steps:**
1. Kiosk: select items (£15.00)
2. Click "Pay with Card"
3. Terminal processes payment
4. Disconnect network (pull ethernet/turn off WiFi)
5. Backend continues polling (or fails gracefully)
6. Reconnect network
7. What does kiosk show?

**Expected:**
- Backend retries with same Idempotency-Key
- Stripe prevents duplicate charge
- Kiosk eventually shows result (approved or error)
- No double-charge

**Pass Criteria:**
- [ ] No double-charge
- [ ] Kiosk recovers and shows final status
- [ ] DB has ONE transaction record
- [ ] Order created (if approved) or failed (if error)

**Blocker Risk:** HIGH if double-charge possible
**Validation Needed:** Test network failure scenario

---

#### TC-010: Reader Connection Lost Mid-Payment

**Test Steps:**
1. Kiosk: click "Pay with Card"
2. Terminal processes payment
3. Reader loses connection (WiFi drops, USB unplugged, etc.)
4. What happens?

**Expected:**
- Reader times out
- Backend returns error
- Kiosk shows "Reader unavailable"
- Customer can retry once reader is back

**Pass Criteria:**
- [ ] Clear error message
- [ ] No stuck order
- [ ] Reader can reconnect and retry

**Blocker Risk:** MEDIUM
**Pilot Acceptable:** YES (with operator training)

---

### Category 5: Data Integrity

#### TC-011: Duplicate Payment Attempt (Rapid Double-Tap)

**Test Steps:**
1. Kiosk: select items (£12.50)
2. Click "Pay with Card" button
3. Rapidly click "Pay with Card" again (within 100ms)
4. What happens?

**Expected:**
- First request creates intent, polls
- Second request with SAME transactionRef hits dedup check
- Returns original result (idempotent)
- NO double-charge
- NO duplicate order

**Pass Criteria:**
- [ ] Only ONE order created
- [ ] Only ONE transaction record in DB
- [ ] Only ONE charge to customer's card
- [ ] Both UI calls show same result

**Blocker Risk:** HIGH if double-charge
**Validation Needed:** Test rapid double-tap

---

#### TC-012: Amount Mismatch Rejection (kioskCreateOrder Verification)

**Test Steps:**
1. Kiosk: select items (£15.00)
2. Click "Pay with Card"
3. Terminal: tap card → Approved for £15.00
4. Backend creates intent for £15.00
5. kioskCreateOrder called with different amount (£20.00)?
6. What happens?

**Expected:**
- kioskCreateOrder verifies amount in DB matches order
- If mismatch: order creation FAILS
- No order created
- No charge processed

**Pass Criteria:**
- [ ] Amount verified before order creation
- [ ] Mismatch causes order failure
- [ ] Transaction stays in 'approved' state (not 'redeemed')

**Blocker Risk:** MEDIUM (should never happen, but protection needed)
**Validation Needed:** Code review (see kioskCreateOrder verification)

---

#### TC-013: Reused Transaction Reference (Replay Attack)

**Test Steps:**
1. Kiosk: pay for order 1 (£15.00) → ref='KIOSK-ABC-12345'
2. Terminal approves, order 1 created
3. Attacker tries: POST processCardTerminal with ref='KIOSK-ABC-12345' again
4. What happens?

**Expected:**
- Backend detects duplicate ref (dedup check line 57-83)
- Returns original result (idempotent)
- NO second transaction
- NO second order

**Pass Criteria:**
- [ ] Duplicate ref rejected
- [ ] Original result returned
- [ ] No second transaction in DB

**Blocker Risk:** MEDIUM (security check)
**Validation Needed:** Code review confirms dedup logic

---

### Category 6: Reader Issues

#### TC-014: Reader Offline at Start

**Test Steps:**
1. Stripe Dashboard: Readers page shows reader as "OFFLINE"
2. Kiosk: select items, click "Pay with Card"
3. Backend attempts to instruct offline reader
4. What happens?

**Expected:**
- API call fails (reader unavailable)
- Backend returns error: "Reader unavailable"
- Kiosk shows: "Card reader unavailable. Try again."
- No charge

**Pass Criteria:**
- [ ] Error detected immediately
- [ ] Clear message to customer
- [ ] No orphaned order or intent
- [ ] Operator knows to check reader

**Blocker Risk:** MEDIUM (reader must be online for pilot)
**Mitigation:** Pre-flight check: verify reader is online before opening kiosk

---

#### TC-015: Reader Reconnects After Brief Disconnect

**Test Steps:**
1. Reader temporarily loses network (1-2 seconds)
2. Reader reconnects
3. Kiosk: attempt payment
4. Does reader respond normally?

**Expected:**
- Reader recovers and processes payment normally
- No impact to transaction

**Pass Criteria:**
- [ ] Brief disconnection doesn't break next transaction
- [ ] Reader can be used normally after reconnect

**Blocker Risk:** LOW
**Pilot Acceptable:** YES

---

### Category 7: POS Integration

#### TC-016: POS Staff Login → Card Payment → Order → Kitchen Display

**Test Steps:**
1. POS: staff logs in (cashier role)
2. Select table or customer
3. Add items (subtotal = £25.50)
4. Click "Process Card Payment"
5. Terminal: tap card 4242... → Approved
6. POS: shows "Payment confirmed"
7. Order created: payment_method='card', payment_status='paid_card'
8. Kitchen Display System: receives order with payment already confirmed

**Expected:**
- Kitchen does NOT see "awaiting payment" status
- Kitchen begins prep immediately
- Order history shows payment confirmed

**Pass Criteria:**
- [ ] POS shows confirmation
- [ ] Kitchen display shows order immediately
- [ ] Payment status is 'paid_card' (not 'pending')
- [ ] No manual payment confirmation needed

**Blocker Risk:** MEDIUM (if KDS doesn't show payment status)
**Validation Needed:** Check KDS integration

---

### Category 8: Operator Safety & UX

#### TC-017: Error Message Clarity (Non-Technical Staff)

**Test Steps:**
1. Trigger various failures (decline, timeout, reader offline, etc.)
2. Evaluate error messages shown to staff/customer
3. Are messages clear? Actionable? Non-technical?

**Evaluate:**
- [ ] "Card declined" — Clear (not "requires_payment_method")
- [ ] "Reader unavailable" — Clear (not "HTTP 500 from Stripe API")
- [ ] "Payment cancelled" — Clear
- [ ] "Try another card" — Actionable (not "retry transaction")

**Blocker Risk:** LOW (mostly UX)
**Pilot Acceptable:** YES (if messages are understandable)

---

#### TC-018: Recovery Path After Failure

**Test Steps:**
1. Payment fails (decline, timeout, cancel, error)
2. What can operator/customer do next?
3. Is recovery path clear?

**Evaluate:**
- [ ] Can customer try different card? (YES → button available)
- [ ] Can operator retry? (YES → clear flow)
- [ ] Is cart preserved? (YES → customer doesn't re-enter order)
- [ ] Is previous transaction still visible? (YES → for reconciliation)

**Blocker Risk:** LOW
**Pilot Acceptable:** YES (if recovery is smooth)

---

## EXECUTION & RESULTS

### Prerequisite Checks

**Before Testing:**
- [ ] Stripe Terminal reader is provisioned and ONLINE
- [ ] Reader is paired with location in Stripe Dashboard
- [ ] Reader ID is configured in Restaurant.kiosk_config
- [ ] STRIPE_SECRET_KEY is set (test key for staging)
- [ ] Test card: 4242 4242 4242 4242 (valid)
- [ ] Test card: 4000 0000 0000 0002 (decline)
- [ ] Monitoring/logging is visible (can watch DB records)
- [ ] Backup reader available (in case primary fails)

### Test Execution Summary

| TC# | Test Case | Expected | Result | Pass? | Blocker? | Notes |
|-----|-----------|----------|--------|-------|----------|-------|
| 001 | Successful Auth → Order | Approved, order created | [RUN] | [ ] | [ ] | |
| 002 | POS Card Order | Approved, dine-in order | [RUN] | [ ] | [ ] | |
| 003 | Card Declined | Declined, no order | [RUN] | [ ] | [ ] | |
| 004 | Expired Card | Declined, clear error | [RUN] | [ ] | [ ] | |
| 005 | Lost Card | Declined, no order | [RUN] | [ ] | [ ] | |
| 006 | Customer Cancel | Cancelled, cart preserved | [RUN] | [ ] | [ ] | |
| 007 | Reader Timeout | Timeout, clear message | [RUN] | [ ] | [ ] | |
| 008 | App Refresh Mid-Payment | Safe close, no double-charge | [RUN] | [ ] | [?] | Check for orphaned intents |
| 009 | Network Interrupt | Retry safe, no double-charge | [RUN] | [ ] | [?] | Network resilience test |
| 010 | Reader Disconnect | Clear error, can retry | [RUN] | [ ] | [ ] | |
| 011 | Duplicate Payment (Double-Tap) | Only 1 order, no double-charge | [RUN] | [ ] | [?] | Idempotency critical |
| 012 | Amount Mismatch | Order fails, no charge | [RUN] | [ ] | [ ] | Code review needed |
| 013 | Replay Attack (Reused Ref) | Duplicate blocked | [RUN] | [ ] | [ ] | Code review needed |
| 014 | Reader Offline | Clear error, no charge | [RUN] | [ ] | [ ] | |
| 015 | Reader Reconnects | Normal operation | [RUN] | [ ] | [ ] | |
| 016 | POS Order Full Flow | Payment confirmed, KDS updated | [RUN] | [ ] | [ ] | |
| 017 | Error Messages | Clear, non-technical | [REVIEW] | [ ] | [ ] | Manual review |
| 018 | Recovery Paths | Smooth, cart preserved | [REVIEW] | [ ] | [ ] | Manual review |

---

## BLOCKER ANALYSIS

### Critical Blockers (MUST PASS Before Pilot)

1. **Double-Charge Prevention** (TC-011)
   - If rapid double-tap creates 2 orders AND charges twice → BLOCKER
   - **Code Status:** Dedup check in place (line 57-83), Idempotency-Key on Stripe call
   - **Validation Method:** Test rapid double-tap with real card
   - **Risk Level:** HIGH (financial impact)

2. **Network Resilience** (TC-009)
   - If network interrupt causes double-charge → BLOCKER
   - **Code Status:** Idempotency-Key prevents Stripe duplicate, but need to verify polling recovery
   - **Validation Method:** Test with network disconnect mid-payment
   - **Risk Level:** HIGH (financial impact)

3. **App Refresh Safety** (TC-008)
   - If app close mid-payment leaves orphaned intent → BLOCKER
   - **Code Status:** Need to verify cleanup or idempotent retry
   - **Validation Method:** Test app close during terminal processing
   - **Risk Level:** HIGH (customer could be charged without order)

4. **Reader Availability** (TC-014)
   - If offline reader is not detected → May block pilot start
   - **Code Status:** Error handling in place, but reader status check unclear
   - **Validation Method:** Start with offline reader
   - **Risk Level:** MEDIUM (blocks pilot start, not during transaction)

### Pilot-Acceptable with Mitigations

1. **Reader Timeout** (TC-007)
   - Risk: Customer leaves before seeing timeout message
   - Mitigation: Clear signage ("Tap card within 30 seconds"), staff training
   - **Acceptable:** YES

2. **Terminal Disconnect** (TC-010)
   - Risk: Reader loses connection mid-transaction
   - Mitigation: Staff checks reader connection, can retry once reconnected
   - **Acceptable:** YES (with procedure)

3. **Error Message Clarity** (TC-017)
   - Risk: Staff confused by technical errors
   - Mitigation: Staff training, operator runbook
   - **Acceptable:** YES (with runbook)

### Low Risk

1. Card outcomes (decline, expired) — Expected, tested
2. POS integration — Code follows same path as kiosk
3. Recovery paths — UI enables retry
4. Reader reconnect — Normal operation

---

## OPERATOR RUNBOOK INPUTS

### Scenario 1: Card Declined (TC-003, 004, 005)

**What Staff Should Do:**
1. ✅ Tell customer: "This card was declined. Please try another card."
2. ✅ Let customer tap a different card
3. ✅ If declined again: escalate to manager

**What Staff Should NOT Do:**
1. ❌ Do NOT manually override payment
2. ❌ Do NOT ask customer for card number (tells them it's unsafe)
3. ❌ Do NOT accept cash without manager approval

**When to Retry:**
- Immediately (same customer, different card)

**When to Escalate:**
- 3+ declines → Ask customer to contact their bank
- Customer has different card → Process that card instead

**Reconciliation:**
- Each decline creates `KioskTerminalTransaction` record with decline_reason
- Check Stripe Dashboard if customer disputes
- No order created = no refund needed

---

### Scenario 2: Reader Timeout (TC-007)

**What Staff Should Do:**
1. ✅ Tell customer: "Card reader timed out. Please try again."
2. ✅ Ensure customer is present (not left kiosk)
3. ✅ Offer to start over (tap card again)

**What Staff Should NOT Do:**
1. ❌ Do NOT wait more than 10 seconds for card reader to respond
2. ❌ Do NOT assume the card was processed (no charge yet if timeout)
3. ❌ Do NOT manually mark payment as complete

**When to Retry:**
- Immediately after timeout message

**When to Escalate:**
- Timeout happens 2+ times with same card → Reader might be offline
- Check reader status on Stripe Dashboard

**Reconciliation:**
- If customer says "I was charged but no order was created" → Check:
  1. Stripe Dashboard → Payments (search customer's card)
  2. If charge exists: manually create order (manager approval)
  3. If no charge: customer's bank took a hold (will release in 1-3 days)

---

### Scenario 3: Reader Offline (TC-014)

**What Staff Should Do:**
1. ✅ Check physical reader (is it powered on? WiFi connected?)
2. ✅ Restart reader if needed (power off 10 sec, power on)
3. ✅ Check Stripe Dashboard: Readers page
4. ✅ If still offline: call IT/manager

**What Staff Should NOT Do:**
1. ❌ Do NOT keep trying to process payment (it will fail)
2. ❌ Do NOT accept cash without manager approval

**When to Retry:**
- After reader shows "Online" in Stripe Dashboard

**When to Escalate:**
- Reader offline more than 5 minutes → Call manager/IT
- Multiple payment attempts fail → Reader might be broken

**Reconciliation:**
- No transactions created if reader is offline
- Safe to reboot reader during off-peak hours

---

### Scenario 4: Customer Cancels (TC-006)

**What Staff Should Do:**
1. ✅ Tell customer: "Payment cancelled. Cart still has your items."
2. ✅ Offer: "Would you like to try again with a different card?"
3. ✅ Or: "You can save your items and come back later."

**What Staff Should NOT Do:**
1. ❌ Do NOT clear the cart automatically
2. ❌ Do NOT charge the customer's card (cancelled = no charge)

**When to Retry:**
- Immediately (same customer, same or different card)

**When to Escalate:**
- Never (normal customer behavior)

**Reconciliation:**
- Cancelled transactions create `KioskTerminalTransaction` with status='cancelled'
- No order created, no charge → No reconciliation needed

---

### Scenario 5: Network Issues / App Crash (TC-008, 009)

**What Staff Should Do:**
1. ✅ If app crashes: restart the kiosk
2. ✅ If network drops: check WiFi/ethernet connection
3. ✅ Offer customer to try again
4. ✅ Wait 30 seconds, then retry payment

**What Staff Should NOT Do:**
1. ❌ Do NOT immediately retry (wait for network to stabilize)
2. ❌ Do NOT assume customer was charged during app crash

**When to Retry:**
- After 30 seconds (allows network to recover)

**When to Escalate:**
- Network down longer than 5 minutes → Call IT
- App crashes repeatedly → Restart kiosk, call manager

**Reconciliation:**
- If app crashed mid-payment: Check Stripe Dashboard
- Search for intent with customer's amount
- If intent shows 'succeeded': manually create order
- If intent shows 'requires_payment_method': customer was NOT charged

---

### Scenario 6: Double-Charge Suspected (TC-011)

**What Staff Should Do:**
1. ✅ Check Order history: are there 2 orders for same customer?
2. ✅ Check Stripe Dashboard: how many charges?
3. ✅ If 2 orders created from 1 card tap: document it
4. ✅ Report to manager immediately

**What Staff Should NOT Do:**
1. ❌ Do NOT delete orders without manager approval
2. ❌ Do NOT assume system is broken

**When to Retry:**
- Only with manager approval

**When to Escalate:**
- Immediately to manager/QA if double-charge suspected

**Reconciliation:**
- Manager checks: was there 1 Stripe charge or 2?
- If 1 charge → two orders = database issue (refund one order, contact support)
- If 2 charges → real double-charge (issue refund immediately)

---

## FINAL RECOMMENDATION

### Based on Code Review + Test Design

**Status:** ⚠️ **CONDITIONAL GO FOR CONTROLLED PILOT**

### Blockers Found

**Critical (Must Resolve Before Pilot):**
1. ✅ **Double-charge prevention:** Code has idempotency + dedup checks (GOOD)
   - Status: Code review PASSED
   - Validation: Must test with rapid double-tap (1 test case)

2. ✅ **Network resilience:** Idempotency-Key on Stripe call (GOOD)
   - Status: Code review PASSED
   - Validation: Must test with network disconnect (1 test case)

3. ⚠️ **App refresh safety:** Unclear if orphaned intents are cleaned up
   - Status: Code review INCOMPLETE
   - Validation: Must test app close mid-payment
   - **Recommendation:** Investigate intent cleanup / timeout

### Mitigations Needed

| Issue | Mitigation | Owner |
|-------|-----------|-------|
| Reader timeout (35 sec) | Clear signage, staff training | Ops |
| Reader disconnect recovery | Restart procedure, check status | Ops |
| Error message clarity | Operator runbook (provided above) | Training |
| Network resilience | Backup WiFi + ethernet, 1-try rule | IT |

### Conditional Approval

**GO FOR PILOT if:**
- [ ] Code review confirms app refresh safety (test TC-008)
- [ ] Test TC-011 (double-tap) passes with real card
- [ ] Test TC-009 (network interrupt) passes
- [ ] All 18 test cases pass with real hardware
- [ ] Operator runbook (provided above) is printed + trained
- [ ] Reader is verified ONLINE before opening kiosk
- [ ] Backup reader available

**NO-GO if:**
- [ ] Any critical blocker fails (double-charge, network, app refresh)
- [ ] Reader cannot be brought online
- [ ] Stripe API key is invalid

### Pilot Scope

**Recommended:**
- **Duration:** 1 week (5 business days)
- **Restaurants:** 1-2 locations (not all at once)
- **Card types:** Visa + Mastercard only (not Amex, not cash)
- **Transaction limit:** Cap at £50/transaction during pilot
- **Monitoring:** Daily reconciliation check + error rate monitoring
- **Escalation:** Any customer complaints → immediate investigation

**Success Criteria for Pilot:**
- 0 double-charges
- < 1% payment decline rate (normal for card processing)
- < 5% timeout rate (indicates reader issues)
- All order creation within 5 seconds of approval
- Kitchen display shows payment confirmed status
- No orphaned transactions or intents

### Post-Pilot Roadmap

1. **Week 2:** Monitor pilot data, review error logs, gather staff feedback
2. **Week 3:** Expand to 5-10 locations if pilot is clean
3. **Week 4:** Full rollout if no issues found
4. **Optional:** Add webhook support (replaces polling), refund API, scheduled payments

---

## SIGN-OFF

**QA Lead:** _____________________ Date: _______

**Operations Manager:** _____________________ Date: _______

**Engineering Lead:** _____________________ Date: _______

---

## APPENDIX: Code Review Validation Checklist

### Critical Code Paths to Verify

- [ ] **processCardTerminal line 57-83:** Dedup logic works with real Stripe calls
- [ ] **processCardTerminal line 100-109:** DB record written BEFORE response sent
- [ ] **processStripeTerminalProvider line 300-320:** Idempotency-Key header always sent
- [ ] **processStripeTerminalProvider line 345-375:** Status polling handles all outcomes
- [ ] **kioskCreateOrder:** Verifies transaction amount before creating order
- [ ] **kioskCreateOrder:** Marks transaction as 'redeemed' (prevents double-redemption)
- [ ] **KioskTerminalTransaction.filter:** Dedup check is atomic (not race-conditioned)

### Test Execution Log (To be filled during testing)

**Date:** ______  
**Tester:** ______  
**Reader ID:** ______  
**Environment:** Test / Live  

| TC# | Time | Status | Notes |
|-----|------|--------|-------|
| 001 | [ ] | [ ] | |
| 002 | [ ] | [ ] | |
| ... | [ ] | [ ] | |