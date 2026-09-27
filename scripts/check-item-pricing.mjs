#!/usr/bin/env node
/**
 * check-item-pricing.mjs - kiosk / QR option pricing: what the customer sees
 * is what the server charges, and a caller cannot lower a price.
 *
 * 1. The pricing block is IDENTICAL in src/lib/item-pricing.js,
 *    kioskCreateOrder and tableCreateOrder (functions cannot import src/).
 * 2. On REAL Tilbury menu items, the shared rule gives exactly what the kiosk
 *    screen always showed (the old KioskItemModal formula, kept below as the
 *    reference) - so the screen is unchanged and the server now agrees with it.
 * 3. The bugs stay fixed: multi-quantity extras, meal extras, negative and
 *    oversized quantities, stale options.
 * 4. Both handlers actually price through it.
 */
import fs from 'node:fs';
import { priceSelection } from '../src/lib/item-pricing.js';

const checks = []; const ck = (l, ok, d = '') => { checks.push(!!ok); console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${l.padEnd(66)} ${d}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const S = '// ── ITEM PRICING (shared', E = '// ── END ITEM PRICING';
const blockOf = (s) => { const a = s.indexOf(S), e = s.indexOf(E); return a < 0 || e < 0 ? null : s.slice(a, s.indexOf('\n', e)); };

// ── 1. identical copies ──────────────────────────────────────────────────────
const libBlock = blockOf(read('src/lib/item-pricing.js'));
for (const fn of ['kioskCreateOrder', 'tableCreateOrder']) {
  const src = read(`base44/functions/${fn}/entry.ts`);
  const b = blockOf(src);
  ck(`${fn} has the pricing block, character for character`, b && b === libBlock, b ? (b === libBlock ? '' : 'DIFFERS') : 'missing');
  // 4. wiring (comments stripped so a comment cannot pass it)
  const handler = src.slice(src.indexOf('Deno.serve(')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  ck(`${fn} prices every item through priceSelection()`, /priceSelection\(menuItem, cartItem\.customizations, cartItem\.itemQuantities\)/.test(handler));
  ck(`${fn} refuses the order when pricing refuses`, /if \(priced\.error\)[\s\S]{0,200}status: 400/.test(handler));
  ck(`${fn} has no leftover label-keyed quantity lookup`, !/itemQuantities\?\.\[val\]/.test(src));
}

// ── Real Tilbury items (27 Sep 2026), verbatim from the live menu ────────────
const DIPS = { name: 'Sauces and Dips', price: 0, pos_price: null, customization_options: [{ name: '', type: 'multiple', required: true, max_quantity: null, meal_customizations: [], options: [
  { price: 0.6, label: 'BBQ Sauce' }, { price: 0.6, label: 'Garlic' }, { price: 0.6, label: 'Burger Sauce' },
  { price: 0.6, label: 'Chilli Sauce' }, { price: 0.6, label: 'Signature Spicy Mayo' }, { price: 0.6, label: 'Mayo' }] }] };
const HONEY = { name: 'Hot Honey Blast burger meal', price: 5.29, pos_price: null, customization_options: [{ name: 'Upgrade ', type: 'meal_upgrade', required: false, max_quantity: 1,
  options: [{ pos_price: null, price: 0, label: 'On its Own' }, { pos_price: null, price: 2.5, label: 'Meal' }],
  meal_customizations: [{ name: 'Drink', type: 'single', required: true, options: [
    { price: 0, label: 'Pepsi 330ml Can' }, { price: 0, label: 'Water 500ml' }] }] }] };
// A meal whose extras cost money (the case the server never charged), plus a single-choice size.
const WINGS = { name: 'Wings meal', price: 6, pos_price: 5.5, customization_options: [
  { name: 'Size', type: 'single', options: [{ label: '6', price: 0 }, { label: '10', price: 2.4 }] },
  { name: 'Upgrade', type: 'meal_upgrade', options: [{ label: 'On its Own', price: 0 }, { label: 'Meal', price: 2 }],
    meal_customizations: [
      { name: 'Drink', type: 'single', options: [{ label: 'Pepsi', price: 0 }, { label: 'Milkshake', price: 1.5 }] },
      { name: 'Dips', type: 'multiple', options: [{ label: 'Garlic', price: 0.5 }, { label: 'BBQ', price: 0.5 }] }] },
  { name: 'No', type: 'single', options: [{ label: 'Normal', price: 0 }, { label: 'No cheese', price: -0.2 }] }] };

// ── 2. reference: the kiosk screen's formula before this change (verbatim) ───
function oldKioskScreen(item, customizations, itemQuantities) {
  let total = item.pos_price != null ? item.pos_price : item.price;
  item.customization_options?.forEach(opt => {
    if (opt.type === 'single' && customizations[opt.name]) {
      const sel = opt.options?.find(o => o.label === customizations[opt.name]); if (sel?.price) total += sel.price;
    } else if (opt.type === 'multiple' && Array.isArray(customizations[opt.name])) {
      customizations[opt.name].forEach(choice => { const qty = itemQuantities[`${opt.name}_${choice}`] || 1;
        const sel = opt.options?.find(o => o.label === choice); if (sel?.price) total += sel.price * qty; });
    } else if (opt.type === 'meal_upgrade' && customizations[opt.name]) {
      const sel = opt.options?.find(o => o.label === customizations[opt.name]); if (sel?.price) total += sel.price;
      const mc = opt.meal_customizations || sel?.meal_customizations;
      mc?.forEach(m => { const val = customizations[`${opt.name}_meal_${m.name}`];
        if (m.type === 'single' && val) { const x = m.options?.find(o => o.label === val); if (x?.price) total += x.price; }
        else if (m.type === 'multiple' && Array.isArray(val)) val.forEach(c => { const x = m.options?.find(o => o.label === c); if (x?.price) total += x.price; }); });
    }
  });
  return Math.round(total * 100) / 100;
}
// Every selection the kiosk can produce for these items.
const cases = [];
for (const picks of [[], ['BBQ Sauce'], ['BBQ Sauce', 'Mayo'], ['Garlic', 'Chilli Sauce', 'Mayo']])
  for (const q of [0, 1, 2, 3, 7]) cases.push([DIPS, { '': picks }, Object.fromEntries(picks.map(p => [`_${p}`, q]))]);
for (const up of ['On its Own', 'Meal']) for (const d of ['Pepsi 330ml Can', 'Water 500ml'])
  cases.push([HONEY, { 'Upgrade ': up, 'Upgrade _meal_Drink': d }, {}]);
for (const size of ['6', '10']) for (const up of ['On its Own', 'Meal']) for (const drink of ['Pepsi', 'Milkshake'])
  for (const dips of [[], ['Garlic'], ['Garlic', 'BBQ']]) for (const no of ['Normal', 'No cheese'])
    cases.push([WINGS, { Size: size, Upgrade: up, Upgrade_meal_Drink: drink, Upgrade_meal_Dips: dips, No: no }, {}]);
const diffs = cases.filter(([i, c, q]) => priceSelection(i, c, q).unit !== oldKioskScreen(i, c, q));
ck('shared rule = what the kiosk screen always showed, every selection', diffs.length === 0, diffs.length ? `${diffs.length} differ` : `${cases.length} selections`);

// ── 3. the bugs ──────────────────────────────────────────────────────────────
const P = (i, c, q) => priceSelection(i, c, q);
ck('REGRESSION GUARD: 3 x BBQ Sauce is £1.80, not £0.60', P(DIPS, { '': ['BBQ Sauce'] }, { '_BBQ Sauce': 3 }).unit === 1.8, P(DIPS, { '': ['BBQ Sauce'] }, { '_BBQ Sauce': 3 }).unit);
ck('REGRESSION GUARD: meal extras are charged (Meal + Milkshake + 2 dips)',
  P(WINGS, { Upgrade: 'Meal', Upgrade_meal_Drink: 'Milkshake', Upgrade_meal_Dips: ['Garlic', 'BBQ'] }, {}).unit === 10, P(WINGS, { Upgrade: 'Meal', Upgrade_meal_Drink: 'Milkshake', Upgrade_meal_Dips: ['Garlic', 'BBQ'] }, {}).unit);
ck('REGRESSION GUARD: a negative quantity is refused, not a discount', !!P(DIPS, { '': ['BBQ Sauce'] }, { '_BBQ Sauce': -100 }).error);
ck('the old attack key (bare label) does nothing', P(DIPS, { '': ['BBQ Sauce'] }, { 'BBQ Sauce': -100 }).unit === 0.6);
ck('fractional or huge quantities are refused', ['1.5', 2.5, 100, 'abc', Infinity].every(v => !!P(DIPS, { '': ['Mayo'] }, { _Mayo: v }).error));
ck('an option that no longer exists is refused, not free', !!P(DIPS, { '': ['Truffle Mayo'] }, {}).error && !!P(HONEY, { 'Upgrade ': 'Large Meal' }, {}).error);
ck('groups the menu does not have are ignored (cannot add prices)', P(DIPS, { '': [], Extra: ['x'], Upgrade_meal_X: 'y' }, {}).unit === 0);
ck('an owner-set negative option still applies ("no cheese -20p")', P(WINGS, { No: 'No cheese' }, {}).unit === 5.3);
ck('POS price is the base when set, else the online price', P(WINGS, {}, {}).unit === 5.5 && P(HONEY, {}, {}).unit === 5.29);
ck('pennies never drift (0.1 + 0.2 style sums round to the penny)', P({ price: 0.1, customization_options: [{ name: 'a', type: 'multiple', options: [{ label: 'x', price: 0.2 }] }] }, { a: ['x'] }, {}).unit === 0.3);
ck('an item with no valid price is refused', !!P({ name: 'x', price: null }, {}, {}).error && !!P({ price: -1 }, {}, {}).error);
ck('safe with missing options, selections and quantities', P({ price: 2 }, undefined, undefined).unit === 2 && P(DIPS, null, null).unit === 0);

const good = checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good === checks.length ? 0 : 1);
