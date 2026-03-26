/**
 * Cross-Store Offline Review Portfolio Ranking — Smoke Tests
 * 
 * Validates:
 * - Per-restaurant metrics calculation
 * - Ranking order (by risk score)
 * - Trend classification
 * - Outlier flag accuracy
 * - Portfolio aggregation
 */

import {
    calculateRestaurantMetrics,
    rankRestaurantsByRisk,
    calculateTrend,
    flagOutliers,
    buildPortfolioRanking
} from '@/lib/offline-review-portfolio-ranking';

export const offlineReviewPortfolioSuite = {
    name: 'Offline Review Portfolio Ranking',
    type: 'automated',

    tests: [
        // ──────────────────────────────────────────────────────────────────────
        // RESTAURANT METRICS CALCULATION
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'calculateRestaurantMetrics: no flagged orders = score 0',
            run: () => {
                const metrics = calculateRestaurantMetrics('r1', 'Test Rest', [], {
                    anomalies: [],
                    totalScore: 0,
                    status: 'ok'
                });
                return metrics.flaggedCount === 0 && metrics.totalScore === 0 && metrics.status === 'ok';
            }
        },

        {
            name: 'calculateRestaurantMetrics: calculates flagged rate correctly',
            run: () => {
                const orders = [
                    { offline_created: true, needs_review: true, offline_review_status: null },
                    { offline_created: false, needs_review: false },
                    { offline_created: true, needs_review: true, offline_review_status: 'resolved' }
                ];
                const metrics = calculateRestaurantMetrics('r1', 'Test', orders, {
                    anomalies: [],
                    totalScore: 0,
                    status: 'ok'
                });
                // 2 flagged out of 3 orders = 67%
                return metrics.flaggedCount === 2 && metrics.flaggedRate === 67;
            }
        },

        {
            name: 'calculateRestaurantMetrics: calculates escalation rate correctly',
            run: () => {
                const orders = [
                    { offline_created: true, needs_review: true, offline_review_status: 'escalated', offline_review_reason_code: 'test' },
                    { offline_created: true, needs_review: true, offline_review_status: 'resolved', offline_review_reason_code: 'test' },
                    { offline_created: true, needs_review: true, offline_review_status: 'resolved', offline_review_reason_code: 'test' }
                ];
                const metrics = calculateRestaurantMetrics('r1', 'Test', orders, {
                    anomalies: [],
                    totalScore: 0,
                    status: 'ok'
                });
                // 1 escalated out of 3 reviewed = 33%
                return metrics.escalatedCount === 1 && metrics.escalationRate === 33;
            }
        },

        {
            name: 'calculateRestaurantMetrics: counts unresolved correctly',
            run: () => {
                const orders = [
                    { offline_created: true, needs_review: true, offline_review_status: null },
                    { offline_created: true, needs_review: true, offline_review_status: 'new' },
                    { offline_created: true, needs_review: true, offline_review_status: 'resolved' }
                ];
                const metrics = calculateRestaurantMetrics('r1', 'Test', orders, {
                    anomalies: [],
                    totalScore: 0,
                    status: 'ok'
                });
                return metrics.unresolvedCount === 2;
            }
        },

        {
            name: 'calculateRestaurantMetrics: extracts top reason code',
            run: () => {
                const orders = [
                    { offline_created: true, needs_review: true, offline_review_status: 'resolved', offline_review_reason_code: 'code_a' },
                    { offline_created: true, needs_review: true, offline_review_status: 'resolved', offline_review_reason_code: 'code_a' },
                    { offline_created: true, needs_review: true, offline_review_status: 'resolved', offline_review_reason_code: 'code_b' }
                ];
                const metrics = calculateRestaurantMetrics('r1', 'Test', orders, {
                    anomalies: [],
                    totalScore: 0,
                    status: 'ok'
                });
                return metrics.topReasonCode === 'code_a';
            }
        },

        {
            name: 'calculateRestaurantMetrics: identifies overdue orders (>4h old)',
            run: () => {
                const now = new Date();
                const old5h = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
                const orders = [
                    { offline_created: true, needs_review: true, offline_review_status: null, offline_synced_at: old5h },
                    { offline_created: true, needs_review: true, offline_review_status: null, offline_synced_at: old5h }
                ];
                const metrics = calculateRestaurantMetrics('r1', 'Test', orders, {
                    anomalies: [],
                    totalScore: 0,
                    status: 'ok'
                });
                return metrics.overdueCount === 2;
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // RANKING TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'rankRestaurantsByRisk: sorts by total score DESC',
            run: () => {
                const restaurants = [
                    { restaurantId: 'r1', restaurantName: 'A', totalScore: 5 },
                    { restaurantId: 'r2', restaurantName: 'B', totalScore: 10 },
                    { restaurantId: 'r3', restaurantName: 'C', totalScore: 0 }
                ];
                const ranked = rankRestaurantsByRisk(restaurants);
                return ranked[0].totalScore === 10 && ranked[1].totalScore === 5 && ranked[2].totalScore === 0;
            }
        },

        {
            name: 'rankRestaurantsByRisk: breaks ties by name ASC',
            run: () => {
                const restaurants = [
                    { restaurantId: 'r1', restaurantName: 'Zebra', totalScore: 5 },
                    { restaurantId: 'r2', restaurantName: 'Alpha', totalScore: 5 }
                ];
                const ranked = rankRestaurantsByRisk(restaurants);
                return ranked[0].restaurantName === 'Alpha' && ranked[1].restaurantName === 'Zebra';
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // TREND TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'calculateTrend: insufficient data = stable',
            run: () => calculateTrend([]) === 'stable'
        },

        {
            name: 'calculateTrend: score decreased = improving',
            run: () => {
                const trend = calculateTrend([
                    { date: '2026-01-01', score: 10 },
                    { date: '2026-01-08', score: 5 }
                ]);
                return trend === 'improving';
            }
        },

        {
            name: 'calculateTrend: score increased = worsening',
            run: () => {
                const trend = calculateTrend([
                    { date: '2026-01-01', score: 5 },
                    { date: '2026-01-08', score: 10 }
                ]);
                return trend === 'worsening';
            }
        },

        {
            name: 'calculateTrend: within ±1 point = stable',
            run: () => {
                const trend = calculateTrend([
                    { date: '2026-01-01', score: 5 },
                    { date: '2026-01-08', score: 6 }
                ]);
                return trend === 'stable';
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // OUTLIER TESTS
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'flagOutliers: empty input = empty outliers',
            run: () => Object.keys(flagOutliers([])).length === 0
        },

        {
            name: 'flagOutliers: identifies highest flagged rate',
            run: () => {
                const restaurants = [
                    { restaurantId: 'r1', restaurantName: 'A', flaggedRate: 10, escalationRate: 0, unresolvedCount: 0, overdueCount: 0, topAnomalies: [] },
                    { restaurantId: 'r2', restaurantName: 'B', flaggedRate: 30, escalationRate: 0, unresolvedCount: 0, overdueCount: 0, topAnomalies: [] }
                ];
                const outliers = flagOutliers(restaurants);
                return outliers.highest_flagged_rate?.name === 'B' && outliers.highest_flagged_rate?.percent === 30;
            }
        },

        {
            name: 'flagOutliers: identifies highest escalation rate',
            run: () => {
                const restaurants = [
                    { restaurantId: 'r1', restaurantName: 'A', flaggedRate: 0, escalationRate: 50, unresolvedCount: 0, overdueCount: 0, topAnomalies: [] },
                    { restaurantId: 'r2', restaurantName: 'B', flaggedRate: 0, escalationRate: 80, unresolvedCount: 0, overdueCount: 0, topAnomalies: [] }
                ];
                const outliers = flagOutliers(restaurants);
                return outliers.highest_escalation_rate?.name === 'B' && outliers.highest_escalation_rate?.percent === 80;
            }
        },

        {
            name: 'flagOutliers: identifies largest unresolved backlog',
            run: () => {
                const restaurants = [
                    { restaurantId: 'r1', restaurantName: 'A', flaggedRate: 0, escalationRate: 0, unresolvedCount: 3, overdueCount: 0, topAnomalies: [] },
                    { restaurantId: 'r2', restaurantName: 'B', flaggedRate: 0, escalationRate: 0, unresolvedCount: 12, overdueCount: 0, topAnomalies: [] }
                ];
                const outliers = flagOutliers(restaurants);
                return outliers.largest_unresolved_backlog?.name === 'B' && outliers.largest_unresolved_backlog?.count === 12;
            }
        },

        {
            name: 'flagOutliers: identifies most overdue',
            run: () => {
                const restaurants = [
                    { restaurantId: 'r1', restaurantName: 'A', flaggedRate: 0, escalationRate: 0, unresolvedCount: 0, overdueCount: 1, topAnomalies: [] },
                    { restaurantId: 'r2', restaurantName: 'B', flaggedRate: 0, escalationRate: 0, unresolvedCount: 0, overdueCount: 5, topAnomalies: [] }
                ];
                const outliers = flagOutliers(restaurants);
                return outliers.most_overdue?.name === 'B' && outliers.most_overdue?.count === 5;
            }
        },

        {
            name: 'flagOutliers: identifies reason code concentration',
            run: () => {
                const restaurants = [
                    {
                        restaurantId: 'r1', restaurantName: 'A',
                        flaggedRate: 0, escalationRate: 0, unresolvedCount: 0, overdueCount: 0,
                        topAnomalies: []
                    },
                    {
                        restaurantId: 'r2', restaurantName: 'B',
                        flaggedRate: 0, escalationRate: 0, unresolvedCount: 0, overdueCount: 0,
                        topAnomalies: [{ type: 'reason_code_concentration', percent: 92, code: 'test_code' }]
                    }
                ];
                const outliers = flagOutliers(restaurants);
                return outliers.highest_concentration?.name === 'B' && outliers.highest_concentration?.code === 'test_code';
            }
        },

        {
            name: 'flagOutliers: identifies abuse escalations',
            run: () => {
                const restaurants = [
                    {
                        restaurantId: 'r1', restaurantName: 'A',
                        flaggedRate: 0, escalationRate: 0, unresolvedCount: 0, overdueCount: 0,
                        topAnomalies: []
                    },
                    {
                        restaurantId: 'r2', restaurantName: 'B',
                        flaggedRate: 0, escalationRate: 0, unresolvedCount: 0, overdueCount: 0,
                        topAnomalies: [{ type: 'abuse_suspicious', count: 3 }]
                    }
                ];
                const outliers = flagOutliers(restaurants);
                return outliers.most_abuse_escalations?.name === 'B' && outliers.most_abuse_escalations?.count === 3;
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // PORTFOLIO AGGREGATION
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'buildPortfolioRanking: returns ranked, summary, outliers, trends',
            run: () => {
                const mockCalc = () => ({ anomalies: [], totalScore: 0, status: 'ok' });
                const portfolio = buildPortfolioRanking(
                    [{ id: 'r1', name: 'Test' }],
                    [],
                    mockCalc
                );
                return portfolio.ranked && portfolio.summary && portfolio.outliers && portfolio.trends;
            }
        },

        {
            name: 'buildPortfolioRanking: summary counts correct',
            run: () => {
                const mockCalc = () => ({ anomalies: [], totalScore: 0, status: 'ok' });
                const portfolio = buildPortfolioRanking(
                    [
                        { id: 'r1', name: 'Test1' },
                        { id: 'r2', name: 'Test2' }
                    ],
                    [],
                    mockCalc
                );
                return portfolio.summary.totalRestaurants === 2;
            }
        }
    ],

    manual: [
        {
            title: 'Ranking Table: Restaurants sorted by risk score (high to low)',
            steps: [
                '1. Create 3 restaurants with varying risk scores (e.g., 10, 5, 0)',
                '2. Open Offline Review Portfolio (SuperAdmin > Offline Reviews)',
                '3. Verify restaurants listed in order: 10 → 5 → 0'
            ]
        },
        {
            title: 'Filtering: "Critical Only" shows only critical restaurants',
            steps: [
                '1. Create restaurants with statuses: critical, risk, watch, ok',
                '2. Open portfolio, select filter "Critical Only"',
                '3. Verify only critical restaurant is shown'
            ]
        },
        {
            title: 'Sorting: "Flagged Rate" sorts by flagged_rate DESC',
            steps: [
                '1. Create restaurants with flagged rates: 10%, 25%, 5%',
                '2. Open portfolio, select sort "Flagged Rate"',
                '3. Verify order: 25% → 10% → 5%'
            ]
        },
        {
            title: 'Outliers Section: Shows worst performers',
            steps: [
                '1. Create restaurant with highest flagged rate (e.g., 30%)',
                '2. Create restaurant with highest escalations (e.g., 80%)',
                '3. Open portfolio',
                '4. Verify outlier flags show both restaurants'
            ]
        },
        {
            title: 'Drill-down: "View" button navigates to restaurant dashboard',
            steps: [
                '1. Open portfolio',
                '2. Click "View" on any restaurant',
                '3. Verify navigates to RestaurantDashboard with correct restaurant_id'
            ]
        }
    ]
};