/**
 * Offline Order Temporal Analytics — Timezone-Aware
 * 
 * Analyzes when offline issues occur (daypart, day-of-week, hourly patterns).
 * Uses restaurant's local timezone for all grouping (converts from UTC).
 * Fallback to UTC if timezone not available.
 * 
 * Pure deterministic calculations — no ML, no forecasting.
 * Simple explainable buckets for operational visibility.
 */

import { convertUtcToLocal, getRestaurantTimezone } from './timezone-utils.js';

/**
 * Map hour of day to daypart bucket
 * 
 * Dayparts (restaurant local time):
 * - Morning: 05:00–10:59
 * - Lunch: 11:00–13:59
 * - Afternoon: 14:00–16:59
 * - Dinner: 17:00–21:59
 * - Late: 22:00–04:59
 * 
 * @param {number} hour (0-23)
 * @returns {string} daypart name
 */
export function hourToDaypart(hour) {
    if (hour >= 5 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 14) return 'lunch';
    if (hour >= 14 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'dinner';
    return 'late'; // 22:00–04:59
}

/**
 * Get day-of-week name (0=Sunday, 6=Saturday)
 * 
 * @param {number} dayNum (0-6)
 * @returns {string} day name
 */
export function dayNumToName(dayNum) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayNum % 7];
}

/**
 * Classify day as weekend or weekday
 * 
 * @param {number} dayNum (0-6, 0=Sunday, 6=Saturday)
 * @returns {string} 'weekend' | 'weekday'
 */
export function classifyDay(dayNum) {
    return (dayNum === 0 || dayNum === 6) ? 'weekend' : 'weekday';
}

/**
 * Calculate temporal metrics for a restaurant's offline orders
 * 
 * Groups by daypart and day-of-week using restaurant's local timezone.
 * Converts UTC offline_synced_at to local time for all grouping.
 * 
 * @param {string} restaurantId
 * @param {array} orders - all orders for restaurant
 * @param {object} restaurant - restaurant entity with {timezone, country}
 * @returns {object} {
 *   byDaypart: {daypart: {metrics}},
 *   byDayOfWeek: {day: {metrics}},
 *   hourlyTrend: [0-23] array of {hour, count, flagged},
 *   summary: {totals, concentrations},
 *   timezone: timezone used for calculation
 * }
 */
