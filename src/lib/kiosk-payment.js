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

/**
 * The reason a backend function gave for refusing, fit to show a customer.
 *
 * functions.invoke THROWS on any non-2xx. The SDK (0.8.x) wraps the failure in
 * a Base44Error that carries the body on err.data - NOT err.response.data - and
 * whose err.message is axios's "Request failed with status code 429", which is
 * never shown to a customer. Older axios-shaped errors are still understood.
 */
export function functionErrorMessage(err, fallback) {
    const bodies = [err?.data, err?.originalError?.response?.data, err?.response?.data];
    for (const b of bodies) {
        const e = b?.error;
        if (typeof e === 'string' && e.trim()) return e;
        if (typeof e?.message === 'string' && e.message.trim()) return e.message;
    }
    return fallback;
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
