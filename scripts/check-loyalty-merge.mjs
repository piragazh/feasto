#!/usr/bin/env node
/**
 * check-loyalty-merge.mjs - runs the REAL awardLoyaltyPoints handler. A customer
 * who signs in sometimes and checks out as a guest other times builds two
 * balances; they are merged into the account. The guest record is zeroed and
 * stamped rather than deleted, so the merge is auditable and can never be
 * applied twice - which would inflate points on every later order.
 */
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../base44/functions/awardLoyaltyPoints/entry.ts', import.meta.url), 'utf8')
  .split('\n').filter(l => !/^import /.test(l)).join('\n');

function world({ account = null, guest = null, signedIn = true } = {}) {
  const db = { LoyaltyPoints: [], LoyaltyTransaction: [] };
  let n = 0;
  if (account) db.LoyaltyPoints.push({ id: 'acc', user_email: 'sam@x.com', total_points: account, points_earned: account, points_redeemed: 0, orders_count: 2 });
  if (guest !== null) db.LoyaltyPoints.push({ id: 'gst', user_email: 'phone:07123456789', total_points: guest, points_earned: guest, points_redeemed: 0, orders_count: 3 });
  const order = {
    id: 'o1', restaurant_id: 'r1', total: 20, status: 'delivered',
    created_by: signedIn ? 'sam@x.com' : 'anonymous', phone: '+44 7123 456789',
  };
  const table = (name) => ({
    filter: async (q = {}) => (name === 'Order' ? [order] : name === 'Restaurant' ? [{ id: 'r1', loyalty_enabled: true, loyalty_points_multiplier: 1 }]
      : name === 'SystemSettings' ? [{ setting_key: 'loyalty_points_per_pound', setting_value: '1' }]
      : (db[name] || [])).filter(r => Object.entries(q).every(([k, v]) => r[k] === v)),
    create: async (d) => { const r = { id: `${name}-${++n}`, ...d }; (db[name] ||= []).push(r); return r; },
    update: async (id, d) => { const r = (db[name] || []).find(x => x.id === id); Object.assign(r || {}, d); return r; },
  });
  const ents = {}; for (const k of ['Order', 'Restaurant', 'SystemSettings', 'LoyaltyPoints', 'LoyaltyTransaction']) ents[k] = table(k);
  const base44 = { auth: { me: async () => { throw new Error('no session'); } }, asServiceRole: { entities: ents } };
  let handler;
  new Function('Deno', 'createClientFromRequest', src)({ serve: (f) => { handler = f; }, env: { get: () => 'x' } }, () => base44);
  const call = async () => {
    const q = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => {};
    try { const r = await handler(new Request('http://x', { method: 'POST', body: JSON.stringify({ orderId: 'o1' }) })); return await r.json().catch(() => ({})); }
    finally { [console.log, console.warn, console.error] = q; }
  };
  const find = (key) => db.LoyaltyPoints.find(r => r.user_email === key);
  return { call, db, find };
}
const checks = [];
const check = (label, ok, detail) => { checks.push(ok); console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${label.padEnd(50)} ${detail}`); };

{ const w = world({ account: 50, guest: 120 });
  await w.call();
  const acc = w.find('sam@x.com'), gst = w.find('phone:07123456789');
  // 50 existing + 120 merged + 20 earned for this £20 order
  check('guest balance merges into the account', acc.total_points === 190 && gst.total_points === 0,
        `account ${acc.total_points}, guest ${gst.total_points}`);
  check('guest record kept and stamped, not deleted', gst.merged_into === 'sam@x.com' && !!gst.merged_at, `merged_into ${gst.merged_into}`); }

{ const w = world({ account: 50, guest: 120 });
  await w.call(); const first = w.find('sam@x.com').total_points;
  await w.call(); const second = w.find('sam@x.com').total_points;
  check('REGRESSION GUARD: never merges twice', second - first <= 20, `after 1st ${first}, after 2nd ${second}`); }

{ const w = world({ account: 50, guest: 120, signedIn: false });
  await w.call();
  check('a guest order does not merge anything', (w.find('phone:07123456789').total_points) > 0, `guest ${w.find('phone:07123456789').total_points}`); }

{ const w = world({ account: 50, guest: 0 });
  await w.call();
  check('an empty guest balance is left alone', !w.find('phone:07123456789').merged_into, 'not stamped'); }

{ const w = world({ account: null, guest: 80 });
  await w.call();
  const acc = w.find('sam@x.com');
  check('merges even when the account has no balance yet', acc && acc.total_points === 100, `account ${acc?.total_points}`); }

const good = checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good === checks.length ? 0 : 1);
