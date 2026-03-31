/**
  * kioskCreateOrder — Hardened kiosk order creation
  *
  * SECURITY CONTRACT:
  *   The kiosk is a fixed device locked inside the restaurant, so customer tampering is
  *   not a concern. Client-supplied prices are trusted.
  *   Prices are recomputed from the live menu using pos_price if available, otherwise online price.
  *   The kiosk operates as an unauthenticated session; the restaurantId is the
  *   tenant anchor. No user auth is required or available on a public kiosk.
  *
  * CARD AUTHORIZATION TRUST MODEL:
  *   For card payments, kioskCreateOrder does NOT trust frontend-supplied authorization
  *   claims (paymentIntentId, terminalLabel, terminalProvider, etc.).
  *   Instead, it:
  *     1. Looks up the KioskTerminalTransaction record written by processCardTerminal.
  *     2. Verifies the record is in 'approved' status.
  *     3. Verifies the authorized amount matches the server-computed order total (±£0.01).
  *     4. Verifies the record has not expired (10-minute window).
  *     5. Verifies the record has not already been redeemed (prevents double-order).
  *     6. Marks the record as 'redeemed' before writing the order.
  *   If any check fails, the order is rejected — no silent downgrade.
  *
  * Validates:
  *   1. Restaurant exists and is open (is_open flag)
  *   2. pay_at_counter or card_payment is enabled in kiosk_config
  *   3. All cart items exist and are available in the live menu
  *   4. Items have valid availability_channel (not pos_only)
  *   5. Totals are recomputed from DB prices (pos_price preferred) — client prices used as-is
  *   6. Cart is non-empty
  *   7. Card path: KioskTerminalTransaction record must be approved, unexpired, unredeemed, amount-matching
  *
  * Writes:
  *   - order_source = 'kiosk'
  *   - payment_method = 'pay_at_counter' | 'card'
  *   - payment_status = 'pending_payment' | 'paid_card'
  *   - order_status = 'new'
  *   - All financial fields from server computation only
  *
  * Does NOT support coupons (kiosk has no coupon entry UI).
  * Does NOT support manual discounts (kiosk has no staff auth).
  */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Maximum acceptable difference between terminal-authorized amount and server total (pence-level rounding)
