/**
 * Offline Review Anomaly Rules — Smoke Tests
 * 
 * Validates all anomaly detection logic:
 * - Threshold calculations
 * - Rule application
 * - Edge cases
 * - UI integration
 */

import {
    calculateFlaggedRate,
    flaggedRateAnomaly,
    calculateEscalatedPercent,
    escalationRateAnomaly,
    unresolvedBacklogAnomaly,
    reasonCodeConcentration,
    calculateAbuseSuspiciousPercent,
    abuseSuspiciousAnomaly,
    managerLoadImbalance,
    documentationGapAnomaly,
    detectAnomalies
} from '@/lib/offline-review-anomaly-rules';

export const offlineReviewAnomaliesSuite = {
    name: 'Offline Review Anomaly Rules',
    type: 'automated',

    tests: [
        // ──────────────────────────────────────────────────────────────────────
        // FLAGGED RATE TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'calculateFlaggedRate: 3/50 = 6%',
            run: () => {
                const rate = calculateFlaggedRate(3, 50);
                return rate === 6;
            }
        },
        {
            name: 'calculateFlaggedRate: 0/100 = 0%',
            run: () => {
                const rate = calculateFlaggedRate(0, 100);
                return rate === 0;
            }
        },
        {
            name: 'calculateFlaggedRate: divide by zero = 0',
            run: () => {
                const rate = calculateFlaggedRate(5, 0);
                return rate === 0;
            }
        },
        {
            name: 'flaggedRateAnomaly: 3% = ok',
            run: () => {
                return flaggedRateAnomaly(3) === 'ok';
            }
        },
        {
            name: 'flaggedRateAnomaly: 12% = elevated',
            run: () => {
                return flaggedRateAnomaly(12) === 'elevated';
            }
        },
        {
            name: 'flaggedRateAnomaly: 20% = high',
            run: () => {
                return flaggedRateAnomaly(20) === 'high';
            }
        },
        {
            name: 'flaggedRateAnomaly: 30% = critical',
            run: () => {
                return flaggedRateAnomaly(30) === 'critical';
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // ESCALATION RATE TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'calculateEscalatedPercent: 5/20 = 25%',
            run: () => {
                const pct = calculateEscalatedPercent(5, 20);
                return pct === 25;
            }
        },
        {
            name: 'calculateEscalatedPercent: 0/0 = 0%',
            run: () => {
                const pct = calculateEscalatedPercent(0, 0);
                return pct === 0;
            }
        },
        {
            name: 'escalationRateAnomaly: 15% = ok',
            run: () => {
                return escalationRateAnomaly(15) === 'ok';
            }
        },
        {
            name: 'escalationRateAnomaly: 40% = elevated',
            run: () => {
                return escalationRateAnomaly(40) === 'elevated';
            }
        },
        {
            name: 'escalationRateAnomaly: 60% = high',
            run: () => {
                return escalationRateAnomaly(60) === 'high';
            }
        },
        {
            name: 'escalationRateAnomaly: 80% = critical',
            run: () => {
                return escalationRateAnomaly(80) === 'critical';
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // UNRESOLVED BACKLOG TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'unresolvedBacklogAnomaly: 0 unresolved = null',
            run: () => {
                return unresolvedBacklogAnomaly(0, 0) === null;
            }
        },
        {
            name: 'unresolvedBacklogAnomaly: 5 unresolved, 2h age = ok',
            run: () => {
                return unresolvedBacklogAnomaly(5, 2) === 'ok';
            }
        },
        {
            name: 'unresolvedBacklogAnomaly: 5 unresolved, 30h age = warning',
            run: () => {
                return unresolvedBacklogAnomaly(5, 30) === 'warning';
            }
        },
        {
            name: 'unresolvedBacklogAnomaly: 15 unresolved, 1h age = critical',
            run: () => {
                return unresolvedBacklogAnomaly(15, 1) === 'critical';
            }
        },
        {
            name: 'unresolvedBacklogAnomaly: 5 unresolved, 100h age = critical',
            run: () => {
                return unresolvedBacklogAnomaly(5, 100) === 'critical';
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // REASON CODE CONCENTRATION TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'reasonCodeConcentration: 0 reviewed = null',
            run: () => {
                return reasonCodeConcentration('some_code', 5, 0) === null;
            }
        },
        {
            name: 'reasonCodeConcentration: 10/20 = 50% = null (not concentrated)',
            run: () => {
                return reasonCodeConcentration('price_adjusted_on_sync', 10, 20) === null;
            }
        },
        {
            name: 'reasonCodeConcentration: 16/20 = 80% = concentrated (warning)',
            run: () => {
                const result = reasonCodeConcentration('other', 16, 20);
                return result && result.percent === 80 && result.severity === 'warning';
            }
        },
        {
            name: 'reasonCodeConcentration: 18/20 = 90% = concentrated (critical)',
            run: () => {
                const result = reasonCodeConcentration('other', 18, 20);
                return result && result.percent === 90 && result.severity === 'critical';
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // ABUSE SUSPICIOUS TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'calculateAbuseSuspiciousPercent: 2/10 = 20%',
            run: () => {
                const pct = calculateAbuseSuspiciousPercent(2, 10);
                return pct === 20;
            }
        },
        {
            name: 'calculateAbuseSuspiciousPercent: 0/0 = 0%',
            run: () => {
                const pct = calculateAbuseSuspiciousPercent(0, 0);
                return pct === 0;
            }
        },
        {
            name: 'abuseSuspiciousAnomaly: 1 count, 10% = null (count too low)',
            run: () => {
                return abuseSuspiciousAnomaly(10, 1) === null;
            }
        },
        {
            name: 'abuseSuspiciousAnomaly: 2 count, 5% = warning',
            run: () => {
                return abuseSuspiciousAnomaly(5, 2) === 'warning';
            }
        },
        {
            name: 'abuseSuspiciousAnomaly: 3 count, 10% = critical',
            run: () => {
                return abuseSuspiciousAnomaly(10, 3) === 'critical';
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // MANAGER LOAD TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'managerLoadImbalance: 0 total = null',
            run: () => {
                return managerLoadImbalance('bob@example.com', 5, 0) === null;
            }
        },
        {
            name: 'managerLoadImbalance: 8/10 = 80% balanced (no alert)',
            run: () => {
                return managerLoadImbalance('bob@example.com', 8, 10) === null;
            }
        },
        {
            name: 'managerLoadImbalance: 12/20 = 60% = imbalanced (alert)',
            run: () => {
                const result = managerLoadImbalance('bob@example.com', 12, 20);
                return result && result.percent === 60;
            }
        },
        {
            name: 'managerLoadImbalance: 15/20 = 75% = imbalanced (alert)',
            run: () => {
                const result = managerLoadImbalance('alice@example.com', 15, 20);
                return result && result.percent === 75;
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // DOCUMENTATION TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'documentationGapAnomaly: 0 reviewed = null',
            run: () => {
                return documentationGapAnomaly(5, 0) === null;
            }
        },
        {
            name: 'documentationGapAnomaly: 8/10 = 80% = ok (no gap)',
            run: () => {
                return documentationGapAnomaly(8, 10) === null;
            }
        },
        {
            name: 'documentationGapAnomaly: 4/10 = 40% = warning (gap)',
            run: () => {
                return documentationGapAnomaly(4, 10) === 'warning';
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // FULL ANOMALY DETECTION TEST
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'detectAnomalies: clean restaurant (no anomalies)',
            run: () => {
                const result = detectAnomalies({
                    totalOrders: 100,
                    flaggedCount: 3,
                    unresolvedCount: 0,
                    reviewedCount: 3,
                    escalatedCount: 0,
                    oldestUnresolvedHours: 0,
                    reasonCodes: { 'price_adjusted_on_sync': 2, 'customer_already_served': 1 },
                    reviews: [],
                    abuseSuspiciousCodes: {}
                });
                // Clean state = no anomalies or only info-level
                const criticalWarnings = result.anomalies.filter(a => a.severity !== 'info');
                return result.severity === 'ok' && criticalWarnings.length === 0;
            }
        },

        {
            name: 'detectAnomalies: problematic restaurant (multiple anomalies)',
            run: () => {
                const result = detectAnomalies({
                    totalOrders: 100,
                    flaggedCount: 30, // 30% flagged = critical
                    unresolvedCount: 15, // critical backlog
                    reviewedCount: 15,
                    escalatedCount: 12, // 80% escalated = critical
                    oldestUnresolvedHours: 50,
                    reasonCodes: { 'other': 12, 'price_adjusted_on_sync': 3 }, // 80% other = critical
                    reviews: [
                        { offline_review_by: 'bob@example.com', offline_review_notes: 'test' },
                        { offline_review_by: 'bob@example.com', offline_review_notes: 'test' },
                        { offline_review_by: 'bob@example.com', offline_review_notes: 'test' },
                        { offline_review_by: 'bob@example.com', offline_review_notes: 'test' },
                    ],
                    abuseSuspiciousCodes: { 'potential_abuse': 3 } // 3 abuse cases
                });
                // Should have multiple critical/warning anomalies
                return result.severity === 'critical' && result.anomalies.length >= 4;
            }
        }
    ],

    manual: [
        {
            title: 'Health Indicator UI: Critical anomalies highlighted',
            steps: [
                '1. Create restaurant with 30% flagged orders',
                '2. Open OfflineOrdersReview dashboard',
                '3. Verify OfflineReviewHealthIndicator displays red alert: "Critical: systemic POS/sync issue"',
                '4. Create escalated backlog (15+ unresolved, >24h old)',
                '5. Verify red alert: "Unresolved backlog: 15 orders pending review"',
                '6. Verify top alert summary shows "critical" severity badge'
            ]
        },
        {
            title: 'Health Indicator UI: Reason code concentration warning',
            steps: [
                '1. Create 10 reviewed orders all with reason_code = "other"',
                '2. Open OfflineOrdersReview',
                '3. Verify yellow alert: "80% of reviews use "other". Verify if pattern is genuine..."',
                '4. Edit some orders to different codes',
                '5. Verify alert disappears when concentration drops below 70%'
            ]
        },
        {
            title: 'Health Indicator UI: Abuse escalation highlight',
            steps: [
                '1. Escalate 3 orders with reason_code = "potential_abuse"',
                '2. Escalate 1 order with reason_code = "price_reconciled_fair"',
                '3. Open OfflineOrdersReview',
                '4. In "Escalated" section, verify potential_abuse entries have RED background',
                '5. Verify price_reconciled_fair has ORANGE background (normal escalation)'
            ]
        },
        {
            title: 'Health Indicator UI: Sync error distribution display',
            steps: [
                '1. Create flagged orders with sync_validation_notes:',
                '   - "Discount capped at £5"',
                '   - "Coupon SUMMER20 rejected"',
                '   - "Price increased 10%"',
                '   - "Coupon XMAS expired"',
                '2. Open OfflineOrdersReview',
                '3. Verify "Validation Error Distribution" section shows:',
                '   - discount: 1',
                '   - coupon: 2',
                '   - price: 1'
            ]
        }
    ],

    fixtures: {
        requirements: [
            'Restaurant with POS + offline sync enabled',
            'Ability to create flagged orders + review decisions'
        ]
    }
};