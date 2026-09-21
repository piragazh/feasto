import fs from 'node:fs';
import * as tested from '../src/lib/pos-schedule-logic.js';

// Pull the mirrored functions out of the Deno handler and evaluate them.
const src = fs.readFileSync(new URL('../base44/functions/posCreateOrder/entry.ts', import.meta.url), 'utf8');
const start = src.indexOf("const SCHEDULE_TZ = 'Europe/London';");
const end = src.indexOf('Deno.serve(async (req) => {');
const mirrored = new Function(src.slice(start, end) +
  '\nreturn { isWithinWindow, isItemAvailableNow, scheduledPrice };')();

const instants = [];
for (const d of ['2026-01-14','2026-03-28','2026-03-29','2026-07-15','2026-10-24','2026-10-25','2026-12-31']) {
  for (const h of ['00:30','01:00','01:59','02:00','11:29','11:30','16:00','16:59','17:00','18:00','18:59','19:00','21:59','22:00','23:30']) {
    instants.push(new Date(`${d}T${h}:00Z`));
  }
}
const windows = [
  { days: [1,2,3,4,5], start: '17:00', end: '19:00' },
  { days: [5], start: '22:00', end: '02:00' },
  { start: '07:00', end: '11:30' },
  { days: [0,6], start: '00:00', end: '00:00' },
  { start: 'bad', end: '19:00' },
];

let checks = 0, mismatches = 0;
for (const w of windows) for (const t of instants) {
  checks++;
  if (tested.isWithinWindow(w, t) !== mirrored.isWithinWindow(w, t)) {
    mismatches++; console.log('  MISMATCH isWithinWindow', JSON.stringify(w), t.toISOString());
  }
  const item = { price_windows: [{ ...w, price: 3 }], availability_windows: [w] };
  checks++;
  if (tested.scheduledPrice(5, item, t) !== mirrored.scheduledPrice(5, item, t)) {
    mismatches++; console.log('  MISMATCH scheduledPrice', JSON.stringify(w), t.toISOString());
  }
  checks++;
  if (tested.isItemAvailableNow(item, t) !== mirrored.isItemAvailableNow(item, t)) {
    mismatches++; console.log('  MISMATCH isItemAvailableNow', JSON.stringify(w), t.toISOString());
  }
}
console.log(`${checks} comparisons across ${instants.length} instants (incl. both BST changeovers): ${mismatches} mismatches`);
process.exit(mismatches ? 1 : 0);
