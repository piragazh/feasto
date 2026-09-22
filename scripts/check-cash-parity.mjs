#!/usr/bin/env node
/**
 * check-cash-parity.mjs - the cash drawer arithmetic in posCashSession must
 * behave IDENTICALLY to the tested src/lib/pos-cash-logic.js.
 *
 * A variance report is an accusation. If the server copy drifts - off by tips,
 * change, or a split - it blames staff for money that was never missing. The
 * Vitest suite only covers the src/ copy, so this executes both side by side.
 */
import fs from 'node:fs';
import * as tested from '../src/lib/pos-cash-logic.js';

const src = fs.readFileSync(new URL('../base44/functions/posCashSession/entry.ts', import.meta.url), 'utf8');
const start = src.indexOf("const REVENUE_STATUSES");
const end = src.indexOf('async function verifyStaffSession');
if (start < 0 || end < 0) { console.error('posCashSession: cash logic mirror missing'); process.exit(1); }
const mirrored = new Function('const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;\n' +
  src.slice(start, end) + '\nreturn { cashTakenForOrder, expectedCash };')();

const statuses = ['collected', 'delivered', 'confirmed', 'cancelled', 'refunded', 'pending'];
const orders = [];
for (const status of statuses) {
  orders.push({ status, cash_amount: 13.49 });
  orders.push({ status, cash_amount: 10, card_amount: 20, total: 30 });
  orders.push({ status, cash_amount: 0, card_amount: 25 });
  orders.push({ status, cash_amount: 45 });
  orders.push({ status, payment_method: 'cash', total: 12, tip_amount: 1 });
  orders.push({ status, payment_method: 'cash', total: 30, notes: 'cash: £10.00, card: £20.00' });
  orders.push({ status, payment_method: 'card', total: 30 });
  orders.push({ status, cash_amount: null, payment_method: 'cash', total: 7.77 });
  orders.push({ status, cash_amount: 33.33 });
}

let checks = 0, mismatches = 0;
for (const o of orders) {
  checks++;
  const a = JSON.stringify(tested.cashTakenForOrder(o)), b = JSON.stringify(mirrored.cashTakenForOrder(o));
  if (a !== b) { mismatches++; console.log('  MISMATCH cashTakenForOrder', JSON.stringify(o), a, b); }
}
const movementSets = [[], [{ type: 'paid_in', amount: 50 }], [{ type: 'paid_out', amount: -10 }],
  [{ type: 'paid_in', amount: 20 }, { type: 'paid_out', amount: 7.5 }], [{ type: 'bogus', amount: 99 }]];
for (const float of [0, 100, 150.5])
  for (const movements of movementSets)
    for (let n = 0; n <= orders.length; n += 9) {
      checks++;
      const input = { openingFloat: float, orders: orders.slice(0, n), movements };
      const a = JSON.stringify(tested.expectedCash(input)), b = JSON.stringify(mirrored.expectedCash(input));
      if (a !== b) { mismatches++; console.log('  MISMATCH expectedCash float', float, 'n', n, a, b); }
    }
console.log(`${checks} cash comparisons: ${mismatches} mismatches`);
process.exit(mismatches ? 1 : 0);
