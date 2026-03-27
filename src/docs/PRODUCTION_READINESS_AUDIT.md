# Production Readiness Audit
**Date:** 2026-03-27  
**Auditor:** Principal Engineer — Full System Review  
**Scope:** All subsystems: online ordering, POS, kiosk, hardware, offline workflow, analytics, reporting, access control, observability

---

## Executive Summary

This platform is in an **advanced pilot state**. The online ordering stack and server-side order/payment logic is genuinely solid — price verification, idempotency, coupon stacking, and velocity controls are all present and correct. The offline POS workflow has meaningful audit trails and discount controls.

However: **card terminal integration is entirely simulated**, **coupon usage_count updates have a real race condition**, **the offline idempotency check is unreliable in production**, direct entity writes bypass payment validation on the kiosk, and the digest/analytics system has freshness and confidence risks.

**Bottom line:** Online ordering is pilot-ready. POS (online only, no real card terminal) is pilot-ready. Kiosk with pay-at-counter is pilot-ready. Kiosk with card terminal is NOT safe to ship as-is — the simulation must be replaced before any real transaction. Offline POS is pilot-ready with mitigation. Hardware integration (Bluetooth printer, card reader) is not production-grade.

---

## Top 10 Production Blockers / High Risks

### 1. BLOCKER — Card Terminal is Entirely Simulated
**File:** `functions/processCardTerminal`  
**Issue:** `processTerminalTransaction()` runs a random 95% approval simulation using `Math.random()`. Real provider integrations (Stripe Terminal, SumUp, Square) are commented out. This means card payments on the kiosk are **not real**.  
**Impact:** Any production kiosk configured with card payment will accept fake authorizations, create real orders, and charge nothing. This is a **financial blocker** — no kiosk card payments can go live on this codebase.  
**Fix:** Implement real provider SDK per provider branch. Stripe Terminal requires server-driven PaymentIntent. SumUp/Square each have Kiosk SDKs. The function structure is correct and ready for real code.  
**Urgent:** YES — must be done before any kiosk goes live with card.

---

### 2. BLOCKER — Kiosk Pay-at-Counter: Direct Entity Write (No Server-Side Validation)
**File:** `components/kiosk/KioskPayment` line 119  
**Issue:** `placeCashOrder()` calls `base44.entities.Order.create()` directly from the frontend. This bypasses server-side price recomputation, customization pricing, and audit controls. A customer who manipulates the browser console can craft any price.  
**Impact:** A kiosk customer could theoretically order £100 of food for £0.01 by altering the cart state or intercepting the entity write.  
**Fix:** Route kiosk pay-at-counter orders through a dedicated backend function (similar to `posCreateOrder`) that re-prices items from the DB, writes the order as service role, and returns a confirmed order.  
**Urgent:** YES — must fix before any public-facing kiosk goes live.

---

### 3. HIGH — Coupon `usage_count` Has a Read-Modify-Write Race Condition
**Files:** `functions/verifyAndCreateOrder` line 533, `functions/posCreateOrder` line 294, `functions/syncOfflineOrder` line 281  
**Issue:** All three handlers do:
```
1. Read coupon.usage_count (snapshot)
2. Create the order
3. Update coupon.usage_count = snapshot + 1
```
Between steps 1 and 3, another request can read the same snapshot. Under concurrent load (flash sale, popular coupon), 5 simultaneous orders could all see usage_count=0 and all pass a limit of 1. The per-customer limit check has the same race.  
**Impact:** A coupon with `usage_limit: 1` can be used multiple times under concurrency. For high-discount coupons this is a direct revenue loss.  
**Fix:** Use an atomic increment (e.g., `$inc` operator) rather than read-modify-write. Short of that, accept the race but add post-hoc reconciliation alerts when usage_count significantly exceeds usage_limit.  
**Urgent:** HIGH — acceptable for low-traffic pilot, must fix before scale.

---

