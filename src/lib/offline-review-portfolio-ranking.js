/**
 * Cross-Store Offline Review Portfolio Ranking
 * 
 * Aggregates per-restaurant anomalies + scores into:
 * - Cross-store ranking (by risk)
 * - Trend classification (7d/30d)
 * - Outlier flags (worst performers)
 * 
 * Pure, deterministic logic. No ML.
 */

/**
 * Calculate restaurant health metrics for ranking
 * 
 * @param {array} orders - all orders for this restaurant
 * @param {object} enrichedAnomalies - output from enrichAnomaliesWithScoring()
 * @returns {object} {
 *   restaurantId, restaurantName,
 *   totalOrders, flaggedCount, unresolvedCount, escalatedCount, overdue,
 *   flaggedRate, escalationRate,
 *   totalScore, status,
 *   topAnomalies (sorted HIGH→LOW),
 *   topReasonCode, topAnomalyCodes
 * }
 */
export function calculateRestaurantMetrics(restaurantId, restaurantName, orders, enrichedAnomalies) {
    const flagged = orders.filter(o => o.offline_created && o.needs_review);
    const unreviewed = flagged.filter(o => !o.offline_review_status || o.offline_review_status === 'new');
    const reviewed = flagged.filter(o => o.offline_review_status);
    const escalated = reviewed.filter(o => o.offline_review_status === 'escalated');
    const overdue = unreviewed.filter(o => {
        if (!o.offline_synced_at) return false;
        const hours = (new Date().getTime() - new Date(o.offline_synced_at).getTime()) / (1000 * 60 * 60);
        return hours > 4;
    });

    // Extract reason codes from reviewed orders
    const reasonCodes = {};
    reviewed.forEach(o => {
        if (o.offline_review_reason_code) {
            reasonCodes[o.offline_review_reason_code] = (reasonCodes[o.offline_review_reason_code] || 0) + 1;
        }
    });

    const topReasonCodeEntry = Object.entries(reasonCodes).sort(([, a], [, b]) => b - a)[0];
    const topReasonCode = topReasonCodeEntry ? topReasonCodeEntry[0] : null;

    // Extract anomaly types
    const anomalyTypes = enrichedAnomalies.anomalies
        .filter(a => a.severity !== 'info')
        .map(a => a.type);

    // Flagged rate
    const flaggedRate = orders.length > 0 ? Math.round((flagged.length / orders.length) * 100) : 0;

    // Escalation rate
    const escalationRate = reviewed.length > 0 ? Math.round((escalated.length / reviewed.length) * 100) : 0;

    return {
        restaurantId,
        restaurantName,
        totalOrders: orders.length,
        flaggedCount: flagged.length,
        unresolvedCount: unreviewed.length,
        escalatedCount: escalated.length,
        overdueCount: overdue.length,
        flaggedRate,
        escalationRate,
        totalScore: enrichedAnomalies.totalScore,
        status: enrichedAnomalies.status,
        topAnomalies: enrichedAnomalies.anomalies.filter(a => a.severity !== 'info'),
        topReasonCode,
        topAnomalyCodes: anomalyTypes.slice(0, 3)
    };
}

/**
 * Rank all restaurants by total risk score (descending)
 * 
 * @param {array} restaurantMetrics - array of calculateRestaurantMetrics() output
 * @returns {array} sorted by totalScore DESC, then by name ASC
 */
export function rankRestaurantsByRisk(restaurantMetrics) {
    return [...restaurantMetrics].sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return a.restaurantName.localeCompare(b.restaurantName);
    });
}

/**
 * Calculate 7-day & 30-day trend for a restaurant
 * 
 * Trend = comparing risk scores over time periods:
 * - Improving: score decreased
 * - Stable: score within 1 point (accounting for noise)
 * - Worsening: score increased
 * 
 * @param {array} historicalMetrics - [{date, score}, ...] (oldest first)
 * @returns {string} 'improving' | 'stable' | 'worsening'
 */
export function calculateTrend(historicalMetrics) {
    if (historicalMetrics.length < 2) return 'stable'; // not enough data

    const oldestScore = historicalMetrics[0].score || 0;
    const newestScore = historicalMetrics[historicalMetrics.length - 1].score || 0;

    const diff = newestScore - oldestScore;

    // +/- 1 point = noise, call it stable
    if (Math.abs(diff) <= 1) return 'stable';

    return diff > 0 ? 'worsening' : 'improving';
}

/**
 * Flag restaurants as outliers based on extreme metrics
 * 
 * @param {array} rankedMetrics - sorted restaurants (from rankRestaurantsByRisk)
 * @returns {object} {
 *   highest_flagged_rate: {restaurantId, name, percent},
 *   highest_escalation_rate: {restaurantId, name, percent},
 *   largest_unresolved_backlog: {restaurantId, name, count},
 *   most_overdue: {restaurantId, name, count},
 *   highest_concentration: {restaurantId, name, code, percent},
 *   most_abuse_escalations: {restaurantId, name, count}
 * }
 */
