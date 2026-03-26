/**
 * Operator Outlier Detection — Rule-Based
 * 
 * Identifies operators with suspicious offline order patterns
 * using simple, explainable rules based on real data only.
 * 
 * NO surveillance. NO blame attribution. Signals only.
 * These are operational patterns, not proof of fault.
 * 
 * Rules are comparative (vs. peer average) to avoid false positives.
 */

/**
 * Detect operator outliers
 * @param {object} operatorMetrics - {operatorEmail: {metrics...}}
 * @param {number} restaurantId - for context
 * @returns {object} outlier flags
 */
export function detectOperatorOutliers(operatorMetrics) {
    if (!operatorMetrics || Object.keys(operatorMetrics).length === 0) {
        return {};
    }
    
    const operators = Object.values(operatorMetrics);
    const outliers = {};
    
    // Calculate restaurant-wide baselines
    const totalOrders = operators.reduce((sum, op) => sum + op.totalOrders, 0);
    const totalFlagged = operators.reduce((sum, op) => sum + op.flaggedCount, 0);
    const avgFlaggedRate = totalOrders > 0
        ? Math.round((totalFlagged / totalOrders) * 100)
        : 0;
    
    const totalEscalated = operators.reduce((sum, op) => sum + op.escalatedCount, 0);
    const avgEscalationRate = totalFlagged > 0
        ? Math.round((totalEscalated / totalFlagged) * 100)
        : 0;
    
    // 1. HIGH FLAGGED RATE (vs. restaurant average)
    // Operators 2x+ restaurant average
    const highFlaggedOps = operators
        .filter(op => op.totalOrders >= 5 && op.flaggedRate > avgFlaggedRate * 2)
        .sort((a, b) => b.flaggedRate - a.flaggedRate);
    
    if (highFlaggedOps.length > 0) {
        const topOp = highFlaggedOps[0];
        outliers.highest_flagged_rate = {
            operator: topOp.operatorEmail,
            name: topOp.operatorName,
            role: topOp.operatorRole,
            flagged_rate: topOp.flaggedRate,
            flagged_count: topOp.flaggedCount,
            total_orders: topOp.totalOrders,
            vs_average: avgFlaggedRate,
            message: `${topOp.operatorName} (${topOp.operatorRole}): ${topOp.flaggedRate}% flagged rate (${topOp.flaggedCount}/${topOp.totalOrders}), vs. ${avgFlaggedRate}% average`
        };
    }
    
    // 2. HIGH ESCALATION RATE (if multiple flagged orders)
    // Escalations > 60% of their flagged orders, AND >= 5 flagged
    const highEscalationOps = operators
        .filter(op => op.flaggedCount >= 5 && op.escalationRate > 60)
        .sort((a, b) => b.escalationRate - a.escalationRate);
    
    if (highEscalationOps.length > 0) {
        const topOp = highEscalationOps[0];
        outliers.highest_escalation_rate = {
            operator: topOp.operatorEmail,
            name: topOp.operatorName,
            role: topOp.operatorRole,
            escalation_rate: topOp.escalationRate,
            escalated_count: topOp.escalatedCount,
            flagged_count: topOp.flaggedCount,
            vs_average: avgEscalationRate,
            message: `${topOp.operatorName} (${topOp.operatorRole}): ${topOp.escalationRate}% escalation rate (${topOp.escalatedCount}/${topOp.flaggedCount} flagged), vs. ${avgEscalationRate}% average`
        };
    }
    
    // 3. ABUSE CONCENTRATION
    // >= 2 abuse-related escalations (potential_abuse, large_price_mismatch, repeated_offline_issues)
    const abuseOps = operators
        .filter(op => op.abuseEscalations >= 2)
        .sort((a, b) => b.abuseEscalations - a.abuseEscalations);
    
    if (abuseOps.length > 0) {
        const topOp = abuseOps[0];
        outliers.abuse_related_escalations = {
            operator: topOp.operatorEmail,
            name: topOp.operatorName,
            role: topOp.operatorRole,
            abuse_escalations: topOp.abuseEscalations,
            total_escalations: topOp.escalatedCount,
            message: `${topOp.operatorName} (${topOp.operatorRole}): ${topOp.abuseEscalations} abuse-related escalations out of ${topOp.escalatedCount} total. Investigate patterns.`
        };
    }
    
    // 4. REASON CODE CONCENTRATION (systematic issue?)
    // > 70% of their flagged orders have same reason code, AND >= 5 flagged
    operators.forEach(op => {
        if (op.flaggedCount >= 5) {
            const reasonCodeEntries = Object.entries(op.reasonCodes)
                .sort(([, a], [, b]) => b - a);
            
            if (reasonCodeEntries.length > 0) {
                const [topCode, count] = reasonCodeEntries[0];
                const pct = Math.round((count / op.flaggedCount) * 100);
                
                if (pct > 70) {
                    if (!outliers.reason_code_concentration) {
                        outliers.reason_code_concentration = {
                            operator: op.operatorEmail,
                            name: op.operatorName,
                            role: op.operatorRole,
                            reason_code: topCode,
                            percent: pct,
                            count,
                            total_flagged: op.flaggedCount,
                            message: `${op.operatorName} (${op.operatorRole}): ${pct}% of their flagged orders are "${topCode}" (${count}/${op.flaggedCount}). Systematic issue?`
                        };
                    }
                }
            }
        }
    });
    
    // 5. HIGH VOLUME with issues (for visibility)
    // > 50 orders AND flagged rate > restaurant average
    const volumeOps = operators
        .filter(op => op.totalOrders > 50 && op.flaggedRate > avgFlaggedRate)
        .sort((a, b) => b.totalOrders - a.totalOrders);
    
    if (volumeOps.length > 0) {
        const topOp = volumeOps[0];
        outliers.high_volume_with_issues = {
            operator: topOp.operatorEmail,
            name: topOp.operatorName,
            role: topOp.operatorRole,
            total_orders: topOp.totalOrders,
            flagged_rate: topOp.flaggedRate,
            flagged_count: topOp.flaggedCount,
            vs_average: avgFlaggedRate,
            message: `${topOp.operatorName} (${topOp.operatorRole}): Created ${topOp.totalOrders} orders with ${topOp.flaggedRate}% flagged rate. Visible outlier by volume.`
        };
    }
    
    return outliers;
}

