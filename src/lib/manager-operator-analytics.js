/**
 * Manager/Operator-Level Offline Review Analytics
 * 
 * Transforms per-restaurant anomaly data into people-level metrics:
 * - Review actions performed by manager
 * - Escalation/resolution rates per person
 * - Documentation quality signals
 * - Reason code patterns
 * - Unresolved backlog attribution
 * 
 * No ML, no predictions. Pure deterministic metrics for operational signals.
 */

/**
 * Calculate manager metrics from orders
 * Groups by offline_review_by (manager email)
 * 
 * @param {string} restaurantId
 * @param {array} orders - all orders for restaurant
 * @returns {object} {managerId: {metrics...}, ...}
 */
export function calculateManagerMetrics(restaurantId, orders) {
    const managerMap = {};
    
    if (!orders || orders.length === 0) {
        return managerMap;
    }
    
    orders.forEach(order => {
        // Only count offline orders
        if (!order.offline_created) return;
        
        // Only count reviewed orders
        const reviewerEmail = order.offline_review_by;
        if (!reviewerEmail) return; // Unreviewed
        
        // Initialize manager bucket
        if (!managerMap[reviewerEmail]) {
            managerMap[reviewerEmail] = {
                managerEmail: reviewerEmail,
                restaurantId,
                totalReviews: 0,
                acknowledgedCount: 0,
                resolvedCount: 0,
                escalatedCount: 0,
                escalationRate: 0,
                resolutionRate: 0,
                unresolvedCount: 0,
                oldestUnresolvedHours: null,
                reasonCodes: {},
                withNotesCount: 0,
                documentationRate: 0,
                averageReviewAgeHours: 0,
                reviewAges: [],
                abuseEscalations: 0,
            };
        }
        
        const mgr = managerMap[reviewerEmail];
        mgr.totalReviews += 1;
        
        // Status counts
        const status = order.offline_review_status;
        if (status === 'acknowledged') mgr.acknowledgedCount += 1;
        if (status === 'resolved') mgr.resolvedCount += 1;
        if (status === 'escalated') mgr.escalatedCount += 1;
        if (!status || status === 'new') mgr.unresolvedCount += 1;
        
        // Reason code distribution
        const code = order.offline_review_reason_code;
        if (code) {
            mgr.reasonCodes[code] = (mgr.reasonCodes[code] || 0) + 1;
        }
        
        // Documentation quality
        if (order.offline_review_notes && order.offline_review_notes.trim()) {
            mgr.withNotesCount += 1;
        }
        
        // Review age (from offline_synced_at to offline_review_at or now)
        if (order.offline_synced_at && order.offline_review_at) {
            const syncedTime = new Date(order.offline_synced_at).getTime();
            const reviewedTime = new Date(order.offline_review_at).getTime();
            const ageHours = (reviewedTime - syncedTime) / (1000 * 60 * 60);
            mgr.reviewAges.push(ageHours);
        } else if (order.offline_synced_at && !order.offline_review_at && status === 'new') {
            // Unreviewed — use current time
            const syncedTime = new Date(order.offline_synced_at).getTime();
            const nowTime = new Date().getTime();
            const ageHours = (nowTime - syncedTime) / (1000 * 60 * 60);
            mgr.reviewAges.push(ageHours);
            if (!mgr.oldestUnresolvedHours || ageHours > mgr.oldestUnresolvedHours) {
                mgr.oldestUnresolvedHours = ageHours;
            }
        }
        
        // Abuse-related escalations (codes: potential_abuse, large_price_mismatch, repeated_offline_issues)
        const abuseCodesList = ['potential_abuse', 'large_price_mismatch', 'repeated_offline_issues'];
        if (status === 'escalated' && code && abuseCodesList.includes(code)) {
            mgr.abuseEscalations += 1;
        }
    });
    
    // Post-process: calculate aggregates
    Object.values(managerMap).forEach(mgr => {
        // Escalation rate (% of completed reviews that were escalated)
        const completedReviews = mgr.resolvedCount + mgr.escalatedCount;
        mgr.escalationRate = completedReviews > 0 
            ? Math.round((mgr.escalatedCount / completedReviews) * 100)
            : 0;
        
        // Resolution rate (% of completed reviews that were resolved)
        mgr.resolutionRate = completedReviews > 0
            ? Math.round((mgr.resolvedCount / completedReviews) * 100)
            : 0;
        
        // Documentation rate
        mgr.documentationRate = mgr.totalReviews > 0
            ? Math.round((mgr.withNotesCount / mgr.totalReviews) * 100)
            : 0;
        
        // Average review age
        mgr.averageReviewAgeHours = mgr.reviewAges.length > 0
            ? Math.round((mgr.reviewAges.reduce((a, b) => a + b, 0) / mgr.reviewAges.length) * 10) / 10
            : 0;
    });
    
    return managerMap;
}

