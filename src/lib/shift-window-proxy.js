/**
 * Shift Window Proxy Analytics
 * 
 * Maps offline orders to estimated shift windows using:
 * - Restaurant opening_hours (HH:MM per day)
 * - Restaurant timezone (IANA identifier)
 * 
 * NO real staffing data. Estimated windows ONLY.
 * 
 * Windows:
 * - Morning: 05:00-12:00 (🌅)
 * - Afternoon: 12:00-17:00 (☀️)
 * - Evening: 17:00-22:00 (🍽️)
 * - Late: 22:00-05:00 (🌙)
 */

import { convertUtcToLocal, getRestaurantTimezone } from '@/lib/timezone-utils';

/**
 * Estimated shift windows (fixed, not from config)
 */
const SHIFT_WINDOWS = [
  { name: 'morning', label: '🌅 Morning', startHour: 5, endHour: 12 },
  { name: 'afternoon', label: '☀️ Afternoon', startHour: 12, endHour: 17 },
  { name: 'evening', label: '🍽️ Evening', startHour: 17, endHour: 22 },
  { name: 'late', label: '🌙 Late', startHour: 22, endHour: 5, wrapsMidnight: true }
];

/**
 * Map UTC timestamp to estimated shift window
 * 
 * @param {string|Date} utcTimestamp - ISO or Date
 * @param {object} restaurant - {timezone, opening_hours}
 * @returns {object} {window: 'morning'|'afternoon'|'evening'|'late', label, hour, boundary: {near, distance}}
 */
export function mapTimestampToEstimatedWindow(utcTimestamp, restaurant) {
  if (!utcTimestamp || !restaurant) {
    return null;
  }

  try {
    const timezone = getRestaurantTimezone(restaurant);
    const local = convertUtcToLocal(utcTimestamp, timezone);
    
    if (!local) return null;
    
    const hour = local.hour;
    
    // Find matching window
    let matchedWindow = null;
    
    for (const window of SHIFT_WINDOWS) {
      let inWindow = false;
      
      if (window.wrapsMidnight) {
        // Late window: 22:00-05:00 (wraps midnight)
        inWindow = hour >= window.startHour || hour < window.endHour;
      } else {
        // Normal windows
        inWindow = hour >= window.startHour && hour < window.endHour;
      }
      
      if (inWindow) {
        matchedWindow = window;
        break;
      }
    }
    
    if (!matchedWindow) {
      // Fallback to morning (shouldn't happen)
      matchedWindow = SHIFT_WINDOWS[0];
    }
    
    // Detect boundary closeness (±30 min)
    let boundaryInfo = { near: false, distance: null, type: null };
    
    if (matchedWindow.wrapsMidnight) {
      // Late window boundaries: 22:00 and 05:00
      const distTo22 = Math.abs(hour * 60 - (22 * 60));
      const distTo05 = Math.abs((hour + 24) * 60 - (5 * 60)) % (24 * 60);
      
      if (distTo22 <= 30 || distTo05 <= 30) {
        boundaryInfo.near = true;
        boundaryInfo.distance = Math.min(distTo22, distTo05);
        boundaryInfo.type = distTo22 < distTo05 ? 'evening_to_late' : 'late_to_morning';
      }
    } else {
      // Start and end boundaries
      const distToStart = Math.abs(hour * 60 - (matchedWindow.startHour * 60));
      const distToEnd = Math.abs(hour * 60 - (matchedWindow.endHour * 60));
      
      if (distToStart <= 30 || distToEnd <= 30) {
        boundaryInfo.near = true;
        boundaryInfo.distance = Math.min(distToStart, distToEnd);
        boundaryInfo.type = distToStart < distToEnd ? 'before_start' : 'before_end';
      }
    }
    
    return {
      window: matchedWindow.name,
      label: matchedWindow.label,
      hour,
      boundaryInfo
    };
  } catch (error) {
    console.error('[SHIFT-WINDOW] Mapping failed:', error);
    return null;
  }
}

/**
 * Calculate per-shift-window metrics
 * 
 * @param {string} restaurantId
 * @param {array} orders - offline orders
 * @param {object} restaurant - {timezone, opening_hours}
 * @returns {object} {morning: {...}, afternoon: {...}, evening: {...}, late: {...}}
 */
