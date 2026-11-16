#!/usr/bin/env node
/**
 * check-ai-core-scenarios.mjs - runs aiOrderingCore itself against an in-memory database.
 *
 * Covers the rules added in the Nov 2026 AI ordering audit: a guessed item is confirmed
 * before it is added, cash up to the limit only, one open cash order per number, nothing
 * private about a past order handed to an agent, a failed save is never answered "Added",
 * and a postcode-lookup outage is never reported as "we don't deliver there".
 *
 * The function is bundled as-is; only its SDK import is swapped for a fake client.
 */
import { build } from 'esbuild';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(os.tmpdir(), `ai-core-${process.pid}.mjs`);
await build({
    entryPoints: [path.join(root, 'base44/functions/aiOrderingCore/entry.ts')],
    bundle: true, format: 'esm', platform: 'node', logLevel: 'error', outfile: out,
    plugins: [{ name: 'fake-sdk', setup(b) {
        b.onResolve({ filter: /^npm:@base44\/sdk/ }, () => ({ path: 'fake-sdk', namespace: 'fake' }));
        b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: 'export const createClientFromRequest = () => globalThis.__client;' }));
    } }],
});
const CORE = pathToFileURL(out).href;

const tables = {};
let failUpdate = false, n = 0;
const T = (name) => {
  const rows = (tables[name] ||= []);
  return {
    filter: async (q = {}, sort, limit = 1000, skip = 0) => {
      let r = rows.filter((x) => Object.entries(q).every(([k, v]) => x[k] === v));
      if (sort && sort.startsWith('-')) r = [...r].reverse();
      return JSON.parse(JSON.stringify(r.slice(skip, skip + limit)));
    },
    create: async (d) => { const row = { id: `${name}${++n}`, created_date: new Date().toISOString(), ...JSON.parse(JSON.stringify(d)) }; rows.push(row); return row; },
    update: async (id, p) => { if (name === 'AiOrderSession' && failUpdate) throw new Error('db down'); Object.assign(rows.find((x) => x.id === id), JSON.parse(JSON.stringify(p))); },
  };
};
const entities = new Proxy({}, { get: (_, k) => T(k) });
globalThis.__client = { auth: { me: async () => { throw new Error('no'); } }, asServiceRole: { entities, functions: { invoke: async (f, a) => {
  if (f === 'verifyAndCreateOrder') { const o = await entities.Order.create({ ...a.orderData, order_source: 'online' }); return { data: { success: true, order_id: o.id, order_number: 'C-1' } }; }
  return { data: { success: true } }; } } } };
