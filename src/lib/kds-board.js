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

// ── Keeping the two status fields in step ──────────────────────────────────
//
// The kitchen advanced kiosk orders by writing ONLY order_status; the till
// advanced them by writing ONLY status. Whichever screen finished an order, the
// other never let go of it - finished orders piled up in the till's Confirmed
// column or on the kitchen board. Every kiosk status change now writes both.

/** Kitchen's order_status -> the matching status the till, reports and stock use. */
export function statusFromKitchen(orderStatus, orderType) {
    const delivery = orderType === 'delivery';
    switch (orderStatus) {
        case 'new': return 'pending';
        case 'confirmed': return 'confirmed';
        case 'preparing': return 'preparing';
        case 'ready': return delivery ? 'out_for_delivery' : 'ready_for_collection';
        case 'completed': return delivery ? 'delivered' : 'collected';
        case 'cancelled': return 'cancelled';
        default: return undefined;
    }
}

/** The till's status -> the matching order_status the kitchen display reads. */
export function kitchenFromStatus(status) {
    switch (status) {
        case 'pending': return 'new';
        case 'confirmed': return 'confirmed';
        case 'preparing': return 'preparing';
        case 'ready_for_collection':
        case 'out_for_delivery': return 'ready';
        case 'collected':
        case 'delivered': return 'completed';
        case 'cancelled':
        case 'refunded': return 'cancelled';
        default: return undefined;
    }
}

/**
 * The update to write when a kiosk order's status changes, from EITHER screen.
 * Non-kiosk orders only ever use `status`, so they get exactly what was asked.
 *
 * @param {object} order
 * @param {{ status?: string, order_status?: string }} change
 */
export function statusUpdateFor(order, change = {}) {
    if (order?.order_source !== 'kiosk') {
        return change.status !== undefined ? { status: change.status } : { ...change };
    }
    if (change.order_status !== undefined) {
        const status = statusFromKitchen(change.order_status, order.order_type);
        return status ? { order_status: change.order_status, status } : { order_status: change.order_status };
    }
    if (change.status !== undefined) {
        const orderStatus = kitchenFromStatus(change.status);
        return orderStatus ? { status: change.status, order_status: orderStatus } : { status: change.status };
    }
    return {};
}