### 4. HIGH — Offline Idempotency Check is Unreliable
**File:** `functions/syncOfflineOrder` lines 51-64  
**Issue:** The duplicate detection logic checks:
```js
o.offline_created_at === offlineOrderData.created_at &&
o.restaurant_id === offlineOrderData.restaurant_id &&
Math.abs(new Date(o.offline_synced_at).getTime() - new Date().getTime()) < 5000
```
The 5-second window is wrong: it checks if `offline_synced_at` is within 5 seconds of *right now*, not of the sync attempt. This means the check only catches duplicates in the first 5 seconds after sync and will **miss duplicates** on retry 6 seconds later. Additionally, there is no unique stable `offline_id` enforced — the field is optional.  
**Impact:** POS offline orders can be synced twice. Double orders enter the system undetected.  
**Fix:** Assign a UUID `offline_id` at order creation time, persist it, and use it as the idempotency key server-side. The check should be: `order where offline_id = X already exists → 409`.  
**Urgent:** HIGH — must fix before offline POS goes live.

---

### 5. HIGH — POS Direct Entity Writes Bypass All Server Validation (Legacy Path)
**File:** `components/restaurant/LiveOrders` lines 257-272 (bulkUpdateStatus)  
**Issue:** `bulkUpdateStatus` calls `base44.entities.Order.update()` directly from the frontend with no server-side validation. Similarly, `updateOrderMutation` mutationFn (line 307) does the same. Any JavaScript-literate user with a RestaurantManager session can set an order to any status, modify the total, or change payment fields directly.  
**Impact:** A rogue manager (or compromised session) can cancel confirmed orders, mark unpaid orders as collected, or alter financial fields without an audit trail.  
**Fix:** Route all status mutations through backend functions that verify role, current state, and valid transitions. The `confirmKioskPayment` pattern is correct — replicate it for general order status transitions.  
**Urgent:** HIGH for financial operations (payment fields, cancellation). Medium for status transitions.

---

### 6. HIGH — `processCardTerminal` Has No Authentication
**File:** `functions/processCardTerminal` lines 25-26  
**Issue:** The comment explicitly says "no user auth required." While it validates `restaurantId` exists, any unauthenticated caller who knows a valid `restaurantId` can invoke this endpoint. It currently only runs a simulation but when real provider SDKs are wired in, this endpoint would initiate real terminal charges without any user authentication.  
**Impact:** When real terminal integration lands, an unauthenticated attacker with a valid restaurant ID could trigger charges on the terminal.  
**Fix:** Require either (a) a kiosk session token (device-bound), or (b) a signed request from the kiosk. At minimum, verify the caller has a valid kiosk device binding for that restaurant.  
**Urgent:** HIGH — must fix before real terminal SDK is wired in.

---

### 7. HIGH — LiveOrders Query Misses Kiosk Orders in Production
**File:** `components/restaurant/LiveOrders` lines 64-70  
**Issue:** The live orders query filters: `status: { $in: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'ready_for_collection'] }`. Kiosk orders use the separate `order_status` field (not `status`). A kiosk order with `order_status: 'new'` and `status: 'pending'` (default) should appear — but a kiosk order that was accepted and has `order_status: 'confirmed'` with `status` still at its default may or may not show, depending on what the default value is.  
**Impact:** Kiosk orders can silently disappear from the Live Orders dashboard when staff try to manage them, causing missed preparation and customer complaints.  
**Fix:** Query should be `OR`: `status IN [...]` OR `order_status IN ['new', 'confirmed', 'preparing', 'ready']` for kiosk source.  
**Urgent:** HIGH — affects operational continuity.

---

### 8. HIGH — Digest/Snapshot System Has No Source-of-Truth Validation
**Files:** `functions/createDigestSnapshot`, `lib/offline-digest-logic.js`  
**Issue:** Digest snapshots are generated by scheduled functions that aggregate existing Order records. There is no verification that the order data used for aggregation is correct (unsynced offline orders, cancelled orders counted twice, etc.). The acknowledgement workflow operates on snapshots that may reflect stale or incorrect data.  
**Impact:** Managers are making decisions (resolve/escalate) on digest summaries that may not match reality. A manager could acknowledge a risk that hasn't actually been resolved.  
**Fix:** Snapshots should record their data cutoff timestamp and order count explicitly. ACK should show snapshot age prominently. Staleness warning after >24h.  
**Urgent:** Medium — affects operational confidence, not financial integrity directly.

---

