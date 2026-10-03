#!/usr/bin/env node
/**
 * check-uber-push.mjs - runs the REAL uberEatsPushStatus handler with Uber
 * simulated. Guards the properties that matter:
 *   - accept is sent exactly once (accepting twice is an error on Uber's side)
 *   - a REJECTED order is denied, a cancelled-after-accept order is cancelled,
 *     and both use Uber's fixed reason codes
 *   - non-Uber orders are untouched, nothing happens without credentials
 *   - a failed push stays retryable BUT CANNOT LOOP: the workflow fires on every
 *     order update, including the function's own, so each re-trigger is replayed
 *     here until the chain goes quiet
 */
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../base44/functions/uberEatsPushStatus/entry.ts', import.meta.url),'utf8')
  .split('\n').filter(l=>!/^import /.test(l)).join('\n')
  // The in-call waits are real seconds in production; not worth sitting through here.
  .replace('const IN_CALL_WAITS_MS = [800, 2000];', 'const IN_CALL_WAITS_MS = [1, 1];');

/** apiStatus: a number for every call, or a function (url, nthApiCall) => number. */
function world({ order, orders, creds = true, apiStatus = 200, tokenOk = true, user = null } = {}) {
  const db = { Order: orders || [order] };
  const calls = []; const bodies = [];
  let updates = 0, apiCalls = 0;
  const ents = { Order: {
    filter: async (q) => db.Order.filter(r => Object.entries(q).every(([k, v]) => r[k] === v)),
    update: async (id, d) => { updates++; const r = db.Order.find(x => x.id === id); Object.assign(r, d); return r; },
  }};
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    if (String(url).includes('oauth')) {
      return tokenOk ? { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3000 }) }
                     : { ok: false, status: 401, text: async () => 'bad creds' };
    }
    bodies.push(JSON.parse(opts?.body || '{}'));
    const s = typeof apiStatus === 'function' ? apiStatus(String(url), ++apiCalls) : apiStatus;
    return s >= 200 && s < 300 ? { ok: true, status: s, text: async () => '' } : { ok: false, status: s, text: async () => 'uber says no' };
  };
  let handler;
  new Function('Deno','createClientFromRequest',src)(
    { serve: f => { handler = f; }, env: { get: k => creds ? 'x' : undefined } },
    () => ({ auth: { me: async () => { if (!user) throw new Error('not signed in'); return user; } }, asServiceRole: { entities: ents } }));
  const call = async (body = { orderId: 'o1' }) => { const q=[console.log,console.error]; console.log=console.error=()=>{};
    try { const r = await handler(new Request('http://x',{method:'POST',body:JSON.stringify(body)})); return {status:r.status, ...(await r.json())}; }
    finally { [console.log,console.error]=q; } };
  const api = () => calls.filter(c => !c.includes('oauth'));
  return { call, db, calls, bodies, api, updates: () => updates };
}
const uber = (extra={}) => ({ id:'o1', third_party_platform:'uber_eats', third_party_order_id:'UB123', status:'confirmed', ...extra });
const accepted = (extra={}) => uber({ uber_status_pushed: { accept: '2026-01-01T00:00:00Z' }, ...extra });
const checks=[]; const ck=(l,ok,d='')=>{checks.push(ok);console.log(`  ${ok?'✓':'✗ WRONG'}  ${l.padEnd(56)} ${d}`);};
const tail = (w) => w.api().map(c => c.split('/').pop()).join(' > ') || '-';

{ const w=world({order:uber()}); const r=await w.call();
  ck('confirmed order sends accept', r.pushed && r.action==='accept', w.calls.find(c=>c.includes('accept'))?.split('/v1/eats')[1] || '-');
  ck('...in a single write', w.updates()===1, `${w.updates()} writes`); }

{ const w=world({order:uber()}); await w.call(); const r2=await w.call();
  ck('REGRESSION GUARD: never accepts twice', !!r2.skipped && w.api().length===1, r2.skipped); }