export function calculateTemporalMetrics(restaurantId, orders, restaurant) {
    const timezone = getRestaurantTimezone(restaurant);

    if (!orders || orders.length === 0) {
        return {
            byDaypart: {},
            byDayOfWeek: {},
            hourlyTrend: Array(24).fill(null).map((_, h) => ({ hour: h, count: 0, flagged: 0 })),
            summary: { totalOrders: 0 },
            timezone
        };
    }

    // Filter to offline orders only
    const offlineOrders = orders.filter(o => o.offline_created && o.offline_synced_at);

    const byDaypart = {};
    const byDayOfWeek = {};
    const hourlyTrend = Array(24).fill(null).map((_, h) => ({ hour: h, count: 0, flagged: 0 }));

    offlineOrders.forEach(order => {
        // Convert UTC → local time
        const localTime = convertUtcToLocal(order.offline_synced_at, timezone);
        const hour = localTime.hour;
        const dayOfWeek = localTime.dayOfWeek;
        const dayName = dayNumToName(dayOfWeek);
        const daypart = hourToDaypart(hour);

        const isFlagged = order.needs_review ? 1 : 0;
        const isEscalated = order.offline_review_status === 'escalated' ? 1 : 0;

        // Initialize buckets
        if (!byDaypart[daypart]) {
            byDaypart[daypart] = {
                daypart,
                totalOrders: 0,
                flaggedCount: 0,
                escalatedCount: 0,
                ordersWithReview: 0,
                hourDistribution: {},
            };
        }

        if (!byDayOfWeek[dayName]) {
            byDayOfWeek[dayName] = {
                day: dayName,
                dayNum: dayOfWeek,
                isWeekend: classifyDay(dayOfWeek) === 'weekend',
                totalOrders: 0,
                flaggedCount: 0,
                escalatedCount: 0,
                ordersWithReview: 0,
            };
        }

        // Increment counters
        byDaypart[daypart].totalOrders += 1;
        byDaypart[daypart].flaggedCount += isFlagged;
        byDaypart[daypart].escalatedCount += isEscalated;
        if (order.offline_review_status) byDaypart[daypart].ordersWithReview += 1;

        byDayOfWeek[dayName].totalOrders += 1;
        byDayOfWeek[dayName].flaggedCount += isFlagged;
        byDayOfWeek[dayName].escalatedCount += isEscalated;
        if (order.offline_review_status) byDayOfWeek[dayName].ordersWithReview += 1;

        // Hourly trend
        hourlyTrend[hour].count += 1;
        hourlyTrend[hour].flagged += isFlagged;

        // Track hour distribution within daypart
        byDaypart[daypart].hourDistribution[hour] = (byDaypart[daypart].hourDistribution[hour] || 0) + 1;
    });

    // Post-process: calculate rates
    Object.values(byDaypart).forEach(dp => {
        dp.flaggedRate = dp.totalOrders > 0 ? Math.round((dp.flaggedCount / dp.totalOrders) * 100) : 0;
        dp.escalationRate = dp.ordersWithReview > 0 ? Math.round((dp.escalatedCount / dp.ordersWithReview) * 100) : 0;
    });

    Object.values(byDayOfWeek).forEach(dow => {
        dow.flaggedRate = dow.totalOrders > 0 ? Math.round((dow.flaggedCount / dow.totalOrders) * 100) : 0;
        dow.escalationRate = dow.ordersWithReview > 0 ? Math.round((dow.escalatedCount / dow.ordersWithReview) * 100) : 0;
    });

    // Hourly trend: calculate rates
    hourlyTrend.forEach(h => {
        h.flaggedRate = h.count > 0 ? Math.round((h.flagged / h.count) * 100) : 0;
    });

    // Summary: identify concentrations
    const totalOrders = offlineOrders.length;
    const totalFlagged = Object.values(byDaypart).reduce((sum, dp) => sum + dp.flaggedCount, 0);
    const totalEscalated = Object.values(byDaypart).reduce((sum, dp) => sum + dp.escalatedCount, 0);

    const daypartSorted = Object.values(byDaypart).sort((a, b) => b.totalOrders - a.totalOrders);
    const highestFlaggedDaypart = Object.values(byDaypart).sort((a, b) => b.flaggedRate - a.flaggedRate)[0];
    const highestEscalationDaypart = Object.values(byDaypart).sort((a, b) => b.escalationRate - a.escalationRate)[0];

    const dowSorted = Object.values(byDayOfWeek).sort((a, b) => b.totalOrders - a.totalOrders);
    const highestFlaggedDay = Object.values(byDayOfWeek).sort((a, b) => b.flaggedRate - a.flaggedRate)[0];

    return {
        byDaypart,
        byDayOfWeek,
        hourlyTrend,
        timezone,
        summary: {
            totalOrders,
            totalFlagged,
            totalEscalated,
            overallFlaggedRate: totalOrders > 0 ? Math.round((totalFlagged / totalOrders) * 100) : 0,
            overallEscalationRate: totalEscalated > 0 ? Math.round((totalEscalated / (totalFlagged + totalEscalated)) * 100) : 0,
            busiestDaypart: daypartSorted[0],
            busiestDay: dowSorted[0],
            highestFlaggedDaypart,
            highestFlaggedDay,
            highestEscalationDaypart,
        }
    };
}

/**
 * Detect temporal outliers (anomalous patterns by time window)
 * 
 * Signals include:
 * - High flagged rate in specific daypart (>20%)
 * - High escalation rate in specific daypart (>50%)
 * - Concentration in one daypart (>40% of all orders)
 * - Weekend vs weekday anomaly
 * - Unresolved backlog concentrated in one time window
 * 
 * @param {object} temporalMetrics - output from calculateTemporalMetrics
 * @returns {object} outliers with signals
 */