### 9. MEDIUM — Promotion Discount is Client-Controlled (Only Cap Applied)
**File:** `functions/verifyAndCreateOrder` lines 489-492  
**Issue:** When no coupon codes are present, the server accepts the client-supplied `discount` value and only caps it at 50% of subtotal:
```js
verifiedDiscount = Math.min(clientDiscount, serverSubtotal * 0.5);
```
The server does **not** independently verify that a promotion exists and applies to this order. Any client can submit `discount: serverSubtotal * 0.4` and it will be accepted.  
**Impact:** A technically literate customer can apply a 49% discount to any order without a valid promotion being active, as long as they submit the correct discount value in the payload.  
**Fix:** When `clientDiscount > 0` and no coupon codes, validate the discount against active promotions for the restaurant server-side.  
**Urgent:** MEDIUM — the 50% cap limits damage but this is still a genuine abuse vector.

---

### 10. MEDIUM — `enforceRestaurantPermissions` Uses SDK v0.8.21 (Outdated)
**File:** `functions/enforceRestaurantPermissions` line 6  
**Issue:** This function imports `npm:@base44/sdk@0.8.21` while all other functions use `0.8.23`. Version drift in security-critical functions creates unpredictable behavior if there are auth model changes between versions.  
**Impact:** Permission check behavior may silently differ from other functions. If 0.8.21 has a bug in `auth.me()`, this function would not benefit from the fix.  
**Fix:** Pin all functions to `@base44/sdk@0.8.23`.  
**Urgent:** LOW-MEDIUM — minor risk but easy fix.

---

## Full Findings by Section

### A. Payments

#### A1. Online Checkout — SOLID
- Stripe PaymentIntent verified server-side (status, amount, PI format) ✅
- Idempotency: both `idempotency_key` and `payment_intent_id` checked ✅
- Price recomputed from DB — client price ignored ✅
- Total mismatch rejection (£0.50 tolerance) ✅
- Double-charge prevention via PI dedup ✅
- **Gap:** £0.50 tolerance is generous. A menu item price change between cart load and checkout could allow a £0.49 under-payment. Not catastrophic but worth noting.

#### A2. POS Payments — PARTIALLY SOLID
- `posCreateOrder` recomputes prices server-side ✅
- Manual discount capped at 20% for managers ✅
- Admin can override without cap ✅ (acceptable)
- **Gap:** No idempotency key — rapid double-tap on "Place Order" button can create duplicate orders. `posCreateOrder` has no idempotency check at all.
- **Gap:** POS card payment goes through browser print/window flow — no card terminal SDK wired.

