/**
 * Offline Risk Calculations — Shared Utilities
 * 
 * Standardized calculation methods used across all offline-risk views.
 * Ensures "same metric, same input → same output" everywhere.
 */

import {
  RISK_THRESHOLDS,
  ESCALATION_CALCULATION,
  DEFAULT_ESCALATION_MODE,
  ABUSE_REASON_CODES,
} from './offline-risk-constants.js';

/**
 * Calculate escalation rate with explicit method
 * 
 * @param {number} escalatedCount - count of escalated orders
 * @param {number} flaggedCount - count of flagged orders (for Method A)
 * @param {number} reviewedCount - count of reviewed orders (for Method B)
 * @param {string} method - calculation method (default: PERCENT_OF_FLAGGED)
 * @returns {number} percentage (0-100)
 */
export function calculateEscalationRate(
  escalatedCount,
  flaggedCount,
  reviewedCount = flaggedCount,
  method = DEFAULT_ESCALATION_MODE
) {
  if (method === ESCALATION_CALCULATION.PERCENT_OF_FLAGGED) {
    return flaggedCount > 0 ? Math.round((escalatedCount / flaggedCount) * 100) : 0;
  }

  if (method === ESCALATION_CALCULATION.PERCENT_OF_REVIEWED) {
    return reviewedCount > 0 ? Math.round((escalatedCount / reviewedCount) * 100) : 0;
  }

  if (method === ESCALATION_CALCULATION.PERCENT_OF_FLAGGED_AND_ESCALATED) {
    const total = flaggedCount + escalatedCount;
    return total > 0 ? Math.round((escalatedCount / total) * 100) : 0;
  }

  return 0;
}

/**
 * Check if order is overdue (based on canonical threshold)
 * 
 * @param {object} order - order entity with offline_synced_at
 * @returns {boolean} true if older than OVERDUE_MINUTES
 */
export function isOrderOverdue(order) {
  if (!order?.offline_synced_at) return false;
  const now = new Date();
  const syncedAt = new Date(order.offline_synced_at);
  const ageMinutes = Math.round((now - syncedAt) / (1000 * 60));
  return ageMinutes > RISK_THRESHOLDS.OVERDUE_MINUTES;
}

/**
 * Check if operator flagged rate is an outlier (vs avg)
 * 
 * @param {number} operatorFlaggedRate - operator's flagged %
 * @param {number} avgFlaggedRate - restaurant/portfolio average
 * @returns {boolean} true if outlier
 */
export function isOperatorOutlier(operatorFlaggedRate, avgFlaggedRate) {
  return operatorFlaggedRate > avgFlaggedRate + RISK_THRESHOLDS.OPERATOR_VS_AVERAGE_THRESHOLD;
}

/**
 * Check if operator has high escalation rate (canonical threshold)
 * 
 * @param {number} operatorEscalationRate - operator's escalation %
 * @returns {boolean} true if high
 */
export function isOperatorHighEscalation(operatorEscalationRate) {
  return operatorEscalationRate > RISK_THRESHOLDS.OPERATOR_HIGH_ESCALATION;
}

/**
 * Check if reason code concentration is notable
 * 
 * @param {number} percentageOfOrders - % of orders with same code
 * @returns {boolean} true if concentration is high
 */
export function isReasonCodeConcentration(percentageOfOrders) {
  return percentageOfOrders > RISK_THRESHOLDS.REASON_CODE_CONCENTRATION;
}

/**
 * Check if reason code is abuse-related
 * 
 * @param {string} reasonCode - reason code from order
 * @returns {boolean} true if abuse-related
 */
export function isAbuseReasonCode(reasonCode) {
  return ABUSE_REASON_CODES.includes(reasonCode);
}

/**
 * Count abuse-related escalations in order array
 * 
 * @param {array} orders - orders to analyze
 * @returns {number} count of abuse-related escalations
 */
export function countAbuseEscalations(orders) {
  return orders.filter(
    o => o.offline_review_status === 'escalated' && isAbuseReasonCode(o.offline_review_reason_code)
  ).length;
}

/**
 * Calculate flagged rate (canonical formula)
 * 
 * @param {number} flaggedCount
 * @param {number} totalCount
 * @returns {number} percentage (0-100)
 */
export function calculateFlaggedRate(flaggedCount, totalCount) {
  return totalCount > 0 ? Math.round((flaggedCount / totalCount) * 100) : 0;
}

/**
 * Check if window/daypart has high flagged rate (canonical threshold)
 * 
 * @param {number} flaggedRate - % flagged in window
 * @returns {boolean} true if high
 */
export function isWindowHighFlaggedRate(flaggedRate) {
  return flaggedRate > RISK_THRESHOLDS.WINDOW_HIGH_FLAGGED;
}

/**
 * Check if window/daypart has high escalation rate
 * 
 * @param {number} escalationRate - % escalated
 * @returns {boolean} true if high
 */
export function isWindowHighEscalation(escalationRate) {
  return escalationRate > RISK_THRESHOLDS.WINDOW_HIGH_ESCALATION;
}

/**
 * Check if order count is high volume with issues
 * 
 * @param {number} orderCount - total orders
 * @returns {boolean} true if >50 orders
 */
export function isHighVolume(orderCount) {
  return orderCount > 50;
}