#!/usr/bin/env node
/**
 * check-kiosk-expiry.mjs - runs the REAL expireUnpaidKioskOrders handler.
 *
 * Walk-away kiosk orders must clear, but a PAID order must never be touched -
 * including one a cashier paid in the moments between the expiry run listing
 * orders and cancelling them.
 */
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../base44/functions/expireUnpaidKioskOrders/entry.ts', import.meta.url), 'utf8')
  .split('\n').filter(l => !/^import /.test(l)).join('\n');

// created_date exactly as the platform returns it: UTC, no Z, microseconds.
const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString().replace('Z', '').replace(/(\.\d{3})$/, '$1000');

function world(orders, { restaurant = {}, payDuringRun = null } = {}) {
  const db = { Order: orders.map(o => ({ restaurant_id: 'r1', order_source: 'kiosk', payment_status: 'pending_payment', status: 'pending', total: 10, ...o })), PosAuditLog: [] };
  let listed = false;
  const ents = {
    Order: {
      filter: async (q) => {
        if (q.id) {
          // Simulate a cashier paying between the listing and the cancellation.
          if (listed && payDuringRun === q.id) Object.assign(db.Order.find(o => o.id === q.id), { payment_status: 'payment_confirmed', status: 'confirmed' });
          return db.Order.filter(o => o.id === q.id).map(o => ({ ...o }));
        }
        listed = true;
        return db.Order.filter(o => Object.entries(q).every(([k, v]) => o[k] === v)).map(o => ({ ...o }));
      },
      update: async (id, d) => Object.assign(db.Order.find(o => o.id === id), d),
    },
    Restaurant: { filter: async () => [{ id: 'r1', kiosk_config: restaurant }] },
    PosAuditLog: { create: async (d) => { db.PosAuditLog.push(d); return d; } },
  };
  let h;
  new Function('Deno', 'createClientFromRequest', src)({ serve: f => { h = f; }, env: { get: () => undefined } }, () => ({ asServiceRole: { entities: ents } }));
  const run = async () => { const q = console.log; console.log = () => {}; try { return await (await h(new Request('http://x', { method: 'POST' }))).json(); } finally { console.log = q; } };
  const get = (id) => db.Order.find(o => o.id === id);
  return { run, get, db };
}
const checks = []; const ck = (l, ok, d) => { checks.push(ok); console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${l.padEnd(56)} ${d}`); };

{ const w = world([{ id: 'old', created_date: ago(20) }]); await w.run();
  ck('a walk-away after 20 minutes is cancelled', w.get('old').status === 'cancelled', w.get('old').status);
  // The kitchen display reads order_status for kiosk orders. Cancelling only
  // status left the order showing as 'new' there - and cookable.
  ck('REGRESSION GUARD: the KITCHEN sees it cancelled too', w.get('old').order_status === 'cancelled', `order_status ${w.get('old').order_status}`);
  ck('with a reason staff can read', /Not paid at the counter within 15/.test(w.get('old').cancellation_reason || ''), (w.get('old').cancellation_reason || '').slice(0, 40));
  ck('and logged', w.db.PosAuditLog[0]?.action === 'kiosk.expired_unpaid', w.db.PosAuditLog[0]?.action); }

{ const w = world([{ id: 'fresh', created_date: ago(5) }]); await w.run();
  ck('a 5-minute-old order is left alone', w.get('fresh').status === 'pending', w.get('fresh').status); }

{ const w = world([{ id: 'paid', created_date: ago(40), payment_status: 'payment_confirmed', status: 'confirmed' }]); await w.run();
  ck('a PAID order is never touched, however old', w.get('paid').status === 'confirmed', w.get('paid').status); }

{ const w = world([{ id: 'race', created_date: ago(30) }], { payDuringRun: 'race' }); await w.run();
  ck('REGRESSION GUARD: paid DURING the run is not cancelled', w.get('race').status === 'confirmed', w.get('race').status); }

{ const w = world([{ id: 'x', created_date: ago(20) }], { restaurant: { unpaid_timeout_minutes: 30 } }); await w.run();
  ck('respects a restaurant\'s own longer limit', w.get('x').status === 'pending', `30-min limit, 20 min old: ${w.get('x').status}`); }

{ const w = world([{ id: 'online', order_source: 'online', created_date: ago(60) }]); await w.run();
  ck('never touches non-kiosk orders', w.get('online').status === 'pending', w.get('online').status); }

const good = checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good === checks.length ? 0 : 1);