export function flagOutliers(rankedMetrics) {
    const outliers = {};

    if (rankedMetrics.length === 0) return outliers;

    // Highest flagged rate
    const byFlaggedRate = [...rankedMetrics].sort((a, b) => b.flaggedRate - a.flaggedRate);
    if (byFlaggedRate[0] && byFlaggedRate[0].flaggedRate > 0) {
        outliers.highest_flagged_rate = {
            restaurantId: byFlaggedRate[0].restaurantId,
            name: byFlaggedRate[0].restaurantName,
            percent: byFlaggedRate[0].flaggedRate
        };
    }

    // Highest escalation rate
    const byEscalationRate = [...rankedMetrics].sort((a, b) => b.escalationRate - a.escalationRate);
    if (byEscalationRate[0] && byEscalationRate[0].escalationRate > 0) {
        outliers.highest_escalation_rate = {
            restaurantId: byEscalationRate[0].restaurantId,
            name: byEscalationRate[0].restaurantName,
            percent: byEscalationRate[0].escalationRate
        };
    }

    // Largest unresolved backlog
    const byBacklog = [...rankedMetrics].sort((a, b) => b.unresolvedCount - a.unresolvedCount);
    if (byBacklog[0] && byBacklog[0].unresolvedCount > 0) {
        outliers.largest_unresolved_backlog = {
            restaurantId: byBacklog[0].restaurantId,
            name: byBacklog[0].restaurantName,
            count: byBacklog[0].unresolvedCount
        };
    }

    // Most overdue
    const byOverdue = [...rankedMetrics].sort((a, b) => b.overdueCount - a.overdueCount);
    if (byOverdue[0] && byOverdue[0].overdueCount > 0) {
        outliers.most_overdue = {
            restaurantId: byOverdue[0].restaurantId,
            name: byOverdue[0].restaurantName,
            count: byOverdue[0].overdueCount
        };
    }

    // Highest reason code concentration (from topAnomalies)
    const byConcentration = rankedMetrics
        .filter(r => r.topAnomalies.some(a => a.type === 'reason_code_concentration'))
        .map(r => {
            const codeAnomaly = r.topAnomalies.find(a => a.type === 'reason_code_concentration');
            return {
                ...r,
                concentrationPercent: codeAnomaly?.percent || 0,
                concentrationCode: codeAnomaly?.code || null
            };
        })
        .sort((a, b) => b.concentrationPercent - a.concentrationPercent);

    if (byConcentration[0] && byConcentration[0].concentrationPercent > 0) {
        outliers.highest_concentration = {
            restaurantId: byConcentration[0].restaurantId,
            name: byConcentration[0].restaurantName,
            code: byConcentration[0].concentrationCode,
            percent: byConcentration[0].concentrationPercent
        };
    }

    // Most abuse-related escalations (from anomalies)
    const byAbuse = rankedMetrics
        .filter(r => r.topAnomalies.some(a => a.type === 'abuse_suspicious'))
        .map(r => {
            const abuseAnomaly = r.topAnomalies.find(a => a.type === 'abuse_suspicious');
            return {
                ...r,
                abuseCount: abuseAnomaly?.count || 0
            };
        })
        .sort((a, b) => b.abuseCount - a.abuseCount);

    if (byAbuse[0] && byAbuse[0].abuseCount > 0) {
        outliers.most_abuse_escalations = {
            restaurantId: byAbuse[0].restaurantId,
            name: byAbuse[0].restaurantName,
            count: byAbuse[0].abuseCount
        };
    }

    return outliers;
}

/**
 * Aggregate all restaurants into a portfolio view
 * 
 * @param {array} restaurants - all Restaurant entities
 * @param {array} orders - all Order entities
 * @param {function} calculateAnomaliesPerRestaurant - function that takes restaurantId, orders array and returns enrichedAnomalies
 * @returns {object} {
 *   ranked: [...restaurants ranked by risk],
 *   summary: {
 *     totalRestaurants,
 *     criticalCount, riskCount, watchCount, okCount,
 *     avgRiskScore,
 *     totalFlaggedOrders,
 *     totalUnresolvedOrders
 *   },
 *   outliers: {...},
 *   trends: {restaurantId: 'improving'|'stable'|'worsening', ...}
 * }
 */
export function buildPortfolioRanking(restaurants, orders, calculateAnomaliesPerRestaurant) {
    // Build metrics for each restaurant
    const allMetrics = restaurants.map(restaurant => {
        const rOrders = orders.filter(o => o.restaurant_id === restaurant.id);
        const enrichedAnomalies = calculateAnomaliesPerRestaurant(restaurant.id, rOrders);
        return calculateRestaurantMetrics(restaurant.id, restaurant.name, rOrders, enrichedAnomalies);
    });

    // Rank by risk
    const ranked = rankRestaurantsByRisk(allMetrics);

    // Summary stats
    const summary = {
        totalRestaurants: restaurants.length,
        criticalCount: allMetrics.filter(m => m.status === 'critical').length,
        riskCount: allMetrics.filter(m => m.status === 'risk').length,
        watchCount: allMetrics.filter(m => m.status === 'watch').length,
        okCount: allMetrics.filter(m => m.status === 'ok').length,
        avgRiskScore: allMetrics.length > 0 ? Math.round(allMetrics.reduce((s, m) => s + m.totalScore, 0) / allMetrics.length) : 0,
        totalFlaggedOrders: allMetrics.reduce((s, m) => s + m.flaggedCount, 0),
        totalUnresolvedOrders: allMetrics.reduce((s, m) => s + m.unresolvedCount, 0)
    };

    // Outliers
    const outliers = flagOutliers(ranked);

    // Trends (stub: would need historical data)
    const trends = {};
    ranked.forEach(r => {
        trends[r.restaurantId] = 'stable'; // placeholder; would compare against past data
    });

    return {
        ranked,
        summary,
        outliers,
        trends
    };
}