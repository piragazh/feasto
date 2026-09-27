#!/usr/bin/env node
/**
 * check-workflow-payloads.mjs - every function a workflow calls finds the order
 * in BOTH payload shapes the platform sends.
 *
 * Workflows created before Sep 2026 send { event: { entity_id, type, ... } };
 * newer ones send { entity_id, event_type, entity_name, data, old_data } at the
 * top level. Functions read only event.entity_id, so every newer workflow
 * failed on every run: stock was never deducted and Uber was never told
 * (found 27 Sep). Each function's own ID line is evaluated against both.
 */
import fs from 'node:fs';

const checks = []; const ck = (l, ok, d = '') => { checks.push(!!ok); console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${l.padEnd(62)} ${d}`); };
const read = (fn) => fs.readFileSync(new URL(`../base44/functions/${fn}/entry.ts`, import.meta.url), 'utf8');

const ID = '6ab951a15c2b49b6f6cced95';
// Exactly what the platform sent to "Apply Stock on Order Create" at 17:25 on 27 Sep (trimmed).
const NEW_SHAPE = { trigger_type: 'entity', event_type: 'create', entity_name: 'Order', entity_id: ID, data: { id: ID, status: 'pending' }, old_data: null };
const OLD_SHAPE = { event: { type: 'create', entity_name: 'Order', entity_id: ID }, data: { id: ID } };
const DIRECT = { orderId: ID };

/** Evaluate a function's own `const <name> = body...;` line against a body. */
function idFrom(src, name, body) {
  const m = src.match(new RegExp(`const ${name} = (body\\.[^;]+);`));
  if (!m) return { missing: true };
  return { value: new Function('body', `return ${m[1]};`)(body) };
}

for (const [fn, name, direct] of [
  ['applyOrderStock', 'orderId', DIRECT],
  ['uberEatsPushStatus', 'orderId', DIRECT],
  ['awardLoyaltyPoints', 'orderId', DIRECT],
  ['sendWhatsAppOrder', 'order_id', { order_id: ID }],
]) {
  const src = read(fn);
  const got = [NEW_SHAPE, OLD_SHAPE, direct].map(b => idFrom(src, name, b));
  ck(`${fn} finds the order: new shape, old shape, direct call`, got.every(g => g.value === ID),
    got.map(g => g.missing ? 'no id line' : (g.value === ID ? 'ok' : String(g.value))).join(' / '));
}

// sendNotification branches on the event TYPE too, not only the id.
{ const src = read('sendNotification');
  const m = src.match(/const ev = ([^;]+);/);
  const evOf = m ? new Function('body', `return ${m[1]};`) : null;
  const upd = (b) => { const ev = evOf?.(b); return !!ev && ev.type === 'update' && ev.entity_name === 'Order' && ev.entity_id === ID; };
  ck('sendNotification recognises an Order update in both shapes',
    evOf && upd({ ...NEW_SHAPE, event_type: 'update' }) && upd({ event: { ...OLD_SHAPE.event, type: 'update' } }), m ? '' : 'no ev line');
  ck('sendNotification still ignores a create', evOf && !upd(NEW_SHAPE) && !upd(OLD_SHAPE)); }

// A workflow that fires on EVERY order update must not report ordinary skips as
// failures: the platform switches a workflow off after enough in a row.
{ const src = read('awardLoyaltyPoints');
  const noted = (msg) => new RegExp(`\\{ (error|skipped): '${msg.replace(/[()]/g, '\\$&')}' \\}\\), \\{ status: (\\d+) \\}`).exec(src);
  for (const msg of ['Order not yet completed', 'No identifier for loyalty (no email or phone)']) {
    const m = noted(msg);
    ck(`awardLoyaltyPoints: "${msg.slice(0, 26)}..." is a skip, not a failure`, m && m[1] === 'skipped' && m[2] === '200', m ? `${m[1]} ${m[2]}` : 'not found');
  } }

const good = checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good === checks.length ? 0 : 1);
