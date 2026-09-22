/**
 * src/lib/pos-cash-logic.js
 * =========================
 * TESTED source of truth for cash drawer arithmetic.
 *
 * Mirrored in functions/posCashSession (see SYNC RULE). The server computes the
 * expected figure; the till never sees it before the count is submitted.
 *
 * ─── WHY THIS HAS TO BE EXACTLY RIGHT ───────────────────────────────────────
 * A variance report is an accusation. If it is quietly wrong - off by the tips,
 * off by the change, off by a split payment - it tells an owner their staff are
 * stealing when they are not, or hides it when they are. Either outcome is
 * worse than having no report. Every rule below exists because the naive
 * version gets one of these wrong.
 *
 * SYNC RULE: any change here MUST be applied to functions/posCashSession →
 *   cashTakenForOrder, expectedCash
 */

import { countsAsRevenue } from './pos-money-logic.js';

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * Cash that went INTO the drawer for one order.
 *
 * Uses the structured `cash_amount` field when present. That field is NET of
 * change: a customer paying £20 for a £13.49 bill leaves £13.49 in the drawer,
 * and the £6.51 change never counts. Includes any cash tip, because the
 * customer hands it over and it physically sits in the drawer until paid out.
 *
 * LEGACY ORDERS (before cash_amount existed): split payments were recorded as
 * payment_method 'cash' for the WHOLE total, with the real breakdown only in
 * free-text notes. Their cash portion cannot be recovered reliably, so they are
 * reported via `legacy_split` rather than silently guessed - a guess here would
 * either invent a shortfall or hide one.
 *
 * @returns {{ cash: number, legacy_split: boolean }}
 */
export function cashTakenForOrder(order) {
    if (!order || !countsAsRevenue(order)) return { cash: 0, legacy_split: false };

    if (order.cash_amount !== undefined && order.cash_amount !== null) {
        return { cash: r2(order.cash_amount), legacy_split: false };
    }

    // Legacy: no structured breakdown.
    if (order.payment_method !== 'cash') return { cash: 0, legacy_split: false };
    const looksSplit = /\bcard\s*:\s*£/i.test(String(order.notes || ''));
    if (looksSplit) return { cash: 0, legacy_split: true };
    return { cash: r2(Number(order.total || 0) + Number(order.tip_amount || 0)), legacy_split: false };
}

/**
 * What SHOULD be in the drawer.
 *
 *   opening float
 * + cash taken on sales in this drawer, this session
 * + money paid in       (e.g. change top-up from the safe)
 * − money paid out      (e.g. cash tips handed to staff, a supplier paid in cash)
 *
 * Voided and refunded orders contribute nothing: countsAsRevenue excludes them.
 * A No Sale opens the drawer without changing what should be in it.
 *
 * @param {object} p
 * @param {number} p.openingFloat
 * @param {object[]} p.orders     orders taken in this drawer during the session
 * @param {object[]} p.movements  [{ type: 'paid_in'|'paid_out', amount }]
 */
export function expectedCash({ openingFloat = 0, orders = [], movements = [] }) {
    let sales = 0;
    let legacySplitCount = 0;
    for (const o of orders) {
        const { cash, legacy_split } = cashTakenForOrder(o);
        sales += cash;
        if (legacy_split) legacySplitCount += 1;
    }
    let paidIn = 0, paidOut = 0;
    for (const m of movements) {
        const a = Math.abs(Number(m?.amount || 0));
        if (m?.type === 'paid_in') paidIn += a;
        else if (m?.type === 'paid_out') paidOut += a;
    }
    return {
        expected: r2(Number(openingFloat || 0) + sales + paidIn - paidOut),
        cashSales: r2(sales),
        paidIn: r2(paidIn),
        paidOut: r2(paidOut),
        legacySplitCount,
    };
}

/**
 * Counted minus expected. Negative = SHORT, positive = OVER.
 * Rounded to the penny so floating point never invents a 1p discrepancy.
 */
export function cashVariance(counted, expected) {
    return r2(Number(counted || 0) - Number(expected || 0));
}

/** UK denominations, largest first, for a counted-by-denomination drawer. */
export const UK_DENOMINATIONS = [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

/**
 * Total of a denomination count, e.g. { '20': 3, '0.05': 7 }.
 *
 * Summed in PENCE as integers. Adding 0.05 seven times in floating point gives
 * 0.35000000000000003 - trivial alone, but it turns an exact drawer into a
 * reported 1p variance, and a 1p variance on every shift erodes trust in the
 * whole report.
 */
export function countTotal(counts = {}) {
    let pence = 0;
    for (const d of UK_DENOMINATIONS) {
        const n = Math.max(0, Math.floor(Number(counts[String(d)] || 0)));
        pence += n * Math.round(d * 100);
    }
    return pence / 100;
}

/**
 * Does this variance need a manager to sign it off?
 * Default tolerance £5 - small enough to catch real problems, large enough that
 * a genuinely miscounted coin doesn't trigger a sign-off every night.
 */
export function needsSignOff(variance, tolerance = 5) {
    return Math.abs(Number(variance || 0)) > Number(tolerance);
}
