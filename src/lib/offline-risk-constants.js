/**
 * Offline Risk Monitoring — Canonical Thresholds & Labels
 * 
 * Single source of truth for thresholds, severity bands, and labels
 * used across all offline-risk views (SuperAdmin, Restaurant, Temporal, etc.)
 * 
 * Prevents drift: same metric, same threshold, everywhere.
 */

// ─────────────────────────────────────────────────────────────────
// OPERATIONAL THRESHOLDS
// ─────────────────────────────────────────────────────────────────

export const RISK_THRESHOLDS = {
  // Overdue: flagged orders older than this (minutes)
  OVERDUE_MINUTES: 240, // 4+ hours = critical

  // Operator outlier: minimum orders to be considered for analysis
  OPERATOR_MIN_VOLUME: 5,

  // Operator outlier: flagged rate must exceed avg by this many points
  OPERATOR_VS_AVERAGE_THRESHOLD: 10, // points above avg

  // Operator outlier: escalation rate above this is high-risk
  OPERATOR_HIGH_ESCALATION: 60, // % of their flagged orders

  // Escalation critical: % of flagged orders that are escalated
  ESCALATION_CRITICAL: 60, // % (also used in temporal + shift)

  // Flagged rate critical: % of all orders flagged
  FLAGGED_CRITICAL: 25, // %

  // Shift/temporal high flagged: % of orders in window
  WINDOW_HIGH_FLAGGED: 20, // %

  // Shift/temporal high escalation: % of flagged in window
  WINDOW_HIGH_ESCALATION: 60, // % (consistent with operator threshold)

  // Shift window: boundary clustering unusual above this %
  BOUNDARY_CONCENTRATION: 25, // % of orders within ±30 min of boundaries

  // Reason code concentration: dominance threshold
  REASON_CODE_CONCENTRATION: 70, // % of orders using single code

  // Unresolved backlog: count thresholds
  BACKLOG_HIGH_COUNT: 15,
  BACKLOG_MEDIUM_COUNT: 10,
  BACKLOG_LOW_COUNT: 5,

  // Unresolved backlog: age thresholds (hours)
  BACKLOG_HIGH_AGE: 48,
  BACKLOG_MEDIUM_AGE: 24,
  BACKLOG_LOW_AGE: 12,

  // Operator dominance in window: % of flagged orders
  WINDOW_OPERATOR_DOMINANCE: 50, // %

  // Abuse concentration
  ABUSE_ESCALATIONS_HIGH: 3,
  ABUSE_ESCALATIONS_MEDIUM: 2,

  // Manager/operator load imbalance
  MANAGER_LOAD_HIGH: 80, // % of reviews by top manager
  MANAGER_LOAD_MEDIUM: 70,

  // Documentation gap
  DOCUMENTATION_HIGH: 20, // <20% have notes
  DOCUMENTATION_MEDIUM: 40, // 20-40% have notes
};

// ─────────────────────────────────────────────────────────────────
// SEVERITY & STATUS BANDS
// ─────────────────────────────────────────────────────────────────

export const SEVERITY_BANDS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
};

export const STATUS_BANDS = {
  CRITICAL: 'critical',
  RISK: 'risk',
  WATCH: 'watch',
  OK: 'ok',
};

// ─────────────────────────────────────────────────────────────────
// SOURCE LABELS (UI indicators for data origin)
// ─────────────────────────────────────────────────────────────────

export const SOURCE_LABELS = {
  LIVE: 'live', // Real-time order queries
  SNAPSHOT: 'snapshot', // Latest digest snapshot
  DERIVED: 'derived', // Calculated from orders
  PROXY: 'proxy', // Estimated/proxy model (shift windows)
};

export const SOURCE_LABEL_DISPLAY = {
  live: '📊 Live Data',
  snapshot: '📸 Latest Snapshot',
  derived: '🔀 Derived',
  proxy: '📋 Estimated (Proxy)',
};

// ─────────────────────────────────────────────────────────────────
// SCOPE & VISIBILITY BOUNDARIES
// ─────────────────────────────────────────────────────────────────

export const SCOPE_TYPES = {
  PORTFOLIO: 'portfolio', // Cross-store (SuperAdmin only)
  RESTAURANT: 'restaurant', // Single restaurant (Manager/Admin)
  WINDOW: 'window', // Shift/temporal window
  OPERATOR: 'operator', // Single staff member
};

// ─────────────────────────────────────────────────────────────────
// REASON CODES (canonical list)
// ─────────────────────────────────────────────────────────────────