{ const w=world({order:accepted({status:'ready_for_collection'})}); const r=await w.call();
  ck('ready_for_collection sends ready', r.action==='ready' && w.api().length===1, tail(w)); }

{ const w=world({order:uber({status:'ready_for_collection'})}); const r=await w.call();
  ck('ready on a never-accepted order accepts first', r.pushed && tail(w)==='accept_pos_order > restaurant_order_ready', tail(w)); }

// ── reject vs cancel ────────────────────────────────────────────────────────
{ const w=world({order:uber({status:'cancelled', rejection_reason:'Too busy tonight'})}); const r=await w.call();
  ck('REJECT (cancelled, never accepted) sends DENY', r.pushed && r.action==='deny' && tail(w)==='deny_pos_order', tail(w));
  ck('...with one of Uber\'s reason codes', w.bodies[0]?.reason?.code==='CAPACITY' && w.bodies[0].reason.explanation==='Too busy tonight', JSON.stringify(w.bodies[0])); }

{ const w=world({order:accepted({status:'cancelled', cancellation_reason:'Fryer broke'})}); const r=await w.call();
  ck('cancel AFTER accept sends cancel', r.pushed && r.action==='cancel' && tail(w)==='cancel', tail(w));
  ck('...reason is an allowed value, text in details', w.bodies[0]?.reason==='OTHER' && w.bodies[0].details==='Fryer broke', JSON.stringify(w.bodies[0])); }

{ const w=world({order:accepted({status:'cancelled', cancellation_reason:'Out of stock'})}); await w.call();
  ck('"out of stock" maps to OUT_OF_ITEMS', w.bodies[0]?.reason==='OUT_OF_ITEMS' && !('details' in w.bodies[0]), JSON.stringify(w.bodies[0])); }

{ const w=world({order:uber({status:'cancelled', uber_status_pushed:{ cancel:'2026-01-01T00:00:00Z' }})}); const r=await w.call();
  ck('order Uber cancelled itself is not echoed back', !!r.skipped && w.api().length===0, r.skipped); }

{ const w=world({order:accepted({status:'cancelled'}), apiStatus:404}); const r=await w.call();
  ck('cancel answered 404 (already finished) counts as done', r.pushed===true && !w.db.Order[0].uber_push_error, String(r.pushed)); }

// ── untouched cases ─────────────────────────────────────────────────────────
{ const w=world({order:{id:'o1',status:'confirmed'}}); const r=await w.call();
  ck('a normal (non-Uber) order is left alone', !!r.skipped && w.calls.length===0 && w.updates()===0, r.skipped); }

{ const w=world({order:uber(),creds:false}); const r=await w.call();
  ck('does nothing when credentials are unset', !!r.skipped && w.calls.length===0, r.skipped); }

{ const w=world({order:uber({status:'pending'})}); const r=await w.call();
  ck('pending sends nothing (not yet accepted by staff)', !!r.skipped && w.calls.length===0, r.skipped); }

// ── failure, retry, and the loop ────────────────────────────────────────────
{ const w=world({order:uber(),apiStatus:500}); const r=await w.call();
  const o=w.db.Order[0];
  ck('a failed push is retryable, not marked sent', r.pushed===false && !o.uber_status_pushed?.accept && !!o.uber_push_error && o.uber_push_pending===true, o.uber_push_error?.slice(0,28));
  ck('transient failure retried in place first', w.api().length===3, `${w.api().length} tries`);
  ck('...and recorded with a next-retry time', o.uber_push_retry?.attempts===1 && new Date(o.uber_push_retry.next_retry_at) > new Date(), o.uber_push_retry?.next_retry_at); }

