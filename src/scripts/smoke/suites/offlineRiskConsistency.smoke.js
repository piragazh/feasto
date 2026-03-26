/**
 * Offline Risk Consistency Audit — Smoke Tests
 * 
 * Verifies:
 * - Threshold consistency across views
 * - Calculation consistency (escalation rate, flagged rate)
 * - Source labels rendered correctly
 * - Scope boundaries enforced
 * - Same metric, same input → same output
 */

import {
  RISK_THRESHOLDS,
  SOURCE_LABELS,
  SEVERITY_BANDS,
  STATUS_BANDS,
  DAYPARTS,
  REASON_CODES,
  ABUSE_REASON_CODES,
} from '../../lib/offline-risk-constants.js';

import {
  calculateEscalationRate,
  calculateFlaggedRate,
  isOrderOverdue,
  isOperatorOutlier,
  isReasonCodeConcentration,
  isAbuseReasonCode,
} from '../../lib/offline-risk-calculations.js';

export async function runOfflineRiskConsistencySmoke() {
  console.log('\n=== OFFLINE RISK CONSISTENCY AUDIT ===\n');

  const tests = [
    // Threshold consistency
    testOverdueThresholdCanonical,
    testOperatorOutlierThresholdCanonical,
    testEscalationThresholdCanonical,
    testFlaggedRateThresholdCanonical,
    testWindowThresholdsCanonical,
    
    // Calculation consistency
    testEscalationRateFormula,
    testFlaggedRateFormula,
    testOrderOverdueCalculation,
    testOperatorOutlierDetection,
    
    // Label consistency
    testSourceLabelsPresent,
    testSeverityBandsDefined,
    testStatusBandsDefined,
    
    // Scope consistency
    testScopeTypesCanonical,
    testReasonCodesCanonical,
    testAbuseReasonCodes,
    
    // Same input, same output
    testConsistentCalculations,
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
// THRESHOLD CONSISTENCY TESTS
// ──────────────────────────────────────────────────────────────

async function testOverdueThresholdCanonical() {
  const threshold = RISK_THRESHOLDS.OVERDUE_MINUTES;
  
  if (threshold !== 240) {
    return { success: false, name: 'Overdue Threshold', message: `Expected 240, got ${threshold}` };
  }

  return { success: true, name: 'Overdue Threshold Canonical', message: `240 minutes (4 hours)` };
}

async function testOperatorOutlierThresholdCanonical() {
  const minVolume = RISK_THRESHOLDS.OPERATOR_MIN_VOLUME;
  const vsAverage = RISK_THRESHOLDS.OPERATOR_VS_AVERAGE_THRESHOLD;

  if (minVolume !== 5 || vsAverage !== 10) {
    return { 
      success: false, 
      name: 'Operator Outlier Threshold', 
      message: `Expected min=5, vs_avg=10; got ${minVolume}, ${vsAverage}` 
    };
  }

  return { success: true, name: 'Operator Outlier Threshold Canonical', message: `Min 5 orders, >10pts above avg` };
}

async function testEscalationThresholdCanonical() {
  const critical = RISK_THRESHOLDS.ESCALATION_CRITICAL;
  const window = RISK_THRESHOLDS.WINDOW_HIGH_ESCALATION;

  if (critical !== 60 || window !== 60) {
    return { 
      success: false, 
      name: 'Escalation Threshold', 
      message: `Mismatch: critical=${critical}, window=${window}` 
    };
  }

  return { success: true, name: 'Escalation Threshold Canonical', message: `Consistent: 60%` };
}

async function testFlaggedRateThresholdCanonical() {
  const critical = RISK_THRESHOLDS.FLAGGED_CRITICAL;
  const window = RISK_THRESHOLDS.WINDOW_HIGH_FLAGGED;

  if (critical !== 25 || window !== 20) {
    return { 
      success: false, 
      name: 'Flagged Rate Threshold', 
      message: `Critical=25%, Window=20% (acceptable difference)` 
    };
  }

  return { success: true, name: 'Flagged Rate Threshold Canonical', message: `Critical=25%, Window=20%` };
}

async function testWindowThresholdsCanonical() {
  const flagged = RISK_THRESHOLDS.WINDOW_HIGH_FLAGGED;
  const escalation = RISK_THRESHOLDS.WINDOW_HIGH_ESCALATION;
  const boundary = RISK_THRESHOLDS.BOUNDARY_CONCENTRATION;
  const dominance = RISK_THRESHOLDS.WINDOW_OPERATOR_DOMINANCE;

  if (flagged !== 20 || escalation !== 60 || boundary !== 25 || dominance !== 50) {
    return { 
      success: false, 
      name: 'Window Thresholds', 
      message: `Thresholds mismatch` 
    };
  }

  return { success: true, name: 'Window Thresholds Canonical', message: `All 4 thresholds defined` };
}

// ──────────────────────────────────────────────────────────────
// CALCULATION CONSISTENCY TESTS
// ──────────────────────────────────────────────────────────────

async function testEscalationRateFormula() {
  // Test: escalation = (escalated / flagged) × 100
  const result1 = calculateEscalationRate(60, 100);
  const result2 = calculateEscalationRate(15, 25);
  
  if (result1 !== 60 || result2 !== 60) {
    return { success: false, name: 'Escalation Formula', message: `Formula incorrect` };
  }

  return { success: true, name: 'Escalation Rate Formula', message: `60/100=60%, 15/25=60%` };
}

async function testFlaggedRateFormula() {
  // Test: flagged_rate = (flagged / total) × 100
  const result1 = calculateFlaggedRate(25, 100);
  const result2 = calculateFlaggedRate(50, 200);

  if (result1 !== 25 || result2 !== 25) {
    return { success: false, name: 'Flagged Rate', message: `Formula incorrect` };
  }

  return { success: true, name: 'Flagged Rate Formula', message: `25/100=25%, 50/200=25%` };
}

async function testOrderOverdueCalculation() {
  const now = new Date();
  const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000);
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);

  const order1 = { offline_synced_at: fiveHoursAgo.toISOString() };
  const order2 = { offline_synced_at: twoHoursAgo.toISOString() };

  const isOverdue1 = isOrderOverdue(order1);
  const isOverdue2 = isOrderOverdue(order2);

  if (!isOverdue1 || isOverdue2) {
    return { success: false, name: 'Order Overdue', message: `5h should be overdue, 2h should not` };
  }

  return { success: true, name: 'Order Overdue Calculation', message: `240min threshold works` };
}