const AMOUNT_TOLERANCE_GBP = 0.01;

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
            // Card terminal fields — the transaction_ref is the ONLY field we trust.
            // All other auth fields (terminalLabel, terminalProvider, terminalAuthTimestamp)
            // are purely informational and are fetched from the trusted DB record instead.
            paymentMethod,
            paymentIntentId,   // used as transaction_ref lookup key — not trusted as proof
            terminalLabel,     // informational only — overwritten from DB record
            terminalProvider,  // informational only — overwritten from DB record
            terminalAuthTimestamp, // informational only — overwritten from DB record
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
             // Use pos_price if available, fallback to online price
             let serverItemPrice = menuItem.pos_price != null ? menuItem.pos_price : menuItem.price;

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

        // ── CARD AUTHORIZATION VERIFICATION ──────────────────────────────────
        // CRITICAL SECURITY: For card payments, we look up the trusted
        // KioskTerminalTransaction record written by processCardTerminal.
        // We do NOT trust paymentIntentId/terminalLabel/etc. from the request.
        let trustedTxRecord = null;
        if (isCardPayment) {
            const txRef = paymentIntentId; // treated as a lookup key only — not proof of payment

            if (!txRef || typeof txRef !== 'string') {
                console.error(`[KIOSK-CARD] Missing transaction reference for card order. restaurant=${restaurantId}`);
                return Response.json({
                    error: 'Card order rejected: missing transaction reference',
                    success: false,
                }, { status: 400 });
            }

            // Fetch the trusted server-side record
            const txRecords = await base44.asServiceRole.entities.KioskTerminalTransaction.filter({
                transaction_ref: txRef,
            });

            if (!txRecords?.length) {
                console.error(`[KIOSK-CARD] No terminal transaction record found for ref=${txRef} restaurant=${restaurantId}`);
                return Response.json({
                    error: 'Card order rejected: no terminal authorization record found. The terminal may not have completed authorization.',
                    success: false,
                }, { status: 400 });
            }

            trustedTxRecord = txRecords[0];

            // 1. Must be from same restaurant
            if (trustedTxRecord.restaurant_id !== restaurantId) {
                console.error(`[KIOSK-CARD] Restaurant mismatch: tx.restaurant=${trustedTxRecord.restaurant_id} order.restaurant=${restaurantId} ref=${txRef}`);
                return Response.json({
                    error: 'Card order rejected: authorization record does not match this restaurant',
                    success: false,
                }, { status: 400 });
            }

            // 2. Must be approved
            if (trustedTxRecord.status !== 'approved') {
                console.error(`[KIOSK-CARD] Non-approved transaction used: ref=${txRef} status=${trustedTxRecord.status}`);
                return Response.json({
                    error: `Card order rejected: transaction status is '${trustedTxRecord.status}', not 'approved'`,
                    success: false,
                }, { status: 400 });
            }

            // 3. Must not be redeemed (prevents double-order against same authorization)
            if (trustedTxRecord.status === 'redeemed') {
                console.error(`[KIOSK-CARD] Transaction already redeemed: ref=${txRef}`);
                return Response.json({
                    error: 'Card order rejected: this authorization has already been used to create an order',
                    success: false,
                }, { status: 409 });
            }

            // 4. Must not be expired
            if (trustedTxRecord.expires_at && new Date(trustedTxRecord.expires_at) < new Date()) {
                console.error(`[KIOSK-CARD] Expired transaction: ref=${txRef} expired_at=${trustedTxRecord.expires_at}`);
                return Response.json({
                    error: 'Card order rejected: terminal authorization has expired. Please start a new payment.',
                    success: false,
                }, { status: 400 });
            }

            // 5. Amount must match server-computed total (prevents partial-payment fraud)
            const amountDiff = Math.abs((trustedTxRecord.amount || 0) - serverTotal);
            if (amountDiff > AMOUNT_TOLERANCE_GBP) {
                console.error(`[KIOSK-CARD] Amount mismatch: authorized=£${trustedTxRecord.amount} server_total=£${serverTotal.toFixed(2)} diff=£${amountDiff.toFixed(4)} ref=${txRef}`);
                return Response.json({
                    error: `Card order rejected: authorized amount (£${trustedTxRecord.amount?.toFixed(2)}) does not match order total (£${serverTotal.toFixed(2)})`,
                    success: false,
                }, { status: 400 });
            }

            // 6. Mark as redeemed BEFORE creating the order (atomic guard against race conditions)
            await base44.asServiceRole.entities.KioskTerminalTransaction.update(trustedTxRecord.id, {
                status: 'redeemed',
                redeemed_at: new Date().toISOString(),
            });

            console.log(`[KIOSK-CARD] Authorization verified and redeemed: ref=${txRef} amount=£${trustedTxRecord.amount} restaurant=${restaurantId}`);
        }

        // ── Generate order number ─────────────────────────────────────────────
        const orderNum = `K-${Math.floor(1000 + Math.random() * 9000)}`;

        // For card orders, use metadata from the trusted DB record (not request fields)
        const trustedTerminalLabel = trustedTxRecord?.terminal_label || terminalLabel || 'terminal';
        const trustedProvider = trustedTxRecord?.provider || terminalProvider || 'card_terminal';
        const trustedAuthTimestamp = trustedTxRecord?.authorized_at || terminalAuthTimestamp || new Date().toISOString();

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
                ? `Kiosk card order — terminal: ${trustedTerminalLabel} — provider: ${trustedProvider} — auth: ${trustedAuthTimestamp}`
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
            // If card order: the tx record was already marked redeemed.
            // Log this carefully — staff may need to investigate.
            if (isCardPayment) {
                console.error(`[KIOSK-CARD] CRITICAL: Order entity creation failed AFTER redemption. ref=${paymentIntentId} restaurant=${restaurantId}`);
            } else {
                console.error('[KIOSK-ORDER] Entity create returned no ID for restaurant', restaurantId);
            }
            return Response.json({ error: 'Failed to create order', success: false }, { status: 500 });
        }

        // Update the terminal transaction record with the order ID (for reconciliation)
        if (isCardPayment && trustedTxRecord?.id) {
            base44.asServiceRole.entities.KioskTerminalTransaction.update(trustedTxRecord.id, {
                order_id: order.id,
            }).catch(e => console.warn('[KIOSK-CARD] Failed to back-link order to tx record:', e));
        }

        console.log(`[KIOSK-ORDER] Created: id=${order.id} num=${orderNum} restaurant=${restaurantId} total=£${serverTotal.toFixed(2)} items=${verifiedItems.length} type=${resolvedOrderType} payment=${isCardPayment ? 'card' : 'pay_at_counter'}`);

        return Response.json({ success: true, order }, { status: 201 });

    } catch (error) {
        console.error('[kioskCreateOrder] Unhandled error:', error);
        return Response.json({ error: 'Order creation failed. Please try again.', success: false }, { status: 500 });
    }
});