/**
 * src/lib/pos-money-logic.js
 * ==========================
 * TESTED source of truth for POS money rules.
 *
 * Follows the same convention as src/lib/order-logic.js: the pure functions
 * here are mirrored verbatim in the Deno handlers, and the Vitest tests in
 * src/lib/__tests__/pos-money.test.js ARE the production logic tests.
 *
 * WHY THIS FILE EXISTS
 *   Every rule below was written in response to a real bug found in the live
 *   system, several of which had been shipped and were silently losing or
 *   misreporting money:
 *     - an unpaid table order recorded as a cash sale
 *     - completed sales left as payment_status 'pending_payment' forever, so an
 *       order could be marked collected without anyone paying
 *     - revenue reports counting cancelled and refunded orders
 *     - quick-cash buttons offering amounts BELOW the bill
 *     - an over-limit discount silently zeroed, charging the customer full price
 *       after staff had quoted them less
 *   None of these threw an error. They all produced a plausible wrong number,
 *   which is exactly the class of bug a build cannot catch and a person will not
 *   notice until the till is short.
 *
 * SYNC RULE: any change here MUST be applied to the mirrored copy in:
 *   - functions/posCreateOrder    → derivePaymentStatus, resolvePaymentMethod,
 *                                   approveDiscount
 *   - functions/syncOfflineOrder  → derivePaymentStatus
 *   - components/pos/POSPayment   → quickCashOptions
 *   - components/pos/POSReports    → REVENUE_STATUSES, countsAsRevenue
 *   - components/pos/POSEndOfDay   → REVENUE_STATUSES, countsAsRevenue
 */

// ─── Payment state ────────────────────────────────────────────────────────────

/**
 * What payment_status should an order be created with?
 *
 * The entity defaults to 'pending_payment' and nothing was setting it, so every
 * POS order — including completed cash sales — read as unpaid. That made a paid
 * takeaway indistinguishable from an open table tab, and meant a dine-in order
 * could be marked collected with no payment and nothing to flag it.
 *
 * A cart sent to a table has NO tender yet (the bill is settled later) and must
 * stay pending. Anything created with a payment method has been paid at the
 * counter.
 */
export function derivePaymentStatus({ payment_status, payment_method } = {}) {
    if (payment_status) return payment_status;
    if (!payment_method) return 'pending_payment';
    return payment_method === 'card' ? 'paid_card' : 'payment_confirmed';
}

/**
 * What payment_method should be stored?
 *
 * `payment_method || 'cash'` turned an explicit null into a cash sale, so an
 * unpaid table order looked like money already taken. Null must survive.
 */
export function resolvePaymentMethod(payment_method) {
    return payment_method ?? undefined;
}

// ─── Revenue ──────────────────────────────────────────────────────────────────

/**
 * Statuses that represent real takings.
 *
 * Reports previously summed EVERY order in range, so a cancelled £50 order still
 * counted as £50. End of Day filtered correctly, so the two screens disagreed on
 * the same day — and Reports was the optimistic one.
 *
 * 'out_for_delivery' counts: a delivery in flight has been paid for.
 */
export const REVENUE_STATUSES = [
    'confirmed', 'preparing', 'ready_for_collection',
    'out_for_delivery', 'delivered', 'collected',
];

export function countsAsRevenue(order) {
    return REVENUE_STATUSES.includes(order?.status);
}

export function sumRevenue(orders = []) {
    return orders.reduce((sum, o) => (countsAsRevenue(o) ? sum + Number(o.total || 0) : sum), 0);
}

// ─── Quick cash ───────────────────────────────────────────────────────────────

const UK_NOTES = [5, 10, 20, 50];

/**
 * Quick-cash denominations, generated from the amount owed.
 *
 * A fixed [5,10,20,50] list is wrong most of the time: on an £8.99 bill the £5
 * button cannot cover it, and on a £62 bill every button is useless. Staff then
 * fall back to the keypad, which is slower and more error-prone in a rush.
 *
 * INVARIANT: every option is strictly greater than the amount owed. A button
 * that produces a short payment is worse than no button.
 */
export function quickCashOptions(owed) {
    if (!(owed > 0)) return UK_NOTES;
    const opts = [];

    const nextPound = Math.ceil(owed);
    if (nextPound > owed) opts.push(nextPound);

    const nextFive = Math.ceil(owed / 5) * 5;
    if (nextFive > owed) opts.push(nextFive);

    for (const note of UK_NOTES) {
        if (note > owed) opts.push(note);
    }

    // Pad with progressively rounder figures so all four slots fill - an exact
    // total like £10.00 otherwise yields only one or two buttons.
    for (const step of [10, 20, 50, 100]) {
        const rounded = Math.ceil(owed / step) * step;
        if (rounded > owed) opts.push(rounded);
        opts.push(rounded + step);
    }

    return [...new Set(opts)].filter(v => v > owed).sort((a, b) => a - b).slice(0, 4);
}

export function changeDue(tendered, owed) {
    return Math.max(0, Math.round((Number(tendered || 0) - Number(owed || 0)) * 100) / 100);
}

// ─── Discounts ────────────────────────────────────────────────────────────────

export const MANAGER_MAX_PCT = 20;
export const MANAGER_MAX_FIXED = 20;

/**
 * Decide whether a requested discount is allowed.
 *
 * Returns { approved, reason }. An invalid discount must REJECT the order rather
 * than be silently zeroed: zeroing looks safe for the business but the cashier
 * has already quoted the discounted price, so the customer is charged full price
 * with nothing shown on screen. Failing loudly lets staff get approval and retry.
 */
export function approveDiscount({ clientDiscount = 0, subtotal = 0, reasonCode, isAdmin = false }) {
    if (!(clientDiscount > 0)) return { approved: 0, reason: null };
    if (!reasonCode) return { approved: null, reason: 'no_reason_code' };
    if (isAdmin) return { approved: clientDiscount, reason: null };

    const pct = subtotal > 0 ? (clientDiscount / subtotal) * 100 : 0;
    if (pct > MANAGER_MAX_PCT || clientDiscount > MANAGER_MAX_FIXED) {
        return { approved: null, reason: 'exceeds_manager_limit' };
    }
    return { approved: clientDiscount, reason: null };
}

// ─── Table lifecycle ──────────────────────────────────────────────────────────

const TERMINAL_STATUSES = ['collected', 'delivered'];

/**
 * May this order be marked complete?
 *
 * A dine-in bill is settled at the till, so completing an unpaid table order
 * from the Queue or the KDS would close it, free the table, and leave the food
 * paid for by nobody. Takeaway and online orders are paid at creation and are
 * unaffected.
 */
export function canCompleteOrder(order, newStatus) {
    if (!TERMINAL_STATUSES.includes(newStatus)) return { allowed: true };
    const unpaidDineIn = order?.order_type === 'dine_in'
        && (!order.payment_status || order.payment_status === 'pending_payment');
    return unpaidDineIn
        ? { allowed: false, reason: 'unpaid_dine_in' }
        : { allowed: true };
}

/**
 * Should a table be released when this order finishes?
 *
 * Only if the order still owns the table — another order may have started on it
 * since. Goes to 'needs_cleaning' rather than straight to available so staff
 * still confirm the table has been reset.
 */
export function tableReleasePatch(order, table) {
    if (!order?.table_id || order.order_type !== 'dine_in') return null;
    if (!table) return null;
    if (table.current_order_id && table.current_order_id !== order.id) return null;
    return { status: 'needs_cleaning', current_order_id: null };
}
