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

// user: who is signed in. managers: RestaurantManager rows (boss@x.com manages r1 by default).
function world(jobs, { agents = [], user = { email:'boss@x.com' }, managers = [{ user_email:'boss@x.com', is_active:true, restaurant_ids:['r1'] }] } = {}) {
  const db = { PrintJob: jobs.map(j => ({ restaurant_id:'r1', retry_count:0, ...j })),
               AgentHeartbeat: agents.map((a, i) => ({ id:'hb'+i, restaurant_id:'r1', ...a })) };
  const tbl = (name) => ({
    filter: async (q={}) => db[name].filter(r => Object.entries(q).every(([k,v]) => (v && typeof v === 'object' && '$gte' in v) ? true : r[k] === v)),
    update: async (id,d) => { const r=db[name].find(x=>x.id===id); Object.assign(r,d); return r; },
    delete: async (id) => { db[name] = db[name].filter(x=>x.id!==id); },
  });
  const ents = { PrintJob: {
    filter: async (q={}) => db.PrintJob.filter(r => Object.entries(q).every(([k,v]) => {
      if (v && typeof v === 'object' && '$gte' in v) return true;
      return r[k] === v;
    })),
    update: async (id,d) => { const r=db.PrintJob.find(x=>x.id===id); Object.assign(r,d); return r; },
    delete: async (id) => { db.PrintJob = db.PrintJob.filter(x=>x.id!==id); },
    // Like the platform: every record gets an id and a created_date (UTC, no Z).
    create: async (d) => { const r={id:'job'+(db.PrintJob.length+1),created_date:naive(0),...d}; db.PrintJob.push(r); return r; },
  }, PrintAgent: { filter: async()=>[], update: async()=>({}), create: async()=>({}) },
     AgentHeartbeat: tbl('AgentHeartbeat'),
     RestaurantManager: { filter: async (q={}) => managers.filter(m => Object.entries(q).every(([k,v]) => m[k] === v)) } };
  let handler;
  new Function('Deno','createClientFromRequest',src)(
    { serve: f=>{handler=f;}, env:{ get:()=> 'KEY' } },
    () => ({ auth:{ me: async()=>user }, asServiceRole:{ entities: ents } }));
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

// ── TILBURY, 27 Sep: an agent built from the setup screen sends "complete" WITHOUT
// agent_id. It was refused every time, the job was reset as stuck, and the same
// receipt printed every 2 minutes for 30 minutes.
{ const w = world([]);
  const q = await w.call({ action:'enqueue', order_data:{ id:'o1' }, printer_ip:'192.168.0.224', config:{ role:'receipt' } });
  let printed = 0;
  for (let cycle = 0; cycle < 10; cycle++) {
    const r = await w.call({ action:'poll', agent_id:'android-agent-1' });
    if (r.job) { printed++; await w.call({ action:'complete', job_id: r.job.id }); }   // as documented: no agent_id
    for (const j of w.db.PrintJob) j.updated_date = naive(3*60000);                     // 3 minutes pass
  }
  const j = w.db.PrintJob.find(x => x.id === q.job_id);
  ck('REGRESSION GUARD: a receipt prints ONCE when complete omits agent_id', printed===1 && j.status==='done', `printed ${printed}x, ${j.status}`); }

{ const w = world([{ id:'j1', status:'processing', agent_id:'a1', created_date: naive(60000) }]);
  const r = await w.call({ action:'complete', job_id:'j1', agent_id:'someone-else' });
  ck('a DIFFERENT agent still cannot complete it', r.error==='Not your job' && w.db.PrintJob[0].status==='processing', r.error||w.db.PrintJob[0].status); }

{ const w = world([{ id:'j1', status:'pending', agent_id:null, retry_count:1, created_date: naive(60000) }]);
  await w.call({ action:'complete', job_id:'j1', agent_id:'a1' });
  ck('a late "printed" after a stuck-reset lands - no reprint', w.db.PrintJob[0].status==='done', w.db.PrintJob[0].status); }

{ const w = world([{ id:'j1', status:'failed', error_message:'Cancelled by boss', created_date: naive(60000) }]);
  await w.call({ action:'complete', job_id:'j1', agent_id:'a1' });
  await w.call({ action:'fail', job_id:'j1', agent_id:'a1', error_message:'x' });
  ck('a cancelled job stays cancelled (late complete or fail)', w.db.PrintJob[0].status==='failed' && /Cancelled/.test(w.db.PrintJob[0].error_message), w.db.PrintJob[0].status); }

{ const w = world([{ id:'j1', status:'done', created_date: naive(60000) }]);
  await w.call({ action:'fail', job_id:'j1', agent_id:'a1', error_message:'late' });
  ck('a late failure report never queues a printed job again', w.db.PrintJob[0].status==='done', w.db.PrintJob[0].status); }

// TILBURY, 26 Sep: one order became jobs at 18:31:20, :22 and :25 - one per open dashboard.
{ const w = world([]);
  const body = { action:'enqueue', order_data:{ id:'o1' }, printer_ip:'192.168.0.224', config:{ role:'receipt' } };
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await w.call(body)).job_id);
  ck('REGRESSION GUARD: 3 dashboards auto-printing one order make ONE job', w.db.PrintJob.length===1 && new Set(ids).size===1, `${w.db.PrintJob.length} jobs`);
  w.db.PrintJob[0].status = 'done';
  await w.call(body);
  ck('a deliberate reprint after it printed is NOT merged', w.db.PrintJob.length===2, `${w.db.PrintJob.length} jobs`);
  await w.call({ ...body, config:{ role:'kitchen' } });
  await w.call({ ...body, printer_ip:'192.168.0.99' });
  ck('the kitchen ticket and a second printer still get their own jobs', w.db.PrintJob.length===4, `${w.db.PrintJob.length} jobs`);
  w.db.PrintJob.forEach(j => { if (j.status==='pending') j.created_date = naive(3*60000); });
  const before = w.db.PrintJob.length; await w.call({ ...body, config:{ role:'kitchen' } });
  ck('an old unprinted job (over 2 min) is not reused', w.db.PrintJob.length===before+1, `${w.db.PrintJob.length - before} new`);
  const t = w.db.PrintJob.length; await w.call({ action:'enqueue', print_action:'test' }); await w.call({ action:'enqueue', print_action:'test' });
  ck('test prints (no order) are never merged', w.db.PrintJob.length===t+2, `${w.db.PrintJob.length - t} new`); }

