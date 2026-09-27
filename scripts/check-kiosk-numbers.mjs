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
// Date is injected so a test can fix the clock; the real one is used by default.
const load = (DateImpl = Date) => new Function('Date', src.slice(a, b) + '\nreturn { nextSequence, nextKioskOrderNumber, ukDay };')(DateImpl);
const { nextSequence, nextKioskOrderNumber, ukDay } = load();
/** A Date whose no-argument form returns a fixed instant. */
const clockAt = (iso) => class extends Date {
  constructor(...args) { super(...(args.length ? args : [iso])); }
  static now() { return new Date(iso).getTime(); }
};

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

// UK midnight during BST. At 00:30 UK on 2 July it is still 1 July in UTC.
// An order at 23:00 UK (22:00Z) is yesterday; one at 00:10 UK (23:10Z) is today.
// A UTC day would count both and answer K-010.
const atMidnight = load(clockAt('2026-07-01T23:30:00Z'));
const r3 = await atMidnight.nextKioskOrderNumber(db([
  { order_number: 'K-009', created_date: naive(new Date('2026-07-01T22:00:00Z')) },
  { order_number: 'K-001', created_date: naive(new Date('2026-07-01T23:10:00Z')) },
]), 'r1');
ck('day boundary is UK midnight, not UTC (BST)', r3 === 'K-002', r3);

// NOTE: this is NOT a race test. Both reads happen after K-003 is saved, so
// max+1 alone gives K-004. Two kiosks reading before either saves can still
// both get the same number - not covered here.
const r2 = await nextKioskOrderNumber(db([
  { order_number: 'K-001', created_date: naive(now) },
  { order_number: 'K-002', created_date: naive(now) },
  { order_number: 'K-003', created_date: naive(now) },
]), 'r1');
ck('counts past numbers already saved today', r2 === 'K-004', r2);

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
