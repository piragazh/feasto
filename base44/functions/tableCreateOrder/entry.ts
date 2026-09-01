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
            if (menuItem.is_available === false) {
                return Response.json({ error: `"${menuItem.name}" is currently unavailable`, success: false }, { status: 400 });
            }
            if (menuItem.availability_channel === 'pos_only') {
                return Response.json({
                    error: `"${menuItem.name}" can only be ordered at the counter`,
                    success: false,
                }, { status: 400 });
            }

            const quantity = Number(cartItem.quantity);
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
                return Response.json({ error: `Invalid quantity for "${menuItem.name}"`, success: false }, { status: 400 });
            }

            // Dine-in is served in the restaurant, so pos_price is the correct
            // basis when set — matching how the POS prices the same item.
            let serverItemPrice = menuItem.pos_price != null ? menuItem.pos_price : menuItem.price;

            // Add option surcharges from the LIVE menu definition, never the client's.
            if (cartItem.customizations && typeof cartItem.customizations === 'object') {
                for (const [groupName, selectedValue] of Object.entries(cartItem.customizations)) {
                    const optGroup = menuItem.customization_options?.find(g => g.name === groupName);
                    if (!optGroup) continue;
                    const values = Array.isArray(selectedValue) ? selectedValue : [selectedValue];
                    for (const val of values) {
                        const opt = optGroup.options?.find(o => o.label === val);
                        if (opt?.price) {
                            const itemQty = cartItem.itemQuantities?.[val] ?? 1;
                            serverItemPrice += opt.price * itemQty;
                        }
                    }
                }
            }

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
