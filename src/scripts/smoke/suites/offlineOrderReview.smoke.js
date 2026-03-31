/* eslint-disable no-undef */
/**
 * Offline Order Review Workflow Smoke Tests
 * 
 * Verifies manager review actions for flagged offline orders:
 * - Authorization & tenant checks
 * - State transitions (new → acknowledged/resolved/escalated)
 * - Audit logging
 * - Dashboard visibility of unresolved count
 * 
 * Last reviewed: 2026-03-26
 * Status: New — complete workflow coverage
 */

const SMOKE_BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:5173';

export const suite = {
    name: 'Offline Order Review Workflow',
    description: 'Verify manager review actions, state transitions, and audit logging for flagged offline orders',
    
    automated: [
        {
            name: 'unauthorizedReviewBlocked',
            description: 'Non-manager user blocked from review action (403)',
            steps: [
                'Create flagged offline order',
                'Call offlineOrderReview as non-manager (regular user)',
                'Verify: 403 Forbidden "Access denied"',
                'Verify: order offline_review_status remains null'
            ],
            expected: 'Unauthorized user rejected; order not modified'
        },
        {
            name: 'acknowledgeNotesOptional',
            description: 'Acknowledge allows empty notes',
            steps: [
                'Create flagged offline order',
                'Manager calls offlineOrderReview with action="acknowledge", review_notes=""',
                'Verify: 200 success, offline_review_status="acknowledged"'
            ],
            expected: 'Acknowledge succeeds without notes'
        },
        {
            name: 'resolveRequiresNotes',
            description: 'Resolved action BLOCKED without notes',
            steps: [
                'Create flagged offline order',
                'Manager calls offlineOrderReview with action="resolved", review_notes=""',
                'Verify: 400 error "Notes are required"',
                'Verify: order offline_review_status remains "new"',
                'Call again with action="resolved", review_notes="acceptable"',
                'Verify: 200 success, offline_review_status="resolved"'
            ],
            expected: 'Resolved requires non-empty notes; empty rejected'
        },
        {
            name: 'escalateRequiresNotes',
            description: 'Escalated action BLOCKED without notes',
            steps: [
                'Create flagged offline order',
                'Manager calls offlineOrderReview with action="escalated", review_notes=""',
                'Verify: 400 error "Notes are required"',
                'Verify: order offline_review_status remains "new"',
                'Call again with action="escalated", review_notes="needs investigation"',
                'Verify: 200 success, offline_review_status="escalated"'
            ],
            expected: 'Escalated requires non-empty notes; empty rejected'
        },
        {
            name: 'overdueCalculation',
            description: 'Overdue flag calculated correctly (>4 hours)',
            steps: [
                'Create flagged offline order synced 2 hours ago',
                'Verify: was_overdue=false in audit log',
                'Create flagged offline order synced 5 hours ago',
                'Manager reviews it',
                'Verify: audit log shows was_overdue=true',
                'Verify: review_age_hours shows ~5'
            ],
            expected: 'Overdue properly calculated; audit captures it'
        },
        {
            name: 'onlyFlaggedOrdersReviewable',
            description: 'Cannot review non-flagged or non-offline orders',
            steps: [
                'Create online order (offline_created=false)',
                'Attempt review action',
                'Verify: 400 error "only flagged offline orders can be reviewed"',
                'Create offline order without flag (needs_review=false)',
                'Attempt review action',
                'Verify: 400 error'
            ],
            expected: 'Only flagged offline orders accepted for review'
        },
        {
            name: 'tenantScopeEnforced',
            description: 'Manager cannot review orders from restaurant they don\'t manage',
            steps: [
                'Manager A assigned to Restaurant X only',
                'Create flagged offline order for Restaurant Y',
                'Manager A calls offlineOrderReview for Restaurant Y order',
                'Verify: 403 Forbidden "Access denied"',
                'Verify: order offline_review_status unchanged'
            ],
            expected: 'Tenant scope enforced; cross-restaurant review blocked'
        },
        {
            name: 'reviewAuditLogged',
            description: 'Each review action logged to DashboardActivity',
            steps: [
                'Create flagged offline order',
                'Manager acknowledges with review_notes="test"',
                'Check DashboardActivity entity',
                'Verify: record with action="OFFLINE_ORDER_REVIEW"',
                'Verify: details include order_id, action, new_status, review_notes, sync_validation_notes'
            ],
            expected: 'Audit trail created for every review action'
        },
        {
            name: 'invalidActionRejected',
            description: 'Invalid action values rejected with 400',
            steps: [
                'Create flagged offline order',
                'Call offlineOrderReview with action="invalid_action"',
                'Verify: 400 error listing valid actions'
            ],
            expected: 'Invalid actions rejected; valid action list shown'
        },
        {
            name: 'unresolvedCountDashboard',
            description: 'Dashboard badge shows unresolved flagged orders',
            steps: [
                'Create 3 flagged offline orders',
                'Go to RestaurantDashboard',
                'Verify: Offline Orders section has badge="3"',
                'Manager acknowledges one order',
                'Wait for dashboard refresh',
                'Verify: badge now shows "2"'
            ],
            expected: 'Badge reflects count of unresolved (new) flagged orders'
        },
        {
            name: 'auditCapturesReviewAge',
            description: 'Audit log includes review age and overdue flag',
            steps: [
                'Create flagged order synced at T=0',
                'At T=5h, manager reviews it',
                'Query DashboardActivity for OFFLINE_ORDER_REVIEW action',
                'Verify: review_age_hours≈5',
                'Verify: was_overdue=true',
                'Verify: review_notes present (for resolved/escalated)'
            ],
            expected: 'Audit trail captures review timing and status'
        },
        {
            name: 'documentationQualityTracking',
            description: 'Dashboard shows % of orders with review notes',
            steps: [
                'Create 10 flagged orders',
                'Review 3 with notes, 2 without notes (acknowledge)',
                'Go to OfflineOrdersReview',
                'See stats showing "50% Documented" or similar',
                'Verify: count/total shown (e.g., 3/10)'
            ],
            expected: 'Documentation quality visible in stats'
        }
    ],

    manual: [
        {
            name: 'offlineOrderReviewUI',
            description: 'Review action buttons visible and functional in dashboard',
            steps: [
                'Create flagged offline order with sync_validation_notes',
                'Open RestaurantDashboard > Operations > Offline Orders',
                'Switch to "Pending Review" tab',
                'Verify: order card shows "Needs Review" badge',
                'Verify: sync_validation_notes visible (e.g., "discount capped")',
                'Verify: action buttons visible: Acknowledge, Resolved, Escalate',
                'Click "Acknowledge"',
                'Verify: dialog appears asking to confirm',
                'Add review notes (optional)',
                'Confirm',
                'Verify: button disabled during submission',
                'Verify: success toast shown',
                'Verify: card now shows "Review Status: acknowledged by [manager]"'
            ],
            expected: 'Full review workflow functional in UI'
        },
        {
            name: 'reviewStateTransitions',
            description: 'Review state transitions work correctly',
            steps: [
                'Create flagged offline order (status = "new")',
                'Click Acknowledge → status becomes "acknowledged"',
                'Verify: timestamp and manager email shown',
                'Create another flagged order',
                'Click Resolved → status becomes "resolved"',
                'Verify: notes (if any) shown below',
                'Create another flagged order',
                'Click Escalate → status becomes "escalated"',
                'Add note: "needs manager investigation"',
                'Verify: note appears in review details'
            ],
            expected: 'All three state transitions work and persist'
        },
        {
            name: 'unresolvedCountBadge',
            description: 'Dashboard sidebar shows unresolved count',
            steps: [
                'Create 5 flagged offline orders',
                'Go to RestaurantDashboard',
                'Check sidebar Operations section',
                'Verify: "Offline Orders" has red badge with count "5"',
                'Acknowledge 2 orders',
                'Wait for dashboard refresh (30s or manual refresh)',
                'Verify: badge updates to "3"',
                'Resolve remaining 3',
                'Verify: badge disappears or shows "0"'
            ],
            expected: 'Badge updates in real-time as orders reviewed'
        },
        {
            name: 'reviewFiltering',
            description: 'Dashboard tabs filter correctly by review status',
            steps: [
                'Create 2 flagged orders (unresolved)',
                'Acknowledge 1',
                'Go to Offline Orders dashboard',
                'Switch to "Pending Review" tab',
                'Verify: shows only 1 order (the unacknowledged one)',
                'Switch to "All Flagged" tab',
                'Verify: shows both orders (acknowledged + unreviewed)',
                'Switch to "All Offline" tab',
                'Verify: shows both + any non-flagged offline orders'
            ],
            expected: 'Tab filters work correctly for each status'
        },
        {
            name: 'reviewNotesCapture',
            description: 'Optional review notes capture manager reasoning',
            steps: [
                'Create flagged offline order with sync_validation_notes="discount capped to £20"',
                'Manager escalates with notes: "need to verify with customer why £50 was attempted"',
                'Save',
                'Refresh page',
                'Re-open order',
                'Verify: both sync_validation_notes AND offline_review_notes visible',
                'Understand: audit trail shows what sync flagged + what manager decided'
            ],
            expected: 'Review notes persist and provide context'
        },
        {
            name: 'auditTrailReview',
            description: 'Manager can view audit trail of review action',
            steps: [
                'Create flagged offline order',
                'Manager acknowledges with notes',
                'Go to admin/audit or DashboardActivity query',
                'Filter for action="OFFLINE_ORDER_REVIEW"',
                'Verify: audit record shows:',
                '  - order_id',
                '  - action taken (e.g., "acknowledge")',
                '  - new_status (e.g., "acknowledged")',
                '  - review_notes',
                '  - sync_validation_notes (original reason for flag)',
                '  - timestamp',
                '  - manager email'
            ],
            expected: 'Full audit trail available for compliance'
        }
    ],

    fixtures: {
        requiredData: [
            'Manager user account',
            'Restaurant with POS enabled',
            'Multiple flagged offline orders (created via syncOfflineOrder)'
        ],
        setup: 'Use syncOfflineOrder to create orders with needs_review=true; set offline_review_status=null initially',
        cleanup: 'Delete test offline orders after tests'
    }
};

export default suite;