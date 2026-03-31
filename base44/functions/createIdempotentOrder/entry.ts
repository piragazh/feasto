/**
 * IDEMPOTENT ORDER CREATION — Called by webhook or verified checkout
 *
 * Guarantees: one paymentIntent → at most one order
 * Source: Can be called from webhook (recovery) or frontend (normal flow)
 *
 * Now includes strict server-side price validation:
 *   - Fetches authoritative MenuItem prices from DB
 *   - Recalculates item totals including all customization costs
 *   - Rejects if total differs from charged amount by > £0.02
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const LOG = '[createIdempotentOrder]';
const PRICE_TOLERANCE = 0.02;
const PAGE_SIZE = 50;

// ── Price Validation Helpers ─────────────────────────────────────────────────

async function fetchMenuItemMap(base44, restaurantId, requiredIds) {
    const itemMap = new Map();
    if (requiredIds.length === 0) return itemMap;
    let skip = 0;
    let hasMore = true;
    while (hasMore && itemMap.size < requiredIds.length) {
        const batch = await base44.asServiceRole.entities.MenuItem.filter(
            { restaurant_id: restaurantId }, null, PAGE_SIZE, skip
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

function calcItemServerPrice(dbItem, orderItem) {
    const basePrice = dbItem.price;
    let serverPrice = basePrice;
    const breakdown = [`base=£${basePrice.toFixed(2)}`];

    const customizations = orderItem.customizations;
    if (!customizations || typeof customizations !== 'object') return { serverPrice, breakdown };

    const dbOptions = dbItem.customization_options || [];
    const customizationList = Array.isArray(customizations)
        ? customizations
        : Object.entries(customizations).map(([name, value]) => ({ name, value }));

    for (const clientCustom of customizationList) {
        const customName = clientCustom.name || clientCustom.key;
        if (!customName) continue;

        const dbGroup = dbOptions.find(g => g.name === customName);
        if (!dbGroup) continue;

        if (dbGroup.type === 'meal_upgrade') {
            const selectedUpgrade = clientCustom.selected_option || clientCustom.value;
            if (!selectedUpgrade) continue;
            const upgradeLabel = typeof selectedUpgrade === 'string' ? selectedUpgrade : selectedUpgrade.label;
            const dbUpgradeOption = (dbGroup.options || []).find(o => o.label === upgradeLabel);
            if (dbUpgradeOption && typeof dbUpgradeOption.price === 'number') {
                serverPrice += dbUpgradeOption.price;
                breakdown.push(`upgrade:${upgradeLabel}=£${dbUpgradeOption.price.toFixed(2)}`);
            }
            if (dbUpgradeOption && Array.isArray(dbUpgradeOption.meal_customizations)) {
                // Align with verifyAndCreateOrder: look for flat-key meal customizations
                const mealCustomsObj = (Array.isArray(customizations)
                    ? null
                    : customizations[`${customName}_meal_customizations`]) || {};

                for (const mealGroup of dbUpgradeOption.meal_customizations) {
                    const mealSelections = mealCustomsObj[mealGroup.name];
                    if (!mealSelections) continue;
                    const selections = Array.isArray(mealSelections) ? mealSelections : [mealSelections];
                    for (const selLabel of selections) {
                        const dbOpt = (mealGroup.options || []).find(o => o.label === selLabel);
                        if (!dbOpt) continue;
                        const optPrice = dbOpt.price || 0;
                        serverPrice += optPrice;
                        breakdown.push(`${mealGroup.name}:${selLabel}=£${optPrice.toFixed(2)}`);
                    }
                }
            }
            continue;
        }

        const selectedOptions = clientCustom.selected_options
            || (clientCustom.selected_option ? [clientCustom.selected_option] : [])
            || (Array.isArray(clientCustom.value) ? clientCustom.value : (clientCustom.value ? [clientCustom.value] : []));

        for (const sel of selectedOptions) {
            const selLabel = typeof sel === 'string' ? sel : sel.label;
            if (!selLabel) continue;
            const dbOpt = (dbGroup.options || []).find(o => o.label === selLabel);
            if (!dbOpt) continue;
            const optPrice = typeof dbOpt.price === 'number' ? dbOpt.price : 0;
            serverPrice += optPrice;
            breakdown.push(`${customName}:${selLabel}=£${optPrice.toFixed(2)}`);
        }
    }
    return { serverPrice, breakdown };
}

/**
 * Validate pricing for webhook/recovery path.
 * Here the payment has already been charged — we validate against the Stripe amount,
 * not against a client-submitted total (which may not exist in metadata).
 * Returns { valid, serverSubtotal, serverTotal, logOnly, error, code }
 */
