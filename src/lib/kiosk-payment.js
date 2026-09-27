/**
 * src/lib/kiosk-payment.js
 * Which kiosk orders are waiting to be paid at the counter.
 *
 * Pure, with no browser or database dependencies, so the rule can be tested on
 * its own - and so the till, the kitchen display and anything else that needs to
 * know share ONE definition.
 */

/** An order is waiting at the till while it is an unpaid kiosk counter order. */
export const isAwaitingKioskPayment = (o) =>
    o?.order_source === 'kiosk'
    && o?.payment_status === 'pending_payment'
    && !['cancelled', 'refunded'].includes(o?.status);

/**
 * Does a pending order need the cashier's attention - i.e. should the till alert?
 *
 *   - inbound online / third-party orders: yes, they need accepting
 *   - kiosk orders waiting to be paid at the counter: yes, a customer is
 *     standing at the till with an order number
 *   - anything rung up at this till, and kiosk orders already paid by card at
 *     the kiosk: no
 *
 * Kiosk orders were previously excluded outright, which was right when every
 * kiosk order was paid by card - but with pay-at-counter, a waiting customer
 * went unannounced.
 */
export const needsCashierAttention = (o) =>
    (o?.order_source !== 'pos' && o?.order_source !== 'kiosk') || isAwaitingKioskPayment(o);

// Kept exported here so existing imports keep working; the one copy lives in function-errors.js.
export { functionErrorMessage } from './function-errors.js';
import { functionErrorMessage as reasonFrom } from './function-errors.js';

/**
 * What the cashier must be told when taking a kiosk payment fails.
 *
 * The three outcomes need different words, because the wrong words cost money:
 *  - already_paid: another till (or a double tap) got there first. Saying
 *    "NOT recorded" here invites charging the customer twice.
 *  - refused: the server answered no (cancelled, not a kiosk order...). The
 *    payment definitely was NOT recorded.
 *  - unknown: no answer, or the server failed. It may have recorded the
 *    payment before the connection dropped - say so, never guess "not".
 * `refresh` is true whenever the lane may be out of date.
 */
export function paymentFailureNotice(err, orderNumber = 'This order') {
    const status = Number(err?.status ?? err?.originalError?.response?.status ?? err?.response?.status);
    const code = err?.data?.code ?? err?.originalError?.response?.data?.code ?? err?.response?.data?.code;
    if (code === 'ALREADY_HANDLED') {
        return { kind: 'already_paid', refresh: true,
            message: `${orderNumber} is ALREADY PAID - do not take payment again.` };
    }
    if (status >= 400 && status < 500) {
        return { kind: 'refused', refresh: status === 409,
            message: `Payment NOT recorded: ${reasonFrom(err, 'the order could not be paid')}` };
    }
    return { kind: 'unknown', refresh: true,
        message: `Could not confirm ${orderNumber}. The payment MAY have been recorded - check the order before taking payment again.` };
}

const digitsOf = (s) => String(s ?? '').replace(/\D/g, '');

/**
 * Find the order a cashier typed, from the digits alone.
 *
 * An exact number wins: "3", "03" and "K3" all mean K-003, and must NOT also
 * list K-013 or K-023 - the cashier would take payment for the wrong customer.
 * Only when nothing matches exactly does it fall back to a partial match, so
 * a half-typed or old-style number (K-4821 from "482") is still found.
 *
 * Keeps the list's order. An empty query returns the whole list.
 */
export function findByOrderNumber(list = [], query = '') {
    const q = digitsOf(query);
    if (!q) return list;
    const exact = list.filter(o => {
        const d = digitsOf(o?.order_number);
        return d !== '' && Number(d) === Number(q);
    });
    if (exact.length) return exact;
    return list.filter(o => digitsOf(o?.order_number).includes(q));
}
