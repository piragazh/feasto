#!/usr/bin/env node
/**
 * check-uber-connect.mjs - runs the REAL uberEatsConnect handler with Uber
 * simulated. Guards: the manager signs in on Uber (never on our page), a
 * tampered or someone else's sign-in cannot be used, a custom domain is handed
 * to the main domain, one Uber store feeds one restaurant, and the activation
 * call matches Uber's Activate Integration reference (settings as query
 * parameters, nothing deprecated in the body).
 */
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../base44/functions/uberEatsConnect/entry.ts', import.meta.url), 'utf8')
  .split('\n').filter(l => !/^import /.test(l)).join('\n');

const db = {
  Restaurant: [{ id: 'r1' }, { id: 'r2', third_party_integrations: { uber_eats: { store_id: 'taken' } } }],
  RestaurantManager: [{ user_email: 'm@x', is_active: true, restaurant_ids: ['r1'] }],
};
const t = n => ({
  filter: async q => db[n].filter(r => Object.entries(q).every(([k, v]) => r[k] === v)),
  list: async () => db[n],
  update: async (id, d) => Object.assign(db[n].find(x => x.id === id), d),
});
const calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), method: opts?.method || 'GET', body: String(opts?.body ?? '') });
  if (String(url).includes('/token')) return { ok: true, json: async () => ({ access_token: 'MERCHANT' }) };
  if (String(url).includes('pos_data')) return { ok: true, status: 204, text: async () => '' };
  return { ok: true, json: async () => ({ stores: [{ store_id: 's1', name: 'Tilbury', location: { address: '1 High St', city: 'Tilbury' } }, { store_id: 'taken', name: 'Other' }] }) };
};
let h, user = { email: 'm@x', role: 'user' };
new Function('Deno', 'createClientFromRequest', src)(
  { serve: f => { h = f; }, env: { get: k => ({ UBER_EATS_CLIENT_ID: 'cid', UBER_EATS_CLIENT_SECRET: 'sec', UBER_EATS_REDIRECT_URI: 'https://mealdrop.base44.app/RestaurantDashboard' })[k] } },
  () => ({ auth: { me: async () => user }, asServiceRole: { entities: { Restaurant: t('Restaurant'), RestaurantManager: t('RestaurantManager') } } }));
const call = async b => {
  const q = [console.log, console.error]; console.log = console.error = () => {};
  try { const r = await h(new Request('http://x', { method: 'POST', body: JSON.stringify(b) })); return { status: r.status, ...(await r.json()) }; }
  finally { [console.log, console.error] = q; }
};
const checks = []; const ck = (l, ok, d = '') => { checks.push(ok); console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${l.padEnd(56)} ${d}`); };

const s = await call({ action: 'start', restaurantId: 'r1', origin: 'https://mealdrop.base44.app' });
const u = new URL(s.url);
ck('start sends the manager to Uber\'s own sign-in', u.origin === 'https://auth.uber.com' && u.searchParams.get('scope') === 'eats.pos_provisioning', u.origin);
const state = u.searchParams.get('state');
ck('custom domain is handed to the main domain', (await call({ action: 'start', restaurantId: 'r1', origin: 'https://tilburychicken.co.uk' })).handoff === 'https://mealdrop.base44.app/RestaurantDashboard?restaurantId=r1&uber_connect=1', '');
ck('cannot start for a restaurant you do not manage', (await call({ action: 'start', restaurantId: 'r2' })).status === 403, '');
ck('a tampered sign-in is refused', (await call({ action: 'exchange', code: 'c', state: state.slice(0, -2) + '00' })).status === 400, '');

const e = await call({ action: 'exchange', code: 'c', state });
ck('exchange lists the stores that login manages', e.status === 200 && e.stores?.length === 2, e.stores?.map(x => x.name).join(', '));
ck('the merchant token never reaches the browser', !String(e.grant).includes('MERCHANT'), '');

user = { email: 'other@x', role: 'user' };
ck('a sign-in cannot be finished by someone else', (await call({ action: 'provision', restaurantId: 'r1', storeId: 's1', grant: e.grant })).status === 400, '');
user = { email: 'm@x', role: 'user' };
ck('one Uber store cannot feed two restaurants', (await call({ action: 'provision', restaurantId: 'r1', storeId: 'taken', grant: e.grant })).status === 409, '');

const p = await call({ action: 'provision', restaurantId: 'r1', storeId: 's1', storeName: 'Tilbury', grant: e.grant });
const pos = calls.find(c => c.url.includes('pos_data'));
const pu = new URL(pos.url);
ck('activation saved against the restaurant', p.status === 200 && db.Restaurant[0].third_party_integrations?.uber_eats?.store_id === 's1', '');
ck('activation settings sent as query parameters', pu.searchParams.get('is_order_manager') === 'true' && pu.searchParams.get('integrator_store_id') === 'r1', pu.search);
ck('...with nothing deprecated in the body', pos.body === '{}', pos.body);

const bad = checks.filter(x => !x).length;
console.log(bad ? `\n${bad} check(s) WRONG` : `\nall ${checks.length} checks pass`);
process.exit(bad ? 1 : 0);
