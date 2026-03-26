/**
 * Offline Review Anomaly Detection Rules
 * 
 * Pure, deterministic rule-based functions for identifying operational anomalies.
 * No ML. No scoring. Just thresholds and conditional logic.
 */

/**
 * Calculate flagged order rate (%)
 * 
 * @param {number} flaggedCount - orders with offline_created=true, needs_review=true
 * @param {number} totalOrders - all orders (any type)
 * @returns {number} percentage (0-100)
 */
export function calculateFlaggedRate(flaggedCount, totalOrders) {
    if (totalOrders === 0) return 0;
    return Math.round((flaggedCount / totalOrders) * 100);
}

/**
 * Detect if flagged rate is anomalous
 * 
 * Normal: 0–5% (offline mode is edge case)
 * Elevated: 6–15% (worth investigating)
 * High: 16–25% (systemic issue)
 * Critical: >25% (major problem)
 * 
 * @param {number} flaggedRatePercent
 * @returns {string} 'ok' | 'elevated' | 'high' | 'critical'
 */
export function flaggedRateAnomaly(flaggedRatePercent) {
    if (flaggedRatePercent <= 5) return 'ok';
    if (flaggedRatePercent <= 15) return 'elevated';
    if (flaggedRatePercent <= 25) return 'high';
    return 'critical';
}

/**
 * Calculate escalated percentage of reviewed orders
 * 
 * @param {number} escalatedCount - orders with offline_review_status='escalated'
 * @param {number} reviewedCount - orders with offline_review_reason_code set
 * @returns {number} percentage (0-100)
 */
export function calculateEscalatedPercent(escalatedCount, reviewedCount) {
    if (reviewedCount === 0) return 0;
    return Math.round((escalatedCount / reviewedCount) * 100);
}

/**
 * Detect if escalation rate is anomalous
 * 
 * Normal: 0–30% (most flagged orders are acceptable)
 * Elevated: 31–50% (many problems)
 * High: 51–70% (process may be too strict)
 * Critical: >70% (broken process)
 * 
 * @param {number} escalatedPercent
 * @returns {string} 'ok' | 'elevated' | 'high' | 'critical'
 */
export function escalationRateAnomaly(escalatedPercent) {
    if (escalatedPercent <= 30) return 'ok';
    if (escalatedPercent <= 50) return 'elevated';
    if (escalatedPercent <= 70) return 'high';
    return 'critical';
}

/**
 * Detect unresolved backlog anomaly
 * 
 * @param {number} unresolvedCount - orders with offline_review_status='new'
 * @param {number} oldestAgeHours - oldest unresolved order age
 * @returns {string} 'ok' | 'warning' | 'critical' | null (no unresolved)
 */
export function unresolvedBacklogAnomaly(unresolvedCount, oldestAgeHours) {
    if (unresolvedCount === 0) return null;
    
    // >10 unresolved items = warning
    if (unresolvedCount > 10) return 'critical';
    
    // >24h age = warning (should be reviewed same day)
    if (oldestAgeHours > 24) return 'warning';
    
    // >72h = critical (3 days stale)
    if (oldestAgeHours > 72) return 'critical';
    
    return 'ok';
}

/**
 * Detect reason code concentration (over-reliance on single reason)
 * 
 * If one reason code accounts for >70% of all reviews → possible validation blind spot
 * 
 * @param {string} dominantCode - most-used reason code
 * @param {number} dominantCount - count of that code
 * @param {number} totalReviewed - total reviewed orders
 * @returns {object|null} {code, percent, message} or null if not concentrated
 */
export function reasonCodeConcentration(dominantCode, dominantCount, totalReviewed) {
    if (totalReviewed === 0) return null;
    
    const percent = Math.round((dominantCount / totalReviewed) * 100);
    
    if (percent > 70) {
        return {
            code: dominantCode,
            percent,
            severity: percent > 85 ? 'critical' : 'warning',
            message: `${percent}% of reviews use "${dominantCode}". Verify if pattern is genuine or masking validation issues.`
        };
    }
    
    return null;
}

/**
 * Calculate abuse-related escalation percentage
 * 
 * Abuse codes: potential_abuse, large_price_mismatch, repeated_offline_issues
 * 
 * @param {number} abuseSuspiciousCount - escalations with abuse-related codes
 * @param {number} escalatedCount - total escalated
 * @returns {number} percentage
 */
export function calculateAbuseSuspiciousPercent(abuseSuspiciousCount, escalatedCount) {
    if (escalatedCount === 0) return 0;
    return Math.round((abuseSuspiciousCount / escalatedCount) * 100);
}

/**
 * Detect abuse-related anomaly
 * 
 * @param {number} abuseSuspiciousPercent
 * @param {number} abuseSuspiciousCount
 * @returns {string|null} 'warning' | 'critical' | null
 */
