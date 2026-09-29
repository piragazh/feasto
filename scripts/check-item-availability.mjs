#!/usr/bin/env node
/**
 * check-item-availability.mjs - "can this item be sold here, now?" is ONE rule,
 * everywhere (src/lib/item-availability.js).
 *
 * 27 Sep: a POS-only item showed on the online menu (PopularItems cached ALL
 * items under the menu's own query key); kiosk and QR screens offered items
 * their servers refused; online checkout never checked the channel; and time
 * windows were enforced at the till only.
 */
import fs from 'node:fs';
import * as A from '../src/lib/item-availability.js';
import { isItemAvailableNow } from '../src/lib/pos-schedule-logic.js';
import { TARGETS } from './sync-item-availability.mjs';

const checks = []; const ck = (l, ok, d = '') => { checks.push(!!ok); console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${l.padEnd(66)} ${d}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const S = '// ── ITEM AVAILABILITY (shared', E = '// ── END ITEM AVAILABILITY';
const blockOf = (s) => { const a = s.indexOf(S), e = s.indexOf(E); return a < 0 || e < 0 ? null : s.slice(a, s.indexOf('\n', e)); };

// ── 1. identical copies in every server that takes orders ────────────────────
const lib = blockOf(read('src/lib/item-availability.js'));
for (const fn of TARGETS) {
  const b = blockOf(read(`base44/functions/${fn}/entry.ts`));
  ck(`${fn} has the availability block, character for character`, b === lib, b ? (b === lib ? '' : 'DIFFERS - run sync-item-availability') : 'missing');
}

// ── 2. the time rule IS the till's rule, at every tested instant ─────────────
const WINDOWS = [
  [{ days: [1, 2, 3, 4, 5], start: '17:00', end: '19:00' }],
  [{ days: [5, 6], start: '22:00', end: '02:00' }],                    // late menu past midnight
  [{ days: [0], start: '00:00', end: '00:00' }],                       // all day Sunday
  [{ days: [], start: '11:30', end: '14:30' }],                        // no days = every day
  [{ days: [1], start: '07:00', end: '11:00' }, { days: [6, 0], start: '09:00', end: '12:00' }],
  [{ start: 'bad', end: '12:00' }],                                    // malformed - never on
  [],                                                                  // empty - always on
];
let n = 0; const diffs = [];
// A fortnight in 17-minute steps across both UK clock changes (29 Mar, 25 Oct 2026).
for (const startIso of ['2026-03-22T00:00:00Z', '2026-10-18T00:00:00Z']) {
  for (let t = Date.parse(startIso); t < Date.parse(startIso) + 14 * 864e5; t += 17 * 60e3) {
    const d = new Date(t);
    for (const ws of WINDOWS) {
      n++;
      const item = { availability_windows: ws };
      if (A.inHours(item, d) !== isItemAvailableNow(item, d)) diffs.push(`${d.toISOString()} ${JSON.stringify(ws)}`);
    }
  }
}
ck('time windows: same answer as the till (pos-schedule-logic)', diffs.length === 0, diffs.length ? `${diffs.length} differ, e.g. ${diffs[0]}` : `${n} instants, incl. both clock changes`);

// ── 3. the channel table ────────────────────────────────────────────────────
const expect = { till: ['both', 'pos_only'], online: ['both', 'online_only'], kiosk: ['both'], qr: ['both'] };
const bad = [];
for (const where of Object.keys(expect)) for (const ch of ['both', 'online_only', 'pos_only', undefined, 'typo']) {
  const want = expect[where].includes(ch === undefined || ch === 'typo' ? 'both' : ch);
  if (A.sellsAt({ availability_channel: ch }, where) !== want) bad.push(`${where}/${ch}`);
}
ck('REGRESSION GUARD: POS-only never online / kiosk / QR; online-only never at till', bad.length === 0, bad.join(', '));
ck('an unknown channel value means "both" (never hides a menu)', A.sellsAt({ availability_channel: 'typo' }, 'online') && A.sellsAt({}, 'kiosk'));
ck('switched off beats everything', A.whyNotSellable({ is_available: false }, 'till', new Date()) === 'unavailable');

const future = new Date(Date.now() + 3 * 3600e3);
ck('a scheduled order is checked at its slot; past or unscheduled means now',
  A.forTime(true, future.toISOString()).getTime() === future.getTime()
  && Math.abs(A.forTime(true, '2020-01-01T12:00:00Z').getTime() - Date.now()) < 5000
  && Math.abs(A.forTime(false, future.toISOString()).getTime() - Date.now()) < 5000
  && Math.abs(A.forTime(undefined, 'garbage').getTime() - Date.now()) < 5000);

// ── 4. every server applies it, with the right channel and time ─────────────
const srv = (fn) => strip(read(`base44/functions/${fn}/entry.ts`).split('Deno.serve(')[1] || '');
ck('kioskCreateOrder refuses with the kiosk rule, now', /whyNotSellable\(menuItem, 'kiosk', new Date\(\)\)[\s\S]{0,200}status: 400/.test(srv('kioskCreateOrder')));
ck('tableCreateOrder refuses with the QR rule, now', /whyNotSellable\(menuItem, 'qr', new Date\(\)\)[\s\S]{0,200}status: 400/.test(srv('tableCreateOrder')));
{ const v = strip(read('base44/functions/verifyAndCreateOrder/entry.ts'));
  ck('verifyAndCreateOrder: till or online rule, at the order\'s slot',
    /whyNotSellable\(dbItem, isPOS \? 'till' : 'online', availableAt\)/.test(v) && /availableAt: forTime\(orderData\?\.is_scheduled, orderData\?\.scheduled_for\)/.test(v)); }
{ const c = srv('createPaymentIntent');
  const i = c.indexOf("whyNotSellable(dbItem, 'online', at)"), j = c.search(/paymentIntents\.create|stripe\.paymentIntents/);
  ck('REGRESSION GUARD: createPaymentIntent refuses BEFORE any card intent', i > 0 && (j < 0 || i < j) && /const at = forTime\(is_scheduled, scheduled_for\)/.test(c), i > 0 ? '' : 'no check'); }

// ── 5. every screen shows only what it may sell ──────────────────────────────
{ const r = strip(read('src/pages/Restaurant.jsx'));
  ck('online menu: its own query key, online rule', /queryKey: \['menuItems', 'online', restaurantId\]/.test(r) && /sellsAt\(item, 'online'\)/.test(r));
  ck('online menu: off-hours items greyed and cannot be added', /offHours=\{offHours\}/.test(r) && /if \(offHours\.has\(item\?\.id\)\)/.test(r)); }
{ // the shared-key bug: nothing else may cache items under the online menu's key shape
  const users = [];
  (function walk(d) { for (const e of fs.readdirSync(new URL(`../${d}`, import.meta.url), { withFileTypes: true })) {
    const p = `${d}/${e.name}`;
    if (e.isDirectory()) { if (!['__tests__'].includes(e.name)) walk(p); continue; }
    if (/\.(jsx?|tsx?)$/.test(e.name) && /queryKey: *\[ *['"]menuItems['"] *, *restaurantId *\]/.test(read(p))) users.push(p);
  } })('src');
  ck("REGRESSION GUARD: no screen caches ['menuItems', restaurantId] (the leak)", users.length === 0, users.join(', ')); }
{ const p = strip(read('src/components/restaurant/PopularItems.jsx'));
  ck('popular rail uses the page\'s filtered list, not its own query', !/MenuItem\.filter/.test(p) && /offHours\?\.has\(item\.id\)/.test(p)); }
{ const k = strip(read('src/components/kiosk/KioskMenu.jsx'));
  ck('kiosk menu: kiosk rule + hides off-hours items', /sellsAt\(i, 'kiosk'\)/.test(k) && /inHours\(i, kioskNow\)/.test(k)); }
{ const q = strip(read('src/pages/TableOrder.jsx'));
  ck('QR menu: QR rule + hides off-hours items', /sellsAt\(i, 'qr'\)/.test(q) && /inHours\(i, qrNow\)/.test(q)); }

const good = checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good === checks.length ? 0 : 1);
