/**
 * Offline Review Severity Scoring & Prioritisation
 * 
 * Converts per-rule anomalies into:
 * - Normalized severity (LOW / MEDIUM / HIGH)
 * - Aggregated risk score
 * - Overall operational status
 * - Actionable next steps
 */

/**
 * Severity threshold bands (configurable)
 * 
 * Maps rule severity names to numeric priority levels
 */
export const SEVERITY_BANDS = {
    // Flagged rate: % of all orders flagged
    flagged_rate: {
        low: { min: 5, max: 15 },
        medium: { min: 15, max: 25 },
        high: { min: 25, max: 100 }
    },
    
    // Escalation rate: % of reviewed orders escalated
    escalation_rate: {
        low: { min: 30, max: 50 },
        medium: { min: 50, max: 70 },
        high: { min: 70, max: 100 }
    },
    
    // Unresolved backlog: count of pending reviews
    unresolved_backlog_count: {
        low: { min: 5, max: 10 },
        medium: { min: 10, max: 15 },
        high: { min: 15, max: 10000 }
    },
    
    // Unresolved backlog: age of oldest item (hours)
    unresolved_backlog_age: {
        low: { min: 12, max: 24 },
        medium: { min: 24, max: 48 },
        high: { min: 48, max: 100000 }
    },
    
    // Reason code concentration: % using single dominant code
    reason_code_concentration: {
        low: { min: 70, max: 80 },
        medium: { min: 80, max: 90 },
        high: { min: 90, max: 100 }
    },
    
    // Abuse-related escalations: count of suspicious cases
    abuse_suspicious_count: {
        low: { min: 2, max: 2 },      // exactly 2 at lower percent
        medium: { min: 2, max: 3 },   // 2-3 at higher percent
        high: { min: 3, max: 100 }    // 3+ at any percent
    },
    
    // Abuse-related escalations: % of all escalations
    abuse_suspicious_percent: {
        low: { min: 5, max: 10 },
        medium: { min: 10, max: 15 },
        high: { min: 15, max: 100 }
    },
    
    // Manager load: % of reviews by top manager
    manager_load: {
        low: { min: 60, max: 70 },
        medium: { min: 70, max: 80 },
        high: { min: 80, max: 100 }
    },
    
    // Documentation: % of reviews with notes
    documentation_gap: {
        low: { min: 40, max: 50 },    // 40-50% have notes
        medium: { min: 20, max: 40 }, // 20-40% have notes
        high: { min: 0, max: 20 }     // <20% have notes
    }
};

/**
 * Calculate severity for a rule based on value(s)
 * 
 * @param {string} ruleType - rule name (e.g. 'flagged_rate')
 * @param {number|object} value - numeric value or {count, percent, age}
 * @returns {string} 'low' | 'medium' | 'high' | null (not anomalous)
 */
export function calculateRuleSeverity(ruleType, value) {
    if (value === null || value === undefined) return null;
    
    // Handle complex rules with multiple metrics
    if (typeof value === 'object') {
        return calculateComplexRuleSeverity(ruleType, value);
    }
    
    // Simple numeric rules
    const bands = SEVERITY_BANDS[ruleType];
    if (!bands) return null;
    
    if (value >= bands.high.min && value <= bands.high.max) return 'high';
    if (value >= bands.medium.min && value <= bands.medium.max) return 'medium';
    if (value >= bands.low.min && value <= bands.low.max) return 'low';
    
    return null;
}

/**
 * Calculate severity for complex rules (multiple metrics)
 * 
 * @private
 */
function calculateComplexRuleSeverity(ruleType, metrics) {
    if (ruleType === 'unresolved_backlog') {
        const { count, ageHours } = metrics;
        
        // Count takes priority
        if (count > 15) return 'high';
        if (count > 10) return 'medium';
        if (count > 5) return 'low';
        
        // Age escalates severity if count is moderate
        if (ageHours > 48) return 'high';
        if (ageHours > 24 && count > 0) return 'medium';
        if (ageHours > 12 && count > 0) return 'low';
        
        return null;
    }
    
    if (ruleType === 'abuse_suspicious') {
        const { count, percent } = metrics;
        
        // Both count and percent must be considered
        if (count >= 3 && percent >= 5) return 'high';
        if (count >= 2 && percent >= 10) return 'medium';
        if (count >= 2 && percent >= 5) return 'low';
        
        return null;
    }
    
    return null;
}

/**
 * Score severity level
 * 
 * @param {string} severity - 'low' | 'medium' | 'high'
 * @returns {number} 1 | 2 | 3
 */
export function severityScore(severity) {
    if (severity === 'high') return 3;
    if (severity === 'medium') return 2;
    if (severity === 'low') return 1;
    return 0; // no anomaly
}

/**
 * Calculate total risk score
 * 
 * @param {array} anomalies - array of {type, severity, ...}
 * @returns {number} sum of scores (0+)
 */
export function calculateTotalScore(anomalies) {
    return anomalies.reduce((sum, anom) => {
        // Ignore 'info'-level alerts in scoring
        if (anom.severity === 'info') return sum;
        return sum + severityScore(anom.severity);
    }, 0);
}