globalThis.Deno = { env: { get: (k) => (k === 'AI_CORE_API_KEY' ? 'k' : undefined) }, serve: (h) => { globalThis.h = h; } };
let fetchMode = 'down';
globalThis.fetch = async () => { if (fetchMode === 'down') throw new Error('timeout'); return new Response(JSON.stringify({ result: { latitude: 51.46, longitude: 0.36, postcode: 'RM18 7NR' } })); };
await import(CORE);
const call = async (body) => (await globalThis.h(new Request('http://x', { method: 'POST', body: JSON.stringify({ key: 'k', ...body }) }))).json();
tables.Restaurant = [{ id: 'r1', name: 'T', collection_enabled: true }];
tables.MenuItem = [{ id: 'm1', restaurant_id: 'r1', name: 'Chicken Burger', price: 9, category: 'Burgers', is_available: true }, { id: 'm2', restaurant_id: 'r1', name: 'Veggie Wrap', price: 5, category: 'Wraps', is_available: true }];
let pass = 0, total = 0;
const ck = (label, ok, d = '') => { total++; if (ok) pass++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} ${ok ? '' : JSON.stringify(d)}`); };
const start = async (phone) => (await call({ action: 'start_session', channel: 'test', restaurant_id: 'r1', customer_phone: phone, customer_name: 'Sam Jones' })).session_id;

// guessed item is confirmed first
let s = await start('07700900001');
let r = await call({ action: 'add_item', session_id: s, item_name: 'chiken burger', quantity: 1 });
ck('fuzzy name -> CONFIRM_ITEM', r.code === 'CONFIRM_ITEM' && r.did_you_mean?.[0]?.name === 'Chicken Burger', r);
r = await call({ action: 'get_basket', session_id: s });
ck('nothing added on a guess', r.basket.length === 0, r.basket);
r = await call({ action: 'add_item', session_id: s, item_name: 'Chicken Burger', quantity: 1 });
ck('exact name added', r.added === true, r);
ck('quote says cash allowed at £9', r.quote.cash_allowed === true, r.quote);
await call({ action: 'set_order_type', session_id: s, order_type: 'collection' });
r = await call({ action: 'place_cash_order', session_id: s });
ck('cash order under limit placed', r.ok && r.order_id, r);

// one open cash order per number
let s2 = await start('07700900001');
await call({ action: 'add_item', session_id: s2, menu_item_id: 'm2', quantity: 1 });
await call({ action: 'set_order_type', session_id: s2, order_type: 'collection' });
r = await call({ action: 'place_cash_order', session_id: s2 });
ck('second cash order same number -> CASH_ORDER_OPEN', r.code === 'CASH_ORDER_OPEN', r);
tables.Order[0].status = 'collected';
r = await call({ action: 'place_cash_order', session_id: s2 });
ck('allowed once the first is collected', r.ok && r.order_id, r);
r = await call({ action: 'get_context', session_id: s2 });
ck('returning customer: first name only, no address/items', r.returning_customer?.name === 'Sam' && !('last_delivery_address' in r.returning_customer) && !('last_items' in r.returning_customer), r.returning_customer);

// cash limit
let s3 = await start('07700900002');
await call({ action: 'add_item', session_id: s3, menu_item_id: 'm1', quantity: 6 });
await call({ action: 'set_order_type', session_id: s3, order_type: 'collection' });
r = await call({ action: 'get_basket', session_id: s3 });
ck('£54 basket: cash not allowed in quote', r.quote.total === 54 && r.quote.cash_allowed === false, r.quote);
r = await call({ action: 'place_cash_order', session_id: s3 });
ck('£54 cash -> CASH_LIMIT', r.code === 'CASH_LIMIT', r);
await call({ action: 'set_quantity', session_id: s3, line: 1, quantity: 5 });
r = await call({ action: 'place_cash_order', session_id: s3, dry_run: true });
ck('£45 cash passes (dry run)', r.ok && r.dry_run, r);
r = await call({ action: 'send_payment_link', session_id: s3, send_sms: false });
ck('card link still offered', r.ok && /AiCheckout\?t=/.test(r.checkout_url), r);

// failed save is not reported as success
let s4 = await start('07700900003');
failUpdate = true;
r = await call({ action: 'add_item', session_id: s4, menu_item_id: 'm1', quantity: 1 });
ck('save failure -> SAVE_FAILED, not "Added"', r.ok === false && r.code === 'SAVE_FAILED', r);
r = await call({ action: 'search_menu', session_id: s4, query: 'burger' });
ck('read-only action still answers when the log write fails', r.ok === true, r);
failUpdate = false;

// postcode lookup down
tables.DeliveryZone = [{ id: 'z1', restaurant_id: 'r1', is_active: true, zone_type: 'radius', radius_miles: 3, radius_center: { lat: 51.46, lng: 0.36 }, delivery_fee: 2, min_order_value: 10 }];
await call({ action: 'set_order_type', session_id: s4, order_type: 'delivery' });
r = await call({ action: 'check_delivery', session_id: s4, postcode: 'RM18 7NR' });
ck('lookup down + map zone -> DELIVERY_CHECK_UNAVAILABLE (not OUT_OF_AREA)', r.code === 'DELIVERY_CHECK_UNAVAILABLE', r);
fetchMode = 'up';
r = await call({ action: 'check_delivery', session_id: s4, postcode: 'RM18 7NR' });
ck('lookup up -> delivers', r.ok && r.delivery?.available === true && r.delivery.fee === 2, r);
fetchMode = 'down';
tables.DeliveryZone = [{ id: 'z2', restaurant_id: 'r1', is_active: true, zone_type: 'postcode', postcodes: ['RM18'], delivery_fee: 1, min_order_value: 0 }];
r = await call({ action: 'check_delivery', session_id: s4, postcode: 'RM18 7NR' });
ck('lookup down + postcode zone still matches', r.ok && r.delivery?.available === true, r);
r = await call({ action: 'check_delivery', session_id: s4, postcode: 'SS1 1AA' });
ck('lookup down + postcode-only zones, other area -> OUT_OF_AREA', r.code === 'OUT_OF_AREA', r);
console.log(`\n${pass}/${total} correct`);
process.exit(pass === total ? 0 : 1);