export function abuseSuspiciousAnomaly(abuseSuspiciousPercent, abuseSuspiciousCount) {
    // If >5% of escalations are abuse-related, flag for investigation
    if (abuseSuspiciousCount >= 2 && abuseSuspiciousPercent >= 5) {
        return abuseSuspiciousCount >= 3 ? 'critical' : 'warning';
    }
    return null;
}

/**
 * Detect manager review load imbalance
 * 
 * If one manager reviewed >60% of flagged orders → potential bus factor or bias
 * 
 * @param {string} topManagerEmail
 * @param {number} topManagerReviewCount
 * @param {number} totalReviewCount
 * @returns {object|null} {manager, percent, message} or null if balanced
 */
export function managerLoadImbalance(topManagerEmail, topManagerReviewCount, totalReviewCount) {
    if (totalReviewCount === 0) return null;
    
    const percent = Math.round((topManagerReviewCount / totalReviewCount) * 100);
    
    if (percent > 60) {
        return {
            manager: topManagerEmail,
            percent,
            message: `${topManagerEmail.split('@')[0]} handled ${percent}% of reviews (${topManagerReviewCount}/${totalReviewCount}). Consider load distribution.`
        };
    }
    
    return null;
}

/**
 * Detect documentation gap
 * 
 * Reviews with notes provide audit trail. <50% with notes = poor documentation.
 * 
 * @param {number} withNotesCount
 * @param {number} totalReviewed
 * @returns {string|null} 'warning' | null
 */
export function documentationGapAnomaly(withNotesCount, totalReviewed) {
    if (totalReviewed === 0) return null;
    
    const percent = Math.round((withNotesCount / totalReviewed) * 100);
    
    if (percent < 50) {
        return 'warning'; // trigger message in UI
    }
    
    return null;
}

/**
 * Aggregate all anomalies for a restaurant's offline review state
 * 
 * @param {object} stats - {
 *   totalOrders,
 *   flaggedCount,
 *   unresolvedCount,
 *   reviewedCount,
 *   escalatedCount,
 *   oldestUnresolvedHours,
 *   reasonCodes: {code: count, ...},
 *   reviews: [{offline_review_reason_code, offline_review_by, offline_review_notes}, ...],
 *   abuseSuspiciousCodes: {potential_abuse: count, large_price_mismatch: count, ...}
 * }
 * @returns {object} {anomalies: [], summary: {}, severity: 'ok'|'warning'|'critical'}
 */
