# Scheduled Digest Snapshots — Security Hardening Summary

**Date:** 2026-03-26  
**Status:** ✅ Complete  

---

## Security Gaps Closed

### Before Hardening

| Vulnerability | Risk | Status |
|---|---|---|
| **No authorization** | Public HTTP endpoint callable by anyone | 🔴 CRITICAL |
| **No rate-limit** | Spam/load attack via repeated calls | 🔴 HIGH |
| **No cooldown** | 1000 calls/min would create noise + load | 🔴 HIGH |
| **No audit trail** | Can't distinguish legitimate vs malicious calls | 🟠 MEDIUM |
| **No source tracking** | Authorized vs unauthorized calls look identical in logs | 🟠 MEDIUM |

### After Hardening

| Vulnerability | Control | Status |
|---|---|---|
| **No authorization** | SCHEDULED_DIGEST_SECRET bearer token required | ✅ FIXED |
| **No rate-limit** | 60-second cooldown window enforced | ✅ FIXED |
| **No cooldown** | Repeated calls blocked, logged as cooldown_blocked | ✅ FIXED |
| **No audit trail** | ScheduledExecutionLog entity tracks all runs | ✅ FIXED |
| **No source tracking** | Status field distinguishes: success/duplicate/cooldown/error | ✅ FIXED |

---

## Protections Implemented

### 1. Execution Authorization Guard

**Control:** Bearer token validation

```javascript
const authHeader = req.headers.get('authorization');
const scheduledSecret = Deno.env.get('SCHEDULED_DIGEST_SECRET');
const expectedAuth = `Bearer ${scheduledSecret}`;

if (authHeader !== expectedAuth) {
  return Response.json({ error: 'Unauthorized' }, { status: 403 });
}
```

**Effect:**
- ✅ External clients cannot call without secret
- ✅ Scheduler automation includes secret (configured in Base44)
- ✅ Internal testing tools can use secret

---

### 2. Cooldown / Idempotency Protection

**Control:** 60-second execution window

```javascript
if (executionLog?.last_execution_timestamp) {
  const lastExecTime = new Date(executionLog.last_execution_timestamp).getTime();
  const secondsSinceLastExec = Math.round((new Date().getTime() - lastExecTime) / 1000);
  
  if (secondsSinceLastExec < 60) {
    return Response.json({
      success: true,
      is_cooldown_blocked: true,
      seconds_until_next_allowed: 60 - secondsSinceLastExec,
      message: 'Cooldown active'
    });
  }
}
```

**Effect:**
- ✅ Repeated calls within 60s are blocked
- ✅ Logs show "cooldown_blocked" status
- ✅ No duplicate DB writes or noise
- ✅ Caller knows when next execution is allowed

---

### 3. Execution Audit Logging

**New entity:** `ScheduledExecutionLog`

**Tracked fields:**
- `last_execution_timestamp` — When function ran
- `last_execution_status` — success|duplicate|cooldown_blocked|error
- `last_snapshot_id` — ID of created snapshot (if success)
- `reason_skipped` — Why execution was skipped (if not success)
- `unauthorized_attempts` — Counter of failed auth attempts
- `last_unauthorized_attempt_at` — Most recent failed auth

**Effect:**
- ✅ Every execution (authorized & rejected) is logged
- ✅ Security team can audit attempted attacks
- ✅ Operational dashboard can show execution history
- ✅ Distinguishes intended (cooldown) vs unintended (unauthorized) skips

---

### 4. Unauthorized Attempt Tracking

**Control:** Increment counter + timestamp on failed auth

```javascript
if (!isAuthorized) {
  executionLog.unauthorized_attempts++;
  executionLog.last_unauthorized_attempt_at = now;
  return Response.json({ error: 'Unauthorized' }, { status: 403 });
}
```

**Effect:**
- ✅ Failed auth attempts are counted
- ✅ Timestamp shows when last attempt occurred
- ✅ Security team can detect brute-force/scanning attempts
- ✅ Provides forensic evidence if function is abused

---

## Files Changed

### New Files (2)

| File | Purpose | Size |
|---|---|---|
| `entities/ScheduledExecutionLog.json` | Execution tracking entity schema | 1.4 KB |
| `docs/SCHEDULED_DIGEST_SNAPSHOTS_HARDENING.md` | Full hardening documentation | 12 KB |

### Modified Files (2)

| File | Changes | Size Impact |
|---|---|---|
| `functions/generateScheduledPortfolioSnapshot.js` | +Auth guard, cooldown, audit logging, error handling | +150 LOC |
| `scripts/smoke/suites/offlineDigest.smoke.js` | +4 security smoke tests | +120 LOC |

---

## Test Coverage

### New Smoke Tests (4)

| Test | Validates | Status |
|---|---|---|
| `testScheduledExecutionGuard` | Unauthorized calls rejected (403) | ✅ Pass |
| `testScheduledCooldownProtection` | Cooldown blocks rapid repeated calls | ✅ Pass |
| `testScheduledAuditLogging` | Executions tracked with status + snapshot_id | ✅ Pass |
| `testUnauthorizedAttemptTracking` | Failed auth increments counter + timestamps | ✅ Pass |

### Existing Test Coverage (15)

All existing tests continue to pass. No breaking changes to digest/snapshot logic.

---

## Remaining Limitations

### By Design (Intentional Constraints)

✅ **Simple cooldown, not per-IP rate-limiting** — Sufficient for single scheduled job, won't scale to 1000s of callers  
✅ **Bearer token, not cryptographic JWT** — Suitable for internal scheduler, not public API  
✅ **Logging, not real-time alerting** — Audit trail created, but no auto-alerts on suspicious activity  
✅ **Manual secret rotation** — Admin can update secret if needed, no auto-rotation  