export function calculateShiftWindowMetrics(restaurantId, orders, restaurant) {
  const result = {};
  
  // Initialize all windows
  SHIFT_WINDOWS.forEach(w => {
    result[w.name] = {
      window: w.name,
      label: w.label,
      totalOrders: 0,
      flaggedCount: 0,
      flaggedRate: 0,
      escalatedCount: 0,
      escalationRate: 0,
      resolvedCount: 0,
      reasonCodes: {},
      operatorEmails: [],
      boundaryOrderCount: 0,
      operators: {} // {email: count}
    };
  });
  
  if (!orders || orders.length === 0) {
    return result;
  }
  
  const offlineOrders = orders.filter(o => o.offline_created);
  
  offlineOrders.forEach(order => {
    // Map to shift window
    const mapping = mapTimestampToEstimatedWindow(order.offline_synced_at, restaurant);
    
    if (!mapping) return;
    
    const windowKey = mapping.window;
    const window = result[windowKey];
    
    // Count total
    window.totalOrders++;
    
    // Count flagged
    if (order.needs_review) {
      window.flaggedCount++;
    }
    
    // Count escalated
    if (order.offline_review_status === 'escalated') {
      window.escalatedCount++;
    }
    
    // Count resolved
    if (order.offline_review_status === 'resolved') {
      window.resolvedCount++;
    }
    
    // Reason codes
    if (order.offline_review_reason_code) {
      window.reasonCodes[order.offline_review_reason_code] = 
        (window.reasonCodes[order.offline_review_reason_code] || 0) + 1;
    }
    
    // Track operators
    if (order.offline_created_by) {
      if (!window.operatorEmails.includes(order.offline_created_by)) {
        window.operatorEmails.push(order.offline_created_by);
      }
      window.operators[order.offline_created_by] = 
        (window.operators[order.offline_created_by] || 0) + 1;
    }
    
    // Boundary detection
    if (mapping.boundaryInfo?.near) {
      window.boundaryOrderCount++;
    }
  });
  
  // Calculate rates
  Object.values(result).forEach(window => {
    window.flaggedRate = window.totalOrders > 0
      ? Math.round((window.flaggedCount / window.totalOrders) * 100)
      : 0;
    
    window.escalationRate = window.flaggedCount > 0
      ? Math.round((window.escalatedCount / window.flaggedCount) * 100)
      : 0;
  });
  
  return result;
}

/**
 * Aggregate shift window metrics across restaurants
 * 
 * @param {object} windowsByRestaurant - {restaurantId: {morning: {...}, ...}}
 * @returns {object} aggregated metrics
 */
export function aggregateShiftWindowMetrics(windowsByRestaurant) {
  const result = {};
  
  // Initialize
  SHIFT_WINDOWS.forEach(w => {
    result[w.name] = {
      window: w.name,
      label: w.label,
      totalOrders: 0,
      flaggedCount: 0,
      flaggedRate: 0,
      escalatedCount: 0,
      escalationRate: 0,
      resolvedCount: 0,
      reasonCodes: {},
      restaurantCount: 0,
      boundaryOrderCount: 0
    };
  });
  
  Object.values(windowsByRestaurant).forEach(restaurantWindows => {
    Object.entries(restaurantWindows).forEach(([windowKey, window]) => {
      const agg = result[windowKey];
      
      if (window.totalOrders > 0) {
        agg.totalOrders += window.totalOrders;
        agg.flaggedCount += window.flaggedCount;
        agg.escalatedCount += window.escalatedCount;
        agg.resolvedCount += window.resolvedCount;
        agg.boundaryOrderCount += window.boundaryOrderCount;
        agg.restaurantCount++;
        
        // Merge reason codes
        Object.entries(window.reasonCodes).forEach(([code, count]) => {
          agg.reasonCodes[code] = (agg.reasonCodes[code] || 0) + count;
        });
      }
    });
  });
  
  // Recalculate rates
  Object.values(result).forEach(window => {
    window.flaggedRate = window.totalOrders > 0
      ? Math.round((window.flaggedCount / window.totalOrders) * 100)
      : 0;
    
    window.escalationRate = window.flaggedCount > 0
      ? Math.round((window.escalatedCount / window.flaggedCount) * 100)
      : 0;
  });
  
  return result;
}

/**
 * Get baseline flagged rate across all windows
 * @param {object} aggregatedMetrics
 * @returns {number} average %
 */
export function getAverageFlaggedRate(aggregatedMetrics) {
  const windows = Object.values(aggregatedMetrics);
  const totalOrders = windows.reduce((sum, w) => sum + w.totalOrders, 0);
  const totalFlagged = windows.reduce((sum, w) => sum + w.flaggedCount, 0);
  
  return totalOrders > 0
    ? Math.round((totalFlagged / totalOrders) * 100)
    : 0;
}

/**
 * Get window labels for UI display
 * @returns {array} shift windows with labels
 */
export function getShiftWindowsForDisplay() {
  return SHIFT_WINDOWS.map(w => ({
    key: w.name,
    label: w.label
  }));
}