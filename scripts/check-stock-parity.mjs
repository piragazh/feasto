#!/usr/bin/env node
/**
 * check-stock-parity.mjs - applyOrderStock's stock logic must behave
 * IDENTICALLY to the tested src/lib/pos-stock-logic.js. It runs on every order
 * from every channel, so a drifted copy would mis-count stock everywhere.
 */
import fs from 'node:fs';
import * as tested from '../src/lib/pos-stock-logic.js';

const src = fs.readFileSync(new URL('../base44/functions/applyOrderStock/entry.ts', import.meta.url), 'utf8');
const start = src.indexOf('const isCustom =');
const end = src.indexOf('async function audit');
if (start < 0 || end < 0) { console.error('applyOrderStock: stock logic mirror missing'); process.exit(1); }
const m = new Function(src.slice(start, end) + '\nreturn { stockDemand, applySale, applyRestore };')();

let checks = 0, mismatches = 0;
const same = (label, a, b) => {
  checks++;
  const A = JSON.stringify(a instanceof Map ? [...a] : a), B = JSON.stringify(b instanceof Map ? [...b] : b);
  if (A !== B) { mismatches++; console.log('  MISMATCH', label, A, B); }
};

const orders = [
  {}, { items: [] },
  { items: [{ menu_item_id: 'p', quantity: 1 }, { menu_item_id: 'p', quantity: 2 }, { menu_item_id: 'c', quantity: 1 }] },
  { items: [{ menu_item_id: 'custom-9', quantity: 5 }, { menu_item_id: 'x', quantity: 0 }, { menu_item_id: 'y', quantity: -1 }, { menu_item_id: 'z', quantity: 'q' }] },
  { items: [{ menu_item_id: 'p', quantity: 2.9 }] },
];
for (const o of orders) same('stockDemand', tested.stockDemand(o), m.stockDemand(o));

const items = [];
for (const track of [true, false, undefined])
  for (const q of [0, 1, 2, 5, 10, undefined])
    for (const avail of [true, false])
      for (const auto of [true, false])
        for (const thr of [0, 5, undefined])
          items.push({ track_stock: track, stock_quantity: q, is_available: avail, auto_86ed: auto, low_stock_threshold: thr });
for (const it of items) for (const qty of [0, 1, 3, 12]) {
  same('applySale', tested.applySale(it, qty), m.applySale(it, qty));
  same('applyRestore', tested.applyRestore(it, qty), m.applyRestore(it, qty));
}
console.log(`${checks} stock comparisons: ${mismatches} mismatches`);
process.exit(mismatches ? 1 : 0);
