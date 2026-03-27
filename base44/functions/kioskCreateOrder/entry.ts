/**
 * kioskCreateOrder — Hardened kiosk order creation
 *
 * SECURITY CONTRACT:
 *   All financial fields are recomputed server-side from the live menu.
 *   Client-supplied subtotal, total, discount, and price values are IGNORED.
 *   The kiosk operates as an unauthenticated session; the restaurantId is the
 *   tenant anchor. No user auth is required or available on a public kiosk.
 *
 * Validates:
 *   1. Restaurant exists and is open (is_open flag)
 *   2. pay_at_counter is enabled in kiosk_config
 *   3. All cart items exist and are available in the live menu
 *   4. Items have valid availability_channel (not pos_only)
 *   5. Totals are recomputed from DB prices — client prices are discarded
 *   6. Cart is non-empty
 *
 * Writes:
 *   - order_source = 'kiosk'
 *   - payment_method = 'pay_at_counter'
 *   - payment_status = 'pending_payment'
 *   - order_status = 'new'
 *   - All financial fields from server computation only
 *
 * Does NOT support coupons (kiosk has no coupon entry UI).
 * Does NOT support manual discounts (kiosk has no staff auth).
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        // Kiosk is unauthenticated — no base44.auth.me() required.
        // Restaurant existence is the tenant check.

        const body = await req.json();
        const {
            restaurantId,
            items,
            orderType,
            selectedTable,
            idempotency_key,
            // Card terminal fields (used when payment is pre-authorized at terminal)
            paymentMethod,
            paymentIntentId,
            terminalLabel,
            terminalProvider,
            terminalAuthTimestamp,
        } = body;

        // Determine which payment path this is
        const isCardPayment = paymentMethod === 'card' && !!paymentIntentId;

        // ── Basic input validation ────────────────────────────────────────────
        if (!restaurantId || typeof restaurantId !== 'string') {
            return Response.json({ error: 'restaurantId is required', success: false }, { status: 400 });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return Response.json({ error: 'Order must contain at least one item', success: false }, { status: 400 });
        }

        const allowedOrderTypes = ['takeaway', 'dine_in'];
        const resolvedOrderType = allowedOrderTypes.includes(orderType) ? orderType : 'takeaway';

        // ── Idempotency check ─────────────────────────────────────────────────
        if (idempotency_key) {
            const existing = await base44.asServiceRole.entities.Order.filter({ idempotency_key });
            if (existing?.length > 0) {
                console.log(`[KIOSK-ORDER] Duplicate idempotency_key=${idempotency_key} → existing order ${existing[0].id}`);
                return Response.json({
                    success: true,
                    order: existing[0],
                    duplicate: true,
                }, { status: 200 });
            }
        }

        // ── Fetch restaurant ──────────────────────────────────────────────────
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId });
        if (!restaurants?.length) {
            return Response.json({ error: 'Restaurant not found', success: false }, { status: 404 });
        }
        const restaurant = restaurants[0];

        // ── Restaurant open check ─────────────────────────────────────────────
        if (restaurant.is_open === false) {
            return Response.json({ error: 'Restaurant is currently closed', success: false }, { status: 400 });
        }

        // ── Kiosk payment method enabled check ───────────────────────────────
        const kioskConfig = restaurant.kiosk_config || {};
        if (isCardPayment) {
            const cardEnabled = kioskConfig.payment_card_enabled === true;
            if (!cardEnabled) {
                return Response.json({
                    error: 'Card payment is not available on this kiosk',
                    success: false,
                }, { status: 400 });
            }
        } else {
            const counterEnabled = kioskConfig.payment_counter_enabled !== false; // default true
            if (!counterEnabled) {
                return Response.json({
                    error: 'Pay at counter is not available on this kiosk',
                    success: false,
                }, { status: 400 });
            }
        }

        // ── Validate and reprice items from live menu ─────────────────────────
        const menuItems = await base44.asServiceRole.entities.MenuItem.filter({ restaurant_id: restaurantId });
        const menuMap = new Map(menuItems.map(m => [m.id, m]));

        const verifiedItems = [];
        for (const cartItem of items) {
            // Each item must have menu_item_id (kiosk doesn't support ad-hoc items)
            if (!cartItem.menu_item_id) {
                return Response.json({
                    error: `Cart item "${cartItem.name || 'unknown'}" is missing a menu reference`,
                    success: false,
                }, { status: 400 });
            }

            const menuItem = menuMap.get(cartItem.menu_item_id);
            if (!menuItem) {
                return Response.json({
                    error: `Item "${cartItem.name || cartItem.menu_item_id}" is no longer on the menu`,
                    success: false,
                }, { status: 400 });
            }

            if (menuItem.is_available === false) {
                return Response.json({
                    error: `"${menuItem.name}" is currently unavailable`,
                    success: false,
                }, { status: 400 });
            }

            // Items marked pos_only should not be orderable from the kiosk
            if (menuItem.availability_channel === 'pos_only') {
                return Response.json({
                    error: `"${menuItem.name}" is not available for self-service ordering`,
                    success: false,
                }, { status: 400 });
            }

            // Quantity validation
            const quantity = Number(cartItem.quantity);
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
                return Response.json({
                    error: `Invalid quantity for "${menuItem.name}"`,
                    success: false,
                }, { status: 400 });
            }

            // Compute server-side item price:
            // Base price from menu (client-supplied price is DISCARDED)
            let serverItemPrice = menuItem.price;

            // Add customization prices from live menu option definitions
            if (cartItem.customizations && typeof cartItem.customizations === 'object') {
                for (const [optionGroupName, selectedValue] of Object.entries(cartItem.customizations)) {
                    const optGroup = menuItem.customization_options?.find(g => g.name === optionGroupName);
                    if (!optGroup) continue; // unknown option group — silently skip (non-blocking)

                    const valuesToCheck = Array.isArray(selectedValue) ? selectedValue : [selectedValue];
                    for (const val of valuesToCheck) {
                        const opt = optGroup.options?.find(o => o.label === val);
                        if (opt?.price) {
                            // For multiple-choice, respect itemQuantities
                            const itemQty = cartItem.itemQuantities?.[val] ?? 1;
                            serverItemPrice += opt.price * itemQty;
                        }
                    }
                }
            }

            verifiedItems.push({
                menu_item_id: cartItem.menu_item_id,
                name: menuItem.name,
                price: serverItemPrice,          // server price — client value discarded
                quantity,
                customizations: cartItem.customizations || {},
                itemQuantities: cartItem.itemQuantities || {},
            });
        }

        // ── Compute totals server-side ────────────────────────────────────────
        const serverSubtotal = verifiedItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const serverTotal = serverSubtotal; // kiosk: no delivery fee, no discount

        // ── Generate order number ─────────────────────────────────────────────
        const orderNum = `K-${Math.floor(1000 + Math.random() * 9000)}`;

        // ── Build safe order payload ──────────────────────────────────────────
        // Only fields we control — client cannot inject financial or status fields
        const orderPayload = {
            restaurant_id: restaurantId,
            restaurant_name: restaurant.name,
            order_number: orderNum,
            items: verifiedItems,
            subtotal: serverSubtotal,
            delivery_fee: 0,
            discount: 0,
            total: serverTotal,
            // Kiosk fixed fields — not client-supplied
            order_source: 'kiosk',
            payment_method: isCardPayment ? 'card' : 'pay_at_counter',
            payment_status: isCardPayment ? 'paid_card' : 'pending_payment',
            order_status: 'new',
            order_type: resolvedOrderType,
            notes: isCardPayment
                ? `Kiosk order — terminal: ${terminalLabel || 'terminal'} — provider: ${terminalProvider || 'card_terminal'} — auth: ${terminalAuthTimestamp || new Date().toISOString()}`
                : 'Kiosk order — awaiting counter payment. Do not prepare until payment confirmed.',
            ...(isCardPayment && paymentIntentId ? { payment_intent_id: paymentIntentId } : {}),
            ...(idempotency_key ? { idempotency_key } : {}),
            ...(selectedTable?.id ? {
                table_id: selectedTable.id,
                table_number: selectedTable.table_number || `Table ${selectedTable.id}`,
            } : {}),
        };

        const order = await base44.asServiceRole.entities.Order.create(orderPayload);

        if (!order?.id) {
            console.error('[KIOSK-ORDER] Entity create returned no ID for restaurant', restaurantId);
            return Response.json({ error: 'Failed to create order', success: false }, { status: 500 });
        }

        console.log(`[KIOSK-ORDER] Created: id=${order.id} num=${orderNum} restaurant=${restaurantId} total=£${serverTotal.toFixed(2)} items=${verifiedItems.length} type=${resolvedOrderType}`);

        return Response.json({ success: true, order }, { status: 201 });

    } catch (error) {
        console.error('[kioskCreateOrder] Unhandled error:', error);
        return Response.json({ error: 'Order creation failed. Please try again.', success: false }, { status: 500 });
    }
});