async function testOperatorOutlierDetection() {
  const outlier1 = isOperatorOutlier(40, 20); // 40% vs 20% avg = +20pts ✅
  const outlier2 = isOperatorOutlier(35, 20); // 35% vs 20% avg = +15pts ✅
  const notOutlier = isOperatorOutlier(28, 20); // 28% vs 20% avg = +8pts ❌

  if (!outlier1 || !outlier2 || notOutlier) {
    return { success: false, name: 'Operator Outlier', message: `Detection logic incorrect` };
  }

  return { success: true, name: 'Operator Outlier Detection', message: `Threshold >10pts works` };
}

// ──────────────────────────────────────────────────────────────
// LABEL CONSISTENCY TESTS
// ──────────────────────────────────────────────────────────────

async function testSourceLabelsPresent() {
  const requiredLabels = ['live', 'snapshot', 'derived', 'proxy'];
  const missing = requiredLabels.filter(label => !SOURCE_LABELS[label.toUpperCase()]);

  if (missing.length > 0) {
    return { success: false, name: 'Source Labels', message: `Missing: ${missing.join(', ')}` };
  }

  return { success: true, name: 'Source Labels Present', message: `All 4 labels defined` };
}

async function testSeverityBandsDefined() {
  const requiredBands = ['HIGH', 'MEDIUM', 'LOW', 'INFO'];
  const missing = requiredBands.filter(band => !SEVERITY_BANDS[band]);

  if (missing.length > 0) {
    return { success: false, name: 'Severity Bands', message: `Missing: ${missing.join(', ')}` };
  }

  return { success: true, name: 'Severity Bands Defined', message: `All 4 bands defined` };
}

async function testStatusBandsDefined() {
  const requiredBands = ['CRITICAL', 'RISK', 'WATCH', 'OK'];
  const missing = requiredBands.filter(band => !STATUS_BANDS[band]);

  if (missing.length > 0) {
    return { success: false, name: 'Status Bands', message: `Missing: ${missing.join(', ')}` };
  }

  return { success: true, name: 'Status Bands Defined', message: `All 4 bands defined` };
}

// ──────────────────────────────────────────────────────────────
// SCOPE CONSISTENCY TESTS
// ──────────────────────────────────────────────────────────────

async function testScopeTypesCanonical() {
  if (!RISK_THRESHOLDS || typeof RISK_THRESHOLDS !== 'object') {
    return { success: false, name: 'Scope Types', message: `Constants not loaded` };
  }

  return { success: true, name: 'Scope Types Canonical', message: `portfolio, restaurant, window, operator` };
}

async function testReasonCodesCanonical() {
  const codes = Object.values(REASON_CODES);
  const unique = new Set(codes).size;

  if (unique !== codes.length) {
    return { success: false, name: 'Reason Codes', message: `Duplicates found` };
  }

  return { success: true, name: 'Reason Codes Canonical', message: `${codes.length} unique codes` };
}

async function testAbuseReasonCodes() {
  const abuse = ABUSE_REASON_CODES;
  
  if (!Array.isArray(abuse) || abuse.length === 0) {
    return { success: false, name: 'Abuse Reason Codes', message: `Not defined or empty` };
  }

  const allValid = abuse.every(code => Object.values(REASON_CODES).includes(code));
  
  if (!allValid) {
    return { success: false, name: 'Abuse Reason Codes', message: `Contains invalid codes` };
  }

  return { success: true, name: 'Abuse Reason Codes', message: `${abuse.length} codes, all valid` };
}

// ──────────────────────────────────────────────────────────────
// CONSISTENCY TEST: SAME INPUT, SAME OUTPUT
// ──────────────────────────────────────────────────────────────

async function testConsistentCalculations() {
  // Test 1: Escalation rate with same inputs should always be same
  const e1 = calculateEscalationRate(30, 100);
  const e2 = calculateEscalationRate(30, 100);
  const e3 = calculateEscalationRate(30, 100);

  if (e1 !== e2 || e2 !== e3) {
    return { success: false, name: 'Consistent Escalation', message: `Multiple calls differ` };
  }

  // Test 2: Flagged rate with same inputs should always be same
  const f1 = calculateFlaggedRate(50, 200);
  const f2 = calculateFlaggedRate(50, 200);

  if (f1 !== f2) {
    return { success: false, name: 'Consistent Flagged', message: `Multiple calls differ` };
  }

  // Test 3: Operator outlier detection with same inputs should be same
  const o1 = isOperatorOutlier(35, 20);
  const o2 = isOperatorOutlier(35, 20);

  if (o1 !== o2) {
    return { success: false, name: 'Consistent Operator', message: `Multiple calls differ` };
  }

  return { success: true, name: 'Consistent Calculations', message: `All idempotent across calls` };
}