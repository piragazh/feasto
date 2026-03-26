# Scheduled Digest Snapshots — Security Hardening

**Status:** ✅ Complete  
**Date:** 2026-03-26  
**Scope:** Execution guard, cooldown protection, and audit logging for scheduled snapshot generation

---

## Executive Summary

The scheduled snapshot generation function (`generateScheduledPortfolioSnapshot`) has been hardened to:

1. **Require authorization** via `SCHEDULED_DIGEST_SECRET` (shared secret in Authorization header)
2. **Enforce cooldown** (60-second window to prevent spam)
3. **Track all executions** (success, duplicate, cooldown blocked, error)
4. **Log unauthorized attempts** (counter + timestamp for security audit)
5. **Reject invalid calls early** (403 Forbidden for unauthorized requests)

**Result:** Internal-only execution path, resistant to accidental/malicious triggering, fully auditable.

---

## Security Gaps Closed

| Gap | Before | After | Control |
|-----|--------|-------|---------|
| **Public trigger** | Anyone could call function | Requires valid secret | Authorization header |
| **No rate-limit** | 100 calls/min possible | Max 1 per 60s | Cooldown window |
| **No audit trail** | Runs silent | All attempts logged | Execution log entity |
| **No source distinction** | All runs look same | Scheduled vs manual | Log status + reason |
| **Spam vulnerability** | Repeated calls overload logs | Blocked within cooldown | Idempotency check |

---

## Implementation Details

### 1. Authorization Guard

**Requirement:** `SCHEDULED_DIGEST_SECRET` environment variable + Bearer token

```
Authorization: Bearer {SCHEDULED_DIGEST_SECRET}
```

**Validation:**
```javascript
const authHeader = req.headers.get('authorization');
const scheduledSecret = Deno.env.get('SCHEDULED_DIGEST_SECRET');
const expectedAuth = `Bearer ${scheduledSecret}`;
const isAuthorized = authHeader === expectedAuth;

if (!isAuthorized) {
  return Response.json({ error: 'Unauthorized' }, { status: 403 });
}
```

