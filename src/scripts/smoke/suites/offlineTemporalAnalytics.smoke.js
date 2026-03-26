/**
 * Offline Temporal Analytics — Smoke Tests
 * 
 * Validates:
 * - Daypart bucketing (5 buckets: morning/lunch/afternoon/dinner/late)
 * - Day-of-week grouping (Sunday–Saturday)
 * - Hourly trend calculation
 * - Temporal outlier detection (5 rules)
 * - Cross-restaurant aggregation
 */

import {
    hourToDaypart,
    dayNumToName,
    classifyDay,
    calculateTemporalMetrics,
    detectTemporalOutliers,
    aggregateTemporalMetricsAcrossRestaurants
} from '@/lib/offline-temporal-analytics';

export const offlineTemporalAnalyticsSuite = {
    name: 'Offline Temporal Analytics',
    type: 'automated',

    tests: [
        // ──────────────────────────────────────────────────────────────────────
        // DAYPART BUCKETING (5 BUCKETS)
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'hourToDaypart: 05:00 → morning',
            run: () => hourToDaypart(5) === 'morning'
        },

        {
            name: 'hourToDaypart: 10:59 → morning',
            run: () => hourToDaypart(10) === 'morning'
        },

        {
            name: 'hourToDaypart: 11:00 → lunch',
            run: () => hourToDaypart(11) === 'lunch'
        },

        {
            name: 'hourToDaypart: 13:59 → lunch',
            run: () => hourToDaypart(13) === 'lunch'
        },

        {
            name: 'hourToDaypart: 14:00 → afternoon',
            run: () => hourToDaypart(14) === 'afternoon'
        },

        {
            name: 'hourToDaypart: 16:59 → afternoon',
            run: () => hourToDaypart(16) === 'afternoon'
        },

        {
            name: 'hourToDaypart: 17:00 → dinner',
            run: () => hourToDaypart(17) === 'dinner'
        },

        {
            name: 'hourToDaypart: 21:59 → dinner',
            run: () => hourToDaypart(21) === 'dinner'
        },

        {
            name: 'hourToDaypart: 22:00 → late',
            run: () => hourToDaypart(22) === 'late'
        },

        {
            name: 'hourToDaypart: 04:59 → late',
            run: () => hourToDaypart(4) === 'late'
        },

        {
            name: 'hourToDaypart: 00:00 (midnight) → late',
            run: () => hourToDaypart(0) === 'late'
        },

        // ──────────────────────────────────────────────────────────────────────
        // DAY-OF-WEEK GROUPING
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'dayNumToName: 0 → Sunday',
            run: () => dayNumToName(0) === 'Sunday'
        },

        {
            name: 'dayNumToName: 1 → Monday',
            run: () => dayNumToName(1) === 'Monday'
        },

        {
            name: 'dayNumToName: 6 → Saturday',
            run: () => dayNumToName(6) === 'Saturday'
        },

        {
            name: 'classifyDay: 0 (Sunday) → weekend',
            run: () => classifyDay(0) === 'weekend'
        },

        {
            name: 'classifyDay: 6 (Saturday) → weekend',
            run: () => classifyDay(6) === 'weekend'
        },

        {
            name: 'classifyDay: 1 (Monday) → weekday',
            run: () => classifyDay(1) === 'weekday'
        },

        {
            name: 'classifyDay: 3 (Wednesday) → weekday',
            run: () => classifyDay(3) === 'weekday'
        },

        // ──────────────────────────────────────────────────────────────────────
        // TEMPORAL METRICS CALCULATION
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'calculateTemporalMetrics: empty orders = empty metrics',
            run: () => {
                const metrics = calculateTemporalMetrics('r1', []);
                return Object.keys(metrics.byDaypart).length === 0 && metrics.summary.totalOrders === 0;
            }
        },

        {
            name: 'calculateTemporalMetrics: skips non-offline orders',
            run: () => {
                const orders = [{ offline_created: false, offline_synced_at: new Date().toISOString() }];
                const metrics = calculateTemporalMetrics('r1', orders);
                return metrics.summary.totalOrders === 0;
            }
        },

        {
            name: 'calculateTemporalMetrics: skips orders without offline_synced_at',
            run: () => {
                const orders = [{ offline_created: true }];
                const metrics = calculateTemporalMetrics('r1', orders);
                return metrics.summary.totalOrders === 0;
            }
        },

        {
            name: 'calculateTemporalMetrics: buckets orders by daypart',
            run: () => {
                // Create an order at 12:30 (lunch time)
                const date = new Date('2024-01-15T12:30:00Z');
                const orders = [
                    { offline_created: true, offline_synced_at: date.toISOString(), needs_review: false }
                ];
                const metrics = calculateTemporalMetrics('r1', orders);
                return metrics.byDaypart['lunch'].totalOrders === 1;
            }
        },

        {
            name: 'calculateTemporalMetrics: calculates flagged rate per daypart',
            run: () => {
                const lunchDate = new Date('2024-01-15T12:30:00Z');
                const dinnerDate = new Date('2024-01-15T18:30:00Z');
                const orders = [
                    { offline_created: true, offline_synced_at: lunchDate.toISOString(), needs_review: true },
                    { offline_created: true, offline_synced_at: lunchDate.toISOString(), needs_review: false },
                    { offline_created: true, offline_synced_at: dinnerDate.toISOString(), needs_review: false }
                ];
                const metrics = calculateTemporalMetrics('r1', orders);
                // Lunch: 1 flagged / 2 total = 50%
                // Dinner: 0 flagged / 1 total = 0%
                return metrics.byDaypart['lunch'].flaggedRate === 50 && metrics.byDaypart['dinner'].flaggedRate === 0;
            }
        },

        {
            name: 'calculateTemporalMetrics: groups orders by day-of-week',
            run: () => {
                // Monday (dayNum=1) 2024-01-01 and Sunday (dayNum=0) 2024-01-07
                const monday = new Date('2024-01-01T12:00:00Z'); // Monday
                const sunday = new Date('2024-01-07T12:00:00Z'); // Sunday
                const orders = [
                    { offline_created: true, offline_synced_at: monday.toISOString(), needs_review: false },
                    { offline_created: true, offline_synced_at: sunday.toISOString(), needs_review: true }
                ];
                const metrics = calculateTemporalMetrics('r1', orders);
                return metrics.byDayOfWeek['Monday'].totalOrders === 1 && metrics.byDayOfWeek['Sunday'].totalOrders === 1;
            }
        },

        {
            name: 'calculateTemporalMetrics: builds hourly trend array (24 hours)',
            run: () => {
                const date = new Date('2024-01-15T15:30:00Z'); // 15:00 UTC
                const orders = [{ offline_created: true, offline_synced_at: date.toISOString(), needs_review: true }];
                const metrics = calculateTemporalMetrics('r1', orders);
                return metrics.hourlyTrend.length === 24 && metrics.hourlyTrend[15].count === 1 && metrics.hourlyTrend[15].flagged === 1;
            }
        },

        {
            name: 'calculateTemporalMetrics: calculates overall rates in summary',
            run: () => {
                const orders = Array(10).fill(null).map((_, i) => ({
                    offline_created: true,
                    offline_synced_at: new Date('2024-01-15T12:00:00Z').toISOString(),
                    needs_review: i < 3 // 3 flagged out of 10
                }));
                const metrics = calculateTemporalMetrics('r1', orders);
                // 3 flagged / 10 total = 30%
                return metrics.summary.overallFlaggedRate === 30;
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // OUTLIER DETECTION (5 RULES)
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'detectTemporalOutliers: empty metrics = empty outliers',
            run: () => Object.keys(detectTemporalOutliers({})).length === 0
        },

        {
            name: 'detectTemporalOutliers: flags high flagged rate in daypart (>20%, min 3 orders)',
            run: () => {
                const metrics = {
                    byDaypart: {
                        lunch: { daypart: 'lunch', totalOrders: 5, flaggedCount: 2, flaggedRate: 40, escalatedCount: 0, ordersWithReview: 0 },
                        dinner: { daypart: 'dinner', totalOrders: 10, flaggedCount: 1, flaggedRate: 10, escalatedCount: 0, ordersWithReview: 0 }
                    },
                    byDayOfWeek: {},
                    hourlyTrend: [],
                    summary: { totalOrders: 15 }
                };
                const outliers = detectTemporalOutliers(metrics);
                return outliers.high_flagged_daypart?.daypart === 'lunch' && outliers.high_flagged_daypart?.rate === 40;
            }
        },

        {
            name: 'detectTemporalOutliers: flags high escalation rate in daypart (>50%, min 2 escalated)',
            run: () => {
                const metrics = {
                    byDaypart: {
                        dinner: { daypart: 'dinner', totalOrders: 5, flaggedCount: 4, escalatedCount: 3, ordersWithReview: 4, escalationRate: 75, flaggedRate: 80 }
                    },
                    byDayOfWeek: {},
                    hourlyTrend: [],
                    summary: { totalOrders: 5 }
                };
                const outliers = detectTemporalOutliers(metrics);
                return outliers.high_escalation_daypart?.daypart === 'dinner' && outliers.high_escalation_daypart?.rate === 75;
            }
        },

        {
            name: 'detectTemporalOutliers: flags daypart concentration (>40% of orders)',
            run: () => {
                const metrics = {
                    byDaypart: {
                        lunch: { daypart: 'lunch', totalOrders: 30, flaggedCount: 3, flaggedRate: 10, escalatedCount: 0, ordersWithReview: 0 },
                        dinner: { daypart: 'dinner', totalOrders: 20, flaggedCount: 2, flaggedRate: 10, escalatedCount: 0, ordersWithReview: 0 }
                    },
                    byDayOfWeek: {},
                    hourlyTrend: [],
                    summary: { totalOrders: 50 }
                };
                const outliers = detectTemporalOutliers(metrics);
                return outliers.daypart_concentration?.daypart === 'lunch' && outliers.daypart_concentration?.percent === 60;
            }
        },

        {
            name: 'detectTemporalOutliers: flags weekend/weekday anomaly (>15% difference)',
            run: () => {
                const metrics = {
                    byDaypart: {},
                    byDayOfWeek: {
                        'Sunday': { day: 'Sunday', dayNum: 0, isWeekend: true, totalOrders: 10, flaggedCount: 5, escalatedCount: 0, ordersWithReview: 0, flaggedRate: 50 },
                        'Monday': { day: 'Monday', dayNum: 1, isWeekend: false, totalOrders: 20, flaggedCount: 2, escalatedCount: 0, ordersWithReview: 0, flaggedRate: 10 }
                    },
                    hourlyTrend: [],
                    summary: { totalOrders: 30 }
                };
                const outliers = detectTemporalOutliers(metrics);
                return outliers.weekend_weekday_anomaly?.difference === 40;
            }
        },

        {
            name: 'detectTemporalOutliers: flags specific hour with high flagged rate (>30%, min 2 orders)',
            run: () => {
                const hourlyTrend = Array(24).fill(null).map((_, h) => ({ hour: h, count: 0, flagged: 0, flaggedRate: 0 }));
                hourlyTrend[12] = { hour: 12, count: 5, flagged: 2, flaggedRate: 40 };
                hourlyTrend[18] = { hour: 18, count: 10, flagged: 1, flaggedRate: 10 };
                
                const metrics = {
                    byDaypart: {},
                    byDayOfWeek: {},
                    hourlyTrend,
                    summary: { totalOrders: 15 }
                };
                const outliers = detectTemporalOutliers(metrics);
                return outliers.high_flagged_hour?.hour === 12 && outliers.high_flagged_hour?.rate === 40;
            }
        },

        // ──────────────────────────────────────────────────────────────────────
        // CROSS-RESTAURANT AGGREGATION
        // ──────────────────────────────────────────────────────────────────────

        {
            name: 'aggregateTemporalMetrics: empty input = empty output',
            run: () => {
                const agg = aggregateTemporalMetricsAcrossRestaurants({});
                return agg.restaurantCount === 0 && agg.totalOrders === 0;
            }
        },

        {
            name: 'aggregateTemporalMetrics: combines daypart metrics across restaurants',
            run: () => {
                const byRestaurant = {
                    r1: {
                        byDaypart: {
                            lunch: { daypart: 'lunch', totalOrders: 5, flaggedCount: 1, escalatedCount: 0 }
                        },
                        byDayOfWeek: {},
                        hourlyTrend: Array(24).fill(null).map((_, h) => ({ hour: h, count: 0, flagged: 0 })),
                        summary: { totalOrders: 5 }
                    },
                    r2: {
                        byDaypart: {
                            lunch: { daypart: 'lunch', totalOrders: 3, flaggedCount: 1, escalatedCount: 0 }
                        },
                        byDayOfWeek: {},
                        hourlyTrend: Array(24).fill(null).map((_, h) => ({ hour: h, count: 0, flagged: 0 })),
                        summary: { totalOrders: 3 }
                    }
                };
                const agg = aggregateTemporalMetricsAcrossRestaurants(byRestaurant);
                return agg.byDaypart['lunch'].totalOrders === 8 && agg.restaurantCount === 2 && agg.totalOrders === 8;
            }
        },

        {
            name: 'aggregateTemporalMetrics: calculates aggregated rates',
            run: () => {
                const byRestaurant = {
                    r1: {
                        byDaypart: {
                            lunch: { daypart: 'lunch', totalOrders: 4, flaggedCount: 2, escalatedCount: 0 }
                        },
                        byDayOfWeek: {},
                        hourlyTrend: Array(24).fill(null).map((_, h) => ({ hour: h, count: 0, flagged: 0 })),
                        summary: { totalOrders: 4 }
                    }
                };
                const agg = aggregateTemporalMetricsAcrossRestaurants(byRestaurant);
                // 2 flagged / 4 total = 50%
                return agg.byDaypart['lunch'].flaggedRate === 50;
            }
        }
    ],

    manual: [
        {
            title: 'Daypart Bucketing: Orders grouped into 5 dayparts correctly',
            steps: [
                '1. Create offline orders at: 08:00, 12:30, 15:00, 19:00, 23:00 UTC',
                '2. View temporal metrics',
                '3. Verify: morning (1), lunch (1), afternoon (1), dinner (1), late (1)'
            ]
        },
        {
            title: 'Day-of-Week Grouping: Orders grouped by day correctly',
            steps: [
                '1. Create offline orders on Monday, Wednesday, Friday, Sunday',
                '2. View temporal metrics',
                '3. Verify each day shows correct count'
            ]
        },
        {
            title: 'Daypart Outlier: High flagged rate (>20%) in one daypart flagged',
            steps: [
                '1. Create 5 orders in lunch daypart with 2 flagged (40%)',
                '2. Create 5 orders in dinner with 0 flagged',
                '3. View temporal analytics',
                '4. Verify lunch shows "high flagged rate" outlier'
            ]
        },
        {
            title: 'Weekend Anomaly: Significantly different weekend vs weekday flagged rate',
            steps: [
                '1. Create 10 orders on Saturday/Sunday with 50% flagged',
                '2. Create 10 orders on weekdays with 10% flagged',
                '3. View temporal analytics',
                '4. Verify "weekend vs weekday anomaly" signal shows'
            ]
        },
        {
            title: 'Hourly Concentration: Orders concentrated in one hour (23:00 UTC)',
            steps: [
                '1. Create 8 orders at 23:30 UTC (late night)',
                '2. Create 1 order at 09:00 UTC (morning)',
                '3. View temporal analytics',
                '4. Verify hour 23 shows 89% concentration with correct flagged count'
            ]
        }
    ]
};