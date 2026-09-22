#!/usr/bin/env node
/**
 * check-promotion-dates.mjs - the server must read a promotion date EXACTLY as a
 * UK customer's browser does. Promotion dates are stored without a time zone;
 * reading them as UTC put the server an hour behind the checkout during British
 * Summer Time, refusing the first hour of customers on any new promotion.
 * Deterministic: compares against a real UK-time reading, all seasons.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const src = fs.readFileSync(new URL('../base44/functions/verifyAndCreateOrder/entry.ts', import.meta.url), 'utf8');
const s = src.indexOf('function ukInstant'); const e = src.indexOf('\n}\n', s) + 2;
const ukInstant = new Function(src.slice(s, e) + '\nreturn ukInstant;')();

const samples = [
  '2026-09-23T12:00', '2026-08-30T12:27', '2026-01-15T09:30', '2026-07-01T00:00', '2026-12-31T23:59',
  // both 2026 clock changes, either side
  '2026-03-29T00:30', '2026-03-29T02:30', '2026-03-29T03:00', '2026-10-25T00:30', '2026-10-25T02:30',
  '2026-02-14T12:27',
  // must be left alone
  '2026-09-23', '2026-09-23T12:00:00Z', '2026-09-23T12:00:00+01:00',
];
// What a UK customer's browser computes: new Date(s) with the machine in UK time.
const browser = JSON.parse(execSync(`TZ=Europe/London node -e 'console.log(JSON.stringify(${JSON.stringify(samples)}.map(x => new Date(x).toISOString())))'`).toString());
let bad = 0;
samples.forEach((x, i) => {
  const server = ukInstant(x).toISOString();       // this process runs in UTC
  const ok = server === browser[i];
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'}  ${x.padEnd(28)} browser ${browser[i]}  server ${server}`);
});
console.log(`\n  ${samples.length - bad}/${samples.length} match a UK browser exactly`);
process.exit(bad ? 1 : 0);
