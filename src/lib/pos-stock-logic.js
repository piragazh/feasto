/**
 * src/lib/pos-stock-logic.js
 * ==========================
 * TESTED source of truth for item-level stock and auto-86.
 *
 * Mirrored in functions/applyOrderStock (see SYNC RULE). That function is fired
 * by a workflow on EVERY order create/update, whichever of the eight order paths
 * produced it - till, offline sync, kiosk, QR table, online checkout, and the
 * marketplace integrations. One implementation, rather than eight copies.
 *
 * WHAT "86" MEANS: kitchen slang for "we've run out". Auto-86 takes an item off
 * sale the moment its stock reaches zero, on every channel at once.
 *
 * SYNC RULE: any change here MUST be applied to functions/applyOrderStock →
 *   stockDemand, applySale, applyRestore
 */

/** Items whose menu_item_id marks a hand-keyed price have no stock record. */
const isCustom = (id) => String(id || '').startsWith('custom-');

/**
 * Total quantity of each tracked menu item an order consumes.
 *
 * The same item can appear on several lines - two pizzas with different
 * toppings are two lines of one item - so quantities are SUMMED per item.
 * Counting only the first line would under-decrement and oversell.
 *
 * @returns {Map<string, number>}  menu_item_id → quantity
 */
export function stockDemand(order) {
    const demand = new Map();
    for (const line of order?.items || []) {
        const id = line?.menu_item_id;
        if (!id || isCustom(id)) continue;
        const qty = Math.floor(Number(line.quantity || 0));
        if (!(qty > 0)) continue;
        demand.set(id, (demand.get(id) || 0) + qty);
    }
    return demand;
}

/**
 * Stock after selling `qty` of an item.
 *
 * Untracked items (the default) are left completely alone - stock tracking is
 * opt-in per item, so an existing menu keeps working untouched.
 *
 * Never goes below zero, but OVERSELLING IS REPORTED, not hidden. It happens
 * whenever two tills sell the last portion at the same moment - the platform
 * has no atomic decrement - and a kitchen needs to know it promised food it
 * may not have.
 *
 * Auto-86 fires at zero. It records that the 86 was AUTOMATIC, so a later
 * restock or void can bring the item back without overriding an item a manager
 * took off deliberately.
 *
 * @returns {null | { stock_quantity, is_available, auto_86ed, oversold, hitZero, low }}
 */
export function applySale(item, qty) {
    if (!item?.track_stock) return null;
    const current = Math.floor(Number(item.stock_quantity || 0));
    const want = Math.floor(Number(qty || 0));
    const remaining = current - want;
    const next = Math.max(0, remaining);
    const hitZero = next === 0;
    const threshold = Math.floor(Number(item.low_stock_threshold ?? 0));
    return {
        stock_quantity: next,
        // Only switch OFF on reaching zero. Never switch an item ON here: a sale
        // cannot make something available that a manager had taken off.
        is_available: hitZero ? false : item.is_available,
        auto_86ed: hitZero ? true : Boolean(item.auto_86ed),
        oversold: remaining < 0 ? -remaining : 0,
        hitZero,
        low: !hitZero && threshold > 0 && next <= threshold,
    };
}

/**
 * Stock after a void or refund returns `qty` to the shelf.
 *
 * Brings the item back on sale ONLY if it was taken off automatically by
 * reaching zero. If a manager 86'd it by hand - the fryer is broken, the
 * supplier sent the wrong thing - a voided order must not quietly put it back
 * on sale.
 */
export function applyRestore(item, qty) {
    if (!item?.track_stock) return null;
    const current = Math.floor(Number(item.stock_quantity || 0));
    const back = Math.floor(Number(qty || 0));
    const next = current + Math.max(0, back);
    const revive = Boolean(item.auto_86ed) && next > 0;
    return {
        stock_quantity: next,
        is_available: revive ? true : item.is_available,
        auto_86ed: revive ? false : Boolean(item.auto_86ed),
    };
}

/** Display state for the till and the menu editor. */
export function stockState(item) {
    if (!item?.track_stock) return 'untracked';
    const q = Math.floor(Number(item.stock_quantity || 0));
    if (q <= 0) return 'out';
    const threshold = Math.floor(Number(item.low_stock_threshold ?? 0));
    return threshold > 0 && q <= threshold ? 'low' : 'in';
}
