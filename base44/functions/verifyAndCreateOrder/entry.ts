/**
 * VERIFY AND CREATE ORDER
 *
 * Performs strict server-side price validation before creating an order:
 *   1. Fetches authoritative MenuItem prices from DB
 *   2. Recalculates every item's price including all customization costs
 *   3. Rejects if any item, subtotal, or total differs from client values by > £0.02
 *   4. Verifies Stripe PaymentIntent status and amount (card orders)
 *   5. Creates the order only after all checks pass
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe';

const LOG = '[verifyAndCreateOrder]';
const PRICE_TOLERANCE = 0.02;
const PAGE_SIZE = 50;

// ── Price Validation Helpers ─────────────────────────────────────────────────

async function fetchMenuItemMap(base44, restaurantId, requiredIds) {
    const itemMap = new Map();
    if (requiredIds.length === 0) return itemMap;
    let skip = 0;
    let hasMore = true;
    while (hasMore && itemMap.size < requiredIds.length) {
        // MED-2 FIX: Use stable sort to ensure consistent pagination across pages
        const batch = await base44.asServiceRole.entities.MenuItem.filter(
            { restaurant_id: restaurantId }, 'created_date', PAGE_SIZE, skip
        );
        if (!Array.isArray(batch) || batch.length === 0) { hasMore = false; break; }
        for (const item of batch) {
            if (item?.id && requiredIds.includes(item.id)) itemMap.set(item.id, item);
        }
        if (itemMap.size === requiredIds.length || batch.length < PAGE_SIZE) hasMore = false;
        skip += PAGE_SIZE;
    }
    return itemMap;
}

function calcItemServerPrice(dbItem, orderItem, isPOS = false) {
    const basePrice = (isPOS && dbItem.pos_price != null) ? dbItem.pos_price : dbItem.price;
    let serverPrice = basePrice;
    const breakdown = [`base=£${basePrice.toFixed(2)}`];

    const customizations = orderItem.customizations;
    // itemQuantities tracks multi-select quantities: key = "GroupName_OptionLabel" => qty
    const itemQuantities = orderItem.itemQuantities || {};

    if (!customizations || typeof customizations !== 'object') return { serverPrice, breakdown };

    const dbOptions = dbItem.customization_options || [];

    // Normalise to array format: [{name, value/selected_options}]
    const customizationList = Array.isArray(customizations)
        ? customizations
        : Object.entries(customizations).map(([name, value]) => ({ name, value }));

    for (const clientCustom of customizationList) {
        const customName = clientCustom.name || clientCustom.key;
        if (!customName) continue;

        // Skip internal meal_customizations keys stored as "GroupName_meal_customizations"
        if (customName.endsWith('_meal_customizations')) continue;

        const dbGroup = dbOptions.find(g => g.name === customName);
        if (!dbGroup) continue;

        if (dbGroup.type === 'meal_upgrade') {
            // Value is the selected upgrade label (e.g. "Meal" or "Just the item")
            const selectedUpgrade = clientCustom.selected_option || clientCustom.value;
            if (!selectedUpgrade) continue;
            const upgradeLabel = typeof selectedUpgrade === 'string' ? selectedUpgrade : selectedUpgrade.label;
            const dbUpgradeOption = (dbGroup.options || []).find(o => o.label === upgradeLabel);
            if (dbUpgradeOption && typeof dbUpgradeOption.price === 'number') {
                serverPrice += dbUpgradeOption.price;
                breakdown.push(`upgrade:${upgradeLabel}=£${dbUpgradeOption.price.toFixed(2)}`);
            }

            // Handle nested meal customizations — look them up from the flat customizations object
            const mealCustomsObj = (Array.isArray(customizations)
                ? null
                : customizations[`${customName}_meal_customizations`]) || {};

            if (dbUpgradeOption && Array.isArray(dbUpgradeOption.meal_customizations)) {
                for (const mealGroup of dbUpgradeOption.meal_customizations) {
                    const mealSelections = mealCustomsObj[mealGroup.name];
                    if (!mealSelections) continue;
                    const selections = Array.isArray(mealSelections) ? mealSelections : [mealSelections];
                    for (const selLabel of selections) {
                        const dbOpt = (mealGroup.options || []).find(o => o.label === selLabel);
                        if (!dbOpt) continue;
                        const optPrice = isPOS && dbOpt.pos_price != null ? dbOpt.pos_price : (dbOpt.price || 0);
                        // Check for multi-qty via itemQuantities
                        const qtyKey = `${customName}_meal_${mealGroup.name}_${selLabel}`;
                        const qty = itemQuantities[qtyKey] || 1;
                        serverPrice += optPrice * qty;
                        breakdown.push(`${mealGroup.name}:${selLabel}×${qty}=£${(optPrice * qty).toFixed(2)}`);
                    }
                }
            }
            continue;
        }

        // single / multiple types
        const rawValue = clientCustom.selected_options ?? clientCustom.selected_option ?? clientCustom.value;
        const selectedOptions = Array.isArray(rawValue) ? rawValue : (rawValue != null && rawValue !== '' ? [rawValue] : []);

        for (const sel of selectedOptions) {
            const selLabel = typeof sel === 'string' ? sel : sel?.label;
            if (!selLabel) continue;
            const dbOpt = (dbGroup.options || []).find(o => o.label === selLabel);
            if (!dbOpt) continue;
            const optPrice = isPOS && dbOpt.pos_price != null ? dbOpt.pos_price : (typeof dbOpt.price === 'number' ? dbOpt.price : 0);
            // For multiple-type, respect itemQuantities (qty stepper on the UI)
            const qtyKey = `${customName}_${selLabel}`;
            const qty = (dbGroup.type === 'multiple' && itemQuantities[qtyKey]) ? itemQuantities[qtyKey] : 1;
            serverPrice += optPrice * qty;
            breakdown.push(`${customName}:${selLabel}×${qty}=£${(optPrice * qty).toFixed(2)}`);
        }
    }
    return { serverPrice, breakdown };
}

async function validateOrderPricing(base44, { items, restaurantId, clientSubtotal, clientTotal, deliveryFee, smallOrderSurcharge, discount, isPOS }) {
    const regularItems = items.filter(i => !String(i.menu_item_id || i.id || '').startsWith('deal_'));
    const dealItems = items.filter(i => String(i.menu_item_id || i.id || '').startsWith('deal_'));
    const requiredIds = [...new Set(regularItems.map(i => i.menu_item_id || i.id).filter(Boolean))];

    let menuMap;
    try {
        menuMap = await fetchMenuItemMap(base44, restaurantId, requiredIds);
    } catch (err) {
        console.error(`${LOG} MenuItem fetch failed: ${err.message}`);
        return { valid: false, error: 'Menu validation unavailable. Please try again.', code: 'MENU_FETCH_FAILED' };
    }

    // ── Fetch and validate meal deals ──────────────────────────────────────
    let dealMap = new Map();
    if (dealItems.length > 0) {
        try {
            const allDeals = await base44.asServiceRole.entities.MealDeal.filter({ restaurant_id: restaurantId });
            if (Array.isArray(allDeals)) {
                for (const deal of allDeals) {
                    if (deal?.id) dealMap.set(deal.id, deal);
                }
            }
        } catch (err) {
            console.error(`${LOG} MealDeal fetch failed: ${err.message}`);
            return { valid: false, error: 'Meal deal validation unavailable. Please try again.', code: 'DEAL_FETCH_FAILED' };
        }
    }

    let serverSubtotal = 0;
    const itemResults = [];

    for (const orderItem of regularItems) {
        const itemId = orderItem.menu_item_id || orderItem.id;
        const dbItem = menuMap.get(itemId);
        if (!dbItem) return { valid: false, error: `Item no longer available: ${orderItem.name}`, code: 'ITEM_NOT_FOUND', compensatable: true };
        if (dbItem.is_available === false) return { valid: false, error: `Item is currently unavailable: ${orderItem.name}`, code: 'ITEM_UNAVAILABLE', compensatable: true };

        const quantity = Number(orderItem.quantity || 1);
        const { serverPrice: serverUnitPrice, breakdown } = calcItemServerPrice(dbItem, orderItem, isPOS);
        const serverLineTotal = serverUnitPrice * quantity;
        const clientLineTotal = Number(orderItem.price || 0) * quantity;
        const delta = Math.abs(serverLineTotal - clientLineTotal);

        itemResults.push({ id: itemId, name: orderItem.name, quantity, clientUnitPrice: Number(orderItem.price || 0), serverUnitPrice, clientLineTotal, serverLineTotal, delta, breakdown });

        if (delta > PRICE_TOLERANCE * quantity) {
            console.error(`${LOG} PRICE_MISMATCH item="${orderItem.name}" client=£${clientLineTotal.toFixed(2)} server=£${serverLineTotal.toFixed(2)} delta=£${delta.toFixed(4)} [${breakdown.join(',')}]`);
            return { valid: false, error: `Price mismatch detected for "${orderItem.name}". Please refresh and try again.`, code: 'PRICE_MISMATCH', itemResults };
        }
        serverSubtotal += serverLineTotal;
    }

    for (const dealItem of dealItems) {
        const dealId = String(dealItem.menu_item_id || dealItem.id || '').replace(/^deal_/, '');
        const dbDeal = dealMap.get(dealId);
        if (!dbDeal) return { valid: false, error: `Meal deal no longer available`, code: 'DEAL_NOT_FOUND', compensatable: true };
        if (dbDeal.is_active === false) return { valid: false, error: `Meal deal is no longer active`, code: 'DEAL_INACTIVE', compensatable: true };

        const quantity = Number(dealItem.quantity || 1);
        const clientDealPrice = Number(dealItem.price || 0);
        const serverDealPrice = Number(dbDeal.deal_price || 0);
        const clientLineTotal = clientDealPrice * quantity;
        const serverLineTotal = serverDealPrice * quantity;
        const delta = Math.abs(serverLineTotal - clientLineTotal);

        if (delta > PRICE_TOLERANCE * quantity) {
            console.error(`${LOG} DEAL_PRICE_MISMATCH deal="${dbDeal.name}" client=£${clientLineTotal.toFixed(2)} server=£${serverLineTotal.toFixed(2)} delta=£${delta.toFixed(4)}`);
            return { valid: false, error: `Price mismatch for meal deal "${dbDeal.name}". Please refresh and try again.`, code: 'DEAL_PRICE_MISMATCH', itemResults };
        }
        serverSubtotal += serverLineTotal;
    }

    const subtotalDelta = Math.abs(serverSubtotal - Number(clientSubtotal));
    if (subtotalDelta > PRICE_TOLERANCE) {
        console.error(`${LOG} SUBTOTAL_MISMATCH client=£${clientSubtotal} server=£${serverSubtotal.toFixed(2)} delta=£${subtotalDelta.toFixed(4)}`);
        return { valid: false, serverSubtotal, error: 'Order subtotal mismatch. Please refresh and try again.', code: 'SUBTOTAL_MISMATCH', itemResults };
    }

    const serverTotal = Math.max(0, serverSubtotal + Number(deliveryFee) + Number(smallOrderSurcharge) - Number(discount));
    const totalDelta = Math.abs(serverTotal - Number(clientTotal));
    if (totalDelta > PRICE_TOLERANCE) {
        console.error(`${LOG} TOTAL_MISMATCH client=£${clientTotal} server=£${serverTotal.toFixed(2)} delta=£${totalDelta.toFixed(4)} [subtotal=${serverSubtotal.toFixed(2)} delivery=${deliveryFee} surcharge=${smallOrderSurcharge} discount=${discount}]`);
        return { valid: false, serverSubtotal, serverTotal, error: 'Order total mismatch. Please refresh and try again.', code: 'TOTAL_MISMATCH', itemResults };
    }

    console.log(`${LOG} ✅ Pricing OK: subtotal=£${serverSubtotal.toFixed(2)} delivery=£${deliveryFee} surcharge=£${smallOrderSurcharge} discount=£${discount} total=£${serverTotal.toFixed(2)}`);
    return { valid: true, serverSubtotal, serverTotal, itemResults };
}

// ── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    try {
        if (req.method !== 'POST') {
            return Response.json({ error: 'POST only', success: false }, { status: 405 });
        }

        const { orderData, paymentIntentId, idempotency_key, stripeChargedAmountPence } = await req.json();
        const base44 = createClientFromRequest(req);
        let user = null;
        try { user = await base44.auth.me(); } catch (_) { user = null; }

        if (!orderData || !orderData.restaurant_id || !Array.isArray(orderData.items) || orderData.items.length === 0) {
            return Response.json({ error: 'Invalid order data', success: false, code: 'INVALID_ORDER_DATA' }, { status: 400 });
        }

        // ── Idempotency check ──────────────────────────────────────────────────
        if (idempotency_key) {
            const existing = await base44.asServiceRole.entities.Order.filter({ idempotency_key });
            if (existing?.length > 0) {
                console.log(`${LOG} Duplicate order request for key=${idempotency_key} — returning existing order`);
                return Response.json({ success: true, order_id: existing[0].id, order_number: existing[0].order_number, duplicate: true }, { status: 200 });
            }
        }

        // ── PaymentIntent dedup check (guards against propagation lag on idempotency_key) ──
        if (paymentIntentId) {
            const existingByPI = await base44.asServiceRole.entities.Order.filter({ payment_intent_id: paymentIntentId });
            if (existingByPI?.length > 0) {
                console.log(`${LOG} Duplicate order request for pi=${paymentIntentId} — returning existing order id=${existingByPI[0].id}`);
                return Response.json({ success: true, order_id: existingByPI[0].id, order_number: existingByPI[0].order_number, duplicate: true }, { status: 200 });
            }
        }

        // ── Restaurant exists ──────────────────────────────────────────────────
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: orderData.restaurant_id });
        if (!restaurants?.length) {
            return Response.json({ error: 'Restaurant not found', success: false, code: 'RESTAURANT_NOT_FOUND' }, { status: 404 });
        }

        // ── Normalize items ────────────────────────────────────────────────────
        const normalizedItems = orderData.items.map((item) => ({
            menu_item_id: item.menu_item_id || item.id || null,
            name: item.name || 'Item',
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 1),
            customizations: item.customizations || {},
            // Pass itemQuantities so server-side price calc respects multi-qty extras
            itemQuantities: item.itemQuantities || {}
        }));

        const clientSubtotal = Number(orderData.subtotal || 0);
        const deliveryFee = Number(orderData.delivery_fee || 0);
        const smallOrderSurcharge = Number(orderData.small_order_surcharge || 0);
        const discount = Number(orderData.discount || 0);
        const clientTotal = Number(orderData.total || 0);
        const isPOS = orderData.order_source === 'pos';

        // ── SERVER-SIDE PRICE VALIDATION ───────────────────────────────────────
        const priceCheck = await validateOrderPricing(base44, {
            items: normalizedItems,
            restaurantId: orderData.restaurant_id,
            clientSubtotal,
            clientTotal,
            deliveryFee,
            smallOrderSurcharge,
            discount,
            isPOS
        });

        if (!priceCheck.valid) {
            console.error(`${LOG} Price validation failed: code=${priceCheck.code} error=${priceCheck.error}`);

            // If payment was already taken and the item is no longer in the menu,
            // flag as compensatable so the caller can trigger a refund.
            if (priceCheck.compensatable) {
                return Response.json({
                    success: false,
                    error: priceCheck.error,
                    code: priceCheck.code,
                    refunded: false,
                    compensatable: true
                }, { status: 422 });
            }

            return Response.json({
                success: false,
                error: priceCheck.error,
                code: priceCheck.code
            }, { status: 422 });
        }

        // Use server-calculated values for the actual order record
        const serverSubtotal = priceCheck.serverSubtotal;
        const serverTotal = priceCheck.serverTotal;

        // ── Stripe PaymentIntent verification (card orders) ────────────────────
        if (orderData.payment_method === 'card' && paymentIntentId) {
            const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
            let paymentIntent;
            try {
                paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            } catch (stripeErr) {
                console.error(`${LOG} Stripe retrieve failed: ${stripeErr.message}`);
                return Response.json({ error: 'Payment verification failed. Please contact support.', success: false, code: 'STRIPE_RETRIEVE_FAILED' }, { status: 502 });
            }

            // Verify payment status
            if (paymentIntent.status !== 'succeeded') {
                console.error(`${LOG} PaymentIntent not succeeded: status=${paymentIntent.status} pi=${paymentIntentId}`);
                return Response.json({ error: `Payment not completed (status: ${paymentIntent.status}). Please try again.`, success: false, code: 'PAYMENT_NOT_SUCCEEDED' }, { status: 402 });
            }

            // MED-7 FIX: Use stripeChargedAmountPence from recovery path if provided (recovery already verified PI),
            // otherwise use paymentIntent.amount. This ensures recovery validates against the actual Stripe charge,
            // not the potentially stale orderData.total.
            const chargedAmountPence = stripeChargedAmountPence ?? paymentIntent.amount;
            const chargedGBP = chargedAmountPence / 100;
            const amountDelta = Math.abs(chargedGBP - serverTotal);
            if (amountDelta > PRICE_TOLERANCE) {
                console.error(`${LOG} STRIPE_AMOUNT_MISMATCH charged=£${chargedGBP.toFixed(2)} serverTotal=£${serverTotal.toFixed(2)} delta=£${amountDelta.toFixed(4)} pi=${paymentIntentId}`);
                return Response.json({
                    error: 'Payment amount does not match order total. Please contact support.',
                    success: false,
                    code: 'STRIPE_AMOUNT_MISMATCH',
                    refunded: false
                }, { status: 422 });
            }

            console.log(`${LOG} ✅ Stripe verified: pi=${paymentIntentId} charged=£${chargedGBP.toFixed(2)} serverTotal=£${serverTotal.toFixed(2)}`);
        }

        // ── Normalise customizations to object format before DB write ─────────
        // The DB entity schema requires customizations to be a plain dict/object.
        // The frontend may send either an array of {name, selected_options} objects
        // or already a plain object — convert array → object here to avoid validation errors.
        const normalizeCustomizationsForDB = (customizations) => {
            if (!customizations) return {};
            if (Array.isArray(customizations)) {
                // Convert [{name: "Chips", selected_options: ["With Chips"]}, ...] → {"Chips": "With Chips", ...}
                const obj = {};
                for (const group of customizations) {
                    if (!group.name) continue;
                    const val = group.selected_options ?? (group.selected_option ? [group.selected_option] : group.value);
                    obj[group.name] = Array.isArray(val) && val.length === 1 ? val[0] : val;
                    // Preserve nested meal_customizations as a sub-object if present
                    // MED-3 FIX: Match the key format used in calcItemServerPrice (_meal_customizations, not __meal)
                    if (group.meal_customizations) {
                        obj[`${group.name}_meal_customizations`] = normalizeCustomizationsForDB(group.meal_customizations);
                    }
                }
                return obj;
            }
            // Already an object — return as-is
            return customizations;
        };

        const itemsForDB = normalizedItems.map(item => ({
            ...item,
            customizations: normalizeCustomizationsForDB(item.customizations),
        }));

        // ── Create order using server-validated values ─────────────────────────
        // Allowlist ONLY safe client-provided fields; override all financial/status fields server-side
        const {
            restaurant_id,
            restaurant_name,
            order_type,
            delivery_address,
            delivery_coordinates,
            phone,
            notes,
            is_scheduled,
            scheduled_for,
            is_group_order,
            group_order_id,
            order_number,
            guest_name,
            guest_email,
            coupon_codes,
        } = orderData;

        // Compute loyalty points server-side (never trust client)
        const restaurant = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurant_id });
        const restaurantData = restaurant?.[0];
        const earnLoyalty = restaurantData?.loyalty_program_enabled !== false;
        const pointsMultiplier = restaurantData?.loyalty_points_multiplier || 1;
        const loyaltyPointsPerPound = 1; // Standard: 1 point per £1
        const loyaltyPointsEarned = earnLoyalty ? Math.floor(serverTotal * loyaltyPointsPerPound * pointsMultiplier) : 0;

        const customerEmail = user?.email || guest_email || null;
        const customerPhone = phone || null;

        const newOrder = await base44.asServiceRole.entities.Order.create({
            restaurant_id,
            restaurant_name,
            order_type,
            delivery_address,
            delivery_coordinates,
            phone: customerPhone,
            notes,
            is_scheduled: is_scheduled === true,
            scheduled_for,
            is_group_order: is_group_order === true,
            group_order_id,
            order_number,
            guest_name,
            guest_email,
            coupon_codes: Array.isArray(coupon_codes) ? coupon_codes : [],
            items: itemsForDB,
            subtotal: serverSubtotal,
            delivery_fee: deliveryFee,
            small_order_surcharge: smallOrderSurcharge,
            discount,
            total: serverTotal,
            loyalty_points_earned: loyaltyPointsEarned,
            loyalty_points_awarded: false,
            ...(idempotency_key ? { idempotency_key } : {}),
            ...(paymentIntentId ? { payment_intent_id: paymentIntentId } : {}),
            status: 'pending',
            order_source: 'online',
            payment_status: paymentIntentId ? 'payment_confirmed' : 'pending_payment',
            payment_method: orderData.payment_method || 'cash',
            customer_email: customerEmail,
            customer_phone: customerPhone,
        });

        // ── Update/create PaymentTransaction record ────────────────────────────
        if (orderData.payment_method === 'card' && paymentIntentId) {
            const existingTxns = await base44.asServiceRole.entities.PaymentTransaction.filter({ payment_intent_id: paymentIntentId });
            if (existingTxns?.length > 0) {
                await base44.asServiceRole.entities.PaymentTransaction.update(existingTxns[0].id, {
                    status: 'order_created',
                    order_id: newOrder.id,
                    order_number: newOrder.order_number || null,
                    order_created_at: new Date().toISOString()
                });
            } else {
                await base44.asServiceRole.entities.PaymentTransaction.create({
                    payment_intent_id: paymentIntentId,
                    idempotency_key: idempotency_key || null,
                    restaurant_id: orderData.restaurant_id,
                    order_id: newOrder.id,
                    order_number: newOrder.order_number || null,
                    amount: serverTotal,
                    currency: 'gbp',
                    status: 'order_created',
                    user_email: user?.email || null,
                    guest_email: orderData.guest_email || null,
                    guest_phone: orderData.phone || null,
                    stripe_verified_at: new Date().toISOString(),
                    order_created_at: new Date().toISOString()
                });
            }
        }

        console.log(`${LOG} ✅ Order created: id=${newOrder.id} total=£${serverTotal.toFixed(2)}`);
        return Response.json({ success: true, order_id: newOrder.id, order_number: newOrder.order_number }, { status: 201 });

    } catch (error) {
        console.error(`${LOG} fatal: ${error.message}`, error.stack);
        return Response.json({ error: error.message, success: false, code: 'ORDER_CREATE_FAILED' }, { status: 500 });
    }
});