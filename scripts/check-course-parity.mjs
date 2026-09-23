#!/usr/bin/env node
/**
 * check-course-parity.mjs - posCourseUpdate must fire courses exactly as the
 * tested logic does, and must NEVER be able to change money. Firing mains has
 * to leave a bill untouched: it deliberately does not go through posUpdateOrder,
 * which re-prices from the live menu.
 */
import fs from 'node:fs';
import * as tested from '../src/lib/pos-course-logic.js';
const src = fs.readFileSync(new URL('../base44/functions/posCourseUpdate/entry.ts', import.meta.url), 'utf8');
const start = src.indexOf("const COURSES = ["); const end = src.indexOf('Deno.serve(');
const m = new Function(src.slice(start, end) + '\nreturn { courseOf, fireCourse, applyAssignments };')();
const sets = [
  [], [{ name: 'a' }],
  [{ name: 'a', course: 'starters' }, { name: 'b', course: 'mains' }, { name: 'c' }],
  [{ name: 'a', course: 'mains', fired: true, fired_at: '2026-01-01T00:00:00.000Z' }, { name: 'b', course: 'mains' }],
  [{ name: 'a', course: 'DESSERTS' }, { name: 'b', course: 'nonsense' }],
];
let checks = 0, bad = 0;
const at = new Date('2026-09-22T19:00:00Z');
for (const items of sets) {
  for (const c of ['drinks', 'starters', 'mains', 'desserts', 'bogus']) {
    checks++;
    const a = JSON.stringify(tested.fireCourse(items, c, at)), b = JSON.stringify(m.fireCourse(items, c, at));
    if (a !== b) { bad++; console.log('  MISMATCH fireCourse', c, a, b); }
  }
  for (const item of items) {
    checks++;
    if (tested.courseOf(item) !== m.courseOf(item)) { bad++; console.log('  MISMATCH courseOf', JSON.stringify(item)); }
  }
}
// The guarantee that matters: assignments can never change money.
const dbItems = [{ name: 'Steak', price: 24.5, quantity: 1, menu_item_id: 'x' }];
const crafted = [{ index: 0, course: 'mains', seat: 2, price: 0.01, quantity: 99, name: 'Hacked', menu_item_id: 'y' }];
const out = m.applyAssignments(dbItems, crafted);
checks += 4;
if (out[0].price !== 24.5) { bad++; console.log('  PRICE CHANGED through assignment'); }
if (out[0].quantity !== 1) { bad++; console.log('  QUANTITY CHANGED through assignment'); }
if (out[0].name !== 'Steak') { bad++; console.log('  NAME CHANGED through assignment'); }
if (out[0].seat !== 2 || out[0].course !== 'mains') { bad++; console.log('  course/seat NOT applied'); }
console.log(`${checks} comparisons: ${bad} mismatches`);
process.exit(bad ? 1 : 0);
