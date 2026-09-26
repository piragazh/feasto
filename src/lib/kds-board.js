/**
 * src/lib/kds-board.js
 * Which orders belong on the kitchen display.
 *
 * NOTE ON THE TWO STATUS FIELDS
 *   The kitchen display tracks kiosk orders by `order_status`, and every other
 *   order by `status`. The till, reports, stock and payments all use `status`.
 *   Server functions that change a kiosk order keep both in step; if they ever
 *   drift, the kitchen and the till disagree about what is ready to cook.
 */
import { isAwaitingKioskPayment } from './kiosk-payment.js';

export const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready_for_collection', 'out_for_delivery', 'new'];
export const KIOSK_ACTIVE_STATUSES = ['new', 'confirmed', 'preparing', 'ready'];

/**
 * Should this order be on the kitchen board?
 *
 * An unpaid kiosk order is NOT kitchen work - it waits at the till and joins the
 * board once paid. It used to be shown red, marked URGENT, at the top, with a
 * disabled button: nothing the kitchen could act on, and red told them to act.
 */
export function isOnKitchenBoard(order) {
    if (!order || isAwaitingKioskPayment(order)) return false;
    return order.order_source === 'kiosk'
        ? KIOSK_ACTIVE_STATUSES.includes(order.order_status)
        : ACTIVE_STATUSES.includes(order.status);
}
