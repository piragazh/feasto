/* eslint-disable no-undef */
/**
 * Offline Reconciliation Smoke Tests
 * 
 * Verifies explicit sync outcomes, manager visibility, retry safety,
 * and duplicate protection for offline POS orders.
 * 
 * Last reviewed: 2026-03-26
 * Status: New — covers hardened reconciliation workflow
 */

const SMOKE_BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:5173';

export const suite = {
    name: 'Offline Reconciliation',
    description: 'Verify offline sync outcomes, retry safety, manager visibility, and duplicate protection',
    
    automated: [
        {
            name: 'syncAcceptedOutcome',
            description: 'Valid offline order syncs successfully (SYNC_ACCEPTED)',
            steps: [
                'Go offline; create full-price order: 2 items = £20',
                'Pay cash; complete order',
                'Go online; sync triggers',
                'Verify: order appears in online Order list',
                'Verify: offline_created=true, offline_synced_at set',
                'Verify: needs_review=false (no validation issues)'
            ],
            expected: 'Order synced with offline metadata; needs_review=false'
        },
        {
            name: 'syncAcceptedNeedsReviewOutcome',
            description: 'Offline order with discount capped on sync (SYNC_ACCEPTED_NEEDS_REVIEW)',
            steps: [
                'Create manager account',
                'Go offline; create order with 50% discount applied (if UI allows)',
                'Go online; sync',
                'Verify: order created with synced discount £10 (capped from £20)',
                'Verify: offline_created=true',
                'Verify: needs_review=true',
                'Verify: sync_validation_notes contains "discount capped"'
            ],
            expected: 'Order created with capped discount; flagged for review'
        },
        {
            name: 'syncRejectedOutcome',
            description: 'Duplicate offline order rejected on sync (SYNC_REJECTED)',
            steps: [
                'Create offline order with offline_id="test_123"',
                'Go online; sync successfully',
                'Manually re-submit same offline_id',
                'Verify: second sync returns 409 (conflict) with isDuplicate=true',
                'Verify: no second order created'
            ],
            expected: 'Duplicate offline_id rejected with 409; idempotency enforced'
        },
        {
            name: 'syncFailureStoredLocally',
            description: 'Failed sync stores error locally; order remains pending',
            steps: [
                'Create offline order; intentionally cause sync error (e.g., invalid restaurant_id)',
                'Go online; attempt sync',
                'Verify: syncStatus="failed" stored in IndexedDB',
                'Verify: syncError contains error message',
                'Verify: syncAttempts incremented',
                'Verify: order remains in pending list for retry'
            ],
            expected: 'Sync failure stored locally; order pending retry; NOT auto-discarded'
        },
        {
            name: 'retryAfterFailure',
            description: 'Failed offline order can be retried manually',
            steps: [
                'Create offline order with failure (previous test)',
                'Fix underlying issue (e.g., use valid restaurant_id)',
                'Trigger "Retry Failed" in POSOfflineSyncBanner',
                'Verify: syncStatus transitions from "failed" to "synced"',
                'Verify: order created on server with correct data'
            ],
            expected: 'Retry succeeds; order synced with updated syncStatus'
        },
        {
            name: 'offlineDiscountFullyBlocked',
            description: 'Offline discounts are fully blocked (not capped)',
            steps: [
                'Go offline',
                'Create order with cart',
                'Attempt to apply manual discount',
                'Verify: discount button disabled with message "unavailable offline"',
                'Go online',
                'Verify: discount button re-enables'
            ],
            expected: 'Manual discounts fully blocked offline; unambiguous policy'
        },
        {
            name: 'offlineCouponBlocked',
            description: 'Offline coupons remain blocked entirely',
            steps: [
                'Go offline',
                'Create order; attempt to apply coupon',
                'Verify: coupon dialog disabled/hidden with message',
                'Verify: no way to apply coupon offline',
                'Go online',
                'Verify: coupon button re-enables'
            ],
            expected: 'Coupons fully blocked offline; policy enforced'
        },
        {
            name: 'flaggedOrderVisibility',
            description: 'Flagged offline orders visible in manager dashboard',
            steps: [
                'Create and sync offline order with validation issues (needs_review=true)',
                'Go to RestaurantDashboard > Operations > Offline Orders',
                'Verify: "Flagged" tab shows the order',
                'Verify: "Needs Review" badge visible',
                'Verify: sync_validation_notes displayed (e.g., "discount capped")',
                'Verify: offline_created_at and offline_synced_at timestamps shown'
            ],
            expected: 'Flagged orders visible to manager with full context'
        },
        {
            name: 'allOfflineOrdersVisible',
            description: 'Manager can view all offline-created orders',
            steps: [
                'Go to RestaurantDashboard > Operations > Offline Orders',
                'Click "All Offline" tab',
                'Verify: includes both flagged and non-flagged offline orders',
                'Verify: count matches total offline orders created',
                'Filter by offline_created=true'
            ],
            expected: 'All offline orders listed; comprehensive audit trail'
        },
        {
            name: 'syncOutcomeAudit',
            description: 'Sync outcomes logged with clear reason for each',
            steps: [
                'Sync multiple offline orders with different outcomes',
                'Review server logs for [OFFLINE-SYNC-BANNER] messages',
                'Verify: each order logged with outcome (ACCEPTED, FLAGGED, REJECTED)',
                'Verify: reason clearly stated (e.g., "discount capped", "duplicate")'
            ],
            expected: 'Each sync outcome logged with clear reason; audit trail complete'
        }
    ],

    manual: [
        {
            name: 'offlineUIBlocking',
            description: 'UI clearly communicates what is blocked offline',
            steps: [
                'Go offline',
                'View POSPayment screen',
                'Verify: offline banner shows "OFFLINE MODE"',
                'Verify: discount panel shows red message "unavailable offline"',
                'Verify: coupon button disabled with explanation',
                'Verify: staff understands they must use online for discounts/coupons',
                'Go online',
                'Verify: all buttons re-enable immediately'
            ],
            expected: 'Clear, unambiguous offline constraints visible to staff'
        },
        {
            name: 'managerReviewWorkflow',
            description: 'Manager can review and understand flagged offline orders',
            steps: [
                'Create multiple offline orders; some with validation issues',
                'Sync and go to Offline Orders dashboard',
                'Filter to "Flagged" orders',
                'For each flagged order:',
                '  - Read sync_validation_notes explaining why flagged',
                '  - Check offline_created_at / offline_synced_at to understand when',
                '  - Verify discount/coupon amounts match what was synced',
                'Understand: can review, track, and audit offline activity'
            ],
            expected: 'Manager can fully understand and review all flagged orders'
        },
        {
            name: 'retryUIExperience',
            description: 'Failed offline orders show retry button; clear failure reason',
            steps: [
                'Create offline order; force sync failure',
                'Go to POSOfflineSyncBanner',
                'Verify: failed order appears in "pending" list',
                'Verify: error message briefly shown (not hidden)',
                'Verify: "Retry Failed" button available',
                'Click retry after fixing issue',
                'Verify: order removes from pending; success message shown',
                'Verify: order appears in Order list'
            ],
            expected: 'Failed orders are never silently discarded; retry always available'
        },
        {
            name: 'offlineDiscountPolicy',
            description: 'Offline discount policy is fully blocked (not ambiguous)',
            steps: [
                'Review POSDiscountPanel source code / behavior',
                'Verify: isOffline prop blocks discount entirely',
                'Verify: no "blocked OR capped" ambiguity',
                'Verify: message: "Manual discounts unavailable offline"',
                'Confirm: policy is explicit and unambiguous'
            ],
            expected: 'Policy clearly blocks discounts (not conditionally capped)'
        },
        {
            name: 'idempotencyProtection',
            description: 'Offline order cannot be synced twice (duplicate detection)',
            steps: [
                'Manually construct two offline orders with same offline_id',
                'Submit first to syncOfflineOrder; succeeds',
                'Submit second with same offline_id within 5 seconds',
                'Verify: second returns 409 Conflict',
                'Verify: isDuplicate=true in response',
                'Verify: only one order created on server'
            ],
            expected: 'Duplicate offline_id rejected; idempotency enforced'
        },
        {
            name: 'syncOutcomeStates',
            description: 'Three explicit sync outcome states are implemented',
            steps: [
                'Test SYNC_ACCEPTED: valid full-price offline order',
                'Test SYNC_ACCEPTED_NEEDS_REVIEW: offline discount capped on sync',
                'Test SYNC_REJECTED: duplicate offline_id submission',
                'Verify: each outcome handled distinctly',
                'Verify: outcome recorded in Order entity (needs_review, sync_validation_notes)',
                'Verify: outcome logged clearly in server logs'
            ],
            expected: 'Three distinct sync outcomes implemented and trackable'
        }
    ],

    fixtures: {
        requiredData: [
            'Manager user account (role != admin)',
            'Restaurant configured for POS',
            'Menu items cached locally',
            'Valid restaurant_id'
        ],
        setup: 'Create test orders offline with various scenarios (full-price, discount-attempt, coupon-attempt, duplicate)',
        cleanup: 'Delete test offline orders and synced server orders after tests'
    }
};

export default suite;