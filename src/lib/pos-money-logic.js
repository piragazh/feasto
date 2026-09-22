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

// ─── Tips ─────────────────────────────────────────────────────────────────────

/**
 * Tips are NOT revenue.
 *
 * Under the Employment (Allocation of Tips) Act 2023 tips belong to staff, and
 * the employer must pass them on in full and keep records. If a tip were folded
 * into the order total, every revenue report that sums `total` would overstate
 * the restaurant's takings by the value of its staff's tips - and the business
 * would appear to be earning money it is legally obliged to pay out.
 *
 * So a tip is stored in its own field BESIDE the total. The customer is charged
 * total + tip; revenue reads total only.
 */
export const TIP_PRESETS = [0, 10, 12.5, 15];

/** Hard ceiling. A tip larger than the bill itself is almost always a keying error. */
export const MAX_TIP_MULTIPLE = 1;

/** Percentage tip on the order total, rounded to the penny. */
export function tipFromPercent(total, percent) {
    const t = Number(total || 0), p = Number(percent || 0);
    if (!(t > 0) || !(p > 0)) return 0;
    return Math.round(t * p) / 100;
}

/**
 * Validate a tip. Returns { tip, error }.
 *
 * Rejects rather than silently clamps - the same principle as discounts. If a
 * cashier keys £50 on a £10 bill, quietly reducing it would charge the customer
 * something they never agreed to.
 */
export function validateTip(tip, total) {
    const t = Number(tip);
    if (tip === undefined || tip === null || tip === '') return { tip: 0, error: null };
    if (!Number.isFinite(t)) return { tip: null, error: 'invalid' };
    if (t < 0) return { tip: null, error: 'negative' };
    const rounded = Math.round(t * 100) / 100;
    if (rounded > Number(total || 0) * MAX_TIP_MULTIPLE && rounded > 0) {
        return { tip: null, error: 'exceeds_bill' };
    }
    return { tip: rounded, error: null };
}

/** What the customer is actually charged. Revenue must NOT use this. */
export function amountToCharge(total, tip) {
    return Math.round((Number(total || 0) + Number(tip || 0)) * 100) / 100;
}

/** Sum of tips for a set of orders, e.g. per staff member for distribution. */
export function sumTips(orders = []) {
    return Math.round(orders.reduce((s, o) => s + Number(o.tip_amount || 0), 0) * 100) / 100;
}

/**
 * Tips per staff member, split by how they were paid.
 *
 * The split is not cosmetic. Cash tips can be handed out from the drawer; card
 * tips arrive in the business's bank account and must be paid through payroll.
 * An employer who pays both the same way either shorts staff or double-pays.
 *
 * Only orders that count as revenue are included - a voided order's tip was
 * never collected and must not be distributed.
 *
 * Returns [{ staff_id, staff_name, cash, card, total, orders }] sorted by total.
 */
export function tipsByStaff(orders = []) {
    const map = new Map();
    for (const o of orders) {
        const tip = Number(o.tip_amount || 0);
        if (!(tip > 0) || !countsAsRevenue(o)) continue;
        const key = o.staff_id || '__unattributed';
        const row = map.get(key) || {
            staff_id: o.staff_id || null,
            staff_name: o.staff_name || 'Unattributed',
            cash: 0, card: 0, total: 0, orders: 0,
        };
        if (o.tip_method === 'card') row.card += tip; else row.cash += tip;
        row.total += tip;
        row.orders += 1;
        map.set(key, row);
    }
    const r2 = (n) => Math.round(n * 100) / 100;
    return [...map.values()]
        .map(r => ({ ...r, cash: r2(r.cash), card: r2(r.card), total: r2(r.total) }))
        .sort((a, b) => b.total - a.total);
}

/**
 * Revenue for one order, split by tender, EXCLUDING tips.
 *
 * The Reports cash/card split used payment_method alone. Split payments were
 * stored as payment_method 'cash' for the whole bill, so every split counted
 * entirely as cash revenue. Now read from the structured cash_amount /
 * card_amount fields.
 *
 * Those fields INCLUDE any tip (it is money handed over), but tips are not
 * revenue - so the tip is taken off whichever tender it was paid in.
 *
 * Legacy orders without the structured fields fall back to payment_method, and
 * a legacy split cannot be divided, so it is attributed to its recorded method
 * as before - no worse than today, and new orders are correct.
 *
 * @returns {{ cash: number, card: number }}
 */
export function revenueByTender(order) {
    if (!order || !countsAsRevenue(order)) return { cash: 0, card: 0 };
    const tip = Number(order.tip_amount || 0);
    const hasSplit = order.cash_amount !== undefined && order.cash_amount !== null
        && order.card_amount !== undefined && order.card_amount !== null;

    if (hasSplit) {
        let cash = Number(order.cash_amount || 0);
        let card = Number(order.card_amount || 0);
        if (tip > 0) {
            if (order.tip_method === 'card') card -= tip; else cash -= tip;
        }
        const r = (n) => Math.max(0, Math.round(n * 100) / 100);
        return { cash: r(cash), card: r(card) };
    }

    const total = Math.round(Number(order.total || 0) * 100) / 100;
    return order.payment_method === 'card' ? { cash: 0, card: total } : { cash: total, card: 0 };
}
