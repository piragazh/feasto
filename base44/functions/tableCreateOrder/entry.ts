/**
 * tableCreateOrder — Hardened QR / dine-in table order creation
 *
 * WHY THIS EXISTS:
 *   TableOrder.jsx previously called base44.entities.Order.create() directly from
 *   a PUBLIC, UNAUTHENTICATED page with client-supplied subtotal and total. Anyone
 *   who scanned a QR code (or simply guessed a table_id) could open devtools and
 *   place a £0.00 order for anything on the menu. The POS and kiosk channels both
 *   route through validating functions; this channel did not.
 *
 * SECURITY CONTRACT:
 *   - Every price is recomputed from the live menu. Client prices are DISCARDED.
 *   - The table must exist AND belong to the given restaurant (tenant anchor).
 *   - Items must exist, be available, and not be pos_only.
 *   - Quantities are bounded.
 *   - Order status is always 'pending' and payment is never marked as taken here:
 *     QR orders are settled at the counter or by a server, so this endpoint can
 *     never mark an order paid.
 *
 * TABLE STATE:
 *   current_order_id is only set when the table has no live order. Overwriting it
 *   unconditionally (the previous behaviour) orphaned an existing POS order when a
 *   customer scanned the QR to add to an open tab.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const MAX_ITEMS = 100;
const MAX_QTY = 99;
const MAX_NOTE_LEN = 500;

// Copied verbatim from src/lib/item-pricing.js - check-item-pricing.mjs compares.
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

// Copied verbatim from src/lib/item-availability.js - check-item-availability.mjs compares.
// ── ITEM AVAILABILITY (shared - keep identical in every copy) ────────────────
const AVAILABILITY_TZ = 'Europe/London';
const SELLS_AT = {
    till: ['both', 'pos_only'],
    online: ['both', 'online_only'],
    kiosk: ['both'],
    qr: ['both'],
};
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** An unknown or missing setting means "both" - never hide a menu by accident. */
function channelOf(item) {
    const c = item?.availability_channel;
    return c === 'online_only' || c === 'pos_only' ? c : 'both';
}

function sellsAt(item, where) {
    return (SELLS_AT[where] || []).includes(channelOf(item));
}

