#!/usr/bin/env node
/**
 * sync-item-pricing.mjs - copy the pricing block from src/lib/item-pricing.js
 * into every backend function that prices kiosk / QR items.
 *
 *   Edit src/lib/item-pricing.js, then run:  node scripts/sync-item-pricing.mjs
 *
 * check-item-pricing.mjs (in check:mirrors) fails if a copy is out of date.
 */
import fs from 'node:fs';

const S = '// ── ITEM PRICING (shared', E = '// ── END ITEM PRICING';
const blockOf = (s, where) => {
  const a = s.indexOf(S), e = s.indexOf(E);
  if (a < 0 || e < 0 || s.indexOf(S, a + 1) >= 0) throw new Error(`${where}: pricing markers missing or duplicated`);
  return [a, s.indexOf('\n', e)];
};
const lib = fs.readFileSync('src/lib/item-pricing.js', 'utf8');
const [la, lb] = blockOf(lib, 'src/lib/item-pricing.js');
const block = lib.slice(la, lb);

for (const fn of ['kioskCreateOrder', 'tableCreateOrder']) {
  const f = `base44/functions/${fn}/entry.ts`;
  const s = fs.readFileSync(f, 'utf8');
  const [a, b] = blockOf(s, f);
  const next = s.slice(0, a) + block + s.slice(b);
  fs.writeFileSync(f, next);
  console.log(`${fn}: ${next === s ? 'already up to date' : 'updated'}`);
}
