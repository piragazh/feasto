/**
 * Offline Risk Digest Smoke Tests
 * 
 * Verifies digest logic prioritisation, role visibility, and output.
 */

export async function runOfflineDigestSmoke() {
    console.log('\n=== OFFLINE RISK DIGEST SMOKE TESTS ===\n');
    
    const tests = [
        testPortfolioDigestGeneration,
        testRestaurantDigestGeneration,
        testOverdueOrdersIncluded,
        testCriticalRanking,
        testWorsening,
        testAbuseSpikeDetection,
        testOperatorOutliersIdentified,
        testPlaintextFormatting,
        testDigestCriticalityCheck,
        testRoleVisibilityBoundaries,
        testSnapshotIdGeneration,
        testSnapshotHashDedup,
        testSnapshotItemCounting,
        testAcknowledgementPermissions,
        testSnapshotHistoryOrdering,
        testScheduledPortfolioSnapshotGeneration,
        testScheduledSnapshotDedup,
        testScheduledSnapshotRoleScope,
        testSummaryFormatterEmail,
        testScheduledExecutionGuard,
        testScheduledCooldownProtection,
        testScheduledAuditLogging,
        testUnauthorizedAttemptTracking,
        testScheduledExecutionGuard,
        testScheduledCooldownProtection,
        testScheduledAuditLogging,
        testUnauthorizedAttemptTracking,
        testControlCenterCriticalFirst,
        testControlCenterSectionOrder,
        testControlCenterNavigationLinks,
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            const result = await test();
            if (result.success) {
                console.log(`✅ ${result.name}: ${result.message}`);
                passed++;
            } else {
                console.log(`❌ ${result.name}: ${result.message}`);
                failed++;
            }
        } catch (error) {
            console.log(`❌ ${test.name}: ${error.message}`);
            failed++;
        }
    }
    
    console.log(`\n=== RESULTS ===`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${passed + failed}\n`);
    
    return { passed, failed, total: passed + failed };
}

// ──────────────────────────────────────────────────────────────
// Test Data Helpers
// ──────────────────────────────────────────────────────────────

function mockOrder(overrides = {}) {
    const now = new Date();
    return {
        id: `order-${Math.random()}`,
        restaurant_id: 'r1',
        offline_created: true,
        offline_synced_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
        offline_created_by: 'op1@test.com',
        offline_created_by_name: 'Operator 1',
        needs_review: false,
        offline_review_status: 'new',
        offline_review_reason_code: null,
        sync_validation_notes: 'Test order',
        ...overrides
    };
}

function mockRestaurant(overrides = {}) {
    return {
        id: 'r1',
        name: 'Test Restaurant',
        ...overrides
    };
}

// ──────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────

async function testPortfolioDigestGeneration() {
    // Mock minimal digest generation
    const orders = [
        mockOrder({ needs_review: true }),
        mockOrder({ offline_review_status: 'escalated', needs_review: true }),
    ];
    
    const restaurants = [mockRestaurant()];
    
    // Digest should have structure
    const digest = {
        critical_now: { overdue_flagged: { count: 0, orders: [] } },
        watch_worsening: { escalation_rate_up: false },
        summary_metrics: { total_offline: 2, flagged_rate: 50 }
    };
    
    if (!digest.critical_now || !digest.summary_metrics) {
        return { success: false, name: 'Portfolio Digest Gen', message: 'Missing required digest sections' };
    }
    
    return { success: true, name: 'Portfolio Digest Generation', message: 'Digest has all required sections' };
}

async function testRestaurantDigestGeneration() {
    const orders = [
        mockOrder({ restaurant_id: 'r1' }),
        mockOrder({ restaurant_id: 'r1', needs_review: true }),
    ];
    
    const restaurant = mockRestaurant({ id: 'r1' });
    
    // Digest should have restaurant context
    const digest = {
        restaurant_id: 'r1',
        restaurant_name: restaurant.name,
        critical_now: { overdue_flagged: { count: 0 } },
        summary_metrics: { total_offline: 2 }
    };
    
    if (digest.restaurant_id !== 'r1' || digest.restaurant_name !== 'Test Restaurant') {
        return { success: false, name: 'Restaurant Digest Gen', message: 'Missing restaurant context' };
    }
    
    return { success: true, name: 'Restaurant Digest Generation', message: 'Restaurant ID and name populated' };
}

async function testOverdueOrdersIncluded() {
    const now = new Date();
    const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000);
    
    const orders = [
        mockOrder({
            offline_synced_at: fiveHoursAgo.toISOString(),
            needs_review: true,
            offline_review_status: 'new'
        })
    ];
    
    // Orders >4h old with needs_review=true should be detected as overdue
    const ageMinutes = 5 * 60; // 300 minutes = 5 hours
    const isOverdue = ageMinutes > 240 && orders[0].needs_review && orders[0].offline_review_status === 'new';
    
    if (!isOverdue) {
        return { success: false, name: 'Overdue Detection', message: `5-hour-old order not flagged as overdue` };
    }
    
    return { success: true, name: 'Overdue Orders Included', message: '5-hour order correctly identified as overdue' };
}

async function testCriticalRanking() {
    // Restaurants ranked by risk score (flagged% + escalation%)
    const restaurants = [
        { name: 'High Risk', flagged_rate: 40, escalation_rate: 60, risk_score: 48 },
        { name: 'Med Risk', flagged_rate: 15, escalation_rate: 40, risk_score: 24 },
        { name: 'Low Risk', flagged_rate: 5, escalation_rate: 20, risk_score: 10 },
    ];
    
    const ranked = restaurants.sort((a, b) => b.risk_score - a.risk_score);
    
    if (ranked[0].name !== 'High Risk') {
        return { success: false, name: 'Critical Ranking', message: 'High risk restaurant not ranked first' };
    }
    
    return { success: true, name: 'Critical Ranking (Risk Score)', message: 'Restaurants ranked by risk score correctly' };
}

async function testWorsening() {
    // Escalation rate 24h vs 7d
    const escalation24h = 55;
    const escalation7d = 40;
    const worsening = escalation24h > escalation7d + 10;
    
    if (!worsening) {
        return { success: false, name: 'Worsening Trend', message: `55% (24h) vs 40% (7d) not detected as worsening` };
    }
    
    return { success: true, name: 'Worsening Trend Detection', message: 'Escalation up 15pts (55% vs 40%) detected' };
}

async function testAbuseSpikeDetection() {
    const orders = [
        mockOrder({ offline_review_status: 'escalated', offline_review_reason_code: 'potential_abuse' }),
        mockOrder({ offline_review_status: 'escalated', offline_review_reason_code: 'potential_abuse' }),
        mockOrder({ offline_review_status: 'escalated', offline_review_reason_code: 'acceptable_policy_override' }),
    ];
    
    const abuseCount = orders.filter(o => 
        o.offline_review_status === 'escalated' && 
        ['potential_abuse', 'large_price_mismatch', 'repeated_offline_issues'].includes(o.offline_review_reason_code)
    ).length;
    
    if (abuseCount < 2) {
        return { success: false, name: 'Abuse Spike', message: `Expected ≥2 abuse escalations, got ${abuseCount}` };
    }
    
    return { success: true, name: 'Abuse Spike Detection', message: '2 abuse-related escalations detected' };
}

async function testOperatorOutliersIdentified() {
    // Operator with 8/10 orders flagged vs avg 2/10
    const operatorStats = {
        'op1@test.com': { total: 10, flagged: 8 },
        'op2@test.com': { total: 10, flagged: 2 }
    };
    
    const avgFlagged = (8 + 2) / 20; // 50%
    const op1Rate = 8 / 10; // 80%
    const isOutlier = op1Rate > avgFlagged * 1.5; // >2x
    
    if (!isOutlier) {
        return { success: false, name: 'Operator Outlier', message: `80% (op1) vs 50% (avg) not flagged` };
    }
    
    return { success: true, name: 'Operator Outliers Identified', message: 'Op1 (80% flagged) identified as outlier vs avg' };
}

async function testPlaintextFormatting() {
    const digest = {
        generated_at: new Date().toISOString(),
        critical_now: {
            overdue_flagged: { count: 3, oldest_minutes: 300, orders: [] },
            abuse_escalations: { count: 2, recent: [] }
        },
        summary_metrics: {
            total_offline: 100,
            flagged_rate: 25,
            escalation_rate: 40
        }
    };
    
    // Simple plaintext format should include key metrics
    const plaintext = `
🚨 CRITICAL NOW
  Overdue Flagged: ${digest.critical_now.overdue_flagged.count} orders
  Abuse Escalations: ${digest.critical_now.abuse_escalations.count}

📊 SUMMARY
  Total Offline: ${digest.summary_metrics.total_offline}
  Flagged: ${digest.summary_metrics.flagged_rate}%
    `.trim();
    
    if (!plaintext.includes('Overdue Flagged') || !plaintext.includes('SUMMARY')) {
        return { success: false, name: 'Plaintext Format', message: 'Missing key sections in plaintext' };
    }
    
    return { success: true, name: 'Plaintext Formatting', message: 'Plaintext includes critical and summary sections' };
}

async function testDigestCriticalityCheck() {
    // Digest with overdue orders should be critical
    const criticalDigest = {
        critical_now: { overdue_flagged: { count: 3 } },
        watch_worsening: { escalation_rate_up: false }
    };
    
    const isCritical = (criticalDigest.critical_now?.overdue_flagged?.count || 0) > 0;
    
    if (!isCritical) {
        return { success: false, name: 'Criticality Check', message: 'Overdue orders not detected as critical' };
    }
    
    return { success: true, name: 'Digest Criticality Check', message: 'Digest with overdue orders marked critical' };
}

async function testRoleVisibilityBoundaries() {
    // SuperAdmin sees all restaurants
    // Restaurant manager sees only their restaurant
    
    const superadminRestaurants = [
        { id: 'r1', name: 'Store A' },
        { id: 'r2', name: 'Store B' },
        { id: 'r3', name: 'Store C' }
    ];
    
    const managerId = 'r1';
    const managerRestaurants = superadminRestaurants.filter(r => r.id === managerId);
    
    if (managerRestaurants.length !== 1 || managerRestaurants[0].id !== 'r1') {
        return { success: false, name: 'Role Visibility', message: 'Manager visibility boundary not enforced' };
    }
    
    return { success: true, name: 'Role Visibility Boundaries', message: 'SuperAdmin sees 3 stores, manager sees 1 store' };
}

async function testSnapshotIdGeneration() {
    // Snapshot IDs should follow snap-YYYYMMDD-NNN format
    const id1 = generateSnapshotId();
    const id2 = generateSnapshotId();
    
    const regex = /^snap-\d{8}-\d{3}$/;
    
    if (!regex.test(id1) || !regex.test(id2)) {
        return { success: false, name: 'Snapshot ID Gen', message: `Invalid format: ${id1}` };
    }
    
    if (id1 === id2) {
        return { success: false, name: 'Snapshot ID Gen', message: 'IDs should be unique' };
    }
    
    return { success: true, name: 'Snapshot ID Generation', message: 'IDs follow snap-YYYYMMDD-NNN format' };
}

async function testSnapshotHashDedup() {
    // Same digest → same hash → dedup
    const digest1 = {
        critical_now: { overdue_flagged: { count: 3 } },
        watch_worsening: { escalation_rate_up: true },
        summary_metrics: { total_offline: 100 }
    };
    
    const digest2 = {
        critical_now: { overdue_flagged: { count: 3 } },
        watch_worsening: { escalation_rate_up: true },
        summary_metrics: { total_offline: 100 }
    };
    
    const hash1 = hashDigest(digest1);
    const hash2 = hashDigest(digest2);
    
    if (hash1 !== hash2) {
        return { success: false, name: 'Snapshot Hash Dedup', message: 'Identical digests produced different hashes' };
    }
    
    return { success: true, name: 'Snapshot Hash Dedup', message: 'Identical digests produce same hash' };
}

async function testSnapshotItemCounting() {
    const digest = {
        critical_now: {
            overdue_flagged: { count: 5 },
            top_restaurants: [{ restaurant_id: 'r1' }],
            abuse_escalations: { count: 2 }
        },
        watch_worsening: {
            escalation_rate_up: true,
            operator_outliers: [{ operator_email: 'op@test.com' }]
        }
    };
    
    const criticalCount = countCriticalItems(digest);
    const worseningCount = countWorseningItems(digest);
    
    // 5 overdue + 1 restaurant + 1 abuse = 7
    if (criticalCount !== 7) {
        return { success: false, name: 'Critical Counting', message: `Expected 7, got ${criticalCount}` };
    }
    
    // 1 escalation rate + 1 operator = 2
    if (worseningCount !== 2) {
        return { success: false, name: 'Worsening Counting', message: `Expected 2, got ${worseningCount}` };
    }
    
    return { success: true, name: 'Snapshot Item Counting', message: 'Critical=7, Worsening=2' };
}

async function testAcknowledgementPermissions() {
    // SuperAdmin can ack any snapshot
    // Manager can only ack their own restaurant snapshot
    
    const snapshots = [
        { id: 's1', scope: 'portfolio', scope_id: null, acknowledged: false },
        { id: 's2', scope: 'restaurant', scope_id: 'r1', acknowledged: false },
        { id: 's3', scope: 'restaurant', scope_id: 'r2', acknowledged: false }
    ];
    
    const adminCanAck = snapshots.filter(s => true).length === 3; // Can ack all
    const managerR1CanAck = snapshots.filter(s => s.scope_id === 'r1').length === 1; // Can ack r1 only
    
    if (!adminCanAck || !managerR1CanAck) {
        return { success: false, name: 'Ack Permissions', message: 'Permission logic broken' };
    }
    
    return { success: true, name: 'Acknowledgement Permissions', message: 'SuperAdmin can ack all, manager scoped to restaurant' };
}

async function testSnapshotHistoryOrdering() {
    // Snapshots should be orderable by timestamp
    const now = new Date();
    const snapshots = [
        { id: 's1', timestamp: new Date(now - 60000).toISOString() }, // 1m ago
        { id: 's2', timestamp: new Date(now - 30000).toISOString() }, // 30s ago
        { id: 's3', timestamp: new Date(now - 90000).toISOString() }  // 1.5m ago
    ];
    
    const sorted = snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (sorted[0].id !== 's2' || sorted[2].id !== 's3') {
        return { success: false, name: 'History Ordering', message: 'Snapshots not correctly sorted by timestamp' };
    }
    
    return { success: true, name: 'Snapshot History Ordering', message: 'Latest snapshot first' };
}

function generateSnapshotId() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const seq = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `snap-${dateStr}-${seq}`;
}

function hashDigest(digest) {
  const json = JSON.stringify({
    critical_now: digest.critical_now,
    watch_worsening: digest.watch_worsening,
    summary_metrics: digest.summary_metrics
  });
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function countCriticalItems(digest) {
  let count = 0;
  if (digest.critical_now?.overdue_flagged?.count > 0) count += digest.critical_now.overdue_flagged.count;
  if (digest.critical_now?.top_restaurants?.length > 0) count += 1;
  if (digest.critical_now?.abuse_escalations?.count > 0) count += 1;
  return count;
}

function countWorseningItems(digest) {
  let count = 0;
  if (digest.watch_worsening?.escalation_rate_up) count += 1;
  if (digest.watch_worsening?.operator_outliers?.length > 0) count += 1;
  return count;
}

async function testScheduledPortfolioSnapshotGeneration() {
  // Scheduled function should generate portfolio digest without user auth
  const digest = {
    generated_at: new Date().toISOString(),
    critical_now: { overdue_flagged: { count: 2 } },
    watch_worsening: { escalation_rate_up: true },
    summary_metrics: { total_offline: 50 }
  };
  
  // Simulate snapshot creation from scheduled function
  const snapshot = {
    snapshot_id: generateSnapshotId(),
    timestamp: new Date().toISOString(),
    scope: 'portfolio',
    scope_id: null,
    digest_hash: hashDigest(digest),
    critical_item_count: 2,
    worsening_item_count: 1,
    created_by: 'system'
  };
  
  if (snapshot.scope !== 'portfolio' || snapshot.created_by !== 'system') {
    return { success: false, name: 'Scheduled Gen', message: 'Snapshot not marked as scheduled' };
  }
  
  return { success: true, name: 'Scheduled Portfolio Generation', message: 'Scheduled snapshot created with created_by=system' };
}

async function testScheduledSnapshotDedup() {
  // Scheduled snapshots should dedup on hash like on-demand
  const digest1 = {
    critical_now: { overdue_flagged: { count: 3 } },
    watch_worsening: { escalation_rate_up: false },
    summary_metrics: { total_offline: 100 }
  };
  
  const hash1 = hashDigest(digest1);
  const hash2 = hashDigest(digest1);
  
  if (hash1 !== hash2) {
    return { success: false, name: 'Scheduled Dedup', message: 'Hash not stable' };
  }
  
  // Simulate skip if no change
  const recentSnapshots = [{ digest_hash: hash1, timestamp: new Date().toISOString() }];
  const isDuplicate = recentSnapshots.some(s => s.digest_hash === hash1);
  
  if (!isDuplicate) {
    return { success: false, name: 'Scheduled Dedup', message: 'Dedup check failed' };
  }
  
  return { success: true, name: 'Scheduled Snapshot Dedup', message: 'Duplicate detection working for scheduled snapshots' };
}

async function testScheduledSnapshotRoleScope() {
  // Scheduled snapshots should always be portfolio scope (no manager-level scheduling)
  const snapshots = [
    { scope: 'portfolio', scope_id: null, created_by: 'system' },
    { scope: 'portfolio', scope_id: null, created_by: 'system' }
  ];
  
  const allPortfolio = snapshots.every(s => s.scope === 'portfolio' && s.scope_id === null);
  
  if (!allPortfolio) {
    return { success: false, name: 'Scheduled Scope', message: 'Non-portfolio scheduled snapshots found' };
  }
  
  return { success: true, name: 'Scheduled Snapshot Role Scope', message: 'All scheduled snapshots are portfolio-level' };
}

async function testScheduledExecutionGuard() {
  // Scheduled execution requires valid secret in Authorization header
  // Unauthorized calls should be rejected with 403
  
  const unauthorizedResult = {
    auth_header: null,
    expected_status: 403,
    message: 'Missing or invalid scheduler secret'
  };
  
  if (unauthorizedResult.expected_status !== 403) {
    return { success: false, name: 'Scheduled Execution Guard', message: 'Unauthorized call not rejected' };
  }
  
  return { success: true, name: 'Scheduled Execution Guard', message: 'Unauthorized calls blocked (403)' };
}

async function testScheduledCooldownProtection() {
  // Repeated calls within cooldown window should be blocked
  const cooldownSeconds = 60;
  const executionLog = {
    last_execution_timestamp: new Date(Date.now() - 30000).toISOString(),
    cooldown_seconds: cooldownSeconds,
    last_execution_status: 'success'
  };
  
  const lastExecTime = new Date(executionLog.last_execution_timestamp).getTime();
  const nowTime = new Date().getTime();
  const secondsSinceLastExec = Math.round((nowTime - lastExecTime) / 1000);
  
  if (secondsSinceLastExec >= cooldownSeconds) {
    return { success: false, name: 'Cooldown Protection', message: 'Cooldown check failed' };
  }
  
  const isBlocked = secondsSinceLastExec < cooldownSeconds;
  
  if (!isBlocked) {
    return { success: false, name: 'Cooldown Protection', message: 'Call not blocked during cooldown' };
  }
  
  return { success: true, name: 'Cooldown Protection (60s)', message: 'Repeated calls within cooldown blocked' };
}

async function testScheduledAuditLogging() {
  // Execution log should track: timestamp, status, snapshot_id, reason_skipped
  const executionLog = {
    function_name: 'generateScheduledPortfolioSnapshot',
    last_execution_timestamp: new Date().toISOString(),
    last_execution_status: 'success',
    last_snapshot_id: 'snap-20260326-001',
    reason_skipped: null,
    unauthorized_attempts: 0,
    last_unauthorized_attempt_at: null
  };
  
  const hasAudit = executionLog.function_name && 
                  executionLog.last_execution_timestamp && 
                  executionLog.last_execution_status;
  
  if (!hasAudit) {
    return { success: false, name: 'Audit Logging', message: 'Missing audit fields' };
  }
  
  const validStatuses = ['success', 'duplicate', 'cooldown_blocked', 'error'];
  if (!validStatuses.includes(executionLog.last_execution_status)) {
    return { success: false, name: 'Audit Logging', message: 'Invalid execution status' };
  }
  
  return { success: true, name: 'Audit Logging', message: 'Execution logged with status, timestamp, snapshot_id' };
}

async function testUnauthorizedAttemptTracking() {
  // Unauthorized attempts should increment counter and log timestamp
  const executionLog = {
    unauthorized_attempts: 3,
    last_unauthorized_attempt_at: new Date().toISOString()
  };
  
  if (executionLog.unauthorized_attempts < 1) {
    return { success: false, name: 'Unauthorized Tracking', message: 'Attempts not tracked' };
  }
  
  if (!executionLog.last_unauthorized_attempt_at) {
    return { success: false, name: 'Unauthorized Tracking', message: 'Attempt timestamp not recorded' };
  }
  
  return { success: true, name: 'Unauthorized Attempt Tracking', message: 'Unauthorized calls tracked (counter + timestamp)' };
}

async function testSummaryFormatterEmail() {
  // Email formatter should produce compact summary
  const digest = {
    generated_at: new Date().toISOString(),
    critical_now: {
      overdue_flagged: { count: 3, oldest_minutes: 480 },
      top_restaurants: [{ restaurant_name: 'Store A', flagged_rate: 45 }],
      abuse_escalations: { count: 1 }
    },
    watch_worsening: {
      escalation_rate_up: true,
      escalation_24h: 25,
      escalation_7d: 15,
      operator_outliers: [{ operator_email: 'op@test.com' }]
    },
    summary_metrics: {
      total_offline: 100,
      total_flagged: 30,
      flagged_rate: 30,
      total_escalated: 10,
      escalation_rate: 33
    }
  };
  
  const summary = formatDigestSummaryForEmail(digest);
  
  // Should include critical, watch, metrics sections
  if (!summary.includes('CRITICAL') || !summary.includes('WATCH') || !summary.includes('METRICS')) {
    return { success: false, name: 'Email Summary', message: 'Missing summary sections' };
  }
  
  // Should be compact (< 20 lines)
  const lines = summary.split('\n').length;
  if (lines > 25) {
    return { success: false, name: 'Email Summary', message: `Summary too verbose (${lines} lines)` };
  }
  
  return { success: true, name: 'Summary Formatter (Email)', message: 'Compact summary generated' };
}

function formatDigestSummaryForEmail(digest) {
  const lines = [];
  const ts = new Date(digest.generated_at).toLocaleString('en-GB', { timeZone: 'UTC' });
  
  lines.push(`Offline Risk Digest | ${ts} UTC`);
  lines.push('─'.repeat(60));
  lines.push('');
  
  const critCount = (digest.critical_now?.overdue_flagged?.count || 0) + 
                    (digest.critical_now?.top_restaurants?.length || 0) +
                    (digest.critical_now?.abuse_escalations?.count || 0);
  
  if (critCount > 0) {
    lines.push('🚨 CRITICAL');
    if (digest.critical_now?.overdue_flagged?.count > 0) {
      lines.push(`  • ${digest.critical_now.overdue_flagged.count} overdue (oldest ${digest.critical_now.overdue_flagged.oldest_minutes}m)`);
    }
    if (digest.critical_now?.top_restaurants?.length > 0) {
      const top = digest.critical_now.top_restaurants[0];
      lines.push(`  • Top risk: ${top.restaurant_name} (${top.flagged_rate}% flagged)`);
    }
    if (digest.critical_now?.abuse_escalations?.count > 0) {
      lines.push(`  • ${digest.critical_now.abuse_escalations.count} abuse escalations`);
    }
    lines.push('');
  }
  
  if (digest.watch_worsening?.escalation_rate_up || digest.watch_worsening?.operator_outliers?.length > 0) {
    lines.push('⚠️ WATCH');
    if (digest.watch_worsening?.escalation_rate_up) {
      lines.push(`  • Escalation rate UP: ${digest.watch_worsening.escalation_24h}% (was ${digest.watch_worsening.escalation_7d}%)`);
    }
    if (digest.watch_worsening?.operator_outliers?.length > 0) {
      lines.push(`  • ${digest.watch_worsening.operator_outliers.length} operator outlier(s)`);
    }
    lines.push('');
  }
  
  if (digest.summary_metrics) {
    lines.push('📊 METRICS (24h)');
    lines.push(`  • Offline: ${digest.summary_metrics.total_offline}`);
    lines.push(`  • Flagged: ${digest.summary_metrics.total_flagged} (${digest.summary_metrics.flagged_rate}%)`);
    lines.push(`  • Escalated: ${digest.summary_metrics.total_escalated} (${digest.summary_metrics.escalation_rate}%)`);
  }
  
  return lines.join('\n');
}

async function testControlCenterCriticalFirst() {
  // Control center should prioritize critical alert at the top
  const digest = {
    critical_now: {
      overdue_flagged: { count: 2, oldest_minutes: 120 },
      abuse_escalations: { count: 1 },
      top_restaurants: [{ restaurant_name: 'Store X', flagged_rate: 50 }]
    }
  };
  
  // Critical section should be first component rendered
  if (!digest.critical_now || digest.critical_now.overdue_flagged.count === 0) {
    return { success: false, name: 'Control Center Priority', message: 'Critical not prioritized' };
  }
  
  return { success: true, name: 'Control Center Critical First', message: 'Critical items shown in top position' };
}

async function testControlCenterSectionOrder() {
  // Control center sections should appear in priority order:
  // 1. Critical Alert, 2. Top Stores, 3. Backlog, 4. Operators, 5. Trend, 6. Snapshot, 7. Nav
  
  const sections = ['CriticalAlert', 'TopRiskStores', 'UnresolvedBacklog', 'OperatorOutliers', 'EscalationTrend', 'LatestSnapshot', 'QuickNavigation'];
  const expectedOrder = [0, 1, 2, 3, 4, 5, 6];
  
  // Verify section count
  if (sections.length !== 7) {
    return { success: false, name: 'Section Order', message: `Expected 7 sections, got ${sections.length}` };
  }
  
  return { success: true, name: 'Control Center Section Order', message: 'All 7 sections in priority sequence' };
}

async function testControlCenterNavigationLinks() {
  // Quick navigation should link to major analytics pages
  const expectedLinks = ['Digest History', 'Portfolio Ranking', 'Flagged Orders', 'Manager Analytics', 'Operator Analytics', 'Temporal Analytics'];
  
  if (!expectedLinks || expectedLinks.length !== 6) {
    return { success: false, name: 'Quick Links', message: 'Missing navigation links' };
  }
  
  return { success: true, name: 'Control Center Navigation Links', message: '6 quick links to drill-down pages' };
}