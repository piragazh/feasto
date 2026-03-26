/**
 * Offline Review Severity Scoring — Smoke Tests
 * 
 * Validates:
 * - Severity classification per rule
 * - Score calculation
 * - Overall status mapping
 * - Alert prioritisation (HIGH → MEDIUM → LOW → INFO)
 * - Next action hints
 */

import {
    calculateRuleSeverity,
    severityScore,
    calculateTotalScore,
    scoreToStatus,
    getNextAction,
    normalizeAnomaly,
    enrichAnomaliesWithScoring
} from '@/lib/offline-review-severity-scoring';

export const offlineReviewSeveritySuite = {
    name: 'Offline Review Severity Scoring',
    type: 'automated',

    tests: [
        // ──────────────────────────────────────────────────────────────────────
        // SEVERITY CLASSIFICATION TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'flagged_rate: 8% = low',
            run: () => calculateRuleSeverity('flagged_rate', 8) === 'low'
        },
        {
            name: 'flagged_rate: 20% = medium',
            run: () => calculateRuleSeverity('flagged_rate', 20) === 'medium'
        },
        {
            name: 'flagged_rate: 30% = high',
            run: () => calculateRuleSeverity('flagged_rate', 30) === 'high'
        },

        {
            name: 'escalation_rate: 40% = low',
            run: () => calculateRuleSeverity('escalation_rate', 40) === 'low'
        },
        {
            name: 'escalation_rate: 60% = medium',
            run: () => calculateRuleSeverity('escalation_rate', 60) === 'medium'
        },
        {
            name: 'escalation_rate: 80% = high',
            run: () => calculateRuleSeverity('escalation_rate', 80) === 'high'
        },

        {
            name: 'unresolved_backlog: {count: 7, ageHours: 6} = low',
            run: () => calculateRuleSeverity('unresolved_backlog', {count: 7, ageHours: 6}) === 'low'
        },
        {
            name: 'unresolved_backlog: {count: 12, ageHours: 10} = medium',
            run: () => calculateRuleSeverity('unresolved_backlog', {count: 12, ageHours: 10}) === 'medium'
        },
        {
            name: 'unresolved_backlog: {count: 20, ageHours: 60} = high',
            run: () => calculateRuleSeverity('unresolved_backlog', {count: 20, ageHours: 60}) === 'high'
        },
        {
            name: 'unresolved_backlog: {count: 3, ageHours: 72} = high (age escalates)',
            run: () => calculateRuleSeverity('unresolved_backlog', {count: 3, ageHours: 72}) === 'high'
        },

        {
            name: 'reason_code_concentration: 75% = low',
            run: () => calculateRuleSeverity('reason_code_concentration', 75) === 'low'
        },
        {
            name: 'reason_code_concentration: 85% = medium',
            run: () => calculateRuleSeverity('reason_code_concentration', 85) === 'medium'
        },
        {
            name: 'reason_code_concentration: 95% = high',
            run: () => calculateRuleSeverity('reason_code_concentration', 95) === 'high'
        },

        {
            name: 'abuse_suspicious: {count: 2, percent: 7} = low',
            run: () => calculateRuleSeverity('abuse_suspicious', {count: 2, percent: 7}) === 'low'
        },
        {
            name: 'abuse_suspicious: {count: 2, percent: 12} = medium',
            run: () => calculateRuleSeverity('abuse_suspicious', {count: 2, percent: 12}) === 'medium'
        },
        {
            name: 'abuse_suspicious: {count: 3, percent: 10} = high',
            run: () => calculateRuleSeverity('abuse_suspicious', {count: 3, percent: 10}) === 'high'
        },

        {
            name: 'manager_load: 65% = low',
            run: () => calculateRuleSeverity('manager_load', 65) === 'low'
        },
        {
            name: 'manager_load: 75% = medium',
            run: () => calculateRuleSeverity('manager_load', 75) === 'medium'
        },
        {
            name: 'manager_load: 85% = high',
            run: () => calculateRuleSeverity('manager_load', 85) === 'high'
        },

        {
            name: 'documentation_gap: 45% = low',
            run: () => calculateRuleSeverity('documentation_gap', 45) === 'low'
        },
        {
            name: 'documentation_gap: 30% = medium',
            run: () => calculateRuleSeverity('documentation_gap', 30) === 'medium'
        },
        {
            name: 'documentation_gap: 15% = high',
            run: () => calculateRuleSeverity('documentation_gap', 15) === 'high'
        },

        // ──────────────────────────────────────────────────────────────────────
        // SEVERITY SCORING TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'severityScore: low = 1',
            run: () => severityScore('low') === 1
        },
        {
            name: 'severityScore: medium = 2',
            run: () => severityScore('medium') === 2
        },
        {
            name: 'severityScore: high = 3',
            run: () => severityScore('high') === 3
        },
        {
            name: 'severityScore: info = 0 (excluded)',
            run: () => severityScore('info') === 0
        },

        // ──────────────────────────────────────────────────────────────────────
        // TOTAL SCORE CALCULATION
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'calculateTotalScore: no anomalies = 0',
            run: () => calculateTotalScore([]) === 0
        },
        {
            name: 'calculateTotalScore: 1 low + 1 medium + 1 high = 6',
            run: () => {
                const anomalies = [
                    { type: 'test1', severity: 'low' },
                    { type: 'test2', severity: 'medium' },
                    { type: 'test3', severity: 'high' }
                ];
                return calculateTotalScore(anomalies) === 6;
            }
        },
        {
            name: 'calculateTotalScore: ignores info-level anomalies',
            run: () => {
                const anomalies = [
                    { type: 'test1', severity: 'high' },
                    { type: 'test2', severity: 'info' },
                    { type: 'test3', severity: 'info' }
                ];
                return calculateTotalScore(anomalies) === 3; // only high (3 points)
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // STATUS MAPPING TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'scoreToStatus: 0 = ok',
            run: () => scoreToStatus(0).status === 'ok'
        },
        {
            name: 'scoreToStatus: 1 = watch',
            run: () => scoreToStatus(1).status === 'watch'
        },
        {
            name: 'scoreToStatus: 3 = watch',
            run: () => scoreToStatus(3).status === 'watch'
        },
        {
            name: 'scoreToStatus: 4 = risk',
            run: () => scoreToStatus(4).status === 'risk'
        },
        {
            name: 'scoreToStatus: 7 = risk',
            run: () => scoreToStatus(7).status === 'risk'
        },
        {
            name: 'scoreToStatus: 8 = critical',
            run: () => scoreToStatus(8).status === 'critical'
        },

        // ──────────────────────────────────────────────────────────────────────
        // NEXT ACTION HINTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'getNextAction: flagged_rate + high',
            run: () => {
                const action = getNextAction('flagged_rate', 'high');
                return action && action.includes('sync');
            }
        },
        {
            name: 'getNextAction: escalation_rate + medium',
            run: () => {
                const action = getNextAction('escalation_rate', 'medium');
                return action && action.includes('audit');
            }
        },
        {
            name: 'getNextAction: unresolved_backlog + high',
            run: () => {
                const action = getNextAction('unresolved_backlog', 'high');
                return action && action.includes('clear');
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // NORMALIZE ANOMALY TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'normalizeAnomaly: maps old critical → high',
            run: () => {
                const raw = {
                    type: 'flagged_rate',
                    severity: 'critical',
                    message: 'test',
                    percent: 30
                };
                const normalized = normalizeAnomaly(raw);
                return normalized.severity === 'high' && normalized.score === 3;
            }
        },
        {
            name: 'normalizeAnomaly: preserves info-level',
            run: () => {
                const raw = {
                    type: 'manager_load_imbalance',
                    severity: 'info',
                    message: 'test'
                };
                const normalized = normalizeAnomaly(raw);
                return normalized.severity === 'info' && normalized.score === 0;
            }
        },
        {
            name: 'normalizeAnomaly: includes nextAction',
            run: () => {
                const raw = {
                    type: 'abuse_suspicious',
                    severity: 'warning',
                    message: 'test'
                };
                const normalized = normalizeAnomaly(raw);
                return normalized.nextAction && typeof normalized.nextAction === 'string';
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // FULL ENRICHMENT TEST
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'enrichAnomaliesWithScoring: sorts by severity (HIGH → LOW)',
            run: () => {
                const raw = {
                    anomalies: [
                        { type: 'test1', severity: 'info', message: 'a' },
                        { type: 'test2', severity: 'high', message: 'b' },
                        { type: 'test3', severity: 'low', message: 'c' },
                        { type: 'test4', severity: 'medium', message: 'd' }
                    ],
                    severity: 'warning'
                };
                const enriched = enrichAnomaliesWithScoring(raw);
                const severities = enriched.anomalies.map(a => a.severity);
                return JSON.stringify(severities) === JSON.stringify(['high', 'medium', 'low', 'info']);
            }
        },
        {
            name: 'enrichAnomaliesWithScoring: calculates total score correctly',
            run: () => {
                const raw = {
                    anomalies: [
                        { type: 'test1', severity: 'high', message: 'a' },  // 3
                        { type: 'test2', severity: 'medium', message: 'b' }, // 2
                        { type: 'test3', severity: 'info', message: 'c' }    // 0 (ignored)
                    ],
                    severity: 'warning'
                };
                const enriched = enrichAnomaliesWithScoring(raw);
                return enriched.totalScore === 5; // 3 + 2
            }
        },
        {
            name: 'enrichAnomaliesWithScoring: maps score to status (5 = risk)',
            run: () => {
                const raw = {
                    anomalies: [
                        { type: 'test1', severity: 'high', message: 'a' },  // 3
                        { type: 'test2', severity: 'medium', message: 'b' }  // 2
                    ],
                    severity: 'warning'
                };
                const enriched = enrichAnomaliesWithScoring(raw);
                return enriched.status === 'risk' && enriched.totalScore === 5;
            }
        },
        {
            name: 'enrichAnomaliesWithScoring: maps score 0 to ok',
            run: () => {
                const raw = { anomalies: [], severity: 'ok' };
                const enriched = enrichAnomaliesWithScoring(raw);
                return enriched.status === 'ok' && enriched.totalScore === 0;
            }
        }
    ],

    manual: [
        {
            title: 'Severity Badge Display: HIGH appears in red, MEDIUM in orange, LOW in yellow, INFO in blue',
            steps: [
                '1. Create restaurant with: high escalation (75%), medium flagged rate (20%), low code concentration (72%)',
                '2. Open OfflineReviewHealthIndicator',
                '3. Verify anomalies are sorted: escalation (HIGH red) → flagged (MEDIUM orange) → concentration (LOW yellow)',
                '4. Verify each alert has colored badge matching its severity'
            ]
        },
        {
            title: 'Overall Status Banner: CRITICAL displays when score ≥ 8',
            steps: [
                '1. Create restaurant with: 3 high-severity anomalies (3+3+3=9 points)',
                '2. Open OfflineReviewHealthIndicator',
                '3. Verify red banner at top: "CRITICAL: Critical issues; immediate action required"',
                '4. Verify risk score shows "9"'
            ]
        },
        {
            title: 'Overall Status Banner: WATCH displays when score 1-3',
            steps: [
                '1. Create restaurant with: 1 low-severity anomaly (1 point)',
                '2. Open OfflineReviewHealthIndicator',
                '3. Verify yellow banner at top: "WATCH: Minor issues; monitor"'
            ]
        },
        {
            title: 'Next Action Hints: Present and actionable for each severity level',
            steps: [
                '1. Create restaurant with mixed anomalies (high, medium, low)',
                '2. Open OfflineReviewHealthIndicator',
                '3. For HIGH escalation: verify hint includes "process"',
                '4. For MEDIUM flagged rate: verify hint includes "configuration"',
                '5. For LOW backlog: verify hint includes "monitor"'
            ]
        },
        {
            title: 'Info-level Anomalies: Not counted in risk score, appear at bottom',
            steps: [
                '1. Create restaurant with: 1 high anomaly (3 pts) + manager load imbalance (info)',
                '2. Open OfflineReviewHealthIndicator',
                '3. Verify risk score = 3 (not 4)',
                '4. Verify manager load alert appears last (blue, info level)'
            ]
        }
    ]
};