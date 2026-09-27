/**
 * The price of one kiosk / QR item with its chosen options - ONE rule for the
 * screen the customer reads and the server that charges them.
 *
 * Why this exists: the kiosk screen and kioskCreateOrder priced options
 * differently. The kiosk stores a multi-choice quantity under "Group_Label";
 * the server looked it up under the bare label, missed, and charged x1 - so
 * 3 dips showed GBP 1.80 and the till charged GBP 0.60. Meal-upgrade extras
 * were never charged at all. With card on, the terminal charged the kiosk's
 * total, the server rejected the order as a mismatch, and the customer paid
 * for nothing. And because the server read a key the caller chose, a crafted
 * request could send a NEGATIVE quantity and make an order's total negative.
 *
 * The block between the markers is copied VERBATIM into
 *   base44/functions/kioskCreateOrder/entry.ts
 *   base44/functions/tableCreateOrder/entry.ts
 * (functions cannot import from src/). scripts/check-item-pricing.mjs fails
 * if any copy differs by a single character.
 */

// ── ITEM PRICING (shared - keep identical in every copy) ─────────────────────
const OPTION_QTY_MAX = 99;

/**
 * Unit price for one item: base (POS price, else online price) plus options.
 * Walks the LIVE menu's option groups, never the client's keys, so a caller
 * cannot add groups or prices the menu does not have.
 * Returns { unit } in pounds rounded to the penny, or { error } to refuse.
 */
function priceSelection(menuItem, customizations, itemQuantities) {
    const rawBase = menuItem?.pos_price != null ? menuItem.pos_price : menuItem?.price;
    const base = rawBase == null || rawBase === '' ? NaN : Number(rawBase);
    if (!Number.isFinite(base) || base < 0) return { error: 'has no valid price' };
    const picks = customizations && typeof customizations === 'object' ? customizations : {};
    const qtys = itemQuantities && typeof itemQuantities === 'object' ? itemQuantities : {};
    // A menu price may be negative on purpose ("no cheese -20p"); only non-numbers count as 0.
    const priceOf = (o) => (typeof o?.price === 'number' && Number.isFinite(o.price) ? o.price : 0);
    const find = (group, label) => (group?.options || []).find(o => o.label === label);
    let total = base;

    for (const group of menuItem?.customization_options || []) {
        const picked = picks[group.name];
        if (group.type === 'single' || group.type === 'meal_upgrade') {
            if (picked == null || picked === '') continue;
            const opt = find(group, picked);
            if (!opt) return { error: `option "${picked}" is no longer available` };
            total += priceOf(opt);
            if (group.type !== 'meal_upgrade') continue;
            const subs = group.meal_customizations || opt.meal_customizations || [];
            for (const sub of subs) {
                const subPicked = picks[`${group.name}_meal_${sub.name}`];
                const labels = sub.type === 'multiple' ? (Array.isArray(subPicked) ? subPicked : [])
                    : sub.type === 'single' ? (subPicked == null || subPicked === '' ? [] : [subPicked]) : [];
                for (const label of labels) {
                    const subOpt = find(sub, label);
                    if (!subOpt) return { error: `option "${label}" is no longer available` };
                    total += priceOf(subOpt);
                }
            }
        } else if (group.type === 'multiple') {
            if (!Array.isArray(picked)) continue;
            for (const label of picked) {
                const opt = find(group, label);
                if (!opt) return { error: `option "${label}" is no longer available` };
                // The kiosk's key. Missing or 0 means one - the kiosk's own rule.
                const raw = qtys[`${group.name}_${label}`];
                let qty = 1;
                if (raw != null && raw !== 0) {
                    qty = Number(raw);
                    if (!Number.isInteger(qty) || qty < 1 || qty > OPTION_QTY_MAX) {
                        return { error: `has an invalid quantity for "${label}"` };
                    }
                }
                total += priceOf(opt) * qty;
            }
        }
    }
    return { unit: Math.round(total * 100) / 100 };
}
// ── END ITEM PRICING ─────────────────────────────────────────────────────────

export { priceSelection, OPTION_QTY_MAX };
