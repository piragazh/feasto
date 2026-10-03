#!/usr/bin/env node
/**
 * check-uber-webhook.mjs - runs the REAL uberEatsWebhook handler with Uber
 * simulated. Guards what matters: Uber's webhook is a THIN notification (store
 * id in meta.user_id, order id in meta.resource_id) and the order itself is
 * fetched from resource_href; an order is created once; a failure answers 5xx so
 * Uber retries; a cancellation or store event is never mistaken for a new order.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
const src = fs.readFileSync(new URL('../base44/functions/uberEatsWebhook/entry.ts', import.meta.url), 'utf8')
  .split('\n').filter(l => !/^import /.test(l)).join('\n');

const SECRET = 'shh';
const STORE = 'store-uuid-1';
const ORDER = 'f9f363d1-e1c2-4595-b477-c649845bc953';

const uberOrder = (extra = {}) => ({
  id: ORDER, display_id: 'BC953', current_state: 'CREATED', type: 'DELIVERY_BY_UBER',
  store: { id: STORE },
  eater: { first_name: 'Larry', last_name: 'D', phone: '+44 20 0000 0000', phone_code: '555' },
  cart: {
    special_instructions: 'Ring bell',
    items: [
      { id: 'uber-item', external_data: JSON.stringify({ mealdrop_id: 'md-burger' }), title: 'Burger', quantity: 2,
        price: { unit_price: { amount: 950 } },
        special_requests: [{ allergy: { allergens_to_exclude: [{ type: 'PEANUTS' }] } }],
        selected_modifier_groups: [
          { title: 'Make it a meal', selected_items: [{ title: 'Meal', quantity: 1,
              selected_modifier_groups: [{ title: 'Drink', selected_items: [{ title: 'Cola', quantity: 1 }] }] }] },
          { title: 'Salad', selected_items: null, removed_items: [{ title: 'Onion' }] },
        ] },
      { id: 'md-fries', title: 'Fries', quantity: 1, price: { unit_price: { amount: 300 } }, selected_modifier_groups: null },
    ],
  },
  payment: { charges: { total: { amount: 2200 }, sub_total: { amount: 2200 } } },
  ...extra,
});

function world({ restaurants, orders = [], order = uberOrder(), orderStatus = 200, tokenOk = true, env = {} } = {}) {
  const db = {
    Restaurant: restaurants ?? [{ id: 'r1', third_party_integrations: { uber_eats: { store_id: STORE, enabled: true } } }],
    Order: orders, UberCredential: [],
  };
  const calls = [];
  let seq = 0;
  const table = (name) => ({
    filter: async (q) => db[name].filter(r => Object.entries(q).every(([k, v]) => k.includes('.') ? false : r[k] === v)),
    list: async () => db[name],
    create: async (d) => { const r = { id: `${name}-${++seq}`, created_date: new Date(Date.now() + seq).toISOString(), ...d }; db[name].push(r); return r; },
    update: async (id, d) => { const r = db[name].find(x => x.id === id); Object.assign(r, d); return r; },
    delete: async (id) => { db[name] = db[name].filter(x => x.id !== id); },
  });
  const ents = { Restaurant: table('Restaurant'), Order: table('Order'), UberCredential: table('UberCredential') };
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    if (String(url).includes('oauth')) {
      return tokenOk ? { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 2592000 }) }
                     : { ok: false, status: 401, text: async () => 'bad creds' };
    }
    return orderStatus === 200 ? { ok: true, status: 200, json: async () => order }
                               : { ok: false, status: orderStatus, text: async () => 'nope' };
  };
  let handler;
  new Function('Deno', 'createClientFromRequest', src)(
    { serve: f => { handler = f; }, env: { get: k => ({ UBER_EATS_CLIENT_SECRET: SECRET, UBER_EATS_CLIENT_ID: 'cid', ...env })[k] } },
    () => ({ asServiceRole: { entities: ents } }));
  const send = async (payload, { sign = true, key = SECRET } = {}) => {
    const raw = JSON.stringify(payload);
    const sig = sign ? crypto.createHmac('sha256', key).update(raw).digest('hex') : 'bad';
    const q = [console.log, console.error]; console.log = console.error = () => {};
    try {
      const r = await handler(new Request('http://x', { method: 'POST', body: raw, headers: { 'x-uber-signature': sig } }));
      return { status: r.status, text: await r.text() };
    } finally { [console.log, console.error] = q; }
  };
  return { send, db: () => db, calls };
}

const notif = (extra = {}) => ({
  event_id: 'e1', event_type: 'orders.notification',
  meta: { resource_id: ORDER, status: 'pos', user_id: STORE },
  resource_href: `https://api.uber.com/v2/eats/order/${ORDER}`, ...extra,
});
const checks = []; const ck = (l, ok, d = '') => { checks.push(ok); console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${l.padEnd(58)} ${d}`); };

{ const w = world(); const r = await w.send(notif()); const o = w.db().Order[0];
  ck('thin notification creates the order', r.status === 200 && w.db().Order.length === 1, `status ${r.status}`);
  ck('acknowledged with an EMPTY body', r.text === '', JSON.stringify(r.text));
  ck('order fetched from resource_href', w.calls.some(c => c === `https://api.uber.com/v2/eats/order/${ORDER}`), '');
  ck('routed by meta.user_id to the right restaurant', o?.restaurant_id === 'r1', o?.restaurant_id);
  ck('dedup key is Uber\'s order id', o?.third_party_order_id === ORDER, o?.third_party_order_id);
  ck('items, prices and quantities mapped', o?.items?.length === 2 && o.items[0].price === 9.5 && o.items[0].quantity === 2, JSON.stringify(o?.items?.map(i => [i.name, i.price, i.quantity])));
  ck('our own menu id recovered from external_data', o?.items?.[0]?.menu_item_id === 'md-burger' && o.items[1].menu_item_id === 'md-fries', o?.items?.map(i => i.menu_item_id).join(','));
  ck('nested and removed modifiers kept', o?.items?.[0]?.customizations?.['Meal › Drink'] === 'Cola' && o.items[0].customizations.Salad === 'No Onion', JSON.stringify(o?.items?.[0]?.customizations));
  ck('allergy reaches the ticket and the notes', o?.items?.[0]?.customizations?.ALLERGY === 'PEANUTS' && /ALLERGY/.test(o.notes), o?.notes);
  ck('totals in pounds, marked third-party and paid', o?.total === 22 && o.order_source === 'third_party' && o.payment_status === 'paid_card', `${o?.total} ${o?.payment_status}`);
  ck('order number from Uber display id', o?.order_number === 'UE-BC953', o?.order_number);
  ck('token stored for reuse (30-day token, 100/hour cap)', w.db().UberCredential.length === 1, ''); }

{ const w = world(); await w.send(notif()); const before = w.calls.length; const r = await w.send(notif());
  ck('a retried notification does not duplicate', r.status === 200 && w.db().Order.length === 1, `${w.db().Order.length} orders`);
  ck('...and does not call Uber again', w.calls.length === before, `${w.calls.length - before} extra calls`); }

{ const w = world(); await w.send(notif()); await w.send(notif({ meta: { resource_id: 'other-order', user_id: STORE }, resource_href: 'https://api.uber.com/v2/eats/order/other-order' }));
  ck('second order reuses the token', w.calls.filter(c => c.includes('oauth')).length === 1, `${w.calls.filter(c => c.includes('oauth')).length} token requests`); }

{ const w = world({ restaurants: [{ id: 'r1', third_party_integrations: { uber_eats: { store_id: 'different', enabled: true } } }] });
  const r = await w.send(notif());
  ck('unknown store answers 503 so Uber retries', r.status === 503 && w.db().Order.length === 0, `status ${r.status}`); }

{ const w = world({ orderStatus: 500 }); const r = await w.send(notif());
  ck('Uber fetch failure answers 5xx, nothing created', r.status === 502 && w.db().Order.length === 0, `status ${r.status}`); }

{ const w = world({ tokenOk: false }); const r = await w.send(notif());
  ck('token failure answers 5xx, never 200', r.status === 500 && w.db().Order.length === 0, `status ${r.status}`); }

{ const w = world(); const r = await w.send(notif(), { sign: false });
  ck('bad signature rejected', r.status === 401 && w.db().Order.length === 0, `status ${r.status}`); }

{ const w = world(); const r = await w.send(notif({ resource_href: 'https://evil.example/v2/eats/order/x' }));
  ck('token never sent to a non-Uber host', r.status === 200 && !w.calls.some(c => c.includes('evil.example')), w.calls.filter(c => !c.includes('oauth')).join(',')); }

{ const w = world({ orders: [{ id: 'o1', third_party_order_id: ORDER, status: 'preparing' }] });
  const r = await w.send(notif({ event_type: 'orders.cancel' })); const o = w.db().Order[0];
  ck('orders.cancel cancels, never creates', r.status === 200 && w.db().Order.length === 1 && o.status === 'cancelled', o.status);
  ck('...and is not echoed back to Uber', !!o.uber_status_pushed?.cancel, ''); }

{ const w = world(); const r = await w.send({ event_type: 'store.deprovisioned', store_id: STORE });
  const u = w.db().Restaurant[0].third_party_integrations.uber_eats;
  ck('store.deprovisioned switches the integration off', r.status === 200 && u.enabled === false && w.db().Order.length === 0, JSON.stringify(u.enabled)); }

{ const w = world(); const r = await w.send(notif({ event_type: 'orders.release' }));
  ck('other events acknowledged without creating', r.status === 200 && w.db().Order.length === 0, `status ${r.status}`); }

{ const w = world({ order: uberOrder({ current_state: 'CANCELED' }) }); const r = await w.send(notif());
  ck('order already cancelled on Uber is not created', r.status === 200 && w.db().Order.length === 0, ''); }

{ const env = { UBER_EATS_WEBHOOK_SIGNING_KEY: 'dash-key', UBER_EATS_WEBHOOK_SIGNING_KEY_SECONDARY: 'old-key' };
  const a = world({ env }); const ra = await a.send(notif(), { key: 'dash-key' });
  ck('signed with the dashboard Signing Key is accepted', ra.status === 200 && a.db().Order.length === 1, `status ${ra.status}`);
  const b = world({ env }); const rb = await b.send(notif(), { key: 'old-key' });
  ck('...and with the secondary key (rotation)', rb.status === 200 && b.db().Order.length === 1, `status ${rb.status}`);
  const c = world({ env }); const rc = await c.send(notif(), { key: 'someone-elses-key' });
  ck('...but not with an unknown key', rc.status === 401 && c.db().Order.length === 0, `status ${rc.status}`); }

const bad = checks.filter(x => !x).length;
console.log(bad ? `\n${bad} check(s) WRONG` : `\nall ${checks.length} checks pass`);
process.exit(bad ? 1 : 0);