/**
 * Rank managers by review quality signals
 * 
 * @param {object} managerMetrics - output from calculateManagerMetrics
 * @returns {array} managers sorted by risk (escalation rate, poor docs, etc.)
 */
export function rankManagersByRisk(managerMetrics) {
    return Object.values(managerMetrics)
        .sort((a, b) => {
            // Primary: escalation rate (higher = more risk)
            const escalationDiff = b.escalationRate - a.escalationRate;
            if (escalationDiff !== 0) return escalationDiff;
            
            // Secondary: documentation rate (lower = more risk)
            const docDiff = a.documentationRate - b.documentationRate;
            if (docDiff !== 0) return docDiff;
            
            // Tertiary: total reviews (more reviews = more visible)
            return b.totalReviews - a.totalReviews;
        });
}

/**
 * Detect manager outliers (suspicious patterns)
 * 
 * @param {array} managerMetrics - array of manager metric objects
 * @returns {object} outlier flags
 */
export function flagManagerOutliers(managerMetrics) {
    if (!managerMetrics || managerMetrics.length === 0) {
        return {};
    }
    
    const outliers = {};
    
    // 1. Highest escalation rate
    const sorted = managerMetrics.slice().sort((a, b) => b.escalationRate - a.escalationRate);
    if (sorted.length > 0 && sorted[0].escalationRate > 50) {
        outliers.highest_escalation = {
            manager: sorted[0].managerEmail,
            rate: sorted[0].escalationRate,
            count: sorted[0].escalatedCount,
            total: sorted[0].resolvedCount + sorted[0].escalatedCount,
            message: `${sorted[0].managerEmail.split('@')[0]}: ${sorted[0].escalationRate}% escalation rate (${sorted[0].escalatedCount}/${sorted[0].resolvedCount + sorted[0].escalatedCount})`
        };
    }
    
    // 2. Lowest documentation rate
    const byDocs = managerMetrics.slice().sort((a, b) => a.documentationRate - b.documentationRate);
    if (byDocs.length > 0 && byDocs[0].documentationRate < 50 && byDocs[0].totalReviews >= 3) {
        outliers.lowest_documentation = {
            manager: byDocs[0].managerEmail,
            rate: byDocs[0].documentationRate,
            total: byDocs[0].totalReviews,
            message: `${byDocs[0].managerEmail.split('@')[0]}: Only ${byDocs[0].documentationRate}% of reviews have notes (${byDocs[0].withNotesCount}/${byDocs[0].totalReviews})`
        };
    }
    
    // 3. Highest reason code concentration by this manager
    managerMetrics.forEach(mgr => {
        if (mgr.totalReviews >= 3) {
            const sorted = Object.entries(mgr.reasonCodes).sort(([,a], [,b]) => b - a);
            if (sorted.length > 0) {
                const [code, count] = sorted[0];
                const pct = Math.round((count / mgr.totalReviews) * 100);
                if (pct > 70) {
                    if (!outliers.highest_concentration) {
                        outliers.highest_concentration = {
                            manager: mgr.managerEmail,
                            code,
                            percent: pct,
                            count,
                            total: mgr.totalReviews,
                            message: `${mgr.managerEmail.split('@')[0]}: ${pct}% use "${code}" (${count}/${mgr.totalReviews}). Verify if genuine pattern.`
                        };
                    }
                }
            }
        }
    });
    
    // 4. Most abuse-related escalations
    const byAbuse = managerMetrics.slice().sort((a, b) => b.abuseEscalations - a.abuseEscalations);
    if (byAbuse.length > 0 && byAbuse[0].abuseEscalations >= 2) {
        outliers.most_abuse_escalations = {
            manager: byAbuse[0].managerEmail,
            count: byAbuse[0].abuseEscalations,
            message: `${byAbuse[0].managerEmail.split('@')[0]}: ${byAbuse[0].abuseEscalations} abuse-related escalations. Investigate patterns.`
        };
    }
    
    // 5. Longest average review age (slowest to respond)
    const bySpeed = managerMetrics.slice().sort((a, b) => b.averageReviewAgeHours - a.averageReviewAgeHours);
    if (bySpeed.length > 0 && bySpeed[0].averageReviewAgeHours > 8 && bySpeed[0].totalReviews >= 3) {
        outliers.slowest_review_time = {
            manager: bySpeed[0].managerEmail,
            avgHours: bySpeed[0].averageReviewAgeHours,
            total: bySpeed[0].totalReviews,
            message: `${bySpeed[0].managerEmail.split('@')[0]}: Average review time ${Math.round(bySpeed[0].averageReviewAgeHours)}h (${bySpeed[0].totalReviews} reviews). Consider workload.`
        };
    }
    
    // 6. Most unresolved items (backlog)
    const byBacklog = managerMetrics.slice().sort((a, b) => b.unresolvedCount - a.unresolvedCount);
    if (byBacklog.length > 0 && byBacklog[0].unresolvedCount > 3) {
        outliers.largest_unresolved_backlog = {
            manager: byBacklog[0].managerEmail,
            count: byBacklog[0].unresolvedCount,
            oldestHours: byBacklog[0].oldestUnresolvedHours,
            message: `${byBacklog[0].managerEmail.split('@')[0]}: ${byBacklog[0].unresolvedCount} unresolved orders (oldest ${Math.round(byBacklog[0].oldestUnresolvedHours || 0)}h)`
        };
    }
    
    return outliers;
}