export function detectTemporalOutliers(temporalMetrics) {
    const outliers = {};

    if (!temporalMetrics.byDaypart || Object.keys(temporalMetrics.byDaypart).length === 0) {
        return outliers;
    }

    const { byDaypart, byDayOfWeek, summary, hourlyTrend } = temporalMetrics;

    // 1. High flagged rate in specific daypart (>20%, min 3 orders)
    const daypartsByFlagged = Object.values(byDaypart).filter(dp => dp.totalOrders >= 3);
    const highFlaggedDaypart = daypartsByFlagged.sort((a, b) => b.flaggedRate - a.flaggedRate)[0];
    if (highFlaggedDaypart && highFlaggedDaypart.flaggedRate > 20) {
        outliers.high_flagged_daypart = {
            daypart: highFlaggedDaypart.daypart,
            rate: highFlaggedDaypart.flaggedRate,
            count: highFlaggedDaypart.flaggedCount,
            total: highFlaggedDaypart.totalOrders,
            message: `${highFlaggedDaypart.daypart}: ${highFlaggedDaypart.flaggedRate}% flagged (${highFlaggedDaypart.flaggedCount}/${highFlaggedDaypart.totalOrders})`
        };
    }

    // 2. High escalation rate in specific daypart (>50%, min 2 flagged)
    const daypartsWithEscalations = Object.values(byDaypart).filter(dp => dp.escalatedCount >= 2);
    const highEscalationDaypart = daypartsWithEscalations.sort((a, b) => b.escalationRate - a.escalationRate)[0];
    if (highEscalationDaypart && highEscalationDaypart.escalationRate > 50) {
        outliers.high_escalation_daypart = {
            daypart: highEscalationDaypart.daypart,
            rate: highEscalationDaypart.escalationRate,
            count: highEscalationDaypart.escalatedCount,
            total: highEscalationDaypart.ordersWithReview,
            message: `${highEscalationDaypart.daypart}: ${highEscalationDaypart.escalationRate}% escalated (${highEscalationDaypart.escalatedCount}/${highEscalationDaypart.ordersWithReview})`
        };
    }

    // 3. Concentration in one daypart (>40% of all orders)
    const allDayparts = Object.values(byDaypart);
    if (allDayparts.length > 0) {
        const sorted = allDayparts.sort((a, b) => b.totalOrders - a.totalOrders);
        const pct = summary.totalOrders > 0 ? Math.round((sorted[0].totalOrders / summary.totalOrders) * 100) : 0;
        if (pct > 40) {
            outliers.daypart_concentration = {
                daypart: sorted[0].daypart,
                percent: pct,
                count: sorted[0].totalOrders,
                total: summary.totalOrders,
                message: `${sorted[0].daypart}: ${pct}% of all offline orders. Investigate if operational.`
            };
        }
    }

    // 4. Weekend vs weekday anomaly (significantly different flagged rate)
    const weekendDays = Object.values(byDayOfWeek).filter(d => d.isWeekend);
    const weekdayDays = Object.values(byDayOfWeek).filter(d => !d.isWeekend);

    if (weekendDays.length > 0 && weekdayDays.length > 0) {
        const weekendFlagged = weekendDays.reduce((sum, d) => sum + d.flaggedCount, 0);
        const weekendTotal = weekendDays.reduce((sum, d) => sum + d.totalOrders, 0);
        const weekdayFlagged = weekdayDays.reduce((sum, d) => sum + d.flaggedCount, 0);
        const weekdayTotal = weekdayDays.reduce((sum, d) => sum + d.totalOrders, 0);

        const weekendRate = weekendTotal > 0 ? Math.round((weekendFlagged / weekendTotal) * 100) : 0;
        const weekdayRate = weekdayTotal > 0 ? Math.round((weekdayFlagged / weekdayTotal) * 100) : 0;
        const diff = Math.abs(weekendRate - weekdayRate);

        if (diff > 15) {
            const worse = weekendRate > weekdayRate ? 'Weekend' : 'Weekday';
            outliers.weekend_weekday_anomaly = {
                weekend_rate: weekendRate,
                weekday_rate: weekdayRate,
                difference: diff,
                worse,
                message: `${worse} has ${diff}% higher flagged rate (weekend=${weekendRate}%, weekday=${weekdayRate}%)`
            };
        }
    }

    // 5. Specific hour with high flagged rate (>30%, min 2 orders)
    const busyHours = hourlyTrend.filter(h => h.count >= 2);
    const highHour = busyHours.sort((a, b) => b.flaggedRate - a.flaggedRate)[0];
    if (highHour && highHour.flaggedRate > 30) {
        const hourStr = String(highHour.hour).padStart(2, '0');
        outliers.high_flagged_hour = {
            hour: highHour.hour,
            rate: highHour.flaggedRate,
            count: highHour.flagged,
            total: highHour.count,
            message: `Hour ${hourStr}:00 UTC: ${highHour.flaggedRate}% flagged (${highHour.flagged}/${highHour.count})`
        };
    }

    return outliers;
}

