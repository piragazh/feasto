/**
 * Offline Risk Digest Logic
 * 
 * Deterministic digest generation for operational awareness.
 * Surfaces critical, worsening, and actionable signals only.
 * 
 * Uses canonical thresholds from offline-risk-constants.js
 */

import { RISK_THRESHOLDS } from './offline-risk-constants.js';
import { calculateFlaggedRate, calculateEscalationRate } from './offline-risk-calculations.js';

/**
 * Generate portfolio-level digest (SuperAdmin)
 * @param {array} orders - all orders
 * @param {array} restaurants - all restaurants
 * @param {object} portfolioAnalytics - from OfflineReviewPortfolio
 * @param {object} operatorAnalytics - from OperatorAnalytics
 * @returns {object} digest
 */
export function generatePortfolioDigest(orders = [], restaurants = [], portfolioAnalytics = {}, operatorAnalytics = {}) {
  const now = new Date();
  const day24h = 24 * 60 * 60 * 1000;
  const day7d = 7 * day24h;

  // ──────────────────────────────────────────────────────────────
  // 1. OVERDUE FLAGGED ORDERS (using canonical threshold)
  // ──────────────────────────────────────────────────────────────
  const overdueOrders = orders
    .filter(o => o.offline_created && o.needs_review && o.offline_review_status === 'new')
    .map(o => {
      const syncedAt = new Date(o.offline_synced_at);
      const ageMinutes = Math.round((now - syncedAt) / (1000 * 60));
      return { ...o, ageMinutes };
    })
    .filter(o => o.ageMinutes > RISK_THRESHOLDS.OVERDUE_MINUTES)
    .sort((a, b) => b.ageMinutes - a.ageMinutes)
    .slice(0, 10);

  // ──────────────────────────────────────────────────────────────
  // 2. CRITICAL RESTAURANTS (top risk rank)
  // ──────────────────────────────────────────────────────────────
  const criticalRestaurants = (portfolioAnalytics.rankedRestaurants || [])
    .slice(0, 5)
    .map(r => {
      const restaurant = restaurants.find(res => res.id === r.restaurant_id);
      return {
        restaurant_id: r.restaurant_id,
        restaurant_name: restaurant?.name || 'Unknown',
        risk_score: r.risk_score,
        flagged_rate: r.flagged_rate,
        escalation_rate: r.escalation_rate,
        flagged_count: r.flagged_count,
        escalated_count: r.escalated_count
      };
    });

  // ──────────────────────────────────────────────────────────────
  // 3. WORSENING TRENDS (escalation rate up >10 pts)
  // ──────────────────────────────────────────────────────────────
  const last24h = orders.filter(o => new Date(o.offline_synced_at) > new Date(now - day24h) && o.offline_created);
  const last7d = orders.filter(o => new Date(o.offline_synced_at) > new Date(now - day7d) && o.offline_created);

  const flagged24h = last24h.filter(o => o.needs_review).length;
  const escalated24h = last24h.filter(o => o.offline_review_status === 'escalated').length;
  const escalated7d = last7d.filter(o => o.offline_review_status === 'escalated').length;
  
  const flaggedRate24h = calculateFlaggedRate(flagged24h, last24h.length);
  const escalation24h = calculateEscalationRate(escalated24h, last24h.length);
  const escalation7d = calculateEscalationRate(escalated7d, last7d.length);

  const worsening = {
    escalation_up: escalation24h > escalation7d + 10,
    escalation_24h: escalation24h,
    escalation_7d: escalation7d,
    delta: escalation24h - escalation7d
  };

  // ──────────────────────────────────────────────────────────────
  // 4. ABUSE ESCALATIONS (potential_abuse, large_price_mismatch, repeated)
  // ──────────────────────────────────────────────────────────────
  const abuseEscalations = orders
    .filter(o => o.offline_review_status === 'escalated' && o.offline_review_reason_code && 
            ['potential_abuse', 'large_price_mismatch', 'repeated_offline_issues'].includes(o.offline_review_reason_code))
    .slice(-10);

  // ──────────────────────────────────────────────────────────────
  // 5. OPERATOR OUTLIERS (top flagged by deviation)
  // ──────────────────────────────────────────────────────────────
  const operatorOutliers = (operatorAnalytics.outliers || [])
    .filter(o => o.type === 'high_flagged')
    .slice(0, 3);

  // ──────────────────────────────────────────────────────────────
  // 6. SUMMARY METRICS
  // ──────────────────────────────────────────────────────────────
  const totalOffline = orders.filter(o => o.offline_created).length;
  const totalFlagged = orders.filter(o => o.offline_created && o.needs_review).length;
  const totalEscalated = orders.filter(o => o.offline_created && o.offline_review_status === 'escalated').length;
  const totalOverdue = overdueOrders.length;

  const flaggedRate = calculateFlaggedRate(totalFlagged, totalOffline);
  const escalationRate = calculateEscalationRate(totalEscalated, totalFlagged);

  return {
    generated_at: now.toISOString(),
    period: '24h',
    
    critical_now: {
      overdue_flagged: {
        count: totalOverdue,
        oldest_minutes: overdueOrders.length > 0 ? overdueOrders[0].ageMinutes : 0,
        orders: overdueOrders.map(o => ({
          order_id: o.id,
          restaurant_name: restaurants.find(r => r.id === o.restaurant_id)?.name,
          age_minutes: o.ageMinutes,
          sync_validation_notes: o.sync_validation_notes
        }))
      },
      top_restaurants: criticalRestaurants,
      abuse_escalations: {
        count: abuseEscalations.length,
        recent: abuseEscalations.map(o => ({
          order_id: o.id,
          restaurant_name: restaurants.find(r => r.id === o.restaurant_id)?.name,
          reason_code: o.offline_review_reason_code,
          reviewed_at: o.offline_review_at
        }))
      }
    },

    watch_worsening: {
      escalation_rate_up: worsening.escalation_up,
      escalation_24h: worsening.escalation_24h,
      escalation_7d: worsening.escalation_7d,
      delta_points: worsening.delta,
      flagged_rate_24h: flaggedRate24h,
      operator_outliers: operatorOutliers.map(o => ({
        operator_email: o.operator_email,
        flagged_rate: o.flagged_rate,
        vs_average: o.vs_average
      }))
    },

    summary_metrics: {
      total_offline: totalOffline,
      total_flagged: totalFlagged,
      flagged_rate: flaggedRate,
      total_escalated: totalEscalated,
      escalation_rate: escalationRate,
      restaurants_with_issues: criticalRestaurants.length
    }
  };
}

