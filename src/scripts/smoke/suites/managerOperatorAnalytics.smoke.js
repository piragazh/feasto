/**
 * Manager/Operator Analytics — Smoke Tests
 * 
 * Validates:
 * - Manager metrics calculation
 * - Ranking by review quality signals
 * - Outlier detection (6 types)
 * - Cross-restaurant aggregation
 */

import {
    calculateManagerMetrics,
    rankManagersByRisk,
    flagManagerOutliers,
    aggregateManagerMetricsAcrossRestaurants
} from '@/lib/manager-operator-analytics';

export const managerOperatorAnalyticsSuite = {
    name: 'Manager/Operator Analytics',
    type: 'automated',

    tests: [
        // ──────────────────────────────────────────────────────────────────────
        // MANAGER METRICS CALCULATION
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'calculateManagerMetrics: no orders = empty map',
            run: () => {
                const metrics = calculateManagerMetrics('r1', []);
                return Object.keys(metrics).length === 0;
            }
        },

        {
            name: 'calculateManagerMetrics: only non-offline orders ignored',
            run: () => {
                const orders = [
                    { offline_created: false, offline_review_by: 'mgr@test.com' }
                ];
                const metrics = calculateManagerMetrics('r1', orders);
                return Object.keys(metrics).length === 0;
            }
        },

        {
            name: 'calculateManagerMetrics: counts reviews by manager',
            run: () => {
                const orders = [
                    { offline_created: true, offline_review_by: 'mgr1@test.com', offline_review_status: 'resolved', offline_review_reason_code: 'test' },
                    { offline_created: true, offline_review_by: 'mgr1@test.com', offline_review_status: 'resolved', offline_review_reason_code: 'test' },
                    { offline_created: true, offline_review_by: 'mgr2@test.com', offline_review_status: 'escalated', offline_review_reason_code: 'test' }
                ];
                const metrics = calculateManagerMetrics('r1', orders);
                return metrics['mgr1@test.com'].totalReviews === 2 && metrics['mgr2@test.com'].totalReviews === 1;
            }
        },

        {
            name: 'calculateManagerMetrics: calculates escalation rate',
            run: () => {
                const orders = [
                    { offline_created: true, offline_review_by: 'mgr@test.com', offline_review_status: 'escalated', offline_review_reason_code: 'test' },
                    { offline_created: true, offline_review_by: 'mgr@test.com', offline_review_status: 'resolved', offline_review_reason_code: 'test' }
                ];
                const metrics = calculateManagerMetrics('r1', orders);
                // 1 escalated out of 2 reviewed = 50%
                return metrics['mgr@test.com'].escalationRate === 50;
            }
        },

        {
            name: 'calculateManagerMetrics: counts documentation rate',
            run: () => {
                const orders = [
                    { offline_created: true, offline_review_by: 'mgr@test.com', offline_review_status: 'resolved', offline_review_reason_code: 'test', offline_review_notes: 'note1' },
                    { offline_created: true, offline_review_by: 'mgr@test.com', offline_review_status: 'resolved', offline_review_reason_code: 'test', offline_review_notes: '' },
                    { offline_created: true, offline_review_by: 'mgr@test.com', offline_review_status: 'resolved', offline_review_reason_code: 'test' }
                ];
                const metrics = calculateManagerMetrics('r1', orders);
                // 1 with notes out of 3 = 33%
                return metrics['mgr@test.com'].documentationRate === 33;
            }
        },

        {
            name: 'calculateManagerMetrics: extracts reason code distribution',
            run: () => {
                const orders = [
                    { offline_created: true, offline_review_by: 'mgr@test.com', offline_review_status: 'resolved', offline_review_reason_code: 'code_a' },
                    { offline_created: true, offline_review_by: 'mgr@test.com', offline_review_status: 'resolved', offline_review_reason_code: 'code_a' },
                    { offline_created: true, offline_review_by: 'mgr@test.com', offline_review_status: 'resolved', offline_review_reason_code: 'code_b' }
                ];
                const metrics = calculateManagerMetrics('r1', orders);
                return metrics['mgr@test.com'].reasonCodes.code_a === 2 && metrics['mgr@test.com'].reasonCodes.code_b === 1;
            }
        },

        {
            name: 'calculateManagerMetrics: counts abuse escalations',
            run: () => {
                const orders = [
                    { offline_created: true, offline_review_by: 'mgr@test.com', offline_review_status: 'escalated', offline_review_reason_code: 'potential_abuse' },
                    { offline_created: true, offline_review_by: 'mgr@test.com', offline_review_status: 'escalated', offline_review_reason_code: 'large_price_mismatch' },
                    { offline_created: true, offline_review_by: 'mgr@test.com', offline_review_status: 'escalated', offline_review_reason_code: 'other' }
                ];
                const metrics = calculateManagerMetrics('r1', orders);
                return metrics['mgr@test.com'].abuseEscalations === 2;
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // RANKING TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'rankManagersByRisk: sorts by escalation rate DESC',
            run: () => {
                const managers = [
                    { managerEmail: 'a@test.com', escalationRate: 30, documentationRate: 80, totalReviews: 10 },
                    { managerEmail: 'b@test.com', escalationRate: 70, documentationRate: 50, totalReviews: 8 },
                    { managerEmail: 'c@test.com', escalationRate: 50, documentationRate: 60, totalReviews: 5 }
                ];
                const ranked = rankManagersByRisk(managers);
                return ranked[0].escalationRate === 70 && ranked[1].escalationRate === 50 && ranked[2].escalationRate === 30;
            }
        },

        {
            name: 'rankManagersByRisk: breaks ties by documentation rate (lower risk)',
            run: () => {
                const managers = [
                    { managerEmail: 'a@test.com', escalationRate: 50, documentationRate: 80, totalReviews: 10 },
                    { managerEmail: 'b@test.com', escalationRate: 50, documentationRate: 40, totalReviews: 8 }
                ];
                const ranked = rankManagersByRisk(managers);
                // Both 50% escalation, but b has lower docs (40% < 80%), so b comes first
                return ranked[0].managerEmail === 'b@test.com' && ranked[1].managerEmail === 'a@test.com';
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // OUTLIER TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'flagManagerOutliers: empty input = empty outliers',
            run: () => Object.keys(flagManagerOutliers([])).length === 0
        },

        {
            name: 'flagManagerOutliers: identifies highest escalation rate (>50%)',
            run: () => {
                const managers = [
                    { managerEmail: 'a@test.com', escalationRate: 40, escalatedCount: 4, resolvedCount: 6 },
                    { managerEmail: 'b@test.com', escalationRate: 75, escalatedCount: 15, resolvedCount: 5 }
                ];
                const outliers = flagManagerOutliers(managers);
                return outliers.highest_escalation?.manager === 'b@test.com' && outliers.highest_escalation?.rate === 75;
            }
        },

        {
            name: 'flagManagerOutliers: identifies lowest documentation (<50%, min 3 reviews)',
            run: () => {
                const managers = [
                    { managerEmail: 'a@test.com', documentationRate: 80, totalReviews: 5, withNotesCount: 4 },
                    { managerEmail: 'b@test.com', documentationRate: 30, totalReviews: 10, withNotesCount: 3 }
                ];
                const outliers = flagManagerOutliers(managers);
                return outliers.lowest_documentation?.manager === 'b@test.com' && outliers.lowest_documentation?.rate === 30;
            }
        },

        {
            name: 'flagManagerOutliers: identifies highest reason code concentration (>70%)',
            run: () => {
                const managers = [
                    {
                        managerEmail: 'a@test.com',
                        totalReviews: 5,
                        reasonCodes: { code_a: 2, code_b: 2, code_c: 1 }
                    },
                    {
                        managerEmail: 'b@test.com',
                        totalReviews: 5,
                        reasonCodes: { code_x: 4, code_y: 1 } // 80% code_x
                    }
                ];
                const outliers = flagManagerOutliers(managers);
                return outliers.highest_concentration?.manager === 'b@test.com' && outliers.highest_concentration?.percent === 80;
            }
        },

        {
            name: 'flagManagerOutliers: identifies most abuse escalations (>=2)',
            run: () => {
                const managers = [
                    { managerEmail: 'a@test.com', abuseEscalations: 1 },
                    { managerEmail: 'b@test.com', abuseEscalations: 3 }
                ];
                const outliers = flagManagerOutliers(managers);
                return outliers.most_abuse_escalations?.manager === 'b@test.com' && outliers.most_abuse_escalations?.count === 3;
            }
        },

        {
            name: 'flagManagerOutliers: identifies slowest review time (>8h avg, min 3 reviews)',
            run: () => {
                const managers = [
                    { managerEmail: 'a@test.com', averageReviewAgeHours: 2, totalReviews: 5 },
                    { managerEmail: 'b@test.com', averageReviewAgeHours: 12, totalReviews: 4 }
                ];
                const outliers = flagManagerOutliers(managers);
                return outliers.slowest_review_time?.manager === 'b@test.com' && outliers.slowest_review_time?.avgHours === 12;
            }
        },

        {
            name: 'flagManagerOutliers: identifies largest unresolved backlog (>3)',
            run: () => {
                const managers = [
                    { managerEmail: 'a@test.com', unresolvedCount: 2 },
                    { managerEmail: 'b@test.com', unresolvedCount: 8, oldestUnresolvedHours: 6 }
                ];
                const outliers = flagManagerOutliers(managers);
                return outliers.largest_unresolved_backlog?.manager === 'b@test.com' && outliers.largest_unresolved_backlog?.count === 8;
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // CROSS-RESTAURANT AGGREGATION
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'aggregateManagerMetricsAcrossRestaurants: empty input = empty output',
            run: () => {
                const agg = aggregateManagerMetricsAcrossRestaurants({});
                return Object.keys(agg).length === 0;
            }
        },

        {
            name: 'aggregateManagerMetricsAcrossRestaurants: combines same manager across restaurants',
            run: () => {
                const byRestaurant = {
                    r1: {
                        'mgr@test.com': {
                            managerEmail: 'mgr@test.com',
                            totalReviews: 5,
                            escalatedCount: 1,
                            resolvedCount: 4
                        }
                    },
                    r2: {
                        'mgr@test.com': {
                            managerEmail: 'mgr@test.com',
                            totalReviews: 3,
                            escalatedCount: 2,
                            resolvedCount: 1
                        }
                    }
                };
                const agg = aggregateManagerMetricsAcrossRestaurants(byRestaurant);
                return agg['mgr@test.com'].totalReviews === 8 &&
                       agg['mgr@test.com'].escalatedCount === 3 &&
                       agg['mgr@test.com'].restaurantIds.length === 2;
            }
        },

        {
            name: 'aggregateManagerMetricsAcrossRestaurants: calculates aggregated escalation rate',
            run: () => {
                const byRestaurant = {
                    r1: {
                        'mgr@test.com': {
                            managerEmail: 'mgr@test.com',
                            totalReviews: 4,
                            escalatedCount: 2,
                            resolvedCount: 2,
                            reasonCodes: {}
                        }
                    }
                };
                const agg = aggregateManagerMetricsAcrossRestaurants(byRestaurant);
                // 2 escalated out of 4 reviewed = 50%
                return agg['mgr@test.com'].escalationRate === 50;
            }
        }
    ],

    manual: [
        {
            title: 'Manager Ranking: Sorts by escalation rate (high to low)',
            steps: [
                '1. Create 3 managers with different escalation rates (30%, 70%, 50%)',
                '2. Open SuperAdmin > Manager Analytics',
                '3. Verify managers listed: 70% → 50% → 30%'
            ]
        },
        {
            title: 'Filtering: Filter by restaurant shows only that restaurant\'s managers',
            steps: [
                '1. Create 2 restaurants with different managers',
                '2. Open Manager Analytics, select restaurant 1',
                '3. Verify only restaurant 1 managers are shown'
            ]
        },
        {
            title: 'Sorting: "Documentation Rate" sorts by lowest to highest',
            steps: [
                '1. Create managers with docs: 80%, 40%, 60%',
                '2. Open analytics, select sort "Documentation"',
                '3. Verify order: 40% → 60% → 80%'
            ]
        },
        {
            title: 'Outliers Section: Shows highest escalation rate (>50%)',
            steps: [
                '1. Create manager with 75% escalation rate',
                '2. Open Manager Analytics',
                '3. Verify outlier flagged: "Highest escalation rate: X (75%)"'
            ]
        },
        {
            title: 'Manager Detail: Click "View" shows manager details',
            steps: [
                '1. Open Manager Analytics',
                '2. Click "View" on any manager row',
                '3. Verify modal shows: total reviews, escalation rate, documentation, reason codes'
            ]
        }
    ]
};