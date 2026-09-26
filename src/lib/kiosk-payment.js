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