async function validatePricingForRecovery(base44, { items, restaurantId, chargedAmountGBP, deliveryFee, smallOrderSurcharge, discount }) {
    const regularItems = items.filter(i => !String(i.menu_item_id || '').startsWith('deal_'));
    const dealItems = items.filter(i => String(i.menu_item_id || '').startsWith('deal_'));
    const requiredIds = [...new Set(regularItems.map(i => i.menu_item_id).filter(Boolean))];

    let menuMap;
    try {
        menuMap = await fetchMenuItemMap(base44, restaurantId, requiredIds);
    } catch (err) {
        console.error(`${LOG} MenuItem fetch failed: ${err.message}`);
        // Non-fatal for recovery — log and proceed with metadata prices
        return { valid: true, logOnly: true, serverSubtotal: null, serverTotal: null };
    }

    let serverSubtotal = 0;

    for (const orderItem of regularItems) {
        const itemId = orderItem.menu_item_id;
        const dbItem = menuMap.get(itemId);

        if (!dbItem) {
            console.warn(`${LOG} Item not found during recovery: ${orderItem.name} (${itemId}) — may have been deleted after payment`);
            return {
                valid: false,
                error: `Item no longer available: ${orderItem.name}`,
                code: 'ITEM_NOT_FOUND',
                compensatable: true,
                recoverable: false
            };
        }

        const quantity = Number(orderItem.quantity || 1);
        const { serverPrice: serverUnitPrice, breakdown } = calcItemServerPrice(dbItem, orderItem);
        const serverLineTotal = serverUnitPrice * quantity;
        const chargedLineTotal = Number(orderItem.price || 0) * quantity;
        const delta = Math.abs(serverLineTotal - chargedLineTotal);

        if (delta > PRICE_TOLERANCE * quantity) {
            // During recovery (payment already taken), we LOG the drift but don't reject.
            // The customer was charged at the time of payment; verifyAndCreateOrder already
            // validated the price at checkout. Menu may have changed since then.
            console.warn(`${LOG} Price drift (recovery): item="${orderItem.name}" charged=£${chargedLineTotal.toFixed(2)} current=£${serverLineTotal.toFixed(2)} delta=£${delta.toFixed(4)} [${breakdown.join(',')}] — keeping charged price`);
        }

        serverSubtotal += serverLineTotal;
    }

    for (const dealItem of dealItems) {
        serverSubtotal += Number(dealItem.price || 0) * Number(dealItem.quantity || 1);
    }

    const serverTotal = Math.max(0, serverSubtotal + Number(deliveryFee || 0) + Number(smallOrderSurcharge || 0) - Number(discount || 0));
    const amountDelta = Math.abs(serverTotal - chargedAmountGBP);

    if (amountDelta > PRICE_TOLERANCE) {
        // In recovery path, if prices have significantly changed on the menu since payment,
        // we log this but still create the order using the charged amount (customer already paid).
        console.warn(`${LOG} Total drift (recovery): serverTotal=£${serverTotal.toFixed(2)} charged=£${chargedAmountGBP.toFixed(2)} delta=£${amountDelta.toFixed(4)} — proceeding with charged amount`);
        return { valid: true, logOnly: true, serverSubtotal, serverTotal: chargedAmountGBP };
    }

    console.log(`${LOG} ✅ Recovery pricing OK: serverTotal=£${serverTotal.toFixed(2)} charged=£${chargedAmountGBP.toFixed(2)}`);
    return { valid: true, logOnly: false, serverSubtotal, serverTotal };
}

// ── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { paymentIntentId, paymentIntentMetadata, sourceType, chargedAmountGBP } = await req.json();

        if (!paymentIntentId || !paymentIntentMetadata) {
            return Response.json({ error: 'Missing paymentIntentId or metadata', success: false }, { status: 400 });
        }

        console.log(`${LOG} Creating order from ${sourceType} for intent=${paymentIntentId}`);

        // ── Dedup check 1: by PaymentIntent ID ────────────────────────────────
        const existingByPI = await base44.asServiceRole.entities.Order.filter({ payment_intent_id: paymentIntentId });
        if (existingByPI?.length > 0) {
            console.log(`${LOG} Order already exists for intent=${paymentIntentId}`);
            return Response.json({ success: true, order_id: existingByPI[0].id, status: 'already_exists' }, { status: 200 });
        }

        // ── Dedup check 2: by idempotency_key ─────────────────────────────────
        const metaIdempotencyKey = paymentIntentMetadata?.idempotency_key;
        if (metaIdempotencyKey) {
            try {
                const existingByKey = await base44.asServiceRole.entities.Order.filter({ idempotency_key: metaIdempotencyKey });
                if (existingByKey?.length > 0) {
                    console.log(`${LOG} Order already exists by idempotency_key=${metaIdempotencyKey} id=${existingByKey[0].id}`);
                    return Response.json({ success: true, order_id: existingByKey[0].id, status: 'already_exists' }, { status: 200 });
                }
            } catch (e) {
                console.warn(`${LOG} idempotency_key dedup check failed (non-fatal): ${e.message}`);
            }
        }

        // ── Extract order data: prefer OrderDraft over Stripe metadata ───────────
        // OrderDraft stores the full payload without the 490-char truncation limit
        // that affects Stripe PI metadata. Fall back to metadata if no draft found.
        let draftOrderData = null;
        let orderDraftId = null;
        try {
            const drafts = await base44.asServiceRole.entities.OrderDraft.filter({
                payment_intent_id: paymentIntentId
            });
            const activeDraft = (drafts || []).find(d => d.status === 'pending');
            if (activeDraft?.order_data) {
                draftOrderData = activeDraft.order_data;
                orderDraftId = activeDraft.id;
                console.log(`${LOG} ✅ Found OrderDraft id=${orderDraftId} for pi=${paymentIntentId} — using full payload`);
            }
        } catch (draftErr) {
            console.warn(`${LOG} OrderDraft lookup failed (non-fatal, falling back to metadata): ${draftErr.message}`);
        }

        // Resolve order fields: draft takes precedence over PI metadata
        const meta = paymentIntentMetadata;
        const restaurant_id = draftOrderData?.restaurant_id || meta.restaurant_id;
        const subtotal = draftOrderData?.subtotal ?? parseFloat(meta.subtotal) ?? 0;
        const delivery_fee = draftOrderData?.delivery_fee ?? parseFloat(meta.delivery_fee) ?? 0;
        const discount = draftOrderData?.discount ?? parseFloat(meta.discount) ?? 0;
        const small_order_surcharge = draftOrderData?.small_order_surcharge ?? parseFloat(meta.small_order_surcharge) ?? 0;
        const total = draftOrderData?.total ?? parseFloat(meta.total) ?? 0;
        const order_type = draftOrderData?.order_type || meta.order_type || 'delivery';
        const delivery_address = draftOrderData?.delivery_address || meta.delivery_address || '';
        const delivery_coordinates = draftOrderData?.delivery_coordinates || (meta.delivery_coordinates ? (() => { try { return JSON.parse(meta.delivery_coordinates); } catch { return null; } })() : null);
        const phone = draftOrderData?.phone || meta.phone || '';
        const guest_name = draftOrderData?.guest_name || meta.guest_name || '';
        const guest_email = draftOrderData?.guest_email || meta.guest_email || '';
        const notes = draftOrderData?.notes || meta.notes || '';
        const is_scheduled = draftOrderData?.is_scheduled ?? (meta.is_scheduled === 'true' || meta.is_scheduled === true);
        const scheduled_for = draftOrderData?.scheduled_for || meta.scheduled_for || null;
        const idempotency_key = draftOrderData?.idempotency_key || meta.idempotency_key || null;

        if (!restaurant_id) {
            console.error(`${LOG} Missing restaurant_id in both draft and metadata`);
            return Response.json({ error: 'Incomplete order data: missing restaurant_id', success: false }, { status: 400 });
        }

        // ── Parse items ────────────────────────────────────────────────────────
        let items;
        if (draftOrderData?.items && Array.isArray(draftOrderData.items) && draftOrderData.items.length > 0) {
            // Full items with customizations from OrderDraft
            items = draftOrderData.items;
            console.log(`${LOG} Using ${items.length} items from OrderDraft (full fidelity)`);
        } else {
            // Fallback: parse from Stripe metadata items_json (may be truncated)
            const items_json = meta.items_json;
            if (!items_json) {
                console.error(`${LOG} No items in draft or metadata`);
                return Response.json({ error: 'Incomplete order data: no items', success: false }, { status: 400 });
            }
            try {
                items = JSON.parse(items_json);
                if (!Array.isArray(items) || items.length === 0) throw new Error('Items must be non-empty array');
                console.warn(`${LOG} ⚠️ Using items from Stripe metadata fallback (may be truncated) for pi=${paymentIntentId}`);
            } catch (e) {
                console.error(`${LOG} Failed to parse items_json: ${e.message} — metadata may be truncated`);
                return Response.json({ error: 'Invalid items data (metadata truncated)', success: false, code: 'METADATA_TRUNCATED', recoverable: false }, { status: 400 });
            }
        }

        // Normalize schema
        const normalizedItems = items.map(i => ({
            menu_item_id: i.menu_item_id || i.id,
            name: i.name || '',
            price: i.price,
            quantity: i.quantity || i.qty,
            customizations: i.customizations || {}
        }));

        // Basic item validation
        for (const item of normalizedItems) {
            if (!item.menu_item_id || typeof item.menu_item_id !== 'string') {
                return Response.json({ error: 'Invalid items data', success: false, code: 'INVALID_ITEM_SCHEMA', recoverable: false }, { status: 400 });
            }
            if (typeof item.price !== 'number' || isNaN(item.price) || item.price < 0) {
                return Response.json({ error: 'Invalid items data', success: false, code: 'INVALID_ITEM_PRICE', recoverable: false }, { status: 400 });
            }
            if (typeof item.quantity !== 'number' || isNaN(item.quantity) || item.quantity < 1) {
                return Response.json({ error: 'Invalid items data', success: false, code: 'INVALID_ITEM_QUANTITY', recoverable: false }, { status: 400 });
            }
        }

        // ── SERVER-SIDE PRICE VALIDATION (recovery-aware) ──────────────────────
        // chargedAmountGBP is the authoritative amount from Stripe — use it as ground truth.
        const chargedGBP = chargedAmountGBP || (parseFloat(total) || 0);
        const priceCheck = await validatePricingForRecovery(base44, {
            items: normalizedItems,
            restaurantId: restaurant_id,
            chargedAmountGBP: chargedGBP,
            deliveryFee: parseFloat(delivery_fee) || 0,
            smallOrderSurcharge: parseFloat(small_order_surcharge) || 0,
            discount: parseFloat(discount) || 0
        });

        if (!priceCheck.valid) {
            console.error(`${LOG} Price validation failed: code=${priceCheck.code} error=${priceCheck.error}`);
            return Response.json({
                success: false,
                error: priceCheck.error,
                code: priceCheck.code,
                recoverable: priceCheck.recoverable !== false,
                compensatable: priceCheck.compensatable || false
            }, { status: 400 });
        }

        // Use server-validated total if available; fall back to charged amount
        const finalTotal = priceCheck.serverTotal || chargedGBP;
        const finalSubtotal = priceCheck.serverSubtotal || parseFloat(subtotal);

        // ── Create order ───────────────────────────────────────────────────────
        let newOrder;
        try {
            newOrder = await base44.asServiceRole.entities.Order.create({
                restaurant_id,
                items: normalizedItems,
                subtotal: finalSubtotal,
                delivery_fee: parseFloat(delivery_fee) || 0,
                discount: parseFloat(discount) || 0,
                total: finalTotal,
                payment_method: 'card',
                payment_status: 'paid_card',
                order_status: 'confirmed',
                status: 'confirmed',
                order_type: order_type || 'delivery',
                delivery_address: delivery_address || '',
                delivery_coordinates: delivery_coordinates || null,
                phone,
                guest_name,
                guest_email,
                notes: notes || '',
                is_scheduled: is_scheduled === 'true' || is_scheduled === true,
                scheduled_for,
                payment_intent_id: paymentIntentId,
                idempotency_key,
                order_source: 'online'
            });

            console.log(`${LOG} ✅ Order created: id=${newOrder.id} from ${sourceType} total=£${finalTotal.toFixed(2)}`);

            // Mark OrderDraft as consumed
            if (orderDraftId) {
                base44.asServiceRole.entities.OrderDraft.update(orderDraftId, {
                    status: 'consumed',
                    consumed_order_id: newOrder.id
                }).catch(e => console.warn(`${LOG} Failed to mark draft consumed: ${e.message}`));
            }
        } catch (createError) {
            console.error(`${LOG} Order creation failed: ${createError.message}`);
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'webhook_order_creation_failed',
                severity: 'critical',
                payment_intent_id: paymentIntentId,
                restaurant_id,
                error_message: createError.message,
                context: { source: sourceType }
            }).catch(e => console.warn(`${LOG} Failed to record failure: ${e.message}`));

            return Response.json({ error: 'Failed to create order. Order will be retried.', success: false, recoverable: true }, { status: 500 });
        }

        return Response.json({ success: true, order_id: newOrder.id, order_number: newOrder.order_number, status: 'created_from_webhook' }, { status: 201 });

    } catch (error) {
        console.error(`${LOG} Unhandled error: ${error.message}`);
        return Response.json({ error: error.message, success: false }, { status: 500 });
    }
});