{ // The workflow fires on EVERY order update. Replay each write as a new
  // invocation, as the platform would, and see whether the chain ends.
  const w=world({order:uber(),apiStatus:500});
  let seen=0, invocations=0;
  await w.call(); invocations++;
  while (w.updates()>seen && invocations<50) { const fire=w.updates()-seen; seen=w.updates(); for (let i=0;i<fire;i++){ await w.call(); invocations++; } }
  ck('REGRESSION GUARD: a failure does not loop', invocations<=3 && w.api().length===3, `${invocations} invocations, ${w.api().length} Uber calls, ${w.updates()} writes`); }

{ const w=world({order:uber(),apiStatus:500}); await w.call(); const before=w.updates(); const r=await w.call();
  ck('inside the back-off window: skipped, zero writes', !!r.skipped && /backing off/.test(r.skipped) && w.updates()===before, r.skipped?.slice(0,22)); }

{ const w=world({order:uber(),apiStatus:400}); const r=await w.call(); const o=w.db.Order[0];
  ck('permanent rejection (4xx) is not retried', r.gave_up===true && w.api().length===1 && o.uber_push_pending===false, `${w.api().length} call, gave_up=${r.gave_up}`); }

{ const w=world({order:uber({ uber_push_retry:{ action:'accept', attempts:5, next_retry_at:'2020-01-01T00:00:00Z' } }),apiStatus:503});
  const r=await w.call(); const o=w.db.Order[0]; const r2=await w.call();
  ck('gives up after the attempt cap', r.gave_up===true && o.uber_push_pending===false && /gave up/.test(o.uber_push_error), o.uber_push_error?.slice(-26));
  ck('...and stays given up', !!r2.skipped && /gave up/.test(r2.skipped), r2.skipped); }

{ const w=world({order:uber({ uber_push_error:'accept: 500', uber_push_pending:true, uber_push_retry:{ action:'accept', attempts:1, next_retry_at:'2020-01-01T00:00:00Z' } })});
  const r=await w.call(); const o=w.db.Order[0];
  ck('a retry that succeeds clears the error', r.pushed && !!o.uber_status_pushed.accept && o.uber_push_error==='' && o.uber_push_pending===false, JSON.stringify(o.uber_push_error)); }

{ const due = uber({ id:'a', uber_push_pending:true, uber_push_retry:{ action:'accept', attempts:1, next_retry_at:'2020-01-01T00:00:00Z' } });
  const notDue = uber({ id:'b', third_party_order_id:'UB2', uber_push_pending:true, uber_push_retry:{ action:'accept', attempts:1, next_retry_at:'2999-01-01T00:00:00Z' } });
  const fine = uber({ id:'c', third_party_order_id:'UB3' });
  const w=world({orders:[due,notDue,fine]}); const r=await w.call({ sweep:true });
  ck('sweep retries only what is due', r.retried===1 && tail(w)==='accept_pos_order' && !!w.db.Order[0].uber_status_pushed?.accept && !w.db.Order[1].uber_status_pushed?.accept, `retried ${r.retried} of ${r.pending} pending`); }

// ── manual "Retry now" from the order card ──────────────────────────────────
{ const stuck = () => uber({ uber_push_error:'accept: 503 — gave up after 6 attempts', uber_push_pending:false, uber_push_retry:{ action:'accept', attempts:6, next_retry_at:null, gave_up:true } });
  const w=world({order:stuck(), user:{ email:'staff@x' }}); const r=await w.call({ orderId:'o1', force:true }); const o=w.db.Order[0];
  ck('Retry now re-sends an order that had given up', r.pushed && !!o.uber_status_pushed?.accept && o.uber_push_error==='', tail(w));
  const w2=world({order:stuck()}); const r2=await w2.call({ orderId:'o1', force:true });
  ck('...but only for a signed-in person', r2.status===401 && w2.api().length===0, `status ${r2.status}`);
  const w3=world({order:stuck()}); const r3=await w3.call();
  ck('...and the workflow alone still leaves it given up', !!r3.skipped && w3.api().length===0, r3.skipped); }

const good=checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good===checks.length?0:1);