export function detectAnomalies(stats) {
    const anomalies = [];
    let maxSeverity = 'ok';
    
    // 1. Flagged rate
    const flaggedRate = calculateFlaggedRate(stats.flaggedCount, stats.totalOrders);
    const flaggedAnomaly = flaggedRateAnomaly(flaggedRate);
    if (flaggedAnomaly !== 'ok') {
        anomalies.push({
            type: 'flagged_rate',
            severity: flaggedAnomaly === 'critical' ? 'critical' : flaggedAnomaly === 'high' ? 'warning' : 'info',
            percent: flaggedRate,
            message: `Flagged rate: ${flaggedRate}% (${stats.flaggedCount}/${stats.totalOrders} orders). ${
                flaggedRate > 25 ? 'Critical: systemic POS/sync issue.' :
                flaggedRate > 15 ? 'High: investigate POS configuration.' :
                'Elevated: monitor closely.'
            }`
        });
        if (flaggedAnomaly === 'critical') maxSeverity = 'critical';
        else if (flaggedAnomaly === 'high' && maxSeverity !== 'critical') maxSeverity = 'warning';
    }
    
    // 2. Unresolved backlog
    if (stats.unresolvedCount > 0) {
        const backlogAnomaly = unresolvedBacklogAnomaly(stats.unresolvedCount, stats.oldestUnresolvedHours || 0);
        if (backlogAnomaly && backlogAnomaly !== 'ok') {
            const ageStr = stats.oldestUnresolvedHours 
                ? `(oldest ${Math.round(stats.oldestUnresolvedHours)}h old)` 
                : '';
            anomalies.push({
                type: 'unresolved_backlog',
                severity: backlogAnomaly,
                count: stats.unresolvedCount,
                message: `Unresolved backlog: ${stats.unresolvedCount} orders pending review ${ageStr}. Needs triage.`
            });
            if (backlogAnomaly === 'critical') maxSeverity = 'critical';
            else if (maxSeverity !== 'critical') maxSeverity = 'warning';
        }
    }
    
    // 3. Escalation rate
    if (stats.reviewedCount > 0) {
        const escalatedPercent = calculateEscalatedPercent(stats.escalatedCount, stats.reviewedCount);
        const escalationAnomaly = escalationRateAnomaly(escalatedPercent);
        if (escalationAnomaly !== 'ok') {
            anomalies.push({
                type: 'escalation_rate',
                severity: escalationAnomaly === 'critical' ? 'critical' : 'warning',
                percent: escalatedPercent,
                message: `Escalation rate: ${escalatedPercent}% (${stats.escalatedCount}/${stats.reviewedCount} reviewed). ${
                    escalatedPercent > 70 ? 'Critical: review process may be too strict.' :
                    escalatedPercent > 50 ? 'High: many orders need investigation.' :
                    'Elevated: monitor resolution patterns.'
                }`
            });
            if (escalationAnomaly === 'critical') maxSeverity = 'critical';
            else if (escalationAnomaly === 'high' && maxSeverity !== 'critical') maxSeverity = 'warning';
        }
    }
    
    // 4. Reason code concentration
    if (stats.reviewedCount > 0 && stats.reasonCodes) {
        const sorted = Object.entries(stats.reasonCodes).sort(([,a], [,b]) => b - a);
        if (sorted.length > 0) {
            const [dominantCode, dominantCount] = sorted[0];
            const concentration = reasonCodeConcentration(dominantCode, dominantCount, stats.reviewedCount);
            if (concentration) {
                anomalies.push({
                    type: 'reason_code_concentration',
                    severity: concentration.severity,
                    code: concentration.code,
                    percent: concentration.percent,
                    message: concentration.message
                });
                if (concentration.severity === 'critical') maxSeverity = 'critical';
                else if (maxSeverity !== 'critical') maxSeverity = 'warning';
            }
        }
    }
    
    // 5. Abuse suspicion
    if (stats.abuseSuspiciousCodes) {
        const abuseSuspiciousCount = Object.values(stats.abuseSuspiciousCodes).reduce((a, b) => a + b, 0);
        const abuseSuspiciousPercent = calculateAbuseSuspiciousPercent(abuseSuspiciousCount, stats.escalatedCount || 0);
        const abuseAnomaly = abuseSuspiciousAnomaly(abuseSuspiciousPercent, abuseSuspiciousCount);
        if (abuseAnomaly) {
            anomalies.push({
                type: 'abuse_suspicious',
                severity: abuseAnomaly,
                count: abuseSuspiciousCount,
                percent: abuseSuspiciousPercent,
                message: `Abuse-related escalations: ${abuseSuspiciousCount} potential_abuse/price_mismatch cases (${abuseSuspiciousPercent}% of escalations). Investigate.`
            });
            if (abuseAnomaly === 'critical') maxSeverity = 'critical';
            else if (maxSeverity !== 'critical') maxSeverity = 'warning';
        }
    }
    
    // 6. Manager load imbalance
    if (stats.reviews && stats.reviews.length > 0) {
        const reviewsByManager = {};
        stats.reviews.forEach(r => {
            if (r.offline_review_by) {
                reviewsByManager[r.offline_review_by] = (reviewsByManager[r.offline_review_by] || 0) + 1;
            }
        });
        const sorted = Object.entries(reviewsByManager).sort(([,a], [,b]) => b - a);
        if (sorted.length > 0 && sorted.length > 1) {
            const [topManager, topCount] = sorted[0];
            const imbalance = managerLoadImbalance(topManager, topCount, stats.reviews.length);
            if (imbalance) {
                anomalies.push({
                    type: 'manager_load_imbalance',
                    severity: 'info', // informational, not a blocker
                    manager: imbalance.manager,
                    percent: imbalance.percent,
                    message: imbalance.message
                });
            }
        }
    }
    
    // 7. Documentation gap
    if (stats.reviewedCount > 0) {
        const withNotesCount = stats.reviews ? stats.reviews.filter(r => r.offline_review_notes && r.offline_review_notes.trim()).length : 0;
        const docGapAnomaly = documentationGapAnomaly(withNotesCount, stats.reviewedCount);
        if (docGapAnomaly) {
            const docPercent = Math.round((withNotesCount / stats.reviewedCount) * 100);
            anomalies.push({
                type: 'documentation_gap',
                severity: 'info',
                percent: docPercent,
                message: `Documentation: ${docPercent}% of reviews have notes. Encourage comments for audit trail.`
            });
        }
    }
    
    return {
        anomalies,
        summary: {
            flaggedRate,
            escalatedPercent: stats.reviewedCount > 0 ? calculateEscalatedPercent(stats.escalatedCount, stats.reviewedCount) : 0,
            unresolvedCount: stats.unresolvedCount,
            reviewedCount: stats.reviewedCount,
            totalOrders: stats.totalOrders
        },
        severity: maxSeverity
    };
}