/**
 * Aggregate temporal metrics across multiple restaurants
 * 
 * Note: When aggregating across restaurants with different timezones,
 * metrics will be in UTC-equivalent buckets (most-common timezone of aggregated restaurants).
 * For precise per-restaurant analysis, examine individual timezone-aware metrics.
 * 
 * @param {object} byRestaurant - {restaurant_id: temporalMetrics}
 * @returns {object} aggregated temporal view
 */
export function aggregateTemporalMetricsAcrossRestaurants(byRestaurant) {
    const aggregated = {
        byDaypart: {},
        byDayOfWeek: {},
        hourlyTrend: Array(24).fill(null).map((_, h) => ({ hour: h, count: 0, flagged: 0 })),
        restaurantCount: 0,
        totalOrders: 0
    };

    let count = 0;
    Object.entries(byRestaurant).forEach(([restaurantId, metrics]) => {
        count++;

        // Daypart aggregation
        Object.entries(metrics.byDaypart || {}).forEach(([daypart, data]) => {
            if (!aggregated.byDaypart[daypart]) {
                aggregated.byDaypart[daypart] = {
                    daypart,
                    totalOrders: 0,
                    flaggedCount: 0,
                    escalatedCount: 0,
                };
            }
            aggregated.byDaypart[daypart].totalOrders += data.totalOrders;
            aggregated.byDaypart[daypart].flaggedCount += data.flaggedCount;
            aggregated.byDaypart[daypart].escalatedCount += data.escalatedCount;
        });

        // Day-of-week aggregation
        Object.entries(metrics.byDayOfWeek || {}).forEach(([day, data]) => {
            if (!aggregated.byDayOfWeek[day]) {
                aggregated.byDayOfWeek[day] = {
                    day,
                    dayNum: data.dayNum,
                    isWeekend: data.isWeekend,
                    totalOrders: 0,
                    flaggedCount: 0,
                    escalatedCount: 0,
                };
            }
            aggregated.byDayOfWeek[day].totalOrders += data.totalOrders;
            aggregated.byDayOfWeek[day].flaggedCount += data.flaggedCount;
            aggregated.byDayOfWeek[day].escalatedCount += data.escalatedCount;
        });

        // Hourly aggregation
        (metrics.hourlyTrend || []).forEach((hour, idx) => {
            aggregated.hourlyTrend[idx].count += hour.count;
            aggregated.hourlyTrend[idx].flagged += hour.flagged;
        });

        aggregated.totalOrders += metrics.summary?.totalOrders || 0;
    });

    aggregated.restaurantCount = count;

    // Calculate rates
    Object.values(aggregated.byDaypart).forEach(dp => {
        dp.flaggedRate = dp.totalOrders > 0 ? Math.round((dp.flaggedCount / dp.totalOrders) * 100) : 0;
        dp.escalationRate = dp.escalatedCount > 0 ? Math.round((dp.escalatedCount / dp.flaggedCount) * 100) : 0;
    });

    Object.values(aggregated.byDayOfWeek).forEach(dow => {
        dow.flaggedRate = dow.totalOrders > 0 ? Math.round((dow.flaggedCount / dow.totalOrders) * 100) : 0;
        dow.escalationRate = dow.escalatedCount > 0 ? Math.round((dow.escalatedCount / dow.flaggedCount) * 100) : 0;
    });

    aggregated.hourlyTrend.forEach(h => {
        h.flaggedRate = h.count > 0 ? Math.round((h.flagged / h.count) * 100) : 0;
    });

    return aggregated;
}