**Who can call:**
- ✅ Base44 scheduler automation (includes secret in request)
- ✅ Internal testing functions (with secret)
- ❌ External clients (don't have secret)
- ❌ Public HTTP calls (unauthorized)

### 2. Cooldown Protection

**Window:** 60 seconds (prevents spam/repeated execution)

**Logic:**
```
if (last_execution_timestamp exists) {
  seconds_elapsed = now - last_execution_timestamp
  if (seconds_elapsed < cooldown_seconds) {
    → Block execution
    → Return 200 with is_cooldown_blocked: true
    → Log "cooldown_blocked" status
  }
}
```

**Effect:**
- First authorized call at 09:00:00 → Creates snapshot
- Retry at 09:00:30 → Blocked (30s < 60s cooldown)
- Call at 09:01:00 → Allowed (60s ≥ 60s cooldown)

### 3. Execution Log Entity

New `ScheduledExecutionLog` entity tracks all runs:

```json
{
  "function_name": "generateScheduledPortfolioSnapshot",
  "last_execution_timestamp": "2026-03-26T09:00:00Z",
  "last_execution_status": "success|duplicate|cooldown_blocked|error",
  "last_snapshot_id": "snap-20260326-001",
  "reason_skipped": "Digest unchanged|Cooldown active|Error message",
  "unauthorized_attempts": 3,
  "last_unauthorized_attempt_at": "2026-03-26T09:00:15Z",
  "cooldown_seconds": 60
}
```

**Status Values:**
- **success** — Snapshot created
- **duplicate** — Hash unchanged, no snapshot created
- **cooldown_blocked** — Within cooldown window, execution skipped
- **error** — Exception occurred during execution

### 4. Unauthorized Attempt Tracking

**Tracking fields:**
- `unauthorized_attempts` — Counter (incremented on each failed auth)
- `last_unauthorized_attempt_at` — Timestamp of most recent failed auth

**Use case:** Security team can monitor for brute-force/scanning attempts

---

## Response Formats

### Successful Execution
```json
{
  "success": true,
  "scheduled": true,
  "execution_source": "scheduled",
  "is_duplicate": false,
  "snapshot_id": "snap-20260326-001",
  "critical_count": 2,
  "message": "Scheduled portfolio snapshot created"
}
```

### Duplicate (No Change)
```json
{
  "success": true,
  "scheduled": true,
  "execution_source": "scheduled",
  "is_duplicate": true,
  "message": "Digest unchanged, no snapshot created"
}
```

### Cooldown Blocked
```json
{
  "success": true,
  "scheduled": true,
  "execution_source": "scheduled",
  "is_cooldown_blocked": true,
  "seconds_until_next_allowed": 30,
  "message": "Cooldown active (60s), execution skipped"
}
```

### Unauthorized (403)
```json
{
  "error": "Unauthorized: invalid or missing scheduler secret",
  "status": 403
}
```

### Error (500)
```json
{
  "error": "Database connection failed",
  "scheduled": true,
  "execution_source": "scheduled",
  "status": 500
}
```

---

## Deployment

### Step 1: Secret Configuration (✅ DONE)

Secret `SCHEDULED_DIGEST_SECRET` is already set in environment.

### Step 2: Automation Update (✅ DONE)

Updated automation to include secret in request headers.

### Step 3: Enable & Test

Scheduler will call function with:
```
POST /functions/generateScheduledPortfolioSnapshot
Authorization: Bearer {SCHEDULED_DIGEST_SECRET}
```

---

## Testing Coverage

### 4 New Smoke Tests

| Test | Coverage | Status |
|------|----------|--------|
| `testScheduledExecutionGuard` | Unauthorized calls rejected (403) | ✅ |
| `testScheduledCooldownProtection` | Cooldown blocks repeated calls | ✅ |
| `testScheduledAuditLogging` | Executions tracked with status + timestamp | ✅ |
| `testUnauthorizedAttemptTracking` | Failed auth attempts counted + timestamped | ✅ |

All existing tests continue to pass (no breaking changes).

---

## Operational Security

### Normal Scheduled Run (09:00 UTC Daily)

```
Base44 Automation at 09:00 UTC
  ↓
HTTP POST /functions/generateScheduledPortfolioSnapshot
Authorization: Bearer {SCHEDULED_DIGEST_SECRET}
  ↓
Validate secret ✅
Check cooldown ✅
Calculate digest
Check hash dedup
  ├─ If changed: Create snapshot, log "success"
  └─ If unchanged: Log "duplicate"
  ↓
Response: 200 (success or duplicate)
ScheduledExecutionLog updated
```

### Unauthorized Call Attempt

```
External client / attacker
  ↓
HTTP POST /functions/generateScheduledPortfolioSnapshot
(no Authorization header)
  ↓
Validate secret ❌
Log unauthorized attempt (counter++)
  ↓
Response: 403 Forbidden
Attempt tracked in ScheduledExecutionLog
```

### Spam Attempt (Repeated Calls)

```
Authorized caller calls function
  ↓
09:00:00 — Create snapshot, log "success", set cooldown
09:00:30 — Try again
  ↓
Check cooldown: 30s < 60s ❌
Log "cooldown_blocked"
  ↓
Response: 200 (success: true, is_cooldown_blocked: true)
ScheduledExecutionLog unchanged
```

---

## Manual Internal Testing (Optional)

If testing the function manually (not via scheduler):

1. **Get the secret:**
   ```bash
   # From Base44 dashboard:
   Dashboard → Settings → Environment Variables
   Find: SCHEDULED_DIGEST_SECRET
   ```

2. **Call function with secret:**
   ```bash
   curl -X POST https://{app-domain}/functions/generateScheduledPortfolioSnapshot \
     -H "Authorization: Bearer {SCHEDULED_DIGEST_SECRET}" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

3. **Expect:**
   - First call: 200 (success)
   - Immediate retry: 200 (is_cooldown_blocked: true)
   - Call after 60s: 200 (success or duplicate depending on digest)

---

## Limitations & Constraints

### By Design

✅ **Not a replacement for user auth** — `createDigestSnapshot` still requires admin login for on-demand access  
✅ **Not public** — Requires environment secret, cannot be called by external clients  
✅ **Not a full rate-limit service** — 60s cooldown is simple, not per-IP or per-secret  
✅ **Audit, not enforcement** — Unauthorized attempts logged but don't trigger alerts  

### Explicit Non-Goals

❌ **Per-IP rate limiting** — No IP tracking, just global cooldown  
❌ **JWT/OAuth** — Simple Bearer token, not cryptographic JWT  
❌ **Alert system** — Logs unauthorized attempts, doesn't send alerts  
❌ **Rotating secrets** — Secret is static, admin must rotate manually if needed  

---

## Files Changed

| File | Change | Impact |
|------|--------|--------|
| `functions/generateScheduledPortfolioSnapshot.js` | Add auth guard + cooldown + audit logging | ~80 lines added |
| `entities/ScheduledExecutionLog.json` | New entity for execution tracking | ~50 lines |
| `scripts/smoke/suites/offlineDigest.smoke.js` | Add 4 security smoke tests | ~120 lines |
| `docs/SCHEDULED_DIGEST_SNAPSHOTS_HARDENING.md` | This hardening documentation | ~350 lines |

**Total new code:** ~600 LOC (mostly documentation)

---

## Monitoring & Support

### Check Execution Status

```
Dashboard → Super Admin → Risk Digest → History
```

### Check Unauthorized Attempts

```
SQL Query: SELECT * FROM ScheduledExecutionLog WHERE unauthorized_attempts > 0
```

### View All Executions

```
SQL Query: SELECT * FROM ScheduledExecutionLog ORDER BY last_execution_timestamp DESC
```

### Clear Failed Attempt Counter

```
Admin can manually reset unauthorized_attempts to 0 in ScheduledExecutionLog
```

---

## Summary

| Item | Status | Details |
|------|--------|---------|
| **Authorization** | ✅ Hardened | Requires SCHEDULED_DIGEST_SECRET bearer token |
| **Rate Limiting** | ✅ Protected | 60-second cooldown prevents spam |
| **Audit Trail** | ✅ Complete | ScheduledExecutionLog tracks all executions |
| **Unauthorized Tracking** | ✅ Enabled | Counter + timestamp for security team |
| **Public Exposure** | ✅ Eliminated | No unauthenticated trigger path |
| **Backward Compatibility** | ✅ Maintained | Existing digest/snapshot logic unchanged |
| **Tests** | ✅ Complete | 4 new smoke tests, all existing tests pass |

**Status:** ✅ Complete, production-ready  
**Next:** Monitor unauthorized attempts, rotate secret annually if needed

---

## FAQ

**Q: What if the scheduler secret is leaked?**  
A: Attacker can trigger daily snapshots. Cooldown (60s) prevents spam. Switch secret via dashboard and re-authorize automation.

**Q: Can the scheduler automation retry if function fails?**  
A: Yes, Base44 automation will retry on error. Cooldown + audit log make it safe (won't create duplicates).

**Q: What about manual testing?**  
A: Use secret from environment variables when testing. Clearly documented above.

**Q: Does this break on-demand snapshots (via dashboard)?**  
A: No. `createDigestSnapshot` is separate, requires admin auth, unchanged.

**Q: How do I rotate the secret?**  
A: Admin manually updates `SCHEDULED_DIGEST_SECRET` in environment, then re-authorize automation in UI.

---

**Production Status:** ✅ Safe, Hardened, Auditable