#!/usr/bin/env node
/**
 * check-checkout-pricing.mjs - executes the REAL validateOrderPricing from
 * verifyAndCreateOrder against genuine orders (must pass) and tampered ones
 * (must be refused), using real menu structures.
 *
 * Online checkout once trusted the browser completely: any customer could set
 * their own price. This guards both directions - a regression that refuses a
 * paying customer is caught as surely as one that lets a 1p order through.
 */
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../base44/functions/verifyAndCreateOrder/entry.ts', import.meta.url), 'utf8');
// Everything between the imports and the request handler: constants + every helper.
const body = src.slice(src.indexOf("const LOG = "), src.indexOf('Deno.serve('));
const { validateOrderPricing } = new Function(body + '\nreturn { validateOrderPricing };')();

// ── Real menu items (from the database) ──
const MENU = {
  wings: { id: 'wings', name: 'Hot Wings', price: 2.99, is_available: true, customization_options: [
    { name: 'Count', type: 'single', options: [{ label: '6 Hot Wings', price: 1 }] },
    { name: 'Upgarade?', type: 'meal_upgrade', options: [{ label: 'On its Own', price: 0 }, { label: 'Meal', price: 3 }],
      meal_customizations: [{ name: 'Side', type: 'single', options: [{ label: 'Chips', price: 0 }, { label: 'Peri Peri Chips', price: 0.2 }] }] }] },
  burger: { id: 'burger', name: 'Classic burger', price: 6.49, is_available: true, customization_options: [
    { name: '', type: 'meal_upgrade', options: [{ label: 'On its Own', price: 0 }, { label: 'Meal', price: 2.5 }], meal_customizations: [] }] },
  ringer: { id: 'ringer', name: 'Ringer Burger', price: 5.19, is_available: true, customization_options: [
    { name: '', type: 'single', options: [{ label: 'Normal', price: 0 }, { label: 'Spicy', price: 0 }] },
    { name: '', type: 'meal_upgrade', options: [{ label: 'On its Own', price: 0 }, { label: 'Meal', price: 2.5 }], meal_customizations: [] }] },
};
const COUPONS = { SAVE10: { code: 'SAVE10', is_active: true, discount_type: 'percentage', discount_value: 10, stackable: false, restaurant_id: 'r1' } };
const PROMOS = [{ restaurant_id: 'r1', name: 'Tuesday Deal', promotion_code: 'TUE', is_active: true }];

const base44 = { asServiceRole: { entities: {
  MenuItem: { filter: async () => Object.values(MENU) },
  MealDeal: { filter: async () => [] },
  Coupon:   { filter: async ({ code }) => (COUPONS[code] ? [COUPONS[code]] : []) },
  Promotion:{ filter: async () => PROMOS },
} } };

const run = (items, { discount = 0, coupons = [], promos = [], fee = 2.99 } = {}) => {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  return validateOrderPricing(base44, {
    items, restaurantId: 'r1', clientSubtotal: subtotal, clientTotal: subtotal + fee - discount,
    deliveryFee: fee, smallOrderSurcharge: 0, discount, isPOS: false, couponCodes: coupons, promotionCodes: promos,
  });
};
const line = (id, price, customizations) => ({ menu_item_id: id, name: id, price, quantity: 1, customizations });

const CASES = [
  // [label, must pass?, promise]
  ['GENUINE  wings meal + Peri Peri Chips (£7.19)', true,  run([line('wings', 7.19, { 'Count': '6 Hot Wings', 'Upgarade?': 'Meal', 'Upgarade?_meal_customizations': { Side: 'Peri Peri Chips' } })])],
  ['GENUINE  burger meal, blank-named group (£8.99)', true, run([line('burger', 8.99, { '': 'Meal' })])],
  ['GENUINE  Ringer collision, customer pays MORE',  true,  run([line('ringer', 7.69, { '': 'Meal' })])],
  ['GENUINE  real coupon SAVE10',                    true,  run([line('burger', 8.99, { '': 'Meal' })], { discount: 0.9, coupons: ['SAVE10'] })],
  ['GENUINE  real active promotion',                 true,  run([line('burger', 8.99, { '': 'Meal' })], { discount: 2, promos: ['TUE'] })],
  ['TAMPER   burger meal priced at 1p',              false, run([line('burger', 0.01, { '': 'Meal' })])],
  ['TAMPER   discount with no coupon or promotion',  false, run([line('burger', 8.99, { '': 'Meal' })], { discount: 4 })],
  ['TAMPER   invented promotion code',               false, run([line('burger', 8.99, { '': 'Meal' })], { discount: 4, promos: ['FAKE'] })],
  ['TAMPER   real coupon, inflated discount',        false, run([line('burger', 8.99, { '': 'Meal' })], { discount: 8, coupons: ['SAVE10'] })],
  ['TAMPER   non-existent coupon',                   false, run([line('burger', 8.99, { '': 'Meal' })], { discount: 1, coupons: ['NOPE'] })],
];

let wrong = 0;
for (const [label, mustPass, p] of CASES) {
  const r = await p;
  const ok = r.valid === mustPass;
  if (!ok) wrong++;
  console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${label.padEnd(48)} → ${r.valid ? 'accepted' : 'refused: ' + r.code}`);
}
console.log(`\n  ${CASES.length - wrong}/${CASES.length} behave correctly`);
process.exit(wrong ? 1 : 0);
