#!/usr/bin/env node
/**
 * sync-item-availability.mjs - copy the availability block from
 * src/lib/item-availability.js into every backend function that takes orders.
 *
 *   Edit src/lib/item-availability.js, then run:
 *     node scripts/sync-item-availability.mjs
 *
 * First run inserts the block just before Deno.serve(; later runs replace it.
 * check-item-availability.mjs (in check:mirrors) fails if a copy is stale.
 */
import fs from 'node:fs';

export const TARGETS = ['kioskCreateOrder', 'tableCreateOrder', 'verifyAndCreateOrder', 'createPaymentIntent'];
const S = '// ── ITEM AVAILABILITY (shared', E = '// ── END ITEM AVAILABILITY';
const HEADER = '// Copied verbatim from src/lib/item-availability.js - check-item-availability.mjs compares.\n';

function span(s, where) {
  const a = s.indexOf(S), e = s.indexOf(E);
  if ((a < 0) !== (e < 0) || (a >= 0 && s.indexOf(S, a + 1) >= 0)) throw new Error(`${where}: availability markers broken`);
  return a < 0 ? null : [a, s.indexOf('\n', e)];
}
const lib = fs.readFileSync('src/lib/item-availability.js', 'utf8');
const [la, lb] = span(lib, 'lib');
const block = lib.slice(la, lb);

for (const fn of TARGETS) {
  const f = `base44/functions/${fn}/entry.ts`;
  const s = fs.readFileSync(f, 'utf8');
  const sp = span(s, f);
  let next;
  if (sp) next = s.slice(0, sp[0]) + block + s.slice(sp[1]);
  else {
    const at = s.indexOf('Deno.serve(');
    if (at < 0 || s.indexOf('Deno.serve(', at + 1) >= 0) throw new Error(`${f}: needs exactly one Deno.serve(`);
    next = s.slice(0, at) + HEADER + block + '\n\n' + s.slice(at);
  }
  fs.writeFileSync(f, next);
  console.log(`${fn}: ${next === s ? 'already up to date' : sp ? 'updated' : 'inserted'}`);
}
