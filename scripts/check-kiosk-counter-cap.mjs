#!/usr/bin/env node
/**
 * check-kiosk-counter-cap.mjs - the pay-at-counter queue cap, from the REAL
 * kioskCreateOrder.
 *
 * kioskCreateOrder is public with no rate limit, and every pay-at-counter order
 * sounds the till alert and sits in the Awaiting Payment lane. Without a cap a
 * script can bury the till in fake orders. New counter orders are refused once
 * 25 (or kiosk_config.max_awaiting_payment) are already waiting.
 *
 * Also checks the handler's copy of "is this order waiting?" still agrees with
 * the lane's (src/lib/kiosk-payment.js) - functions cannot import from src/.
 */
import fs from 'node:fs';
import { isAwaitingKioskPayment } from '../src/lib/kiosk-payment.js';

const src = fs.readFileSync(new URL('../base44/functions/kioskCreateOrder/entry.ts', import.meta.url), 'utf8');
const a = src.indexOf('/** Today\'s date in the UK'), b = src.indexOf('Deno.serve(');
const { isAwaitingCounterPayment, maxAwaitingCounter, counterIsFull } =
  new Function(src.slice(a, b) + '\nreturn { isAwaitingCounterPayment, maxAwaitingCounter, counterIsFull };')();

const checks = []; const ck = (l, ok, d = '') => { checks.push(ok); console.log(`  ${ok ? '✓' : '✗ WRONG'}  ${l.padEnd(60)} ${d}`); };
const waiting = (n, x = {}) => Array.from({ length: n }, (_, i) => ({ order_source: 'kiosk', payment_status: 'pending_payment', status: 'pending', order_number: `K-${i}`, ...x }));

// 1. Same rule as the lane, over every combination that matters.
let drift = [];
for (const order_source of ['kiosk', 'pos', 'online', 'qr', 'third_party', undefined])
  for (const payment_status of ['pending_payment', 'payment_confirmed', 'paid_card', 'cancelled_payment', undefined])
    for (const status of ['pending', 'confirmed', 'preparing', 'cancelled', 'refunded', undefined]) {
      const o = { order_source, payment_status, status };
      if (isAwaitingCounterPayment(o) !== isAwaitingKioskPayment(o)) drift.push(JSON.stringify(o));
    }
if (isAwaitingCounterPayment(null) !== isAwaitingKioskPayment(null)) drift.push('null');
ck('handler and till lane agree on which orders are waiting', drift.length === 0, drift.length ? `differs: ${drift[0]}` : '181 cases');

// 2. The cap itself.
ck('24 waiting: a new counter order is accepted', !counterIsFull(waiting(24), {}));
ck('REGRESSION GUARD: 25 waiting: the next one is refused', counterIsFull(waiting(25), {}));
ck('orders already paid do not count', !counterIsFull([...waiting(24), ...waiting(10, { payment_status: 'payment_confirmed' })], {}));
ck('walk-aways already cancelled do not count', !counterIsFull([...waiting(24), ...waiting(10, { status: 'cancelled' })], {}));
ck('kiosk card orders do not count', !counterIsFull([...waiting(24), ...waiting(10, { payment_status: 'paid_card' })], {}));
ck('a store can set its own cap', counterIsFull(waiting(10), { max_awaiting_payment: 10 }) && !counterIsFull(waiting(9), { max_awaiting_payment: 10 }));
ck('a nonsense setting falls back to 25, never 0', [0, -5, 'abc', 2.5, null].every(v => maxAwaitingCounter({ max_awaiting_payment: v }) === 25));
ck('safe with no orders and no config', !counterIsFull(undefined, undefined));

// 3. Where it runs in the handler (comments stripped, so a comment alone can't pass).
const code = src.slice(b).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const at = (s) => code.indexOf(s);
const iIdem = at('idempotency_key })'), iCounter = at("payment_counter_enabled"), iCap = at('counterIsFull('),
      iMenu = at('MenuItem.filter'), iCard = at('if (isCardPayment) {');
ck('the cap is actually called by the handler', iCap > 0);
ck('it runs after the idempotency check (retries still get their order)', iCap > iIdem && iIdem > 0);
ck('it runs only on the pay-at-counter branch, not for card', iCap > iCounter && iCounter > iCard && iCap < iMenu);
ck('a refusal returns 429 with a reason the kiosk can show', /counterIsFull\([\s\S]{0,400}error:[\s\S]{0,300}status: 429/.test(code));

const good = checks.filter(Boolean).length;
console.log(`\n  ${good}/${checks.length} correct`);
process.exit(good === checks.length ? 0 : 1);