/** Weekday and minute-of-day in the UK, whatever the device's own zone. */
function ukClock(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: AVAILABILITY_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (t) => parts.find(p => p.type === t)?.value;
    return { day: WEEKDAYS[get('weekday')], minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

function hhmmToMinutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    return h > 23 || min > 59 ? null : h * 60 + min;
}

/** Same rule as the till: days, late menus past midnight, start === end is all day. */
function inWindow(w, date) {
    if (!w) return false;
    const start = hhmmToMinutes(w.start), end = hhmmToMinutes(w.end);
    if (start === null || end === null) return false;
    const { day, minutes } = ukClock(date);
    const days = Array.isArray(w.days) && w.days.length ? w.days : [0, 1, 2, 3, 4, 5, 6];
    if (start === end) return days.includes(day);
    if (start < end) return days.includes(day) && minutes >= start && minutes < end;
    if (minutes >= start) return days.includes(day);           // evening part of a late menu
    return minutes < end && days.includes((day + 6) % 7);       // after midnight: yesterday's window
}

/** No windows (or an empty list) means always - scheduling is opt-in. */
function inHours(item, date) {
    const ws = item?.availability_windows;
    if (!Array.isArray(ws) || ws.length === 0) return true;
    return ws.some(w => inWindow(w, date));
}

/**
 * Why this item cannot be sold here at `date`, or null if it can.
 * 'unavailable' - switched off; 'channel' - not sold here; 'hours' - outside its times.
 */
function whyNotSellable(item, where, date) {
    if (!item || item.is_available === false) return 'unavailable';
    if (!sellsAt(item, where)) return 'channel';
    if (!inHours(item, date)) return 'hours';
    return null;
}
/** Customer-facing wording for a refusal (servers use the same words). */
function notSellableMessage(name, why) {
    const n = `"${name || 'An item'}"`;
    if (why === 'channel') return `${n} isn't sold here. Please remove it.`;
    if (why === 'hours') return `${n} isn't available at this time. Please remove it.`;
    return `${n} is currently unavailable. Please remove it.`;
}
// ── END ITEM AVAILABILITY ────────────────────────────────────────────────────

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { restaurant_id: restaurantId, table_id: tableId, items, notes, customer_name: customerName } = body;

        if (!restaurantId || !tableId) {
            return Response.json({ error: 'Missing restaurant or table reference', success: false }, { status: 400 });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return Response.json({ error: 'Your order is empty', success: false }, { status: 400 });
        }
        if (items.length > MAX_ITEMS) {
            return Response.json({ error: 'Too many items in one order', success: false }, { status: 400 });
        }

        // ── Tenant anchor: the table must belong to this restaurant ───────────
        const tables = await base44.asServiceRole.entities.RestaurantTable.filter({
            id: tableId,
            restaurant_id: restaurantId,
        });
        const table = tables?.[0];
        if (!table) {
            return Response.json({ error: 'Invalid QR code — table not found', success: false }, { status: 404 });
        }
        if (table.is_active === false) {
            return Response.json({ error: 'This table is not currently in use', success: false }, { status: 400 });
        }

        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId });
        const restaurant = restaurants?.[0];
        if (!restaurant) {
            return Response.json({ error: 'Restaurant not found', success: false }, { status: 404 });
        }
        // Respect the restaurant's own switch for QR ordering, if configured.
        if (restaurant.qr_ordering_enabled === false) {
            return Response.json({ error: 'Table ordering is not available right now', success: false }, { status: 400 });
        }

        // ── Validate and reprice every item from the live menu ────────────────
        const menuItems = await base44.asServiceRole.entities.MenuItem.filter({ restaurant_id: restaurantId });
        const menuMap = new Map(menuItems.map(m => [m.id, m]));

        const verifiedItems = [];
        for (const cartItem of items) {
            if (!cartItem?.menu_item_id) {
                return Response.json({
                    error: `Item "${cartItem?.name || 'unknown'}" is missing a menu reference`,
                    success: false,
                }, { status: 400 });
            }

            const menuItem = menuMap.get(cartItem.menu_item_id);
            if (!menuItem) {
                return Response.json({
                    error: `"${cartItem.name || 'An item'}" is no longer on the menu`,
                    success: false,
                }, { status: 400 });
            }
            // Switched off, not sold by QR (POS-only or online-only), or outside
            // its time windows - the same rule the QR menu hides by.
            const whyNot = whyNotSellable(menuItem, 'qr', new Date());
            if (whyNot) {
                return Response.json({ error: notSellableMessage(menuItem.name, whyNot), code: `ITEM_${whyNot.toUpperCase()}`, success: false }, { status: 400 });
            }

            const quantity = Number(cartItem.quantity);
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
                return Response.json({ error: `Invalid quantity for "${menuItem.name}"`, success: false }, { status: 400 });
            }

            // Dine-in is served in the restaurant, so pos_price is the correct
            // basis when set — matching how the POS prices the same item.
            // Unit price from the LIVE menu (POS price basis, as the till). Same rule as the kiosk.
            const priced = priceSelection(menuItem, cartItem.customizations, cartItem.itemQuantities);
            if (priced.error) {
                return Response.json({ error: `"${menuItem.name}" ${priced.error}. Please remove it and add it again.`, success: false }, { status: 400 });
            }
            const serverItemPrice = priced.unit;

            verifiedItems.push({
                menu_item_id: cartItem.menu_item_id,
                name: menuItem.name,
                price: serverItemPrice,      // server price — client value discarded
                quantity,
                customizations: cartItem.customizations || {},
                itemQuantities: cartItem.itemQuantities || {},
            });
        }

        const serverSubtotal = verifiedItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const serverTotal = Math.round(serverSubtotal * 100) / 100;

        const safeNotes = typeof notes === 'string' ? notes.slice(0, MAX_NOTE_LEN) : undefined;

        const order = await base44.asServiceRole.entities.Order.create({
            restaurant_id: restaurantId,
            restaurant_name: restaurant.name,
            items: verifiedItems,
            subtotal: serverSubtotal,
            total: serverTotal,
            delivery_fee: 0,
            discount: 0,
            order_type: 'dine_in',
            // Distinct channel so reporting can separate QR table orders from web
            // orders, and so the POS new-order alert can treat them correctly.
            order_source: 'qr',
            table_id: tableId,
            table_number: table.table_number,
            customer_name: typeof customerName === 'string' ? customerName.slice(0, 120) : undefined,
            // Never marked paid here: QR orders are settled at the counter or by a
            // server. A public endpoint must not be able to record a payment.
            payment_method: 'pay_at_counter',
            payment_status: 'pending_payment',
            status: 'pending',
            notes: safeNotes,
        });

        // Only claim the table if it has no live order. Overwriting orphaned an
        // existing POS tab when a customer scanned the QR to add to it.
        const tablePatch = { status: 'occupied' };
        if (!table.current_order_id) {
            tablePatch.current_order_id = order.id;
        }
        await base44.asServiceRole.entities.RestaurantTable.update(tableId, tablePatch);

        return Response.json({
            success: true,
            order: { id: order.id, order_number: order.order_number, total: serverTotal },
        });
    } catch (error) {
        console.error('[TABLE-CREATE-ORDER] Failed:', error?.message || error);
        return Response.json({
            error: 'Could not place your order. Please ask a member of staff.',
            success: false,
        }, { status: 500 });
    }
});
