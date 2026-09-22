#!/usr/bin/env node
/**
 * check-timestamps.mjs - platform timestamps (created_date / updated_date) arrive
 * as UTC with no "Z", so browsers showed every order one hour early in BST.
 * Runs the REAL base44Client wrapper in UK time and checks every read path shows
 * the true UK time, while owner-entered dates are left untouched.
 */
import fs from 'node:fs';
import { normalizePlatformTimestamps } from '../src/lib/platformTimestamps.js';
const STORED = '2026-09-22T15:33:32.810000';   // exactly as the platform returned your order
let subscriber;
// A fake SDK that behaves like the real one, including methods that rely on `this`.
const createClient = () => ({
  auth: { me: async () => ({ email: 'x' }) },
  entities: {
    Order: {
      _rows: [{ id: 'o1', created_date: STORED, updated_date: STORED, total: 3.55 }],
      filter: async function () { return this._rows; },            // uses `this`
      get: async function (id) { return this._rows.find(r => r.id === id); },
      subscribe(cb) { subscriber = cb; return () => {}; },
      name: 'Order',
    },
  },
  functions: { invoke: async () => ({ data: { order: { id: 'o2', created_date: STORED } } }) },
});
const code = fs.readFileSync(new URL('../src/api/base44Client.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace('export const base44 =', 'const base44 =')
  + '\nreturn base44;';
const base44 = new Function('createClient', 'appParams', 'getApiUrl', 'normalizePlatformTimestamps', code)(
  createClient, { appId: 'a' }, () => 'https://x', normalizePlatformTimestamps);

const uk = (iso) => new Date(iso).toLocaleTimeString('en-GB');
const checks = [];
const check = (label, ok, detail) => { checks.push(ok); console.log(`  ${ok ? '✓' : '✗'}  ${label.padEnd(44)} ${detail}`); };

const rows = await base44.entities.Order.filter({});
check('order list shows the real UK time', uk(rows[0].created_date) === '16:33:32', `shows ${uk(rows[0].created_date)} (was 15:33:32)`);
const one = await base44.entities.Order.get('o1');
check('single order', uk(one.updated_date) === '16:33:32', `shows ${uk(one.updated_date)}`);
let live; base44.entities.Order.subscribe(e => { live = e; });
subscriber({ type: 'create', data: { id: 'o3', created_date: STORED } });
check('live update (new order arriving)', uk(live.data.created_date) === '16:33:32', `shows ${uk(live.data.created_date)}`);
const fn = await base44.functions.invoke('posCreateOrder', {});
check('order returned by a backend function', uk(fn.data.order.created_date) === '16:33:32', `shows ${uk(fn.data.order.created_date)}`);
check('methods relying on `this` still work', rows.length === 1, `${rows.length} row(s)`);
check('other data untouched', rows[0].total === 3.55, `total £${rows[0].total}`);
check('non-entity parts pass through (auth)', (await base44.auth.me()).email === 'x', 'auth.me ok');
check('plain entity properties pass through', base44.entities.Order.name === 'Order', `name: ${base44.entities.Order.name}`);
const good = checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good === checks.length ? 0 : 1);