export const REASON_CODES = {
  // Offline sync issues
  PRICE_ADJUSTED_ON_SYNC: 'price_adjusted_on_sync',
  ACCEPTABLE_POLICY_OVERRIDE: 'acceptable_policy_override',

  // Operational
  CUSTOMER_ALREADY_SERVED: 'customer_already_served',
  MINOR_DISCREPANCY: 'minor_discrepancy',

  // Abuse-related (flagged for investigation)
  POTENTIAL_ABUSE: 'potential_abuse',
  LARGE_PRICE_MISMATCH: 'large_price_mismatch',
  REPEATED_OFFLINE_ISSUES: 'repeated_offline_issues',

  // Other
  NEEDS_REFUND_FOLLOWUP: 'needs_refund_followup',
  OTHER: 'other',
};

// Abuse-related codes (for abuse concentration detection)
export const ABUSE_REASON_CODES = [
  REASON_CODES.POTENTIAL_ABUSE,
  REASON_CODES.LARGE_PRICE_MISMATCH,
  REASON_CODES.REPEATED_OFFLINE_ISSUES,
];

// ─────────────────────────────────────────────────────────────────
// TEMPORAL BUCKETS (used in temporal-analytics)
// ─────────────────────────────────────────────────────────────────

export const DAYPARTS = {
  MORNING: 'morning', // 05:00–10:59
  LUNCH: 'lunch', // 11:00–13:59
  AFTERNOON: 'afternoon', // 14:00–16:59
  DINNER: 'dinner', // 17:00–21:59
  LATE: 'late', // 22:00–04:59
};

export const DAYPART_RANGES = {
  morning: { start: 5, end: 11 },
  lunch: { start: 11, end: 14 },
  afternoon: { start: 14, end: 17 },
  dinner: { start: 17, end: 22 },
  late: { start: 22, end: 5 }, // wraps around midnight
};

// ─────────────────────────────────────────────────────────────────
// FRESHNESS BANDS (for FreshnessIndicator)
// ─────────────────────────────────────────────────────────────────

export const FRESHNESS_BANDS = {
  FRESH: { minMinutes: 0, maxMinutes: 5, status: 'fresh', label: '🟢 Fresh' },
  AGING: { minMinutes: 5, maxMinutes: 15, status: 'aging', label: '🟡 Aging' },
  STALE: { minMinutes: 15, maxMinutes: Infinity, status: 'stale', label: '🔴 Stale' },
};

// ─────────────────────────────────────────────────────────────────
// ESCALATION RATE CALCULATION MODES
// ─────────────────────────────────────────────────────────────────

/**
 * Escalation rate can be calculated multiple ways depending on context.
 * This constant maps the calculation method for consistency.
 */
export const ESCALATION_CALCULATION = {
  // Method A: (escalated / flagged) × 100
  // Used: digest-logic, operator-outlier, most views
  // Meaning: Of the flagged orders, what % were escalated?
  PERCENT_OF_FLAGGED: 'percent_of_flagged',

  // Method B: (escalated / reviewed) × 100
  // Used: temporal-analytics per daypart
  // Meaning: Of the reviewed orders, what % were escalated?
  PERCENT_OF_REVIEWED: 'percent_of_reviewed',

  // Method C: (escalated / (flagged + escalated)) × 100
  // Used: temporal-analytics overall
  // Meaning: Of flagged+escalated, what % were escalated?
  PERCENT_OF_FLAGGED_AND_ESCALATED: 'percent_of_flagged_and_escalated',
};

// Default: use Method A unless context specifies otherwise
export const DEFAULT_ESCALATION_MODE = ESCALATION_CALCULATION.PERCENT_OF_FLAGGED;

// ─────────────────────────────────────────────────────────────────
// HELPER: Get freshness status
// ─────────────────────────────────────────────────────────────────

export function getFreshnessStatus(ageMinutes) {
  if (ageMinutes <= FRESHNESS_BANDS.FRESH.maxMinutes) {
    return FRESHNESS_BANDS.FRESH;
  }
  if (ageMinutes <= FRESHNESS_BANDS.AGING.maxMinutes) {
    return FRESHNESS_BANDS.AGING;
  }
  return FRESHNESS_BANDS.STALE;
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Get source label display text
// ─────────────────────────────────────────────────────────────────

export function getSourceLabelDisplay(source) {
  return SOURCE_LABEL_DISPLAY[source] || source;
}