#### A3. Kiosk Payments — PARTIALLY SAFE, PARTIALLY SIMULATED
- Pay-at-counter audit trail via `confirmKioskPayment` backend ✅
- Role enforcement on payment confirmation ✅  
- Payment state machine well-designed ✅
- Interrupted payment recovery via sessionStorage ✅
- **BLOCKER:** Card terminal simulation (see Blocker #1 above)
- **BLOCKER:** Pay-at-counter order creates via direct entity write (see Blocker #2 above)

#### A4. Reconciliation
- No reconciliation dashboard or daily settlement report
- No way to see "payments taken vs orders created" in aggregate
- Stripe reconciliation not implemented (no webhook endpoint consuming charge.succeeded vs order created)
- **Rating:** NOT READY for financial reconciliation

---

### B. Coupons / Discounts / Promotions

#### B1. Coupon Stacking — SOLID
- Max 3 coupons enforced ✅
- Stackable flag respected ✅
- Deterministic application order (percentage first, then fixed, sorted by code) ✅
- 50% subtotal cap ✅
- Per-customer limits enforced for authenticated users ✅
- Legacy `coupon_code` + new `coupon_codes` compatibility handled ✅

#### B2. Guest Abuse — BEST-EFFORT
- Guest identity via normalized phone + email (best-effort, acknowledged) ✅
- Phone rotation throttle (3 coupon uses per hour per phone) ✅
- **Known gap:** Guest with no phone/email can bypass per-customer limits entirely. Documented but real risk.

#### B3. POS Walk-in Limitation — DOCUMENTED BUT REAL
- Walk-in customers (no phone/email) only hit global usage_limit, not per_customer_limit
- Stated in comments and docs
- **Risk:** A savvy customer can use a high-value coupon unlimited times from different POS terminals by never providing contact info

#### B4. Promotion Discount Bypass — see Finding #9

---

### C. Kiosk

#### C1. Payment Safety — MIXED (see A3 above)

#### C2. Admin Access — GOOD
- 5-tap logo access ✅
- PIN protection with lockout after 5 failed attempts ✅
- 3-minute auto-logout ✅
- Rate limiting in module scope ✅
- **Gap:** Default PIN is `0000`. Docs say to change it. No warning if default PIN is still active on a live device.

#### C3. Device Binding — SOLID
- localStorage-first binding (URL param only on first visit) ✅
- Admin rebind function ✅
- Clear documentation ✅

#### C4. Idle Media Safety — SOLID
- Payment/confirmation screens block idle media transition ✅
- Session cleared before media mode ✅
- Touch exits immediately ✅

#### C5. Abandoned Session Handling — ADEQUATE
- Inactivity timeout resets cart ✅
- **Gap:** If browser crashes mid-payment, the order may be in `order_status: 'new'` with `payment_status: 'pending_payment'` forever. No cleanup job for abandoned pay-at-counter orders.

---

### D. POS / Hardware

#### D1. Printer Integration — PILOT-READY
- Bluetooth printer with Web Bluetooth API ✅
- Fallback to browser print window ✅
- Auto-reconnect on mount ✅
- Channel routing (kiosk vs online vs POS) ✅
- **Gap:** Web Bluetooth is not available in all browsers. Safari on iOS does not support Web Bluetooth at all. Any iOS kiosk/POS will silently fall back to browser print.
- **Gap:** Browser print is unreliable (popup blockers, print dialog appearance). Not production-grade for kitchen tickets.
- **Gap:** No print acknowledgement — if browser print is opened and immediately closed, no error is surfaced.

#### D2. Kitchen Printing — NOT PRODUCTION GRADE
- Kitchen tickets go through same browser-print path
- No ESC/POS direct socket connection for kitchen printers
- Kitchen displays exist (KDS component) but are web-tab based — a browser crash = no kitchen display
- **Rating:** Acceptable for pilot. Not production-grade for a high-volume kitchen.

#### D3. Card Reader — NOT READY (see Blocker #1)

#### D4. Cash Drawer — NOT IMPLEMENTED
- No cash drawer integration mentioned in any backend function
- POS shows cash payment as method but no drawer open command
- **Rating:** Labeled as a payment method but no hardware control whatsoever.

---

### E. Offline Workflows

#### E1. Queue Integrity — ADEQUATE WITH GAPS
- `POSOfflineDB` (IndexedDB) stores orders locally ✅
- Sync triggered on reconnection ✅
- `syncOfflineOrder` validates prices and discounts server-side ✅
- **BLOCKER-level gap:** Duplicate sync detection is broken (see Blocker #4 above)

#### E2. Discount Re-Validation — SOLID
- Offline discounts re-validated on sync ✅
- Manager threshold enforced (20% / £20) ✅
- `needs_review` flag set when discount adjusted ✅
- Full audit notes stored ✅

#### E3. Review Workflow — SOLID
- Review portal with resolve/escalate/acknowledge states ✅
- reason_code required for terminal actions ✅
- Offline review anomaly detection ✅
- **Gap:** No SLA enforcement — a flagged order can sit unacknowledged indefinitely. No escalation to SuperAdmin if manager doesn't act.

#### E4. Backlog Visibility — ADEQUATE
- OfflineRiskControlCenter shows aggregate metrics ✅
- Per-restaurant view ✅
- **Gap:** No real-time alert if offline orders spike (e.g., network outage causes 50 queued orders). Dashboard requires active navigation.

---

### F. Access Control / Role Boundaries

#### F1. Server-Side Enforcement — GOOD ON CRITICAL PATHS
- `posCreateOrder`, `syncOfflineOrder`, `confirmKioskPayment` all check user role server-side ✅
- `enforceRestaurantPermissions` helper exists ✅
- Tenant isolation in all order creation paths ✅

#### F2. Raw Entity Write Bypass — PRESENT (see Blocker #5)
- `bulkUpdateStatus` in LiveOrders is a direct entity write from frontend
- `updateOrderMutation` in LiveOrders is a direct entity write
- Any restaurant manager can update an order to any status without going through a backend function
- Financial fields (total, payment_status) are technically writable from frontend by a manager

#### F3. SuperAdmin vs Restaurant Scope
- SuperAdmin can see all restaurants ✅
- Restaurant managers are scoped to their restaurant_ids ✅
- **Gap:** A SuperAdmin could potentially access any restaurant's data without additional audit logging. Admin access is logged (`[AUDIT] Admin ${email} accessed...`) in `enforceRestaurantPermissions` but not in direct entity access patterns.

#### F4. Staff PIN vs Platform Auth
- Staff PINs in `StaffMember` entity are stored as plaintext (hashed check happens in component logic)
- **Gap:** If an attacker gets read access to `StaffMember` entity, all staff PINs are exposed
- **Severity:** Medium — PINs are for staff-role switching, not platform auth

---

### G. Operational Dashboards / Analytics

#### G1. Live Orders Dashboard — SOLID
- Kiosk vs online source labeling ✅
- Unpaid kiosk order highlighting ✅
- Dual status model (payment_status + order_status for kiosk) rendered correctly ✅
- **Gap:** 15-second polling interval — a new order placed at t=0 may not appear until t=14. For high-urgency pay-at-counter kiosk orders, 14 seconds of invisibility is operationally risky.

#### G2. Analytics Dashboards — FUNCTIONAL BUT NOT VERIFIED
- Revenue, order count, type breakdowns present ✅
- **Gap:** Analytics are derived from Order records without integrity checks. Offline orders (which skip normal order flow) may not be counted correctly until synced.
- **Gap:** Timezone handling — all timestamps are stored in UTC but displayed in local time. For multi-timezone restaurants this could cause date boundary issues in daily summaries.

#### G3. Digest / Snapshot Reporting — PILOT-READY
- Scheduled snapshot generation ✅
- ACK workflow ✅
- Historical comparison ✅
- **Gap:** Snapshot data is not reconciled with actual financial totals. A snapshot showing "low offline risk" could coexist with 20 unsynced orders.
- **Gap:** If scheduled digest function fails (Deno error, network timeout), no alert is raised. Failure is silent.

#### G4. False Confidence Risk — REAL
- OfflineRiskControlCenter shows "freshness" indicators ✅
- But: the control center relies on snapshots. If snapshot generation is broken, the last snapshot shows as stale — but without active monitoring, managers may not notice.

---

### H. Reliability / Performance

#### H1. Likely Crash Points
- `LiveOrders` component: `order.items.map()` on line 640+ — no null guard. If `order.items` is null/undefined (malformed order), the entire component crashes.
- Browser print `document.write()` — covered with try/catch ✅
- Bluetooth printer callbacks — covered with catch ✅
- `ScreenDisplay` media component — complex, multiple timers, potential memory leaks under high media switching

#### H2. Expensive Queries
- `LiveOrders` refetchInterval: 15s — every 15 seconds fetches all live orders for the restaurant. For a restaurant with 100+ active orders, this is a significant recurring query.
- `syncOfflineOrder` fetches ALL offline orders to check for duplicates: `Order.filter({ offline_created: true })` — no date range filter. With 10,000 offline orders in the DB, this scan is expensive.
- `verifyAndCreateOrder` runs multiple sequential DB queries (restaurant, delivery zones twice, menu items, coupon checks) — each order creation is O(n_coupons * 2) additional queries.

#### H3. State Management Risks
- POS cart state is in React state only. Browser refresh = lost cart. No localStorage persistence for cart.
- Kiosk card payment sentinel in sessionStorage — cleared on browser close. If battery dies mid-payment, recovery sentinel is lost.

#### H4. Scaling Risks
- Each restaurant manager accessing Live Orders = 15s polling = 4 req/min per manager. With 50 restaurants each having 2 staff viewing dashboard = 400 req/min just for Live Orders.
- No WebSocket or Server-Sent Events for real-time updates — all polling.
- Real-time subscription used in `ScreenDisplay` (WebSocket) — unclear what happens when media screen count grows to 100+.

---

### I. Configuration / Deployment Safety

#### I1. Secrets Handling — ADEQUATE
- Stripe keys in env vars ✅
- Twilio credentials in env vars ✅
- `SCHEDULED_DIGEST_SECRET` for scheduler protection ✅
- `CART_SIGNING_SECRET` defined ✅
- **Gap:** `CART_SIGNING_SECRET` exists but no evidence of cart signature verification in `verifyAndCreateOrder`. The secret may be defined but not enforced.

#### I2. Scheduler Protection — PRESENT
- `SCHEDULED_DIGEST_SECRET` validates scheduled function calls ✅
- **Gap:** Other scheduled functions (loyalty expiry, sync triggers) — unclear if all are equally protected.

#### I3. Fallback Values — GOOD
- kiosk_config defaults handled throughout ✅
- Restaurant config has safe defaults ✅
- Menu item pricing has fallback logic ✅

#### I4. Migration / Legacy Compatibility — MANAGED
- `coupon_code` (string) + `coupon_codes` (array) dual-write handled ✅
- Legacy order `status` + kiosk `order_status`/`payment_status` dual-model acknowledged ✅
- **Gap:** Dual-model complexity increases over time. No migration path to unified model documented.

---

### J. Observability

#### J1. Logs — ADEQUATE IN FUNCTIONS
- All backend functions have structured `console.log` with context ✅
- `[PAYMENT_CONFIRMATION]`, `[ORDER]`, `[COUPON]`, `[OFFLINE-SYNC]` tagged logs ✅
- **Gap:** Logs are in Deno function output — no aggregation, no alerting. A critical payment error generates a log line that goes nowhere unless someone actively checks.

#### J2. Audit Trails — PARTIAL
- Kiosk payment confirmation has full audit trail ✅
- Offline order sync has validation notes ✅
- Order status_history array ✅
- **Gap:** Who accepted/rejected an online order? `updateOrderMutation` does not record which staff member took the action.
- **Gap:** Who applied a manual POS discount? The `discount_reason_code` is recorded but not the acting user.
- **Gap:** No structured audit log for restaurant settings changes (printer config, kiosk config, menu changes).

#### J3. Silent Failures
- Coupon `usage_count` increment is fire-and-forget (`.catch(e => console.warn(...))`). If it fails, the coupon can be over-used — logged but not escalated.
- Auto-print failure falls back to browser print — if browser print is also blocked, failure is a toast only. No operational alert.
- Scheduled digest function — if it fails, no alert. Dashboard shows stale data silently.
- `sendCustomerNotification` errors are caught and logged but customer never retried. Customer may not receive their order confirmation.

---

### K. Documentation / Rollout Readiness

#### K1. Well-Documented
- Kiosk idle media mode — comprehensive docs ✅
- Coupon stacking policy — detailed ✅
- Offline POS hardening — thorough ✅
- State transition model — documented ✅
- Staff quick reference guides ✅

#### K2. Misleading / Oversold
- `docs/KIOSK_PAYMENT_CONFIG.md` likely implies card payments are production-ready. They are not.
- The card terminal UI shows "Terminal ready" with a green shield icon even when running simulation mode.
- `docs/PRODUCTION_READINESS.md` (if it exists) — unknown state.
- Hardware integration described as "connected" when Bluetooth connection is browser-session-only and lost on page refresh.

#### K3. Missing Documentation
- No reconciliation/settlement runbook
- No incident response guide (what to do when kiosk payment terminal fails during peak hours)
- No data retention/deletion policy
- No GDPR/data processing documentation (customer phone numbers stored indefinitely)
- No rollback procedure for config changes

---

## Subsystem Readiness Table

| Subsystem | Readiness | Notes |
|-----------|-----------|-------|
| **Online Ordering** | ✅ Pilot-Ready | Price verification, idempotency, coupon control solid. Promotion discount bypass is medium risk. |
| **POS (Online Mode)** | ✅ Pilot-Ready | Price recomputation, coupon stacking, tenant isolation solid. No idempotency on order creation. Direct entity writes for status updates. |
| **POS (Offline Mode)** | ⚠️ Pilot-Ready with Mitigation | Discount re-validation strong. Idempotency check broken — fix required before wide deployment. |
| **Kiosk (Pay-at-Counter)** | ⚠️ Pilot-Ready with Mitigation | Pay-at-counter flow works end-to-end. Direct entity write from frontend is a security gap that must be addressed. |
| **Kiosk (Card Terminal)** | ❌ Not Ready | Terminal is entirely simulated. No real payment SDK wired in. |
| **Hardware Integration** | ❌ Not Ready for Production | Bluetooth printer: browser-only, no iOS support. Kitchen printer: browser-print-only. Cash drawer: not implemented. Card reader: simulated only. |
| **Offline Workflow** | ⚠️ Pilot-Ready with Mitigation | Discount controls solid. Idempotency unreliable. No automatic escalation for unreviewed flags. |
| **Dashboards / Analytics** | ✅ Pilot-Ready | Adequate for pilot. Polling latency is operationally acceptable. False-confidence risks manageable at pilot scale. |
| **Digest / Scheduled Reporting** | ⚠️ Pilot-Ready | Works but silent failures. Snapshot reliability needs monitoring. |
| **Access Control** | ⚠️ Pilot-Ready | Server-side enforcement on creation paths. Direct entity writes for status mutations are a gap. |
| **Observability** | ⚠️ Pilot-Ready | Logs exist but not aggregated or alerted. Silent failures in critical paths. |

---

## Recommended Pre-Launch Fix Order

### Phase 1 — Must Fix Before Any Public Kiosk Launch (Blockers)

1. **Replace `processCardTerminal` simulation** with real provider SDK per terminal type. Do not launch card payment until this is done.

2. **Route kiosk pay-at-counter order creation through a backend function.** Remove direct `base44.entities.Order.create()` from `KioskPayment.placeCashOrder()`. Replace with `posCreateOrder` equivalent that re-prices from DB.

3. **Fix offline order idempotency.** Assign stable UUID `offline_id` at creation. Dedup server-side on this field.

4. **Add authentication/device-token check to `processCardTerminal`** before wiring in real SDKs.

### Phase 2 — Fix Before Restaurant-Wide POS Rollout (High)

5. **Route order status mutations through backend functions.** `bulkUpdateStatus` and `updateOrderMutation` in LiveOrders should go through server-side functions with role/state validation.

6. **Fix LiveOrders query to include kiosk orders** by `order_status` as well as `status` field.

7. **Add idempotency to `posCreateOrder`** to prevent double-order on rapid tap.

8. **Fix promotion discount server-side validation.** Validate against active promotions, don't just cap.

### Phase 3 — Fix Before Wider Rollout (Medium)

9. **Atomic coupon `usage_count` increment** or accept race with post-hoc reconciliation alert.

10. **Add alerting for silent failures:** Coupon increment failure, SMS/WhatsApp failure, digest generation failure.

11. **Update `enforceRestaurantPermissions` to SDK 0.8.23.**

12. **Add default PIN warning in kiosk admin panel** if PIN is `0000`.

13. **Add null guard to `order.items.map()` in LiveOrders** to prevent crash on malformed orders.

14. **Reduce/eliminate offline orders scan in `syncOfflineOrder`** — add date range filter or use `offline_id` lookup directly.

### Phase 4 — Before Scale (Long-term)

15. Replace polling with WebSocket/SSE for Live Orders.
16. Staff PINs should be hashed server-side, not plaintext.
17. Add Stripe webhook for charge reconciliation.
18. Add a cash drawer open command to POS cash payment flow.
19. GDPR/data retention policy and implementation.

---

## Recommended Pilot Scope

If launching today, the safest pilot configuration is:

**Pilot A — Online Ordering Only**
- ✅ Safe to deploy to any restaurant
- Online ordering, collection, delivery
- Coupon codes, promotions
- SMS/WhatsApp notifications
- Exclusions: POS, kiosk, offline

**Pilot B — POS (Online-Only, No Offline)**
- ✅ Safe with monitoring
- POS order entry, cash payment only
- No offline mode enabled
- 1-2 locations with active manager monitoring
- Monitor: duplicate orders, discount anomalies

**Pilot C — Kiosk (Pay-at-Counter Only)**
- ⚠️ Safe with the following mandatory fixes:
  1. Route order creation through backend function (Blocker #2)
  2. Set non-default admin PIN on all devices
- Pay-at-counter only (no card terminal)
- Monitor: abandoned pending_payment orders daily

**Do Not Pilot Yet:**
- Kiosk with card terminal (terminal is simulated)
- POS offline mode (idempotency broken)
- Any production financial reconciliation

---

## Closing Assessment

**The engineering quality is above average for a platform of this scope.** The coupon stacking policy, kiosk payment state machine, offline discount re-validation, and server-side price verification are genuinely well-implemented. The dual-status model (kiosk payment_status vs order_status) is correctly designed and documented.

**The gap between "works in testing" and "operationally safe" is primarily concentrated in:**
1. The simulated card terminal (known, documented, just not done yet)
2. Direct entity writes bypassing server-side validation in the restaurant ops UI
3. Silent failure modes in critical paths (coupon count, notifications, digests)
4. Broken offline idempotency

**These are all fixable.** None require architectural redesign. The core data model and backend function patterns are solid. Fix the identified blockers, add monitoring for silent failures, and this platform is genuinely pilot-ready across the board.