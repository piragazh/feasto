#!/usr/bin/env node
/**
 * check-print-queue.mjs - runs the REAL managePrintQueue handler. A printer whose
 * IP changed made the agent hang rather than fail, and a job reclaimed after
 * hanging was reset WITHOUT counting as an attempt - so it retried forever and
 * 300+ jobs piled up at one site. Also guards: stale tickets expire instead of
 * flooding out when the printer returns, newest prints first, a manual retry
 * gets a fresh window, and stuck jobs can be cleared in one action.
 */
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../base44/functions/managePrintQueue/entry.ts', import.meta.url),'utf8')
  .split('\n').filter(l=>!/^import /.test(l)).join('\n');

// Timestamps exactly as the platform returns them: UTC, no Z, microseconds.
const naive = (msAgo) => new Date(Date.now() - msAgo).toISOString().replace('Z','').replace(/(\.\d{3})$/, '$1000');

function world(jobs) {
  const db = { PrintJob: jobs.map(j => ({ restaurant_id:'r1', retry_count:0, ...j })) };
  const ents = { PrintJob: {
    filter: async (q={}) => db.PrintJob.filter(r => Object.entries(q).every(([k,v]) => {
      if (v && typeof v === 'object' && '$gte' in v) return true;
      return r[k] === v;
    })),
    update: async (id,d) => { const r=db.PrintJob.find(x=>x.id===id); Object.assign(r,d); return r; },
    delete: async (id) => { db.PrintJob = db.PrintJob.filter(x=>x.id!==id); },
    create: async (d) => { const r={id:'new',...d}; db.PrintJob.push(r); return r; },
  }, PrintAgent: { filter: async()=>[], update: async()=>({}), create: async()=>({}) } };
  let handler;
  new Function('Deno','createClientFromRequest',src)(
    { serve: f=>{handler=f;}, env:{ get:()=> 'KEY' } },
    () => ({ auth:{ me: async()=>({email:'boss@x.com'}) }, asServiceRole:{ entities: ents } }));
  const call = async (body) => { const q=[console.log,console.error,console.warn]; console.log=console.error=console.warn=()=>{};
    try { const r = await handler(new Request('http://x',{method:'POST',headers:{'x-api-key':'KEY'},body:JSON.stringify({restaurant_id:'r1',api_key:'KEY',...body})})); return await r.json(); }
    finally { [console.log,console.error,console.warn]=q; } };
  return { call, db };
}
const checks=[]; const ck=(l,ok,d)=>{checks.push(ok);console.log(`  ${ok?'✓':'✗ WRONG'}  ${l.padEnd(56)} ${d}`);};

// YOUR SCENARIO: printer IP changed, so connection hangs and the agent never reports.
{ const w = world([{ id:'j1', status:'processing', agent_id:'a1', created_date: naive(60000), updated_date: naive(3*60000) }]);
  let polls = 0;
  for (; polls < 10; polls++) {
    const job = w.db.PrintJob[0];
    if (job.status === 'failed') break;
    if (job.status === 'pending') { job.status = 'processing'; job.agent_id = 'a1'; job.next_retry_at = null; }
    job.updated_date = naive(3*60000);                       // hangs again for 3 minutes
    await w.call({ action:'poll', agent_id:'a1' });
  }
  const j = w.db.PrintJob[0];
  ck('REGRESSION GUARD: a hanging printer stops retrying', j.status==='failed', `failed after ${polls} polls, retry_count ${j.retry_count}`);
  ck('and says what to check', /IP address/.test(j.error_message||''), (j.error_message||'').slice(0,46)); }

{ const w = world([{ id:'old', status:'pending', created_date: naive(45*60000) }]);
  await w.call({ action:'poll', agent_id:'a1' });
  ck('a 45-minute-old ticket is EXPIRED, not printed', w.db.PrintJob[0].status==='failed' && /Expired/.test(w.db.PrintJob[0].error_message), w.db.PrintJob[0].status); }

{ const w = world([{ id:'fresh', status:'pending', created_date: naive(2*60000) }]);
  await w.call({ action:'poll', agent_id:'a1' });
  ck('a current ticket still prints', w.db.PrintJob[0].status!=='failed', w.db.PrintJob[0].status); }

{ const w = world([
    { id:'older', status:'pending', created_date: naive(10*60000) },
    { id:'newer', status:'pending', created_date: naive(1*60000) } ]);
  const r = await w.call({ action:'poll', agent_id:'a1' });
  const first = (r.jobs||r.job ? (r.jobs||[r.job]) : [])[0]?.id;
  ck('after an outage, the NEWEST ticket prints first', first==='newer', `first: ${first}`); }

{ const w = world([{ id:'x', status:'failed', created_date: naive(90*60000), expires_at: new Date(Date.now()-3600e3).toISOString() }]);
  await w.call({ action:'manual_retry', job_id:'x' });
  await w.call({ action:'poll', agent_id:'a1' });
  ck('a manual Retry gets a fresh window, not re-expired', w.db.PrintJob[0].status!=='failed', w.db.PrintJob[0].status); }

{ const w = world(Array.from({length:300},(_,i)=>({ id:'s'+i, status: i%2?'pending':'processing', created_date: naive(60000) })));
  const r = await w.call({ action:'clear_stuck' });
  const left = w.db.PrintJob.filter(j=>j.status==='pending'||j.status==='processing').length;
  ck('clears all 300 stuck jobs in one action', r.cleared===300 && left===0, `cleared ${r.cleared}, still stuck ${left}`);
  ck('keeps a record of what did not print', w.db.PrintJob.length===300, `${w.db.PrintJob.length} records kept`); }

const good=checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good===checks.length?0:1);
