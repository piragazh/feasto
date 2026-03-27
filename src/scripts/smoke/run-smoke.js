#!/usr/bin/env node
/**
 * MealDrop Backend Smoke Test Runner
 * ====================================
 * Calls real deployed Base44 backend functions to verify live wiring.
 *
 * Usage:
 *   node scripts/smoke/run-smoke.js
 *   node scripts/smoke/run-smoke.js --only getManifest
 *   node scripts/smoke/run-smoke.js --only verifyAndCreateOrder
 *
 * Environment: Copy .env.smoke.example → .env.smoke and fill in values.
 * ⚠️  NEVER run --only verifyAndCreateOrder against production.
 */

import { loadEnv, printSummary, getResults } from './lib/runner.js';

// ── Suites ────────────────────────────────────────────────────────────────────
import { run as runGetManifest } from './suites/getManifest.smoke.js';
import { run as runAuditLog } from './suites/auditLog.smoke.js';
import { run as runValidateCoupon } from './suites/validateCouponUsage.smoke.js';
import { run as runPermissions } from './suites/enforceRestaurantPermissions.smoke.js';
import { run as runPaymentIntent } from './suites/createPaymentIntent.smoke.js';
import { run as runCreateOrder } from './suites/verifyAndCreateOrder.smoke.js';
import { run as runKioskCreateOrder } from './suites/kioskCreateOrder.smoke.js';
import { run as runOfflineSyncIdempotency } from './suites/offlineSyncIdempotency.smoke.js';
import { run as runLiveOrdersAccessControl } from './suites/liveOrdersAccessControl.smoke.js';
import { run as runKioskCardAuthTrust } from './suites/kioskCardAuthTrust.smoke.js';
import { run as runAssignOrderDriver } from './suites/assignOrderDriver.smoke.js';
import { run as runLiveOrdersKioskVisibility } from './suites/liveOrdersKioskVisibility.smoke.js';
import { run as runPromotionDiscountIntegrity } from './suites/promotionDiscountIntegrity.smoke.js';

const SUITES = {
    getManifest: runGetManifest,
    auditLog: runAuditLog,
    validateCouponUsage: runValidateCoupon,
    enforceRestaurantPermissions: runPermissions,
    createPaymentIntent: runPaymentIntent,
    verifyAndCreateOrder: runCreateOrder,
    kioskCreateOrder: runKioskCreateOrder,
    offlineSyncIdempotency: runOfflineSyncIdempotency,
    liveOrdersAccessControl: runLiveOrdersAccessControl,
    promotionDiscountIntegrity: runPromotionDiscountIntegrity,
    kioskCardAuthTrust: runKioskCardAuthTrust,
    assignOrderDriver: runAssignOrderDriver,
    liveOrdersKioskVisibility: runLiveOrdersKioskVisibility,
    promotionDiscountIntegrity: runPromotionDiscountIntegrity,
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);
    const onlyIdx = args.indexOf('--only');
    const onlyFilter = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

    const env = loadEnv();

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║         MealDrop Backend Smoke Tests                     ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`  Target: ${env.baseUrl}`);
    console.log(`  Admin token: ${env.adminToken ? '✅ set' : '⚠️  not set (auth tests will be limited)'}`);
    console.log(`  User token:  ${env.userToken ? '✅ set' : '⚠️  not set'}`);
    console.log(`  Restaurant:  ${env.restaurantId || '⚠️  not set (happy-path tests will be skipped)'}`);
    console.log(`  Coupon:      ${env.couponId || '⚠️  not set'}`);
    console.log(`  MenuItem:    ${env.menuItemId || '⚠️  not set'}`);

    if (onlyFilter) {
        console.log(`\n  Running: ${onlyFilter} only`);
    } else {
        console.log(`\n  Running: all suites`);
    }

    const suitesToRun = onlyFilter
        ? Object.entries(SUITES).filter(([name]) => name === onlyFilter)
        : Object.entries(SUITES);

    if (suitesToRun.length === 0) {
        console.error(`\n❌  Unknown suite: "${onlyFilter}"`);
        console.error(`   Available: ${Object.keys(SUITES).join(', ')}\n`);
        process.exit(1);
    }

    for (const [, runner] of suitesToRun) {
        await runner(env);
    }

    const failed = printSummary('Backend Smoke Tests');

    if (failed > 0) {
        console.log('⚠️  Some smoke tests failed. Check function deployment and fixture data.\n');
        process.exit(1);
    } else {
        console.log('✅  All smoke tests passed.\n');
        process.exit(0);
    }
}

main().catch(err => {
    console.error('\n❌  Smoke runner crashed:', err.message);
    process.exit(1);
});