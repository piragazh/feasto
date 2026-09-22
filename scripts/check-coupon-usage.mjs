#!/usr/bin/env node
/**
 * check-coupon-usage.mjs - online coupon use must be counted exactly once per
 * successful order: never on a refused order, never twice on a retry, and a
 * counting failure must never break an order the customer has paid for.
 * Runs the REAL verifyAndCreateOrder handler.
 */
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../base44/functions/verifyAndCreateOrder/entry.ts', import.meta.url), 'utf8')
  .split('\n').filter(l => !/^import /.test(l)).join('\n');

function world({ piAmount, couponUpdateFails = false } = {}) {
  const db = { Order: [], PaymentTransaction: [],
    Coupon: [{ id: 'cp1', code: 'SAVE10', is_active: true, discount_type: 'percentage', discount_value: 10, restaurant_id: 'r1', usage_count: 0 }] };
  let n = 0;
  const table = (name) => ({
    filter: async (q = {}) => (db[name] || FIXED[name] || []).filter(r => Object.entries(q).every(([k, v]) => r[k] === v)),
    create: async (d) => { const r = { id: `${name}-${++n}`, ...d }; (db[name] ||= []).push(r); return r; },
    update: async (id, d) => {
      if (name === 'Coupon' && couponUpdateFails) throw new Error('simulated write failure');
      const r = (db[name] || []).find(x => x.id === id); Object.assign(r || {}, d); return r;
    },
  });
  const FIXED = {
    Restaurant: [{ id: 'r1', name: 'PK STORE', is_active: true }], SystemSettings: [], MealDeal: [], Promotion: [],
    MenuItem: [{ id: 'chivas', restaurant_id: 'r1', name: 'Chivas', price: 2.0, is_available: true, customization_options: [
      { name: 'test 2', type: 'single', options: [{ label: 'tes1 1', price: 1.2 }, { label: 'tes2 ', price: 1.4 }] },
      { name: 'test 3', type: 'meal_upgrade', options: [{ label: 'On its Own', price: 0 }, { label: 'Meal', price: 4.5 }], meal_customizations: [] }] }],
  };
  const ents = {}; for (const k of ['Order', 'PaymentTransaction', 'Coupon', 'Restaurant', 'SystemSettings', 'MealDeal', 'Promotion', 'MenuItem']) ents[k] = table(k);
  const base44 = { auth: { me: async () => ({ id: 'u', email: 'c@x.com' }) }, asServiceRole: { entities: ents } };
  class Stripe { constructor() {
    this.paymentIntents = { retrieve: async (id) => ({ id, status: 'succeeded', amount: piAmount, amount_received: piAmount }) };
    this.refunds = { create: async () => ({}) };
  } }
  let handler;
  new Function('Deno', 'createClientFromRequest', 'Stripe', src)({ serve: (f) => { handler = f; }, env: { get: () => 'sk' } }, () => base44, Stripe);
  const call = async (body) => {
    const q = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => {};
    try { const r = await handler(new Request('http://x', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, ...(await r.json()) }; }
    finally { [console.log, console.warn, console.error] = q; }
  };
  return { call, db };
}

// Your real order, exactly as placed: Chivas £3.40 with SAVE10, £0.49 delivery, £3.55 total
const REAL = (price = 3.4, extra = {}) => ({
  restaurant_id: 'r1', order_type: 'delivery', payment_method: 'card', coupon_codes: ['SAVE10'],
  items: [{ menu_item_id: 'chivas', name: 'Chivas', price, quantity: 1, itemQuantities: {},
            customizations: { 'test 2': 'tes2 ', 'test 3': 'On its Own', 'test 3_meal_customizations': {} } }],
  subtotal: price, delivery_fee: 0.49, small_order_surcharge: 0, discount: Math.round(price * 10) / 100,
  total: Math.round((price + 0.49 - Math.round(price * 10) / 100) * 100) / 100,
  customer_name: 'T', customer_email: 'c@x.com', customer_phone: '07000000000', delivery_address: '1 St', ...extra,
});
const results = [];
const check = (label, cond, detail) => { results.push(cond); console.log(`  ${cond ? '✓' : '✗ WRONG'}  ${label.padEnd(52)} ${detail}`); };

{ const w = world({ piAmount: 355 });
  const r = await w.call({ orderData: REAL(), paymentIntentId: 'pi_a', idempotency_key: 'k1' });
  check('your real order: created, coupon counted once', r.success && w.db.Coupon[0].usage_count === 1, `order:${r.success ? 'yes' : 'no'} usage_count:${w.db.Coupon[0].usage_count}`); }

{ const w = world({ piAmount: 355 });
  await w.call({ orderData: REAL(), paymentIntentId: 'pi_b', idempotency_key: 'k2' });
  const r2 = await w.call({ orderData: REAL(), paymentIntentId: 'pi_b', idempotency_key: 'k2' });
  check('same request retried: not counted twice', r2.duplicate && w.db.Order.length === 1 && w.db.Coupon[0].usage_count === 1, `orders:${w.db.Order.length} usage_count:${w.db.Coupon[0].usage_count}`); }

{ const w = world({ piAmount: 1 });
  const r = await w.call({ orderData: REAL(0.01), paymentIntentId: 'pi_c', idempotency_key: 'k3' });
  check('refused (tampered) order: coupon NOT used up', !r.success && w.db.Coupon[0].usage_count === 0, `order:${r.success ? 'yes' : 'no'} usage_count:${w.db.Coupon[0].usage_count} [${r.code}]`); }

{ const w = world({ piAmount: 355, couponUpdateFails: true });
  const r = await w.call({ orderData: REAL(), paymentIntentId: 'pi_d', idempotency_key: 'k4' });
  check('counting fails: order STILL created', r.success && w.db.Order.length === 1, `order:${r.success ? 'yes' : 'no'} status:${r.status}`); }

{ const w = world({ piAmount: 355 });
  const r = await w.call({ orderData: REAL(3.4, { coupon_codes: ['save10 '] }), paymentIntentId: 'pi_e', idempotency_key: 'k5' });
  check('lower-case / spaced code: still found and counted', r.success && w.db.Coupon[0].usage_count === 1, `order:${r.success ? 'yes' : 'no'} usage_count:${w.db.Coupon[0].usage_count}`); }

{ const w = world({ piAmount: 320 });
  // One coupon applied twice to double the discount - refused by the tested
  // duplicate rule, and must not use the coupon up.
  const r = await w.call({ orderData: REAL(3.4, { coupon_codes: ['SAVE10', 'SAVE10'], discount: 0.68, total: 3.21 }), paymentIntentId: 'pi_f', idempotency_key: 'k6' });
  check('same coupon twice: refused, and not used up', !r.success && w.db.Coupon[0].usage_count === 0, `order:${r.success ? 'yes' : 'no'} usage_count:${w.db.Coupon[0].usage_count} [${r.code}]`); }

const good = results.filter(Boolean).length;
console.log(`\n  ${good}/${results.length} correct`);
process.exit(good === results.length ? 0 : 1);
