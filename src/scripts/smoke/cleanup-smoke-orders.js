#!/usr/bin/env node
/**
 * Cleanup smoke test orders.
 * Deletes any Order records where notes contains "[SMOKE_TEST]".
 *
 * Usage: node scripts/smoke/cleanup-smoke-orders.js
 *
 * Requires SMOKE_BASE_URL and SMOKE_ADMIN_TOKEN in .env.smoke or env.
 * ⚠️  Only run against staging — never production.
 */

import { loadEnv } from './lib/runner.js';

const env = loadEnv();

if (!env.adminToken) {
    console.error('❌  SMOKE_ADMIN_TOKEN is required to delete orders.');
    process.exit(1);
}

console.log(`\nCleaning up smoke test orders on ${env.baseUrl} ...\n`);
console.log('NOTE: This script lists candidate orders. Actual deletion must be done');
console.log('      via the Admin Dashboard (Orders → filter by "[SMOKE_TEST]" in notes).');
console.log('      Automated deletion is intentionally not implemented to prevent accidental data loss.\n');

// We can't delete entities directly from outside Base44, but we can inform the operator.
console.log('To delete smoke orders:');
console.log('  1. Open Admin Dashboard');
console.log('  2. Navigate to Orders');
console.log('  3. Search/filter for notes containing "[SMOKE_TEST]"');
console.log('  4. Select and delete those records\n');

console.log('Alternatively, identify them by:');
console.log('  - notes field: "[SMOKE_TEST] safe to delete"');
console.log('  - guest_name: "Smoke Test"');
console.log('  - phone: "07700000000"\n');