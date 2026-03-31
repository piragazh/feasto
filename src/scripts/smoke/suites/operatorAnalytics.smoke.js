/**
/* eslint-disable no-undef */
/**
 * Operator Analytics Smoke Tests
 * 
 * Verifies real operator-level offline analytics:
 * - Operator grouping by offline_created_by
 * - Flagged rate calculation
 * - Escalation rate calculation
 * - Outlier detection rules
 * - Risk scoring
 */

const { createClientFromRequest } = require('npm:@base44/sdk@0.8.23');
const { calculateOperatorMetrics } = require('/lib/manager-operator-analytics.js');
const { detectOperatorOutliers, rankOperatorsByRisk, calculateOperatorRiskScore } = require('/lib/operator-outlier-rules.js');

export async function runOperatorAnalyticsSmoke() {
    console.log('\n=== OPERATOR ANALYTICS SMOKE TESTS ===\n');
    
    const tests = [
        testOperatorGrouping,
        testFlaggedRateCalculation,
        testEscalationRateCalculation,
        testOutlierDetection,
        testRiskScoring,
        testRoleAggregation,
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

async function testOperatorGrouping() {
    // Mock orders with different operators
    const orders = [
        { offline_created: true, offline_created_by: 'john@test.com', offline_created_by_name: 'John', offline_created_by_role: 'cashier', needs_review: true, offline_review_status: 'resolved' },
        { offline_created: true, offline_created_by: 'john@test.com', offline_created_by_name: 'John', offline_created_by_role: 'cashier', needs_review: false },
        { offline_created: true, offline_created_by: 'jane@test.com', offline_created_by_name: 'Jane', offline_created_by_role: 'waiter', needs_review: false },
        { offline_created: false }, // Should be ignored
    ];
    
    const metrics = calculateOperatorMetrics('rest-1', orders);
    
    if (Object.keys(metrics).length !== 2) {
        return { success: false, name: 'Operator Grouping', message: `Expected 2 operators, got ${Object.keys(metrics).length}` };
    }
    
    if (!metrics['john@test.com'] || !metrics['jane@test.com']) {
        return { success: false, name: 'Operator Grouping', message: 'Operators not grouped correctly' };
    }
    
    if (metrics['john@test.com'].totalOrders !== 2) {
        return { success: false, name: 'Operator Grouping', message: `John should have 2 orders, got ${metrics['john@test.com'].totalOrders}` };
    }
    
    return { success: true, name: 'Operator Grouping', message: 'Correctly grouped 2 operators from 4 orders' };
}

async function testFlaggedRateCalculation() {
    const orders = [
        { offline_created: true, offline_created_by: 'op1@test.com', offline_created_by_name: 'Op1', offline_created_by_role: 'cashier', needs_review: true },
        { offline_created: true, offline_created_by: 'op1@test.com', offline_created_by_name: 'Op1', offline_created_by_role: 'cashier', needs_review: true },
        { offline_created: true, offline_created_by: 'op1@test.com', offline_created_by_name: 'Op1', offline_created_by_role: 'cashier', needs_review: false },
        { offline_created: true, offline_created_by: 'op1@test.com', offline_created_by_name: 'Op1', offline_created_by_role: 'cashier', needs_review: false },
    ];
    
    const metrics = calculateOperatorMetrics('rest-1', orders);
    const op1 = metrics['op1@test.com'];
    
    // 2 flagged out of 4 = 50%
    if (op1.flaggedRate !== 50) {
        return { success: false, name: 'Flagged Rate Calculation', message: `Expected 50%, got ${op1.flaggedRate}%` };
    }
    
    if (op1.flaggedCount !== 2) {
        return { success: false, name: 'Flagged Rate Calculation', message: `Expected 2 flagged, got ${op1.flaggedCount}` };
    }
    
    return { success: true, name: 'Flagged Rate Calculation', message: '2/4 orders = 50% flagged rate' };
}

async function testEscalationRateCalculation() {
    const orders = [
        { offline_created: true, offline_created_by: 'op1@test.com', offline_created_by_name: 'Op1', offline_created_by_role: 'cashier', needs_review: true, offline_review_status: 'escalated' },
        { offline_created: true, offline_created_by: 'op1@test.com', offline_created_by_name: 'Op1', offline_created_by_role: 'cashier', needs_review: true, offline_review_status: 'resolved' },
    ];
    
    const metrics = calculateOperatorMetrics('rest-1', orders);
    const op1 = metrics['op1@test.com'];
    
    // 1 escalated out of 2 flagged = 50%
    if (op1.escalationRate !== 50) {
        return { success: false, name: 'Escalation Rate Calculation', message: `Expected 50%, got ${op1.escalationRate}%` };
    }
    
    if (op1.escalatedCount !== 1) {
        return { success: false, name: 'Escalation Rate Calculation', message: `Expected 1 escalated, got ${op1.escalatedCount}` };
    }
    
    return { success: true, name: 'Escalation Rate Calculation', message: '1/2 flagged escalated = 50%' };
}

async function testOutlierDetection() {
    const orders = [
        // Op1: high flagged rate (3 out of 5 = 60%)
        { offline_created: true, offline_created_by: 'op1@test.com', offline_created_by_name: 'High Flagger', offline_created_by_role: 'cashier', needs_review: true, offline_review_status: 'resolved' },
        { offline_created: true, offline_created_by: 'op1@test.com', offline_created_by_name: 'High Flagger', offline_created_by_role: 'cashier', needs_review: true, offline_review_status: 'resolved' },
        { offline_created: true, offline_created_by: 'op1@test.com', offline_created_by_name: 'High Flagger', offline_created_by_role: 'cashier', needs_review: true, offline_review_status: 'resolved' },
        { offline_created: true, offline_created_by: 'op1@test.com', offline_created_by_name: 'High Flagger', offline_created_by_role: 'cashier', needs_review: false },
        { offline_created: true, offline_created_by: 'op1@test.com', offline_created_by_name: 'High Flagger', offline_created_by_role: 'cashier', needs_review: false },
        // Op2: normal (1 out of 5 = 20%)
        { offline_created: true, offline_created_by: 'op2@test.com', offline_created_by_name: 'Normal Op', offline_created_by_role: 'waiter', needs_review: true, offline_review_status: 'resolved' },
        { offline_created: true, offline_created_by: 'op2@test.com', offline_created_by_name: 'Normal Op', offline_created_by_role: 'waiter', needs_review: false },
        { offline_created: true, offline_created_by: 'op2@test.com', offline_created_by_name: 'Normal Op', offline_created_by_role: 'waiter', needs_review: false },
        { offline_created: true, offline_created_by: 'op2@test.com', offline_created_by_name: 'Normal Op', offline_created_by_role: 'waiter', needs_review: false },
        { offline_created: true, offline_created_by: 'op2@test.com', offline_created_by_name: 'Normal Op', offline_created_by_role: 'waiter', needs_review: false },
    ];
    
    const metrics = calculateOperatorMetrics('rest-1', orders);
    const outliers = detectOperatorOutliers(metrics);
    
    // Should flag op1 as high flagged rate
    if (!outliers.highest_flagged_rate) {
        return { success: false, name: 'Outlier Detection', message: 'Did not detect high flagged rate' };
    }
    
    if (outliers.highest_flagged_rate.operator !== 'op1@test.com') {
        return { success: false, name: 'Outlier Detection', message: `Expected op1, got ${outliers.highest_flagged_rate.operator}` };
    }
    
    return { success: true, name: 'Outlier Detection', message: 'Detected op1 with 60% flagged rate as outlier' };
}

async function testRiskScoring() {
    const metrics = {
        operatorEmail: 'test@test.com',
        totalOrders: 20,
        flaggedCount: 5,
        flaggedRate: 25,
        escalatedCount: 3,
        escalationRate: 60,
        abuseEscalations: 2,
        reasonCodes: {},
    };
    
    const score = calculateOperatorRiskScore(metrics);
    
    if (score < 0 || score > 100) {
        return { success: false, name: 'Risk Scoring', message: `Score out of range: ${score}` };
    }
    
    if (score < 50) {
        return { success: false, name: 'Risk Scoring', message: `Expected risk score > 50, got ${score}` };
    }
    
    return { success: true, name: 'Risk Scoring', message: `Risk score ${score} within expected range (50-100)` };
}

async function testRoleAggregation() {
    const orders = [
        { offline_created: true, offline_created_by: 'c1@test.com', offline_created_by_name: 'Cashier 1', offline_created_by_role: 'cashier', needs_review: true },
        { offline_created: true, offline_created_by: 'c1@test.com', offline_created_by_name: 'Cashier 1', offline_created_by_role: 'cashier', needs_review: false },
        { offline_created: true, offline_created_by: 'c2@test.com', offline_created_by_name: 'Cashier 2', offline_created_by_role: 'cashier', needs_review: false },
        { offline_created: true, offline_created_by: 'w1@test.com', offline_created_by_name: 'Waiter 1', offline_created_by_role: 'waiter', needs_review: false },
    ];
    
    const metrics = calculateOperatorMetrics('rest-1', orders);
    
    // Verify roles captured
    if (metrics['c1@test.com'].operatorRole !== 'cashier') {
        return { success: false, name: 'Role Aggregation', message: 'Role not captured correctly' };
    }
    
    // Count by role
    const cashiers = Object.values(metrics).filter(op => op.operatorRole === 'cashier');
    const waiters = Object.values(metrics).filter(op => op.operatorRole === 'waiter');
    
    if (cashiers.length !== 2 || waiters.length !== 1) {
        return { success: false, name: 'Role Aggregation', message: `Expected 2 cashiers, 1 waiter; got ${cashiers.length} and ${waiters.length}` };
    }
    
    return { success: true, name: 'Role Aggregation', message: 'Correctly grouped by role (2 cashiers, 1 waiter)' };
}