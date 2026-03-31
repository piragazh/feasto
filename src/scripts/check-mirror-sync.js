#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * scripts/check-mirror-sync.js
 * =============================
 * Drift-protection for the mirror pattern between src/lib/order-logic.js
 * and the Deno handlers that inline the same pure functions.
 *
 * Strategy (Option A + lightweight Option C hybrid):
 *   1. Extract the canonical function signatures from src/lib/order-logic.js
 *   2. Verify that each mirrored handler contains a matching implementation
 *   3. Warn loudly (and fail CI) if a function exists in the lib but is
 *      ABSENT from the expected handler — which likely means a new function
 *      was added to the lib without being synced to the handler.
 *
 * This is intentionally SIMPLE: it checks for the presence of the mirror
 * marker comments + function names, not byte-for-byte equality
 * (which would create false positives from formatting differences).
 *
 * Run:  node scripts/check-mirror-sync.js
 * Exit: 0 = all synced, 1 = drift detected
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// ── Source of truth ───────────────────────────────────────────────────────────
const LIB_FILE = 'src/lib/order-logic.js';

// Each entry describes one exported pure function and which handler(s) must
// contain a "Mirrors order-logic.js: <name>" comment to prove it is synced.
const MIRROR_MAP = [
    {
        fn: 'recomputeSubtotal',
        handlers: ['functions/verifyAndCreateOrder'],
    },
    {
        fn: 'computeAndVerifyTotal',
        handlers: ['functions/verifyAndCreateOrder'],
    },
    {
        fn: 'validateCoupon',
        handlers: ['functions/verifyAndCreateOrder'],
    },
    {
        fn: 'capPromotionDiscount',
        handlers: ['functions/verifyAndCreateOrder'],
    },
    {
        fn: 'basketFingerprint',
        handlers: ['functions/orderVelocityThrottle'],
    },
    {
        fn: 'checkPerUserBurst',
        handlers: ['functions/orderVelocityThrottle', 'functions/enforceRateLimiting'],
    },
    {
        fn: 'checkPlatformBurst',
        handlers: ['functions/orderVelocityThrottle'],
    },
];

// ── Checks ────────────────────────────────────────────────────────────────────

let libSource;
try {
    libSource = read(LIB_FILE);
} catch (e) {
    console.error(`✗ Could not read ${LIB_FILE}: ${e.message}`);
    process.exit(1);
}

let failures = 0;
const results = [];

for (const { fn, handlers } of MIRROR_MAP) {
    // 1. Verify the function is exported from the lib
    const exportedInLib = libSource.includes(`export function ${fn}(`);
    if (!exportedInLib) {
        results.push({ status: 'MISSING_IN_LIB', fn, file: LIB_FILE });
        failures++;
        continue;
    }

    // 2. Verify each handler has the sync marker comment
    for (const handlerPath of handlers) {
        let handlerSource;
        try {
            handlerSource = read(handlerPath);
        } catch (e) {
            results.push({ status: 'HANDLER_NOT_FOUND', fn, file: handlerPath });
            failures++;
            continue;
        }

        // The sync marker comment we require in each handler
        const marker = `Mirrors order-logic.js: ${fn}`;
        const hasMarker = handlerSource.includes(marker);

        // Also verify the function implementation body is present
        const hasFn = handlerSource.includes(`function ${fn}(`);

        if (!hasMarker || !hasFn) {
            results.push({ status: 'NOT_SYNCED', fn, file: handlerPath, hasMarker, hasFn });
            failures++;
        } else {
            results.push({ status: 'OK', fn, file: handlerPath });
        }
    }
}

// ── Report ────────────────────────────────────────────────────────────────────

const width = 70;
console.log('\n' + '─'.repeat(width));
console.log('  Mirror Sync Check — src/lib/order-logic.js ↔ Deno handlers');
console.log('─'.repeat(width));

for (const r of results) {
    if (r.status === 'OK') {
        console.log(`  ✓  ${r.fn.padEnd(26)} ${r.file}`);
    } else if (r.status === 'MISSING_IN_LIB') {
        console.log(`  ✗  ${r.fn.padEnd(26)} NOT FOUND IN ${LIB_FILE}`);
    } else if (r.status === 'HANDLER_NOT_FOUND') {
        console.log(`  ✗  ${r.fn.padEnd(26)} HANDLER FILE MISSING: ${r.file}`);
    } else if (r.status === 'NOT_SYNCED') {
        const detail = !r.hasFn
            ? 'function body missing in handler'
            : 'sync marker comment missing in handler';
        console.log(`  ✗  ${r.fn.padEnd(26)} DRIFT DETECTED in ${r.file}`);
        console.log(`     └─ ${detail}`);
        console.log(`     └─ Add comment: /** ${`Mirrors order-logic.js: ${r.fn}`} */`);
    }
}

console.log('─'.repeat(width));

if (failures === 0) {
    console.log(`  ✓  All ${results.length} mirrors in sync.\n`);
    process.exit(0);
} else {
    console.log(`  ✗  ${failures} sync issue(s) detected — see above.\n`);
    console.log('  REQUIRED ACTION:');
    console.log('    When changing a function in src/lib/order-logic.js, you MUST');
    console.log('    apply the same change to the mirrored copy in each handler.');
    console.log('    Then add/update the "Mirrors order-logic.js: <fn>" comment.\n');
    process.exit(1);
}