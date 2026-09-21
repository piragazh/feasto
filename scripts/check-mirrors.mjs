#!/usr/bin/env node
/**
 * check-mirrors.mjs — guard against mirrored-logic drift
 *
 * WHY THIS EXISTS
 *   Base44 functions are self-contained: they cannot import from src/. So the
 *   money rules in src/lib/pos-money-logic.js are duplicated by hand inside the
 *   Deno handlers, and the Vitest suite only tests the src/ copy.
 *
 *   That leaves a gap the tests cannot see. It has already bitten once:
 *   posCreateOrder was fixed to treat a null payment_method as 'pending_payment',
 *   syncOfflineOrder was not, and an unpaid table order sent while OFFLINE synced
 *   back marked as PAID. Every test stayed green throughout, because the drifted
 *   copy was never under test.
 *
 * WHAT THIS DOES
 *   Asserts that each mirrored rule is still present in the handler that is
 *   supposed to carry it. It is a smoke check on the SYNC RULE comments, not a
 *   semantic proof - it catches "someone edited one copy and not the other",
 *   which is the failure that actually happens.
 *
 * Run: npm run check:mirrors   (or as part of npm run preflight)
 */

import fs from 'node:fs';

/**
 * Read a file with COMMENTS STRIPPED.
 *
 * Every rule below is documented in a comment next to the code that implements
 * it - which means a naive substring search passes even when the code is gone
 * and only the comment remains. Caught during development: deleting the
 * skipOrderCreation prop still passed, because the comment above it explains
 * why the prop matters.
 *
 * Crude but sufficient: this is a smoke check, not a parser.
 */
const read = (p) => {
    let src;
    try { src = fs.readFileSync(p, 'utf8'); }
    catch { return null; }
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments, incl. JSX {/* ... */}
        .replace(/^\s*\/\/.*$/gm, '');        // whole-line // comments
};

/**
 * Each check names the rule, the file that must carry it, and a fragment that
 * proves the rule is present. Fragments are chosen to be the DISTINCTIVE part of
 * the rule - the branch that was missing when it drifted - not boilerplate.
 */
const CHECKS = [
    {
        rule: 'derivePaymentStatus — null tender must stay pending',
        file: 'base44/functions/posCreateOrder/entry.ts',
        mustContain: "'pending_payment'",
        why: 'A cart sent to a table has no tender; recording it as paid lets the bill be closed with nobody having paid.',
    },
    {
        rule: 'derivePaymentStatus — null tender must stay pending (offline sync)',
        file: 'base44/functions/syncOfflineOrder/entry.ts',
        mustContain: "'pending_payment'",
        why: 'This copy drifted once already: offline table sends synced back as payment_confirmed.',
    },
    {
        rule: 'resolvePaymentMethod — null must not become cash',
        file: 'base44/functions/posCreateOrder/entry.ts',
        mustContain: 'orderData.payment_method ?? undefined',
        why: "`|| 'cash'` turns an unpaid table order into a recorded cash sale.",
    },
    {
        rule: 'approveDiscount — over-limit rejects, never silently zeroes',
        file: 'base44/functions/posCreateOrder/entry.ts',
        // The distinctive part is that it RETURNS rather than zeroing and
        // carrying on. 'The order has not been placed' is the wording that
        // proves the reject path, not the silent-zero path, is in place.
        mustContain: 'The order has not been placed',
        why: 'Zeroing charges the customer full price after staff quoted them less.',
    },
    {
        rule: 'REVENUE_STATUSES — Reports excludes cancelled/refunded',
        file: 'src/components/pos/POSReports.jsx',
        mustContain: 'REVENUE_STATUSES',
        why: 'Reports once summed every order, disagreeing with End of Day on the same day.',
    },
    {
        rule: 'REVENUE_STATUSES — End of Day counts deliveries in flight',
        file: 'src/components/pos/POSEndOfDay.jsx',
        mustContain: "'out_for_delivery'",
        why: 'Omitting it under-reports the day until drivers mark orders delivered.',
    },
    {
        rule: 'quickCashOptions — never offers less than owed',
        file: 'src/components/pos/POSPayment.jsx',
        mustContain: 'filter(v => v > owed)',
        why: 'A quick-cash button below the bill produces a short payment.',
    },
    {
        rule: 'canCompleteOrder — unpaid dine-in cannot be closed (Queue)',
        file: 'src/components/pos/POSOrderQueue.jsx',
        mustContain: 'isUnpaidDineIn',
        why: 'Closing an unpaid table frees it and leaves the food paid for by nobody.',
    },
    {
        rule: 'canCompleteOrder — unpaid dine-in cannot be closed (KDS)',
        file: 'src/components/kds/KitchenDisplaySystem.jsx',
        mustContain: 'unpaidDineIn',
        why: 'Same rule, second entry point.',
    },
    {
        rule: 'validateTip — tip rejected server-side when larger than the bill',
        file: 'base44/functions/posCreateOrder/entry.ts',
        mustContain: 'The tip is larger than the bill',
        why: 'Without server validation a crafted request could record an arbitrary tip.',
    },
    {
        rule: 'Tips are not revenue — change uses amountDue, not the order total',
        file: 'src/components/pos/POSPayment.jsx',
        mustContain: 'totalPaid - amountDue',
        why: 'Using effectiveTotal would hand the tip straight back to the customer as change.',
    },
    {
        rule: 'posCreateOrder reads the menu and refuses underpriced lines',
        file: 'base44/functions/posCreateOrder/entry.ts',
        mustContain: 'claimed + 0.005 < floor',
        why: 'It used client prices as-is for its whole history - any modified request could ring any item at any price.',
    },
    {
        rule: 'Table payment settles existing orders, never creates a duplicate',
        file: 'src/components/pos/POSTablesView.jsx',
        mustContain: 'skipOrderCreation',
        why: 'Without it every table payment created a second order and double-counted revenue.',
    },
];

let failed = 0;
const missingFiles = [];

for (const check of CHECKS) {
    const src = read(check.file);
    if (src === null) {
        missingFiles.push(check.file);
        console.error(`✗ ${check.rule}\n    FILE NOT FOUND: ${check.file}`);
        failed++;
        continue;
    }
    if (!src.includes(check.mustContain)) {
        console.error(`✗ ${check.rule}`);
        console.error(`    file:     ${check.file}`);
        console.error(`    expected: ${check.mustContain}`);
        console.error(`    why:      ${check.why}`);
        failed++;
    }
}

if (failed > 0) {
    console.error(`\n${failed} mirrored rule(s) missing or drifted.`);
    console.error('A money rule was changed in one place and not the other, or a file was reverted.');
    console.error('The Vitest suite will NOT catch this — it only tests src/lib/pos-money-logic.js.\n');
    process.exit(1);
}

console.log(`✓ all ${CHECKS.length} mirrored money rules present`);