// The websocket route had the same endless reset; it must count attempts too.
{ const ws = fs.readFileSync(new URL('../base44/functions/printAgentWS/entry.ts', import.meta.url),'utf8');
  const rec = ws.slice(ws.indexOf('for (const j of stuckJobs)'), ws.indexOf('// ── Fetch pending jobs'));
  ck('printAgentWS stuck recovery counts attempts and gives up', /const attempts = \(j\.retry_count \|\| 0\) \+ 1;/.test(rec) && /retry_count: attempts/.test(rec) && /attempts > MAX_RETRIES/.test(rec) && /status: 'failed'/.test(rec), ''); }

// ── Removing a device that is no longer used (Tilbury: "pktablet", last seen 8 May) ──
{ const w = world([{ id:'held', status:'processing', agent_id:'pktablet', created_date: naive(60000) }], { agents: [
    { agent_id:'pktablet', last_seen:'2026-05-08T19:41:24.076Z' },
    { agent_id:'android-agent-1', last_seen: new Date(Date.now() - 20000).toISOString() } ] });
  const r = await w.call({ action:'remove_agent', agent_id:'pktablet' });
  const left = w.db.AgentHeartbeat.map(a => a.agent_id);
  ck('REGRESSION GUARD: an old agent can be removed', r.success && left.join()==='android-agent-1', left.join());
  ck('a ticket it was holding goes back to the queue', w.db.PrintJob[0].status==='pending' && w.db.PrintJob[0].agent_id===null, w.db.PrintJob[0].status);
  const live = await w.call({ action:'remove_agent', agent_id:'android-agent-1' });
  ck('a RUNNING agent (seen < 5 min) is refused - it would reappear', /still running/.test(live.error||'') && w.db.AgentHeartbeat.length===1, live.error ? 'refused' : 'REMOVED'); }

{ const w = world([], { agents: [{ agent_id:'old', last_seen:'2026-05-08T19:41:24Z' }], user: { email:'other@x.com' },
    managers: [{ user_email:'other@x.com', is_active:true, restaurant_ids:['r2'] }] });
  const r = await w.call({ action:'remove_agent', agent_id:'old' });
  ck("another restaurant's manager cannot remove it", r.error==='Forbidden' && w.db.AgentHeartbeat.length===1, r.error||'removed');
  const l = await w.call({ action:'list_agents' });
  ck("nor list this restaurant's agents and printer IPs", l.error==='Forbidden' && !l.agents, l.error||'LISTED'); }

{ const w = world([], { agents: [{ agent_id:'old', last_seen:'2026-05-08T19:41:24Z' }], user: { email:'admin@x.com', role:'admin' }, managers: [] });
  const r = await w.call({ action:'remove_agent', agent_id:'old' });
  const l = await w.call({ action:'list_agents' });
  ck('an admin can remove agents anywhere', r.success && Array.isArray(l.agents) && l.agents.length===0, r.error||'ok');
  const n = await w.call({ action:'remove_agent', agent_id:'nope' });
  ck('removing an unknown agent says so', n.error==='Agent not found', n.error||''); }

const good=checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good===checks.length?0:1);