### Why These Choices?

- **Scope is internal-only** — One daily scheduled job, not public API
- **Keep simple & deterministic** — No state machine, no complex auth logic
- **Audit-first approach** — Log everything, let admins decide actions

---

## Deployment Status

| Item | Status | Notes |
|---|---|---|
| **Authorization guard code** | ✅ Deployed | Checks SCHEDULED_DIGEST_SECRET |
| **Cooldown protection code** | ✅ Deployed | 60-second window enforced |
| **Execution log entity** | ✅ Created | ScheduledExecutionLog ready |
| **Smoke tests** | ✅ Added | 4 new security tests |
| **Documentation** | ✅ Written | Full hardening guide |
| **Secret configured** | ✅ Set | SCHEDULED_DIGEST_SECRET in environment |
| **Automation updated** | ✅ Updated | Daily Portfolio Digest Snapshot includes secret |

---

## How It Works (End-to-End)

### Authorized Execution (Scheduler at 09:00 UTC)

```
1. Base44 automation triggers at 09:00 UTC
   ↓
2. HTTP POST to /functions/generateScheduledPortfolioSnapshot
   Authorization: Bearer {SCHEDULED_DIGEST_SECRET}
   ↓
3. Function validates secret ✅
   ↓
4. Check ScheduledExecutionLog for cooldown
   Last exec was 24h ago ✅ (past cooldown window)
   ↓
5. Calculate portfolio digest
   ↓
6. Check hash vs latest snapshot
   ├─ If changed: Create new snapshot
   │  Status: "success"
   │  Return: snapshot_id + critical_count
   └─ If unchanged: Skip creation
      Status: "duplicate"
      Return: success: true, is_duplicate: true
   ↓
7. Update ScheduledExecutionLog
   last_execution_timestamp: now
   last_execution_status: success|duplicate
   unauthorized_attempts: 0
   ↓
8. Response: 200 OK
```

### Unauthorized Attempt (External Client)

```
1. External client/attacker calls:
   HTTP POST /functions/generateScheduledPortfolioSnapshot
   (no Authorization header)
   ↓
2. Function checks secret ❌
   ↓
3. Log unauthorized attempt
   executionLog.unauthorized_attempts++
   executionLog.last_unauthorized_attempt_at = now
   ↓
4. Response: 403 Forbidden
   { error: "Unauthorized: invalid or missing scheduler secret" }
   ↓
5. Security team can query ScheduledExecutionLog to see:
   - How many attempts (unauthorized_attempts counter)
   - When last attempt occurred (last_unauthorized_attempt_at)
   - Pattern of attacks (if repeated)
```

### Spam Attack (Repeated Authorized Calls Within Cooldown)

```
1. Authorized caller (knows secret) calls function
   Authorization: Bearer {SCHEDULED_DIGEST_SECRET}
   ↓
2. First call at 09:00:00
   Cooldown check: No previous execution ✅
   Create snapshot
   Status: "success"
   Update log: last_execution_timestamp = 09:00:00
   ↓
3. Retry at 09:00:30
   Authorization: Bearer {SCHEDULED_DIGEST_SECRET}
   ↓
4. Cooldown check: 30s since last exec < 60s cooldown ❌
   Status: "cooldown_blocked"
   Update log: reason = "Only 30s since last execution"
   ↓
5. Response: 200 OK
   { success: true, is_cooldown_blocked: true, seconds_until_next_allowed: 30 }
   ↓
6. Caller knows next call allowed at 09:01:00
```

---

## Security Checklist

- ✅ **Authorization:** Secret required, caller cannot bypass
- ✅ **Rate-limiting:** Cooldown prevents spam/DoS
- ✅ **Audit:** All executions logged (success, duplicate, blocked, error)
- ✅ **Unauthorized tracking:** Failed attempts counted + timestamped
- ✅ **No public trigger:** External clients cannot call
- ✅ **Idempotent:** Repeated calls safe (blocked by cooldown)
- ✅ **Error handling:** Exceptions logged, don't crash function
- ✅ **Test coverage:** 4 new smoke tests for security controls
- ✅ **Documentation:** Full hardening guide + FAQ

---

## Next Steps (Optional)

If operations needs grow:

### Phase 2 (Optional)
1. **Real-time alerts** — Send Slack/email on unauthorized attempts
2. **Per-secret tracking** — If multiple internal callers, track per-secret
3. **Secret rotation** — Automated rotation policy (e.g., quarterly)
4. **Metrics dashboard** — Execution success rate, cooldown blocks, errors

### Monitoring Commands
```sql
-- Check execution history
SELECT * FROM ScheduledExecutionLog 
WHERE function_name = 'generateScheduledPortfolioSnapshot'
ORDER BY last_execution_timestamp DESC
LIMIT 10;

-- Check unauthorized attempts
SELECT * FROM ScheduledExecutionLog 
WHERE unauthorized_attempts > 0;

-- Check recent failures
SELECT * FROM ScheduledExecutionLog 
WHERE last_execution_status = 'error'
ORDER BY last_execution_timestamp DESC;
```

---

## Conclusion

**Scheduled snapshot generation is now:**
- ✅ **Protected** — Requires SCHEDULED_DIGEST_SECRET
- ✅ **Rate-limited** — 60-second cooldown prevents spam
- ✅ **Auditable** — All executions tracked in ScheduledExecutionLog
- ✅ **Hardened** — Unauthorized attempts logged + counted
- ✅ **Production-ready** — Tested, documented, deployable

**Remaining risk:** Very low. Only internal scheduled job, authorized via secret, cooldown protected, fully audited.

**Status:** ✅ HARDENING COMPLETE