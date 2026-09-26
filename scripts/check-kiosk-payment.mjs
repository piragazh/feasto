#!/usr/bin/env node
/**
 * check-kiosk-payment.mjs - runs the REAL confirmKioskPayment handler.
 *
 * A kiosk "pay at counter" order must not be cooked until paid, and once paid it
 * must be released to the kitchen AND counted in the cash drawer. The previous
 * version only flagged the payment: the order stayed 'pending' (so it was missing
 * from takings and stock) and no tender was recorded (so cash taken at the till
 * made a correct drawer look over).
 */
import fs from 'node:fs';
import { cashTakenForOrder } from '../src/lib/pos-cash-logic.js';
const src = fs.readFileSync(new URL('../base44/functions/confirmKioskPayment/entry.ts', import.meta.url), 'utf8')
  .split('\n').filter(l => !/^import /.test(l)).join('\n');

function world({ order, manages = true, userRole = 'user' }) {
  const db = { Order: [{ ...order }], PosAuditLog: [] };
  const ents = {
    Order: { filter: async (q) => db.Order.filter(r => r.id === q.id), update: async (id, d) => Object.assign(db.Order.find(x => x.id === id), d) },
    RestaurantManager: { filter: async () => manages ? [{ restaurant_ids: ['r1'] }] : [] },
    PosAuditLog: { create: async (d) => { db.PosAuditLog.push(d); return d; } },
  };
  let h;
  new Function('Deno', 'createClientFromRequest', src)({ serve: f => { h = f; }, env: { get: () => undefined } },
    () => ({ auth: { me: async () => ({ email: 'till@shop.com', role: userRole }) }, asServiceRole: { entities: ents } }));
  const call = async (b) => { const q = console.error; console.error = () => {};
    try { const r = await h(new Request('http://x', { method: 'POST', body: JSON.stringify(b) })); return { status: r.status, ...(await r.json()) }; }
    finally { console.error = q; } };
  return { call, db };
}
const kiosk = (x = {}) => ({ id: 'k1', restaurant_id: 'r1', order_status: 'new', order_source: 'kiosk', payment_method: 'pay_at_counter', payment_status: 'pending_payment', status: 'pending', total: 12.5, order_number: 'K042', ...x });
const checks = []; const ck = (l, ok, d) => { checks.push(ok); console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${l.padEnd(54)} ${d}`); };

{ const w = world({ order: kiosk() }); const r = await w.call({ order_id: 'k1', tender: 'cash', terminal: 1 }); const o = w.db.Order[0];
  ck('cash payment RELEASES the order to the kitchen', r.success && o.status === 'confirmed', `status ${o.status}`);
  ck('and the KITCHEN display agrees (order_status)', o.order_status === 'confirmed', `order_status ${o.order_status}`);
  ck('and the cash DRAWER counts it', cashTakenForOrder(o).cash === 12.5, `drawer sees £${cashTakenForOrder(o).cash}`);
  ck('audited for the exceptions report', w.db.PosAuditLog.length === 1, w.db.PosAuditLog[0]?.action); }

{ const w = world({ order: kiosk() }); await w.call({ order_id: 'k1', tender: 'card' }); const o = w.db.Order[0];
  ck('card payment puts nothing in the drawer', o.card_amount === 12.5 && cashTakenForOrder(o).cash === 0, `card £${o.card_amount}, drawer £${cashTakenForOrder(o).cash}`); }

{ const w = world({ order: kiosk() }); await w.call({ order_id: 'k1', tender: 'cash' }); const r2 = await w.call({ order_id: 'k1', tender: 'cash' });
  ck('REGRESSION GUARD: cannot be paid twice', r2.status === 409 && r2.code === 'ALREADY_HANDLED', r2.error); }

{ const w = world({ order: kiosk(), manages: false }); const r = await w.call({ order_id: 'k1', tender: 'cash' });
  ck('another restaurant\'s staff are refused', r.status === 403, `${r.status}`); }

{ const w = world({ order: kiosk(), userRole: 'user' }); const r = await w.call({ order_id: 'k1', tender: 'cash' });
  ck('the till account (no "cashier" role) is allowed', r.success === true, `${r.status}`); }

{ const w = world({ order: kiosk() }); const r = await w.call({ order_id: 'k1' }); const o = w.db.Order[0];
  ck('Live Orders call without a tender still works', r.success && o.status === 'confirmed', `status ${o.status}`); }

{ const w = world({ order: kiosk({ status: 'cancelled' }) }); const r = await w.call({ order_id: 'k1', tender: 'cash' });
  ck('a cancelled order cannot be paid', r.status === 409, r.error); }

{ const w = world({ order: kiosk({ order_source: 'online' }) }); const r = await w.call({ order_id: 'k1', tender: 'cash' });
  ck('a non-kiosk order is refused', r.status === 409, r.error); }

const good = checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good === checks.length ? 0 : 1);
