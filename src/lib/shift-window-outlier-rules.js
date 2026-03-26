/**
 * Shift Window Outlier Detection
 * 
 * Rule-based detection of unusual patterns in estimated shift windows.
 * All rules are COMPARATIVE and HONEST.
 */

/**
 * Detect shift window outliers
 * @param {object} aggregatedMetrics - {morning: {...}, afternoon: {...}, ...}
 * @param {object} perRestaurant - {restaurantId: {morning: {...}, ...}}
 * @returns {object} outlier flags
 */
export function detectShiftWindowOutliers(aggregatedMetrics, perRestaurant = {}) {
  const outliers = {};
  
  if (!aggregatedMetrics) return outliers;
  
  const windows = Object.values(aggregatedMetrics);
  const avgFlaggedRate = getAverageFlaggedRate(aggregatedMetrics);
  
  // 1. HIGH FLAGGED RATE IN WINDOW
  // Any window with 2x+ average flagged rate
  const highFlaggedWindows = windows
    .filter(w => w.totalOrders >= 10 && w.flaggedRate > avgFlaggedRate * 2)
    .sort((a, b) => b.flaggedRate - a.flaggedRate);
  
  if (highFlaggedWindows.length > 0) {
    const top = highFlaggedWindows[0];
    outliers.high_flagged_window = {
      window: top.window,
      label: top.label,
      flagged_rate: top.flaggedRate,
      flagged_count: top.flaggedCount,
      total_orders: top.totalOrders,
      vs_average: avgFlaggedRate,
      message: `${top.label}: ${top.flaggedRate}% flagged (${top.flaggedCount}/${top.totalOrders}), vs. ${avgFlaggedRate}% average`
    };
  }
  
  // 2. HIGH ESCALATION RATE IN WINDOW
  // Any window with >60% escalation rate of flagged AND >=5 flagged
  const highEscalationWindows = windows
    .filter(w => w.flaggedCount >= 5 && w.escalationRate > 60)
    .sort((a, b) => b.escalationRate - a.escalationRate);
  
  if (highEscalationWindows.length > 0) {
    const top = highEscalationWindows[0];
    outliers.high_escalation_window = {
      window: top.window,
      label: top.label,
      escalation_rate: top.escalationRate,
      escalated_count: top.escalatedCount,
      flagged_count: top.flaggedCount,
      message: `${top.label}: ${top.escalationRate}% escalation rate (${top.escalatedCount}/${top.flaggedCount} flagged)`
    };
  }
  
  // 3. BOUNDARY CONCENTRATION
  // Unusual cluster of offline orders within ±30 min of shift boundaries
  const totalOrders = windows.reduce((sum, w) => sum + w.totalOrders, 0);
  const totalBoundary = windows.reduce((sum, w) => sum + w.boundaryOrderCount, 0);
  
  if (totalOrders > 0) {
    const boundaryRate = Math.round((totalBoundary / totalOrders) * 100);
    
    // If >25% of orders near boundaries, flag it
    if (boundaryRate > 25) {
      outliers.boundary_concentration = {
        boundary_orders: totalBoundary,
        total_orders: totalOrders,
        boundary_rate: boundaryRate,
        message: `Unusual boundary clustering: ${boundaryRate}% of offline orders within ±30 min of shift boundaries (${totalBoundary}/${totalOrders}). May indicate handover issues or legitimate workflow.`
      };
    }
  }
  
  // 4. ABUSE CONCENTRATION IN WINDOW
  // Window with >=2 abuse-related escalations
  const abuseWindows = windows
    .map(w => ({
      ...w,
      abuseEscalations: (w.reasonCodes['potential_abuse'] || 0) + 
                        (w.reasonCodes['large_price_mismatch'] || 0) + 
                        (w.reasonCodes['repeated_offline_issues'] || 0)
    }))
    .filter(w => w.abuseEscalations >= 2)
    .sort((a, b) => b.abuseEscalations - a.abuseEscalations);
  
  if (abuseWindows.length > 0) {
    const top = abuseWindows[0];
    outliers.abuse_window = {
      window: top.window,
      label: top.label,
      abuse_escalations: top.abuseEscalations,
      message: `${top.label}: ${top.abuseEscalations} abuse-related escalations. Investigate patterns.`
    };
  }
  
  // 5. OPERATOR DOMINANCE IN WINDOW
  // Single operator created >50% of flagged orders in a window (per restaurant)
  Object.entries(perRestaurant).forEach(([restaurantId, restaurantWindows]) => {
    Object.values(restaurantWindows).forEach(window => {
      if (window.flaggedCount >= 5) {
        const operators = Object.entries(window.operators)
          .sort(([, a], [, b]) => b - a);
        
        if (operators.length > 0) {
          const [topOp, count] = operators[0];
          const pct = Math.round((count / window.flaggedCount) * 100);
          
          if (pct > 50) {
            const key = `operator_dominance_${window.window}_${restaurantId}`;
            if (!outliers[key]) {
              outliers[key] = {
                window: window.window,
                label: window.label,
                operator: topOp,
                operator_count: count,
                window_flagged_total: window.flaggedCount,
                percent: pct,
                message: `Operator ${topOp} created ${pct}% of flagged orders in ${window.label} (${count}/${window.flaggedCount})`
              };
            }
          }
        }
      }
    });
  });
  
  // 6. REASON CODE SPIKE IN WINDOW
  // >60% of flagged orders in window have same reason code
  const reasonSpikeWindows = windows
    .map(w => {
      if (w.flaggedCount < 5) return null;
      
      const codes = Object.entries(w.reasonCodes)
        .sort(([, a], [, b]) => b - a);
      
      if (codes.length === 0) return null;
      
      const [topCode, count] = codes[0];
      const pct = Math.round((count / w.flaggedCount) * 100);
      
      return pct > 60 ? { ...w, topCode, count, pct } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.pct - a.pct);
  
  if (reasonSpikeWindows.length > 0) {
    const top = reasonSpikeWindows[0];
    outliers.reason_spike_window = {
      window: top.window,
      label: top.label,
      reason_code: top.topCode,
      percent: top.pct,
      count: top.count,
      total_flagged: top.flaggedCount,
      message: `${top.label}: ${top.pct}% of flagged orders are "${top.topCode}" (${top.count}/${top.flaggedCount}). Systematic issue?`
    };
  }
  
  return outliers;
}

/**
 * Get average flagged rate
 * @param {object} aggregatedMetrics
 * @returns {number}
 */
function getAverageFlaggedRate(aggregatedMetrics) {
  const windows = Object.values(aggregatedMetrics);
  const totalOrders = windows.reduce((sum, w) => sum + w.totalOrders, 0);
  const totalFlagged = windows.reduce((sum, w) => sum + w.flaggedCount, 0);
  
  return totalOrders > 0
    ? Math.round((totalFlagged / totalOrders) * 100)
    : 0;
}

/**
 * Calculate shift window risk score (0-100)
 * @param {object} windowMetrics - single window
 * @returns {number}
 */
export function calculateWindowRiskScore(windowMetrics) {
  if (!windowMetrics || windowMetrics.totalOrders < 5) {
    return 0;
  }
  
  let score = 0;
  
  // Flagged rate (max 50 points, assume 15% avg)
  const flaggedScore = Math.min(50, (windowMetrics.flaggedRate / 15) * 40);
  score += flaggedScore;
  
  // Escalation rate (max 50 points, assume 40% avg)
  const escalationScore = Math.min(50, (windowMetrics.escalationRate / 40) * 45);
  score += escalationScore;
  
  return Math.round(score);
}