/**
 * Rank operators by risk
 * @param {object} operatorMetrics
 * @returns {array} sorted by risk (escalation rate, then flagged rate)
 */
export function rankOperatorsByRisk(operatorMetrics) {
    return Object.values(operatorMetrics)
        .sort((a, b) => {
            // Primary: escalation rate (higher = more risk)
            const escalationDiff = b.escalationRate - a.escalationRate;
            if (escalationDiff !== 0) return escalationDiff;
            
            // Secondary: flagged rate
            const flaggedDiff = b.flaggedRate - a.flaggedRate;
            if (flaggedDiff !== 0) return flaggedDiff;
            
            // Tertiary: total orders (more visible)
            return b.totalOrders - a.totalOrders;
        });
}

/**
 * Calculate operator risk score (0-100)
 * Composite of flagged rate, escalation rate, and abuse escalations
 * @param {object} operatorMetrics - single operator
 * @returns {number} 0-100
 */
export function calculateOperatorRiskScore(operatorMetrics) {
    if (!operatorMetrics || operatorMetrics.totalOrders < 3) {
        return 0; // Insufficient data
    }
    
    let score = 0;
    
    // Flagged rate (max 40 points)
    // Assume 15% average, scale non-linearly
    const flaggedScore = Math.min(40, (operatorMetrics.flaggedRate / 15) * 30);
    score += flaggedScore;
    
    // Escalation rate (max 40 points)
    // Assume 40% average, scale non-linearly
    const escalationScore = Math.min(40, (operatorMetrics.escalationRate / 40) * 35);
    score += escalationScore;
    
    // Abuse escalations (max 20 points)
    // Each abuse escalation = +10 points
    const abuseScore = Math.min(20, operatorMetrics.abuseEscalations * 10);
    score += abuseScore;
    
    return Math.round(score);
}