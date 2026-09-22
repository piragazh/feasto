#!/usr/bin/env node
/**
 * check-checkout-handler.mjs - runs the REAL verifyAndCreateOrder request handler
 * end to end, with Stripe and the database simulated, and checks the three things
 * that matter on a live checkout: was an order created, was the customer
 * refunded, and was any money STRANDED (charged, no order, no refund).
 *
 * Covers genuine orders, tampering, database hiccups and the emergency switch.
 * Each fix it guards was proven by undoing it and watching this fail.
 */
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../base44/functions/verifyAndCreateOrder/entry.ts', import.meta.url), 'utf8')
  .split('\n').filter(l => !/^import /.test(l)).join('\n');

function world({ pi = null, crash = null, switchOff = false } = {}) {
  const db = { Order: [], PaymentTransaction: [] };
  const refunds = [];
  let n = 0;
  const table = (name, rows) => ({
    filter: async (q = {}) => {
      if (crash === name) throw new Error('simulated database hiccup');
      return rows().filter(r => Object.entries(q).every(([k, v]) => r[k] === v));
    },
    create: async (d) => { const r = { id: `${name}-${++n}`, order_number: 'MD' + n, ...d }; rows().push(r); return r; },
    update: async (id, d) => { const r = rows().find(x => x.id === id); Object.assign(r || {}, d); return r; },
  });
  const MENU = [{ id: 'burger', restaurant_id: 'r1', name: 'Classic burger', price: 6.49, is_available: true,
    customization_options: [{ name: '', type: 'meal_upgrade', options: [{ label: 'On its Own', price: 0 }, { label: 'Meal', price: 2.5 }], meal_customizations: [] }] }];
  const base44 = {
    auth: { me: async () => ({ id: 'cust-1', email: 'c@example.com', role: 'user' }) },
    asServiceRole: { entities: {
      Order: table('Order', () => db.Order),
      PaymentTransaction: table('PaymentTransaction', () => db.PaymentTransaction),
      Restaurant: table('Restaurant', () => [{ id: 'r1', name: 'Test', is_active: true }]),
      SystemSettings: table('SystemSettings', () => switchOff ? [{ setting_key: 'checkout_price_validation', setting_value: 'off' }] : []),
      MenuItem: table('MenuItem', () => MENU),
      MealDeal: table('MealDeal', () => []),
      Coupon: table('Coupon', () => []),
      Promotion: table('Promotion', () => []),
    } },
  };
  class Stripe {
    constructor() {
      this.paymentIntents = { retrieve: async (id) => ({ id, status: pi?.status ?? 'succeeded', amount: pi?.amount, amount_received: pi?.amount }) };
      this.refunds = { create: async (a) => { refunds.push(a.payment_intent); return { id: 're_1' }; } };
    }
  }
  let handler;
  const Deno = { serve: (fn) => { handler = fn; }, env: { get: () => 'sk_test_x' } };
  new Function('Deno', 'createClientFromRequest', 'Stripe', src)(Deno, () => base44, Stripe);
  return { handler, db, refunds };
}

const ORDER = (price, method, extra = {}) => ({
  restaurant_id: 'r1', order_type: 'delivery', payment_method: method,
  items: [{ menu_item_id: 'burger', name: 'Classic burger', price, quantity: 1, customizations: { '': 'Meal' } }],
  subtotal: price, delivery_fee: 2.99, small_order_surcharge: 0, discount: 0, total: price + 2.99,
  customer_name: 'Test', customer_email: 'c@example.com', customer_phone: '07000000000',
  delivery_address: '1 Test St', ...extra,
});

async function run(label, expect, opts, body) {
  const w = world(opts);
  let res, json = {};
  const quiet = console.error; console.error = () => {}; const qw = console.warn; console.warn = () => {}; const ql = console.log; console.log = () => {};
  try {
    res = await w.handler(new Request('http://x/verifyAndCreateOrder', { method: 'POST', body: JSON.stringify(body) }));
    json = await res.json();
  } finally { console.error = quiet; console.warn = qw; console.log = ql; }
  const got = { order: w.db.Order.length > 0, refunded: w.refunds.length > 0 };
  const stranded = !!(body.orderData.payment_method === 'card' && body.paymentIntentId && !got.order && !got.refunded);
  const ok = got.order === expect.order && got.refunded === expect.refunded && !stranded;
  console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${label.padEnd(50)} order:${got.order ? 'yes' : 'no '} refund:${got.refunded ? 'yes' : 'no '}${stranded ? '  ⚠ MONEY STRANDED' : ''}  [${res.status} ${json.code || (json.success ? 'ok' : '')}]`);
  return ok;
}

const results = [
  await run('GENUINE card order, burger meal £8.99',          { order: true,  refunded: false }, { pi: { amount: 1198 } }, { orderData: ORDER(8.99, 'card'), paymentIntentId: 'pi_1' }),
  await run('GENUINE cash order, burger meal £8.99',          { order: true,  refunded: false }, {},                     { orderData: ORDER(8.99, 'cash') }),
  await run('TAMPER card: priced at 1p, charged 1p',          { order: false, refunded: true  }, { pi: { amount: 300 } },  { orderData: ORDER(0.01, 'card'), paymentIntentId: 'pi_2' }),
  await run('TAMPER card: true prices, Stripe charged 1p, caller claims full charge',
                                                              { order: false, refunded: true  }, { pi: { amount: 1 } },    { orderData: ORDER(8.99, 'card'), paymentIntentId: 'pi_3', stripeChargedAmountPence: 1198 }),
  await run('TAMPER cash: priced at 1p',                      { order: false, refunded: false }, {},                     { orderData: ORDER(0.01, 'cash') }),
  await run('HICCUP menu lookup fails (reported, not thrown)',{ order: true,  refunded: false }, { pi: { amount: 1198 }, crash: 'MenuItem' },  { orderData: ORDER(8.99, 'card'), paymentIntentId: 'pi_4' }),
  await run('HICCUP coupon lookup throws',                    { order: true,  refunded: false }, { pi: { amount: 1098 }, crash: 'Coupon' },    { orderData: ORDER(8.99, 'card', { coupon_codes: ['X'], discount: 1, total: 10.98 }), paymentIntentId: 'pi_6' }),
  await run('HICCUP promotion lookup throws',                 { order: true,  refunded: false }, { pi: { amount: 1098 }, crash: 'Promotion' }, { orderData: ORDER(8.99, 'card', { promotion_codes: ['P'], discount: 1, total: 10.98 }), paymentIntentId: 'pi_7' }),
  await run('HICCUP emergency switch unreadable - still validates',{ order: false, refunded: true }, { pi: { amount: 300 }, crash: 'SystemSettings' }, { orderData: ORDER(0.01, 'card'), paymentIntentId: 'pi_8' }),
  await run('SWITCH OFF: validation disabled by owner',       { order: true,  refunded: false }, { pi: { amount: 301 }, switchOff: true }, { orderData: ORDER(0.02, 'card'), paymentIntentId: 'pi_5' }),
];
const good = results.filter(Boolean).length;
console.log(`\n  ${good}/${results.length} scenarios behave correctly`);
process.exit(good === results.length ? 0 : 1);
