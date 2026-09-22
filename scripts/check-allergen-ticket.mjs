#!/usr/bin/env node
/**
 * check-allergen-ticket.mjs - builds a REAL kitchen ticket and checks what is
 * printed. The "Allergen Warnings" printer option used to do nothing at all, so
 * an owner could switch it on and believe tickets carried allergen information.
 *
 * The rule this guards: an item nobody has confirmed is listed SEPARATELY. Its
 * absence from the CONTAINS line must never read as "safe".
 */
import { buildReceiptBytes } from '../src/lib/escpos.js';
import { orderAllergenSummary } from '../src/lib/allergen-logic.js';

const menu = new Map([
  ['a', { name: 'Cheeseburger', allergens: ['milk', 'gluten', 'sesame'], allergens_confirmed: true }],
  ['b', { name: 'Chips', allergens: [], allergens_confirmed: true }],
  ['c', { name: 'Mystery Pie', allergens: [] }],
]);
const items = [
  { menu_item_id: 'a', name: 'Cheeseburger', quantity: 1, price: 8.5 },
  { menu_item_id: 'b', name: 'Chips', quantity: 1, price: 3 },
  { menu_item_id: 'c', name: 'Mystery Pie', quantity: 1, price: 7 },
];
const base = { order_number: 'MD1', order_type: 'delivery', status: 'confirmed', total: 18.5, subtotal: 18.5, created_date: '2026-09-22T15:33:32.810Z' };
const text = (order, cfg) => new TextDecoder('latin1')
  .decode(new Uint8Array(buildReceiptBytes(order, { name: 'T' }, cfg)))
  .replace(/[\x00-\x09\x0B-\x1F]/g, '');

const checks = [];
const check = (label, ok) => { checks.push(ok); console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${label}`); };

const on = text({ ...base, items, _allergenSummary: orderAllergenSummary(items, menu) }, { role: 'kitchen', show_allergens: true });
check('lists the confirmed allergens', /ALLERGENS: .*GLUTEN.*MILK.*SESAME/i.test(on));
check('flags the unconfirmed item SEPARATELY', /ALLERGENS NOT CONFIRMED/i.test(on) && /Mystery Pie/.test(on));
check('tells staff to check it', /Check before serving/i.test(on));

const off = text({ ...base, items, _allergenSummary: orderAllergenSummary(items, menu) }, { role: 'kitchen', show_allergens: false });
check('prints nothing when the option is off', !/ALLERGEN/i.test(off));

const offline = text({ ...base, items, _allergenSummary: { labels: [], unconfirmedItems: [], unavailable: true } }, { role: 'kitchen', show_allergens: true });
check('says UNAVAILABLE when the menu cannot be read', /ALLERGEN INFO UNAVAILABLE/i.test(offline));

const clean = [items[1]];
const clear = text({ ...base, items: clean, _allergenSummary: orderAllergenSummary(clean, menu) }, { role: 'kitchen', show_allergens: true });
check('stays quiet when everything is confirmed and clear', !/ALLERGEN/i.test(clear));

const good = checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good === checks.length ? 0 : 1);
