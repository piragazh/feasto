#!/usr/bin/env node
/**
 * check-coupon-dates.mjs - a coupon date a person typed means a whole UK day.
 * The rule lives in four places (library, checkout, verifyAndCreateOrder,
 * posValidateCoupon) and they must agree EXACTLY: if the checkout is ever more
 * generous than the server, a customer is charged and then refused.
 */
import fs from 'node:fs';
import * as lib from '../src/lib/order-logic.js';

const load = (file) => {
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('const DATE_ONLY =');
  // The helper block ends at validateCoupon where there is one; posValidateCoupon
  // validates inline, so its block ends at the request handler instead.
  const ends = ['function validateCoupon(', 'Deno.serve(']
    .map(marker => src.indexOf(marker, start)).filter(i => i > 0);
  const end = ends.length ? Math.min(...ends) : -1;
  if (start < 0 || end < 0) { throw new Error(`${file}: coupon date helpers missing`); }
  return new Function(src.slice(start, end) + '\nreturn { couponValidFromInstant, couponValidUntilInstant };')();
};
const copies = {
  verifyAndCreateOrder: load(new URL('../base44/functions/verifyAndCreateOrder/entry.ts', import.meta.url)),
  posValidateCoupon: load(new URL('../base44/functions/posValidateCoupon/entry.ts', import.meta.url)),
};

const dates = [];
for (const d of ['2026-01-01','2026-03-28','2026-03-29','2026-03-30','2026-06-15','2026-09-22','2026-10-06',
                 '2026-10-24','2026-10-25','2026-10-26','2026-12-31','2027-02-28']) dates.push(d);
const other = ['2026-10-06T12:00:00Z', '2026-10-06T12:00:00+01:00', '', null];

let checks = 0, bad = 0;
for (const [name, c] of Object.entries(copies)) {
  for (const d of [...dates, ...other]) {
    for (const fn of ['couponValidFromInstant', 'couponValidUntilInstant']) {
      checks++;
      const a = String(lib[fn](d)), b = String(c[fn](d));
      if (a !== b) { bad++; console.log(`  MISMATCH ${name}.${fn}(${JSON.stringify(d)}) lib=${a} copy=${b}`); }
    }
  }
}
// And the behaviour that matters to a customer.
const until = lib.couponValidUntilInstant('2026-10-06');
const lastMoment = new Date('2026-10-06T22:59:59Z');   // 23:59:59 UK on 6 Oct (BST)
const afterMidnight = new Date('2026-10-06T00:30:00Z'); // 01:30 UK on 6 Oct - used to be expired
checks += 2;
if (!(until >= lastMoment)) { bad++; console.log('  the last minute of the final day is NOT covered'); }
if (!(until > afterMidnight)) { bad++; console.log('  still expires in the early hours'); }
// Matching helpers are not enough: every place that checks a coupon date must
// actually CALL them. A call site quietly reverting to new Date(...) passes a
// helper-only comparison - found by mutating exactly that and watching this pass.
const CALL_SITES = [
  'src/lib/order-logic.js',
  'src/components/checkout/DiscountCodeInput.jsx',
  'base44/functions/verifyAndCreateOrder/entry.ts',
  'base44/functions/posValidateCoupon/entry.ts',
];
for (const rel of CALL_SITES) {
  const src = fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
  for (const [field, helper] of [['valid_from', 'couponValidFromInstant'], ['valid_until', 'couponValidUntilInstant']]) {
    checks++;
    const raw = new RegExp(`new Date\\(\\s*coupon\\.${field}`).test(src);
    const uses = src.includes(`${helper}(coupon.${field}`);
    if (raw || !uses) {
      bad++;
      console.log(`  DRIFTED ${rel}: coupon.${field} ${raw ? 'is read with new Date()' : `does not use ${helper}`}`);
    }
  }
}

console.log(`${checks} comparisons across ${Object.keys(copies).length} copies: ${bad} mismatches`);
process.exit(bad ? 1 : 0);