/**
 * Generate restaurant-level digest (Manager/Admin)
 * @param {string} restaurantId
 * @param {array} orders - all orders
 * @param {object} restaurant
 * @param {object} restaurantAnalytics - analytics for this restaurant
 * @returns {object} digest
 */
export function generateRestaurantDigest(restaurantId, orders = [], restaurant = {}, restaurantAnalytics = {}) {
  const now = new Date();
  const day24h = 24 * 60 * 60 * 1000;

  const restaurantOrders = orders.filter(o => o.restaurant_id === restaurantId && o.offline_created);

  // ──────────────────────────────────────────────────────────────
  // 1. OVERDUE FLAGGED ORDERS (this restaurant)
  // ──────────────────────────────────────────────────────────────
  const overdueOrders = restaurantOrders
    .filter(o => o.needs_review && o.offline_review_status === 'new')
    .map(o => {
      const syncedAt = new Date(o.offline_synced_at);
      const ageMinutes = Math.round((now - syncedAt) / (1000 * 60));
      return { ...o, ageMinutes };
    })
    .filter(o => o.ageMinutes > 240)
    .sort((a, b) => b.ageMinutes - a.ageMinutes);

  // ──────────────────────────────────────────────────────────────
  // 2. LOCAL OPERATOR OUTLIERS (high flagged rate at this store)
  // ──────────────────────────────────────────────────────────────
  const operatorStats = {};
  restaurantOrders.forEach(o => {
    if (o.offline_created_by) {
      if (!operatorStats[o.offline_created_by]) {
        operatorStats[o.offline_created_by] = { total: 0, flagged: 0, email: o.offline_created_by, name: o.offline_created_by_name };
      }
      operatorStats[o.offline_created_by].total++;
      if (o.needs_review) {
        operatorStats[o.offline_created_by].flagged++;
      }
    }
  });

  const avgFlaggedRate = calculateFlaggedRate(
    restaurantOrders.filter(o => o.needs_review).length,
    restaurantOrders.length
  );

  const operatorOutliers = Object.values(operatorStats)
    .filter(op => op.total >= 3)
    .map(op => {
      const rate = Math.round((op.flagged / op.total) * 100);
      return {
        operator_email: op.email,
        operator_name: op.name,
        flagged_rate: rate,
        flagged_count: op.flagged,
        total_orders: op.total,
        vs_average: rate - avgFlaggedRate
      };
    })
    .filter(op => op.vs_average > 10)
    .sort((a, b) => b.vs_average - a.vs_average)
    .slice(0, 3);

  // ──────────────────────────────────────────────────────────────
  // 3. TOP REASON CODE (this restaurant)
  // ──────────────────────────────────────────────────────────────
  const reasonCodeFreq = {};
  restaurantOrders
    .filter(o => o.needs_review && o.offline_review_reason_code)
    .forEach(o => {
      reasonCodeFreq[o.offline_review_reason_code] = (reasonCodeFreq[o.offline_review_reason_code] || 0) + 1;
    });

  const topReasonCode = Object.entries(reasonCodeFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 1)
    .map(([code, count]) => ({ code, count }))[0];

  // ──────────────────────────────────────────────────────────────
  // 4. METRICS (24H)
  // ──────────────────────────────────────────────────────────────
  const last24h = restaurantOrders.filter(o => new Date(o.offline_synced_at) > new Date(now - day24h));
  const flaggedLast24h = last24h.filter(o => o.needs_review).length;
  const escalatedLast24h = last24h.filter(o => o.offline_review_status === 'escalated').length;
  const flaggedRate24h = calculateFlaggedRate(flaggedLast24h, last24h.length);

  return {
    generated_at: now.toISOString(),
    restaurant_id: restaurantId,
    restaurant_name: restaurant.name || 'Unknown',
    period: '24h',

    critical_now: {
      overdue_flagged: {
        count: overdueOrders.length,
        oldest_minutes: overdueOrders.length > 0 ? overdueOrders[0].ageMinutes : 0,
        orders: overdueOrders.map(o => ({
          order_id: o.id,
          age_minutes: o.ageMinutes,
          issue: o.sync_validation_notes
        }))
      },
      operator_outliers: operatorOutliers.length > 0
        ? {
            count: operatorOutliers.length,
            list: operatorOutliers.map(o => ({
              name: o.operator_name,
              flagged_rate: o.flagged_rate,
              vs_average: `+${o.vs_average}pts`,
              flagged_count: o.flagged_count
            }))
          }
        : null
    },

    next_actions: {
      top_reason_code: topReasonCode ? {
        code: topReasonCode.code,
        count: topReasonCode.count,
        action: `Review ${topReasonCode.code} pattern (${topReasonCode.count} orders)`
      } : null,
      avg_flagged_rate: avgFlaggedRate
    },

    summary_metrics: {
      total_offline: restaurantOrders.length,
      flagged_24h: flaggedLast24h,
      escalated_24h: escalatedLast24h,
      flagged_rate_24h: flaggedRate24h
    }
  };
}

