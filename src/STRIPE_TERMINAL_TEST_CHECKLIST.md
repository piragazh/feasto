# Stripe Terminal Test Execution Checklist

## Pre-Test Setup

### Environment Checklist
- [ ] Stripe Terminal reader is ONLINE (check Stripe Dashboard → Readers)
- [ ] Reader ID is noted: `rdr_________________`
- [ ] STRIPE_SECRET_KEY is set (test key: `sk_test_...`)
- [ ] Restaurant config has `stripe_reader_id` field populated
- [ ] Monitoring/logging is accessible (can watch DB records)
- [ ] Test card: **4242 4242 4242 4242** (Stripe test = approve)
- [ ] Test card: **4000 0000 0000 0002** (Stripe test = decline)
- [ ] Backup reader available if primary fails
- [ ] QA tester ready + runbook at hand
- [ ] Database access ready (can query KioskTerminalTransaction)

**Tester Name:** _____________________  
**Start Time:** _____ **Date:** _____  

---

## TEST EXECUTION MATRIX

### CATEGORY 1: Happy Path (Pass/Fail Criteria)

#### TC-001: Successful Card Authorization → Order Created
**Steps:**
1. Launch kiosk, add items (total = £15.50)
2. Click "Pay with Card"
3. Terminal shows: "Insert/tap card"
4. Tap test card: **4242 4242 4242 4242**
5. Terminal shows: "Processing..."
6. Terminal shows: "Approved ✓"

**Expected Results:**
- [ ] Terminal displays green "Approved"
- [ ] Kiosk UI shows ✓ (green checkmark)
- [ ] Order number displayed
- [ ] DB: KioskTerminalTransaction exists with status='approved'
- [ ] DB: Order exists with payment_status='paid_card'
- [ ] Amount in DB matches £15.50

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

#### TC-002: POS Card Order (Dine-In Table)
**Steps:**
1. Launch POS dashboard
2. Staff logs in (cashier role)
3. Select Table 5
4. Add items (steak £18.00 + wine £8.50 = £26.50)
5. Click "Process Card Payment"
6. Tap card: **4242 4242 4242 4242**
7. Terminal shows: "Approved ✓"

**Expected Results:**
- [ ] Terminal displays "Approved"
- [ ] POS shows "Payment confirmed"
- [ ] Kitchen display shows order immediately
- [ ] Order marked as dine_in (not delivery)
- [ ] DB: Order has order_type='dine_in', table_id='5'

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

### CATEGORY 2: Card Outcomes (Real Card Rejection)

#### TC-003: Card Declined (Insufficient Funds)
**Steps:**
1. Kiosk: select items (£20.00)
2. Click "Pay with Card"
3. Tap test card: **4000 0000 0000 0002** (decline card)
4. Terminal shows: "Card declined"

**Expected Results:**
- [ ] Terminal clearly displays "Card declined"
- [ ] Kiosk shows error message
- [ ] No order created in database
- [ ] DB: KioskTerminalTransaction exists with status='declined'
- [ ] Error reason logged (e.g., 'generic_decline')
- [ ] Customer can try another card

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

#### TC-004: Expired Card
**Steps:**
1. Kiosk: select items (£15.00)
2. Click "Pay with Card"
3. Tap test card: **4000 0000 0000 0069** (expired)
4. Terminal shows: "Card expired" or "Card declined"

**Expected Results:**
- [ ] Terminal shows decline message
- [ ] Kiosk error message mentions card issue
- [ ] No order created
- [ ] DB: Transaction status='declined'

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

#### TC-005: Lost/Stolen Card
**Steps:**
1. Use Stripe test card for lost/stolen status
2. Terminal processes
3. Card rejected

**Expected Results:**
- [ ] Declined clearly
- [ ] Message doesn't expose security reason
- [ ] No order created
- [ ] DB: Transaction status='declined'

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

### CATEGORY 3: Customer Actions (Cancel, Timeout)

#### TC-006: Customer Cancels (Before Card Tap)
**Steps:**
1. Kiosk: select items, click "Pay with Card"
2. Terminal shows: "Insert/tap card"
3. Customer presses CANCEL on reader
4. Terminal shows: "Cancelled"

