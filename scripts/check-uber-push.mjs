#!/usr/bin/env node
/**
 * check-uber-push.mjs - runs the REAL uberEatsPushStatus handler with Uber
 * simulated. Guards the properties that matter: accept is sent exactly once
 * (accepting twice is an error on Uber's side), non-Uber orders are untouched,
 * nothing happens without credentials, and a FAILED push stays retryable - an
 * order Uber never hears about is auto-cancelled on them.
 */
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../base44/functions/uberEatsPushStatus/entry.ts', import.meta.url),'utf8')
  .split('\n').filter(l=>!/^import /.test(l)).join('\n');

function world({ order, creds = true, apiOk = true, tokenOk = true } = {}) {
  const db = { Order: [order] };
  const calls = [];
  const ents = { Order: {
    filter: async (q) => db.Order.filter(r => r.id === q.id),
    update: async (id, d) => { const r = db.Order.find(x => x.id === id); Object.assign(r, d); return r; },
  }};
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    if (String(url).includes('oauth')) {
      return tokenOk ? { ok: true, json: async () => ({ access_token: 't', expires_in: 3000 }) }
                     : { ok: false, status: 401, text: async () => 'bad creds' };
    }
    return apiOk ? { ok: true, text: async () => '' } : { ok: false, status: 500, text: async () => 'uber down' };
  };
  let handler;
  new Function('Deno','createClientFromRequest',src)(
    { serve: f => { handler = f; }, env: { get: k => creds ? 'x' : undefined } },
    () => ({ asServiceRole: { entities: ents } }));
  const call = async () => { const q=[console.log,console.error]; console.log=console.error=()=>{};
    try { const r = await handler(new Request('http://x',{method:'POST',body:JSON.stringify({orderId:'o1'})})); return {status:r.status, ...(await r.json())}; }
    finally { [console.log,console.error]=q; } };
  return { call, db, calls };
}
const uber = (extra={}) => ({ id:'o1', third_party_platform:'uber_eats', third_party_order_id:'UB123', status:'confirmed', ...extra });
const checks=[]; const ck=(l,ok,d)=>{checks.push(ok);console.log(`  ${ok?'✓':'✗ WRONG'}  ${l.padEnd(52)} ${d}`);};

{ const w=world({order:uber()}); const r=await w.call();
  ck('confirmed order sends accept', r.pushed && r.action==='accept', w.calls.find(c=>c.includes('accept'))?.split('/v1/eats')[1] || '-'); }

{ const w=world({order:uber()}); await w.call(); const r2=await w.call();
  ck('REGRESSION GUARD: never accepts twice', !!r2.skipped, r2.skipped); }

{ const w=world({order:uber({status:'ready_for_collection'})}); const r=await w.call();
  ck('ready_for_collection sends ready', r.action==='ready', String(r.pushed)); }

{ const w=world({order:uber({status:'cancelled'})}); const r=await w.call();
  ck('cancelled sends cancel', r.action==='cancel', String(r.pushed)); }

{ const w=world({order:{id:'o1',status:'confirmed'}}); const r=await w.call();
  ck('a normal (non-Uber) order is left alone', !!r.skipped && w.calls.length===0, r.skipped); }

{ const w=world({order:uber(),creds:false}); const r=await w.call();
  ck('does nothing when credentials are unset', !!r.skipped && w.calls.length===0, r.skipped); }

{ const w=world({order:uber(),apiOk:false}); const r=await w.call();
  const o=w.db.Order[0];
  ck('a failed push is retryable, not marked sent', r.pushed===false && !o.uber_status_pushed?.accept && !!o.uber_push_error, o.uber_push_error?.slice(0,28)); }

{ const w=world({order:uber({status:'pending'})}); const r=await w.call();
  ck('pending sends nothing (not yet accepted by staff)', !!r.skipped && w.calls.length===0, r.skipped); }

const good=checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good===checks.length?0:1);