/**
 * Map total score to operational status
 * 
 * @param {number} score - total risk score
 * @returns {object} {status: 'ok'|'watch'|'risk'|'critical', description: string}
 */
export function scoreToStatus(score) {
    if (score === 0) {
        return { status: 'ok', description: 'No issues detected' };
    }
    if (score <= 3) {
        return { status: 'watch', description: 'Minor issues; monitor' };
    }
    if (score <= 7) {
        return { status: 'risk', description: 'Multiple issues; action needed' };
    }
    return { status: 'critical', description: 'Critical issues; immediate action required' };
}

/**
 * Next action hints per rule
 */
export const NEXT_ACTIONS = {
    flagged_rate: {
        low: 'Monitor POS sync performance',
        medium: 'Review POS configuration; check network stability',
        high: 'Urgent: investigate sync/validation issues'
    },
    escalation_rate: {
        low: 'Review escalation criteria; maintain standards',
        medium: 'Audit decision standards; may be too strict',
        high: 'Critical: review process may be broken'
    },
    unresolved_backlog: {
        low: 'Monitor review queue; maintain pace',
        medium: 'Increase review capacity; assign more reviewers',
        high: 'Urgent: clear pending review queue'
    },
    reason_code_concentration: {
        low: 'Monitor reason code distribution',
        medium: 'Investigate if concentration is genuine',
        high: 'Urgent: verify codes aren\'t masking issues'
    },
    abuse_suspicious: {
        low: 'Monitor suspicious patterns',
        medium: 'Investigate abuse cases; escalate if needed',
        high: 'Urgent: investigate fraud risk'
    },
    manager_load_imbalance: {
        low: 'Consider load distribution',
        medium: 'Distribute reviews across team',
        high: 'Urgent: check for manager fatigue or bias'
    },
    documentation_gap: {
        low: 'Encourage decision notes',
        medium: 'Require notes for audit trail',
        high: 'Urgent: mandate notes on all decisions'
    }
};

/**
 * Get next action for a rule
 * 
 * @param {string} ruleType
 * @param {string} severity
 * @returns {string}
 */
export function getNextAction(ruleType, severity) {
    const actions = NEXT_ACTIONS[ruleType];
    if (!actions) return 'Review rule details';
    return actions[severity] || 'Monitor this rule';
}

/**
 * Normalize anomaly with severity + next action
 * 
 * @param {object} anomaly - raw anomaly from detectAnomalies
 * @returns {object} enriched anomaly with severity + action
 */
export function normalizeAnomaly(anomaly) {
    // Map old severity levels to new ones for backward compatibility
    let newSeverity = anomaly.severity;
    
    if (anomaly.type === 'flagged_rate') {
        const oldSevMap = { 'critical': 'high', 'high': 'medium', 'elevated': 'low', 'ok': null };
        newSeverity = oldSevMap[anomaly.severity] || anomaly.severity;
    } else if (anomaly.type === 'escalation_rate') {
        const oldSevMap = { 'critical': 'high', 'high': 'medium', 'elevated': 'low', 'ok': null };
        newSeverity = oldSevMap[anomaly.severity] || anomaly.severity;
    } else if (anomaly.type === 'unresolved_backlog') {
        const oldSevMap = { 'critical': 'high', 'warning': 'medium', 'ok': null };
        newSeverity = oldSevMap[anomaly.severity] || anomaly.severity;
    } else if (anomaly.type === 'reason_code_concentration') {
        const oldSevMap = { 'critical': 'high', 'warning': 'medium' };
        newSeverity = oldSevMap[anomaly.severity] || anomaly.severity;
    } else if (anomaly.type === 'abuse_suspicious') {
        const oldSevMap = { 'critical': 'high', 'warning': 'medium' };
        newSeverity = oldSevMap[anomaly.severity] || anomaly.severity;
    }
    
    // Info-level anomalies stay as 'info'
    if (anomaly.severity === 'info') {
        newSeverity = 'info';
    }
    
    return {
        ...anomaly,
        severity: newSeverity,
        score: severityScore(newSeverity),
        nextAction: getNextAction(anomaly.type, newSeverity)
    };
}

/**
 * Enrich detectAnomalies output with scoring + prioritisation
 * 
 * @param {object} detectionResult - result from detectAnomalies()
 * @returns {object} enriched result with scores + status
 */
export function enrichAnomaliesWithScoring(detectionResult) {
    // Normalize all anomalies
    const normalizedAnomalies = detectionResult.anomalies.map(normalizeAnomaly);
    
    // Sort by severity (HIGH → MEDIUM → LOW → INFO)
    const severityOrder = { 'high': 0, 'medium': 1, 'low': 2, 'info': 3 };
    const sortedAnomalies = normalizedAnomalies.sort((a, b) => {
        const aOrder = severityOrder[a.severity] ?? 4;
        const bOrder = severityOrder[b.severity] ?? 4;
        return aOrder - bOrder;
    });
    
    // Calculate total score (excluding info-level)
    const totalScore = calculateTotalScore(sortedAnomalies);
    const statusMap = scoreToStatus(totalScore);
    
    return {
        ...detectionResult,
        anomalies: sortedAnomalies,
        totalScore,
        ...statusMap // adds status, description
    };
}