/**
 * Calculate operator (staff) metrics from orders
 * Groups by orders created in offline mode
 * 
 * Note: Currently offline_created_by is not persisted on Order entity,
 * so this is a stub awaiting schema change.
 * 
 * @param {string} restaurantId
 * @param {array} orders - all orders
 * @returns {object} {operatorId: {metrics...}, ...}
 */
export function calculateOperatorMetrics(restaurantId, orders) {
    // STUB: Requires offline_created_by field on Order entity
    // For now, returns empty because we don't have operator identity
    // This will be implemented in Phase 2 when Order schema is updated
    return {};
}

/**
 * Aggregate manager metrics across multiple restaurants
 * For cross-restaurant manager visibility (SuperAdmin only)
 * 
 * @param {object} managersByRestaurant - {restaurant_id: {manager_email: {...}}}
 * @returns {object} {manager_email: {aggregated_metrics...}}
 */
export function aggregateManagerMetricsAcrossRestaurants(managersByRestaurant) {
    const aggregated = {};
    
    Object.entries(managersByRestaurant).forEach(([restaurantId, managers]) => {
        Object.entries(managers).forEach(([managerEmail, metrics]) => {
            if (!aggregated[managerEmail]) {
                aggregated[managerEmail] = {
                    managerEmail,
                    restaurantIds: [],
                    totalReviews: 0,
                    escalatedCount: 0,
                    resolvedCount: 0,
                    acknowledgedCount: 0,
                    unresolvedCount: 0,
                    withNotesCount: 0,
                    reasonCodes: {},
                    abuseEscalations: 0,
                };
            }
            
            const agg = aggregated[managerEmail];
            agg.restaurantIds.push(restaurantId);
            agg.totalReviews += metrics.totalReviews;
            agg.escalatedCount += metrics.escalatedCount;
            agg.resolvedCount += metrics.resolvedCount;
            agg.acknowledgedCount += metrics.acknowledgedCount;
            agg.unresolvedCount += metrics.unresolvedCount;
            agg.withNotesCount += metrics.withNotesCount;
            agg.abuseEscalations += metrics.abuseEscalations;
            
            // Merge reason codes
            Object.entries(metrics.reasonCodes).forEach(([code, count]) => {
                agg.reasonCodes[code] = (agg.reasonCodes[code] || 0) + count;
            });
        });
    });
    
    // Calculate aggregated rates
    Object.values(aggregated).forEach(agg => {
        const completedReviews = agg.resolvedCount + agg.escalatedCount;
        agg.escalationRate = completedReviews > 0
            ? Math.round((agg.escalatedCount / completedReviews) * 100)
            : 0;
        
        agg.documentationRate = agg.totalReviews > 0
            ? Math.round((agg.withNotesCount / agg.totalReviews) * 100)
            : 0;
    });
    
    return aggregated;
}