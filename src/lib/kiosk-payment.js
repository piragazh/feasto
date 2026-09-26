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
