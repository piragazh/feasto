#!/usr/bin/env node
/**
 * check-kiosk-numbers.mjs - kiosk order numbers from the REAL kioskCreateOrder.
 *
 * They were random (K-1000..9999, no uniqueness check): ~89% chance of a shared
 * number at 200 orders a day, and with no receipt printer the on-screen number
 * is the customer's only record. Now sequential per UK day, checked for clashes.
 */
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../base44/functions/kioskCreateOrder/entry.ts', import.meta.url), 'utf8');
const a = src.indexOf('/** Today\'s date in the UK'), b = src.indexOf('Deno.serve(');
const { nextSequence, nextKioskOrderNumber, ukDay } = new Function(src.slice(a, b) + '\nreturn { nextSequence, nextKioskOrderNumber, ukDay };')();

const naive = (d) => d.toISOString().replace('Z', '').replace(/(\.\d{3})$/, '$1000');
const db = (orders) => ({ asServiceRole: { entities: { Order: { filter: async () => orders } } } });
const checks = []; const ck = (l, ok, d) => { checks.push(ok); console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${l.padEnd(56)} ${d}`); };

ck('the first order of the day is K-001', nextSequence([]) === 'K-001', nextSequence([]));
ck('then it counts up', nextSequence(['K-001', 'K-002']) === 'K-003', nextSequence(['K-001', 'K-002']));
ck('gaps do not cause reuse', nextSequence(['K-001', 'K-007']) === 'K-008', nextSequence(['K-001', 'K-007']));
ck('old random numbers do not jump the count to thousands', nextSequence(['K-4821', 'K-002']) === 'K-003', nextSequence(['K-4821', 'K-002']));

const now = new Date();
const yesterday = new Date(now.getTime() - 26 * 3600e3);
const r1 = await nextKioskOrderNumber(db([
  { order_number: 'K-015', created_date: naive(yesterday) },
  { order_number: 'K-002', created_date: naive(now) },
]), 'r1');
ck('restarts each UK day - yesterday\'s numbers ignored', r1 === 'K-003', r1);

// Two kiosks placing at once: both computed K-003, one already saved it.
const r2 = await nextKioskOrderNumber(db([
  { order_number: 'K-001', created_date: naive(now) },
  { order_number: 'K-002', created_date: naive(now) },
  { order_number: 'K-003', created_date: naive(now) },
]), 'r1');
ck('never reuses a number already taken today', r2 === 'K-004', r2);

// 200 orders in a day: all distinct.
let orders = [], clash = false;
for (let i = 0; i < 200; i++) {
  const n = await nextKioskOrderNumber(db(orders), 'r1');
  if (orders.some(o => o.order_number === n)) clash = true;
  orders = [{ order_number: n, created_date: naive(now) }, ...orders];
}
ck('REGRESSION GUARD: 200 orders in a day, no two share a number', !clash && new Set(orders.map(o => o.order_number)).size === 200, `last: ${orders[0].order_number}`);

const good = checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good === checks.length ? 0 : 1);