**Expected Results:**
- [ ] Terminal responds to cancel
- [ ] Kiosk shows "Payment cancelled"
- [ ] Cart NOT cleared (items still there)
- [ ] No charge on card
- [ ] DB: Transaction status='cancelled'

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

#### TC-007: Reader Timeout (No Card Inserted, 35+ Seconds)
**Steps:**
1. Kiosk: select items, click "Pay with Card"
2. Terminal waits for card
3. Wait 35+ seconds (don't insert card)
4. Terminal times out

**Expected Results:**
- [ ] Timeout detected within reasonable time
- [ ] Clear error message shown
- [ ] Kiosk allows retry
- [ ] No charge (zero or partial)
- [ ] DB: Transaction status='timeout'

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

#### TC-008: App Refresh During Payment (CRITICAL)
**Steps:**
1. Kiosk: select items, click "Pay with Card"
2. Terminal: awaiting card
3. Admin closes app / screen locks
4. Admin reopens app
5. What state is the system in?

**Expected Results:**
- [ ] App can close safely without charge
- [ ] Intent is handled safely (no orphaned charge)
- [ ] DB: Only ONE transaction record (idempotency)
- [ ] Kiosk can retry payment safely
- [ ] No unexpected charge on test card

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

### CATEGORY 4: Network Issues

#### TC-009: Network Interrupt During Processing (CRITICAL)
**Steps:**
1. Kiosk: select items (£15.00)
2. Click "Pay with Card"
3. Terminal processes payment
4. DISCONNECT network (WiFi/ethernet)
5. Wait 5 seconds
6. RECONNECT network
7. Monitor what happens

**Expected Results:**
- [ ] No double-charge (only 1 charge on card)
- [ ] Kiosk eventually shows result
- [ ] DB: Only ONE transaction record
- [ ] Order created (if approved) or error shown (if failed)
- [ ] System recovers gracefully

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

#### TC-010: Reader Connection Lost
**Steps:**
1. Payment processing starts
2. Reader loses WiFi/USB connection
3. Monitor recovery

**Expected Results:**
- [ ] Clear error message
- [ ] No stuck order
- [ ] Reader can reconnect
- [ ] Payment can be retried

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

### CATEGORY 5: Data Integrity (CRITICAL)

#### TC-011: Duplicate Payment (Rapid Double-Tap) (CRITICAL)
**Steps:**
1. Kiosk: select items (£12.50)
2. Click "Pay with Card"
3. RAPIDLY click "Pay with Card" again (within 100ms)
4. Monitor what happens

**Expected Results:**
- [ ] Only ONE order created (not 2)
- [ ] Only ONE transaction in DB
- [ ] Only ONE charge on card (not 2)
- [ ] Both UI calls show same result
- [ ] NO double-charge

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**CRITICAL:** ☐ This MUST pass — if it fails, BLOCKER  
**Notes:** ________________________________________________________________

---

#### TC-012: Amount Mismatch Rejection
**Steps:**
1. Kiosk: select items (£15.00)
2. Terminal: approve for £15.00
3. Try to create order with different amount (£20.00)?

**Expected Results:**
- [ ] Order creation fails (amount mismatch)
- [ ] No order created
- [ ] Transaction stays in 'approved' state (not redeemed)

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

#### TC-013: Reused Transaction Reference (Replay Attack)
**Steps:**
1. Pay for order 1 (ref='ABC-12345') → approve
2. Attacker retries with same ref
3. What happens?

**Expected Results:**
- [ ] Duplicate ref blocked
- [ ] Original result returned (idempotent)
- [ ] No second transaction
- [ ] No second order

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

### CATEGORY 6: Reader Issues

#### TC-014: Reader Offline at Start
**Steps:**
1. Reader is OFFLINE (disable network / power off)
2. Kiosk: select items, click "Pay with Card"
3. Monitor what happens

**Expected Results:**
- [ ] Error detected immediately
- [ ] Clear message: "Card reader unavailable"
- [ ] No orphaned order
- [ ] No charge

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

#### TC-015: Reader Reconnects After Brief Disconnect
**Steps:**
1. Reader loses connection (1-2 seconds)
2. Reader reconnects
3. Try payment again

**Expected Results:**
- [ ] Brief disconnect doesn't break next payment
- [ ] Reader responds normally

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

### CATEGORY 7: POS Integration

#### TC-016: POS Full Workflow (Staff Login → Payment → Order → KDS)
**Steps:**
1. POS: staff logs in
2. Select customer/table
3. Add items (£25.50)
4. Click "Process Card Payment"
5. Terminal: approve
6. Check Kitchen Display

**Expected Results:**
- [ ] POS shows confirmation
- [ ] Kitchen Display shows order
- [ ] Order shows payment='paid_card' (not pending)
- [ ] Kitchen doesn't need to confirm payment

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

### CATEGORY 8: Operator Safety & UX

#### TC-017: Error Message Clarity (Manual Review)
**Steps:**
1. Trigger various failures
2. Evaluate error messages
3. Are they clear to non-technical staff?

**Evaluate:**
- [ ] "Card declined" (clear)
- [ ] "Reader unavailable" (clear)
- [ ] "Payment cancelled" (clear)
- [ ] "Try another card" (actionable)
- [ ] No technical jargon (HTTP 500, API error, etc.)

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

#### TC-018: Recovery Paths (Manual Review)
**Steps:**
1. Payment fails (decline, timeout, cancel, error)
2. Can customer/staff recover?

**Evaluate:**
- [ ] Can try different card? (button available)
- [ ] Cart preserved? (not cleared)
- [ ] Can retry? (clear flow)
- [ ] Previous transaction visible? (for reconciliation)

**Time:** _____ **Pass?** ☐ YES ☐ NO ☐ PARTIAL  
**Notes:** ________________________________________________________________

---

## SUMMARY RESULTS

### Test Results

| TC # | Test Case | Result | Pass? | Blocker? |
|------|-----------|--------|-------|----------|
| 001 | Successful Auth | [____] | [ ] | [ ] |
| 002 | POS Order | [____] | [ ] | [ ] |
| 003 | Card Declined | [____] | [ ] | [ ] |
| 004 | Expired Card | [____] | [ ] | [ ] |
| 005 | Lost Card | [____] | [ ] | [ ] |
| 006 | Customer Cancel | [____] | [ ] | [ ] |
| 007 | Timeout | [____] | [ ] | [ ] |
| 008 | App Refresh | [____] | [ ] | [?] |
| 009 | Network Interrupt | [____] | [ ] | [?] |
| 010 | Reader Disconnect | [____] | [ ] | [ ] |
| 011 | Double-Tap | [____] | [ ] | [?] |
| 012 | Amount Mismatch | [____] | [ ] | [ ] |
| 013 | Replay Attack | [____] | [ ] | [ ] |
| 014 | Reader Offline | [____] | [ ] | [ ] |
| 015 | Reader Reconnect | [____] | [ ] | [ ] |
| 016 | POS Workflow | [____] | [ ] | [ ] |
| 017 | Error Messages | [____] | [ ] | [ ] |
| 018 | Recovery Paths | [____] | [ ] | [ ] |

**Total Passed:** ____/18  
**Critical Failures:** ____  
**Blocker Found?** ☐ YES ☐ NO  

---

## FINAL ASSESSMENT

**Overall Status:** ☐ PASS ☐ FAIL ☐ CONDITIONAL PASS

**Blockers Found:**
1. _____________________________________________________________________
2. _____________________________________________________________________
3. _____________________________________________________________________

**Mitigations Needed:**
1. _____________________________________________________________________
2. _____________________________________________________________________

**Recommendation:**
☐ GO for pilot (all critical tests passed)
☐ CONDITIONAL GO (with mitigations documented above)
☐ NO-GO (critical blocker found, escalate to engineering)

**QA Sign-Off:**

QA Lead: ___________________________  Date: _______

Engineering Lead: ___________________________  Date: _______

Operations Lead: ___________________________  Date: _______

---

**End of Test Execution Checklist**