/**
 * Format digest for plaintext/email
 * @param {object} digest - portfolio or restaurant digest
 * @returns {string} plaintext
 */
export function formatDigestAsPlaintext(digest) {
  const lines = [];
  
  lines.push(`=== OFFLINE RISK DIGEST ===`);
  lines.push(`Generated: ${new Date(digest.generated_at).toLocaleString()}`);
  lines.push('');
  
  if (digest.critical_now) {
    lines.push(`🚨 CRITICAL NOW`);
    
    if (digest.critical_now.overdue_flagged?.count > 0) {
      lines.push(`  Overdue Flagged: ${digest.critical_now.overdue_flagged.count} orders (oldest: ${digest.critical_now.overdue_flagged.oldest_minutes}m)`);
      digest.critical_now.overdue_flagged.orders.slice(0, 3).forEach(o => {
        lines.push(`    - ${o.order_id}: ${o.age_minutes}m old`);
      });
    }
    
    if (digest.critical_now.top_restaurants?.length > 0) {
      lines.push(`  Top Risk Restaurants:`);
      digest.critical_now.top_restaurants.slice(0, 3).forEach(r => {
        lines.push(`    - ${r.restaurant_name}: Risk ${r.risk_score}, ${r.flagged_rate}% flagged`);
      });
    }
    
    if (digest.critical_now.abuse_escalations?.count > 0) {
      lines.push(`  Abuse Escalations: ${digest.critical_now.abuse_escalations.count}`);
    }
    lines.push('');
  }
  
  if (digest.watch_worsening) {
    lines.push(`⚠️ WATCH (WORSENING)`);
    if (digest.watch_worsening.escalation_rate_up) {
      lines.push(`  Escalation Rate: ${digest.watch_worsening.escalation_24h}% (24h) vs ${digest.watch_worsening.escalation_7d}% (7d) — UP ${digest.watch_worsening.delta_points}pts`);
    }
    if (digest.watch_worsening.operator_outliers?.length > 0) {
      lines.push(`  Operator Outliers:`);
      digest.watch_worsening.operator_outliers.slice(0, 2).forEach(o => {
        lines.push(`    - ${o.operator_email}: ${o.flagged_rate}% (avg ${o.vs_average}%)`);
      });
    }
    lines.push('');
  }
  
  if (digest.summary_metrics) {
    lines.push(`📊 SUMMARY`);
    lines.push(`  Total Offline: ${digest.summary_metrics.total_offline}`);
    lines.push(`  Flagged: ${digest.summary_metrics.total_flagged} (${digest.summary_metrics.flagged_rate}%)`);
    lines.push(`  Escalated: ${digest.summary_metrics.total_escalated} (${digest.summary_metrics.escalation_rate}%)`);
  }
  
  return lines.join('\n');
}

/**
 * Check if digest is critical (has urgent items)
 * @param {object} digest
 * @returns {boolean}
 */
export function isDigestCritical(digest) {
  return (
    (digest.critical_now?.overdue_flagged?.count || 0) > 0 ||
    (digest.critical_now?.abuse_escalations?.count || 0) > 0 ||
    (digest.watch_worsening?.escalation_rate_up === true)
  );
}