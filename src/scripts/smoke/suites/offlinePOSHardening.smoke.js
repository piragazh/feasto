/**
/* eslint-disable no-undef */
 * Offline POS Hardening Smoke Tests
 * Verifies that offline mode enforces safe constraints and sync re-validates properly
 * 
 * Last reviewed: 2026-03-26
 * Status: New — covers hardened offline policy
 */

const SMOKE_BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:5173';

export const suite = {
    name: 'Offline POS Hardening',
    description: 'Verify offline POS mode blocks unsafe actions and sync re-validates orders',
    
    automated: [
        {
            name: 'offlineNoCoupon',
            description: 'Coupon dialog is disabled when offline; order created without coupon',
            steps: [
                'Go offline (unplug network or use devtools)',
                'Create a cart with items totaling £50',
                'Attempt to open coupon dialog on POSPayment screen',
                'Verify: dialog is blocked; message shows "Coupons unavailable offline"',
                'Complete full-price order',
                'Go back online',
                'Verify: order synced without coupon code'
            ],
            expected: 'Coupon dialog disabled; order created at full price (£50)'
        },
        {
            name: 'offlineDisabledWithFlag',
            description: 'Manual discounts blocked offline (safest option); or if allowed, flagged for review',
            steps: [
                'Go offline',
                'Create cart with items (£30)',
                'Attempt to apply manual discount',
                'Verify: discount button disabled OR shows warning "will be reviewed"',
                'If allowed: apply discount (£5), create order',
                'Go online',
                'Verify: order synced with needs_review=true if discount was applied'
            ],
            expected: 'Manual discounts either blocked OR flagged for review on sync'
        },
        {
            name: 'offlineFullPriceSync',
            description: 'Full-price offline orders sync without validation issues',
            steps: [
                'Go offline',
                'Create order: 2x Item (£10 each) = £20 total',
                'Pay cash, complete order',
                'Go online',
                'Verify: POSOfflineSyncBanner shows "syncing"',
                'Wait for sync to complete',
                'Verify: order appears in Order list with offline_created=true, needs_review=false'
            ],
            expected: 'Full-price order syncs successfully; offline_created=true'
        },
        {
            name: 'offlineSyncRevalidation',
            description: 'syncOfflineOrder re-validates discount server-side on sync',
            steps: [
                'Create offline order with manual discount (£5 off £40)',
                'Call syncOfflineOrder({ ...order, discount: 15, discount_reason_code: "test" })',
                'If caller is manager: verify discount is capped to £20 max',
                'If caller is admin: verify discount £15 accepted',
                'Verify: order persists with approved discount amount'
            ],
            expected: 'Discount re-validated; manager cap enforced; admin passes'
        },
        {
            name: 'offlineExpiredCouponRejected',
            description: 'If offline order contains expired coupon, sync re-validation rejects it',
            steps: [
                'Create expired coupon (valid_until: yesterday)',
                'Manually insert into offline order: { coupon_code: "EXPIRED" }',
                'Call syncOfflineOrder with this order',
                'Verify: coupon validation fails; order created with needs_review=true',
                'Verify: sync_validation_notes contains "has expired"'
            ],
            expected: 'Expired coupon rejected; needs_review=true; sync_validation_notes populated'
        },
        {
            name: 'offlineCouponUsageLimitEnforced',
            description: 'Sync re-validates per-customer coupon limit',
            steps: [
                'Create coupon with per_customer_limit=1',
                'Create offline order with phone number and this coupon',
                'Already have 1 existing order with same phone+coupon in database',
                'Call syncOfflineOrder',
                'Verify: coupon rejected due to per-customer limit',
                'Verify: needs_review=true; sync_validation_notes mentions limit'
            ],
            expected: 'Per-customer limit enforced on sync; order flagged'
        },
        {
            name: 'offlineMutualExclusionEnforced',
            description: 'Sync enforces coupon/discount mutual exclusion',
            steps: [
                'Create offline order with both discount=5 AND coupon_code="SAVE10"',
                'Call syncOfflineOrder',
                'Verify: both discounts accepted initially, then coupon removed',
                'Verify: order created with only manual discount (£5)',
                'Verify: sync_validation_notes mentions "Manual discount already applied; coupon removed"'
            ],
            expected: 'Coupon removed; manual discount kept; mutual exclusion enforced'
        },
        {
            name: 'offlinePriceRecomputed',
            description: 'Sync recomputes item prices from current menu',
            steps: [
                'Create menu item with price £10',
                'Create offline order with this item at £10',
                'Update menu item price to £12',
                'Call syncOfflineOrder',
                'Verify: order created with item.price=£12 (recomputed)',
                'Verify: total reflects new price'
            ],
            expected: 'Item prices recomputed from live menu; total updated'
        }
    ],

    manual: [
        {
            name: 'offlineUXWarning',
            description: 'UI clearly communicates offline constraints',
            steps: [
                'Disable WiFi or go offline in DevTools',
                'Navigate to POSDashboard',
                'Verify: WifiOff icon shown; banner says "OFFLINE MODE"',
                'Verify: coupon button disabled with explanation text',
                'Verify: discount button disabled with explanation text',
                'Verify: "Full-price orders sync automatically" message shown',
                'Go online',
                'Verify: offline banner dismisses; coupon/discount buttons re-enable'
            ],
            expected: 'Clear, prominent offline warnings; disabled UI elements'
        },
        {
            name: 'offlineAutoSync',
            description: 'Offline orders auto-sync when connection restores',
            steps: [
                'Go offline',
                'Create 3 full-price orders',
                'Verify: POSOfflineSyncBanner shows "3 changes queued"',
                'Go online',
                'Wait 2 seconds',
                'Verify: banner shows "Syncing..."',
                'Verify: banner clears after sync completes',
                'Verify: all 3 orders appear in Order list with offline_created=true'
            ],
            expected: 'Orders sync automatically; banner updates; offline metadata preserved'
        },
        {
            name: 'offlineFlaggedOrderAudit',
            description: 'Flagged offline orders appear in audit dashboard with reasons',
            steps: [
                'Go offline',
                'Apply manual discount offline (if allowed)',
                'Go online, sync',
                'Navigate to restaurant admin dashboard / audit log / offline reconciliation',
                'Verify: flagged order listed with "needs_review=true"',
                'Verify: sync_validation_notes visible (e.g., "Discount capped from £50 to £20")',
                'Click order',
                'Verify: offline_created_at, offline_synced_at shown'
            ],
            expected: 'Flagged orders appear in audit; validation reasons visible'
        },
        {
            name: 'offlineManagerThresholdCap',
            description: 'Manager discount threshold enforced on sync even if not enforced offline',
            steps: [
                'Login as manager',
                'Go offline',
                'Apply 50% discount offline (if UI allows; should be blocked)',
                'Go online, sync',
                'Verify: order created with discount capped to £20 or 20%',
                'Verify: sync_validation_notes mentions "capped"',
                'Verify: order flagged for review'
            ],
            expected: 'Manager threshold enforced on sync; discount capped; order flagged'
        },
        {
            name: 'offlineAdminCanApplyAnyDiscount',
            description: 'Admin user can apply any discount; no sync override needed',
            steps: [
                'Login as admin',
                'Go offline',
                'Apply 50% discount (if UI allows)',
                'Go online, sync',
                'Verify: order created with full 50% discount',
                'Verify: needs_review=false (no validation issues)',
                'Verify: no sync_validation_notes'
            ],
            expected: 'Admin discount accepted; no flagging needed'
        },
        {
            name: 'offlineSyncFailureHandling',
            description: 'Failed sync shows clear error; order remains pending',
            steps: [
                'Go offline',
                'Create order with invalid restaurant_id',
                'Go online, attempt sync',
                'Verify: sync fails with error message',
                'Verify: order remains in POSOfflineSyncBanner pending list',
                'Verify: toast shows "1 update failed to sync"',
                'User can retry sync manually via "Sync Now" button'
            ],
            expected: 'Failed orders retained; error communicated; retry available'
        }
    ],

    fixtures: {
        requiredData: [
            'Coupon entity with per_customer_limit set',
            'Expired coupon (valid_until: past date)',
            'MenuItem with editable price',
            'Manager and Admin user accounts'
        ],
        setup: 'Create test coupons and menu items per fixtures above',
        cleanup: 'Delete test coupons and orders created during tests'
    }
};

export default suite;