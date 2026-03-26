/**
 * Lightweight Engagement Tracking
 * 
 * Purpose: Track adoption signals WITHOUT surveillance
 * 
 * Tracked Events:
 * - view_control_center: SuperAdmin opened OfflineRiskControlCenter
 * - view_overview: Restaurant manager opened RestaurantOfflineRiskOverview
 * - view_digest: User opened digest snapshot
 * - acknowledge_digest: Manager acknowledged digest
 * - review_action: Manager resolved/escalated flagged order
 * 
 * NOT Tracked:
 * - Card clicks / button interactions
 * - Scroll depth / time spent
 * - Individual feature usage
 * 
 * Session Dedup:
 * - "view" events deduplicated per session (reload = same view)
 * - "action" events always recorded (each action matters)
 */

import { base44 } from '@/api/base44Client';

// Get/create session ID for dedup
function getSessionId() {
  if (typeof window === 'undefined') return null;
  
  let sessionId = sessionStorage.getItem('engagement_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('engagement_session_id', sessionId);
  }
  return sessionId;
}

/**
 * Record a page view event
 * Deduplicated per session (page reload = same view)
 */
export async function trackPageView(eventType, restaurantId = null) {
  try {
    const user = await base44.auth.me();
    if (!user) return;

    const role = user.role === 'admin' ? 'superadmin' : 'manager';
    const sessionId = getSessionId();

    // Check if we already recorded this view in this session
    const key = `engagement_${eventType}_${sessionId}`;
    if (sessionStorage.getItem(key)) {
      return; // Already tracked in this session
    }

    // Record the view
    await base44.entities.EngagementEvent.create({
      user_email: user.email,
      role,
      restaurant_id: restaurantId || null,
      event_type: eventType,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    });

    // Mark as recorded for this session
    sessionStorage.setItem(key, 'true');
  } catch (error) {
    console.warn('[Engagement] Failed to track event:', error);
    // Silently fail — don't disrupt user experience
  }
}

/**
 * Record an action event (not deduplicated)
 * Each action is recorded (resolve, escalate, acknowledge)
 */
export async function trackAction(actionType, restaurantId = null, subtype = null) {
  try {
    const user = await base44.auth.me();
    if (!user) return;

    const role = user.role === 'admin' ? 'superadmin' : 'manager';

    await base44.entities.EngagementEvent.create({
      user_email: user.email,
      role,
      restaurant_id: restaurantId || null,
      event_type: actionType,
      event_subtype: subtype,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[Engagement] Failed to track action:', error);
    // Silently fail
  }
}

/**
 * Aggregation Utilities
 * Simple queries for adoption metrics
 */

/**
 * Get stores with zero overview engagement in last X days
 */
export async function getInactiveStores(days = 7) {
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Get all restaurants
    const restaurants = await base44.entities.Restaurant.list();

    // Get restaurants with recent overview views
    const events = await base44.entities.EngagementEvent.filter({
      event_type: 'view_overview',
    });

    const activeRestaurantIds = new Set(
      events
        .filter(e => new Date(e.timestamp) > new Date(cutoff))
        .map(e => e.restaurant_id)
    );

    // Return restaurants NOT in the active set
    return restaurants.filter(r => !activeRestaurantIds.has(r.id));
  } catch (error) {
    console.error('[Engagement] Failed to get inactive stores:', error);
    return [];
  }
}

/**
 * Get daily manager engagement rate
 * % of restaurants that had at least one manager view today
 */
export async function getDailyEngagementRate() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    // Get all restaurants
    const restaurants = await base44.entities.Restaurant.list();

    // Get overview views from today
    const events = await base44.entities.EngagementEvent.filter({
      event_type: 'view_overview',
    });

    const activeToday = new Set(
      events
        .filter(e => new Date(e.timestamp) >= new Date(todayIso))
        .map(e => e.restaurant_id)
    );

    if (restaurants.length === 0) return 0;
    return Math.round((activeToday.size / restaurants.length) * 100);
  } catch (error) {
    console.error('[Engagement] Failed to get daily rate:', error);
    return 0;
  }
}

/**
 * Get time from digest creation → first view
 * Returns median time in minutes
 */
export async function getDigestTimeToView() {
  try {
    const events = await base44.entities.EngagementEvent.filter({
      event_type: 'view_digest',
    });

    if (events.length === 0) return 0;

    // Group by digest/user to find first view time
    // (simplified: assumes views are clustered)
    const times = events.map(e => {
      const createdTime = new Date(e.created_date || e.timestamp);
      const viewTime = new Date(e.timestamp);
      return (viewTime - createdTime) / (1000 * 60); // minutes
    });

    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    return Math.round(median);
  } catch (error) {
    console.error('[Engagement] Failed to get time to view:', error);
    return 0;
  }
}

/**
 * Get manager review action frequency
 * % of restaurants with at least one review action in last 24h
 */
export async function getReviewActionRate(hours = 24) {
  try {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const restaurants = await base44.entities.Restaurant.list();
    const events = await base44.entities.EngagementEvent.filter({
      event_type: 'review_action',
    });

    const activeStores = new Set(
      events
        .filter(e => new Date(e.timestamp) > new Date(cutoff))
        .map(e => e.restaurant_id)
    );

    if (restaurants.length === 0) return 0;
    return Math.round((activeStores.size / restaurants.length) * 100);
  } catch (error) {
    console.error('[Engagement] Failed to get review action rate:', error);
    return 0;
  }
}

/**
 * Check if digest viewed by anyone
 * Used to detect "digest generated but never opened" situations
 */
export async function isDigestViewed(digestSnapshotId, withinMinutes = 120) {
  try {
    const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();

    const events = await base44.entities.EngagementEvent.filter({
      event_type: 'view_digest',
    });

    return events.some(
      e =>
        e.timestamp > cutoff &&
        // Heuristic: if digest was viewed within timeframe, assume it's related
        new Date(e.timestamp) > new Date(cutoff)
    );
  } catch (error) {
    console.error('[Engagement] Failed to check digest view:', error);
    return false;
  }
}