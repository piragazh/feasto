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
        // ROOT CAUSE FIX: an EMPTY group name is a real name, not a missing one.
        // `if (!customName) continue` treated "" as absent, so every option group
        // with a blank name was skipped - which in this data is the meal upgrade
        // on many burgers, wings and wraps. A burger meal was priced £2.50 short
        // and rejected as a mismatch. Only a genuinely absent name is skipped.
        const customName = clientCustom.name ?? clientCustom.key;
        if (customName === undefined || customName === null) continue;

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

            // ROOT CAUSE FIX: meal extras live on the option GROUP
            // (dbGroup.meal_customizations), not on the selected upgrade option.
            // Reading them from the option found nothing, so any priced meal extra
            // (e.g. Peri Peri Chips +£0.20) was left out: the customer saw £7.19,
            // this computed £6.99, and the order was rejected as a price mismatch.
            // That false rejection is why price validation was switched off.
            // The option-level location is kept as a fallback for older data.
            const mealGroups = (Array.isArray(dbGroup.meal_customizations) && dbGroup.meal_customizations.length)
                ? dbGroup.meal_customizations
                : (Array.isArray(dbUpgradeOption?.meal_customizations) ? dbUpgradeOption.meal_customizations : []);
            if (mealGroups.length) {
                for (const mealGroup of mealGroups) {
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

// ── Coupon & promotion rules: MIRROR of src/lib/order-logic.js ──────────────
// Copied programmatically, not retyped, so the server applies EXACTLY the rules
// the tests cover. scripts/check-checkout-parity.mjs executes both side by side.
// The file's SYNC RULE always claimed this function mirrored these - but until
// now it contained none of them, and simply trusted the browser's discount.
const MAX_COUPONS_PER_ORDER = 3;
const MAX_COUPON_DISCOUNT_RATIO = 0.50; // 50% of subtotal cap

function validateCoupon(coupon, serverSubtotal, restaurantId, now = new Date()) {
    // A: Active status
    if (!coupon.is_active) {
        return { valid: false, reason: 'inactive', discount: 0 };
    }

    // B: Date range
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
        return { valid: false, reason: 'not_yet_valid', discount: 0 };
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
        return { valid: false, reason: 'expired', discount: 0 };
    }
    // Precise expires_at timestamp (reward coupons)
    if (coupon.expires_at && new Date(coupon.expires_at) < now) {
        return { valid: false, reason: 'expired', discount: 0 };
    }

    // Global usage limit
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
        return { valid: false, reason: 'usage_limit_reached', discount: 0 };
    }

    // D: Minimum spend
    if (coupon.minimum_order && serverSubtotal < coupon.minimum_order) {
        return { valid: false, reason: 'below_minimum_order', discount: 0 };
    }

    // C: Restaurant scope
    if (coupon.restaurant_id && coupon.restaurant_id !== restaurantId) {
        return { valid: false, reason: 'wrong_restaurant', discount: 0 };
    }

    let d = 0;
    if (coupon.discount_type === 'percentage') {
        d = (serverSubtotal * coupon.discount_value) / 100;
        if (coupon.max_discount) d = Math.min(d, coupon.max_discount);
    } else if (coupon.discount_type === 'free_delivery') {
        // free_delivery: caller should pass deliveryFee as serverSubtotal context; we return the raw value here
        d = coupon.discount_value || 0;
    } else {
        d = coupon.discount_value || 0;
    }
    // Discount can never exceed the subtotal
    d = Math.min(d, serverSubtotal);

    return { valid: true, reason: null, discount: d };
}

async function resolveCouponDiscount(couponCodesInput, serverSubtotal, restaurantId, getCoupon, now = new Date()) {
    if (!couponCodesInput || (Array.isArray(couponCodesInput) && couponCodesInput.length === 0)) {
        return { error: null, discount: 0, skipped: true };
    }

    // Normalise to array of upper-cased trimmed codes
    let codes;
    if (Array.isArray(couponCodesInput)) {
        codes = couponCodesInput.map(c => String(c).trim().toUpperCase()).filter(Boolean);
    } else {
        codes = String(couponCodesInput).split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
    }

    if (codes.length === 0) {
        return { error: null, discount: 0, skipped: true };
    }

    // A) Max 3 coupons
    if (codes.length > MAX_COUPONS_PER_ORDER) {
        return { error: 'MAX_EXCEEDED', discount: 0 };
    }

    // B) No duplicates
    if (new Set(codes).size !== codes.length) {
        return { error: 'DUPLICATE', discount: 0 };
    }

    // C) Fetch and validate each coupon
    const validatedCoupons = [];
    for (const code of codes) {
        const coupon = await getCoupon(code);
        if (!coupon) return { error: 'NOT_FOUND', discount: 0 };

        const result = validateCoupon(coupon, serverSubtotal, restaurantId, now);
        if (!result.valid) return { error: result.reason.toUpperCase(), discount: 0 };

        validatedCoupons.push({ coupon, rawDiscount: result.discount });
    }

    // D) Stacking check: if > 1 coupon, all must have stackable=true
    if (validatedCoupons.length > 1) {
        const nonStackable = validatedCoupons.filter(vc => !vc.coupon.stackable);
        if (nonStackable.length > 0) return { error: 'STACKING', discount: 0 };
    }

    // E) Deterministic application order: percentage first (sorted by code asc), then fixed/other
    const percentageCoupons = validatedCoupons
        .filter(vc => vc.coupon.discount_type === 'percentage')
        .sort((a, b) => a.coupon.code.localeCompare(b.coupon.code));
    const otherCoupons = validatedCoupons
        .filter(vc => vc.coupon.discount_type !== 'percentage')
        .sort((a, b) => a.coupon.code.localeCompare(b.coupon.code));
    const orderedCoupons = [...percentageCoupons, ...otherCoupons];

    // Apply cap: total coupon discount cannot exceed MAX_COUPON_DISCOUNT_RATIO of subtotal
    const maxDiscount = serverSubtotal * MAX_COUPON_DISCOUNT_RATIO;
    let accumulated = 0;
    const appliedCodes = [];

    for (const vc of orderedCoupons) {
        const remaining = maxDiscount - accumulated;
        accumulated += Math.min(vc.rawDiscount, remaining);
        appliedCodes.push(vc.coupon.code);
    }

    // Round to whole pence. Unrounded, a 50% cap on a £2.49 order is £1.245, and
    // the order total became £4.235 - not a real amount of money, and not
    // something Stripe can charge. The CAP is rounded DOWN so the discount can
    // never exceed the 50% limit; the discount itself is rounded to the nearest
    // penny within that. (1e-9 absorbs float noise such as 124.50000000000001.)
    const capPence = Math.floor(maxDiscount * 100 + 1e-9);
    const discountPence = Math.min(Math.round(accumulated * 100), capPence);
    return { error: null, discount: discountPence / 100, appliedCodes };
}

function capPromotionDiscount(clientDiscount, serverSubtotal) {
    // Same whole-pence rule as coupons: the 50% cap is rounded DOWN so it can
    // never be exceeded, and the result is always a chargeable amount.
    const capPence = Math.floor(serverSubtotal * 0.5 * 100 + 1e-9);
    const wantPence = Math.round(Math.max(0, Number(clientDiscount) || 0) * 100);
    return Math.min(wantPence, capPence) / 100;
}

/**
 * Does this order reference at least one REAL, active, in-date promotion for
 * this restaurant? The checkout sends each promotion's code, or its name when it
 * has no code, so both are matched.
 */
/**
 * The coupon amount the LIVE checkout gives - mirrors DiscountCodeInput.jsx.
 *
 * Checked against the checkout's own rules, not order-logic's 50% cap. That cap
 * was documented in the test library but was never live: the server trusted the
 * browser, so customers have always received the checkout's rule - each coupon
 * capped at the SUBTOTAL. Enforcing 50% now would refuse genuine customers (a
 * "£5 off" coupon on an £8 order) on a live site, which is a policy change
 * nobody has decided. See the note to the owner about the 50% question.
 *
 * Fraud is stopped by resolveCouponDiscount's ELIGIBILITY checks (the coupon
 * must exist, be active, in date, for this restaurant, over its minimum spend,
 * within usage and stacking rules) - not by the cap.
 */
function liveCouponDiscount(coupon, base) {
    let d = 0;
    if (coupon.discount_type === 'percentage') {
        d = (base * Number(coupon.discount_value || 0)) / 100;
        if (coupon.max_discount && d > coupon.max_discount) d = coupon.max_discount;
    } else if (coupon.discount_type === 'free_delivery') {
        // The checkout shows 0 here. The older CouponInput used
        // free_delivery_amount, so allow the larger - a ceiling above what the
        // browser claims is harmless; one below it refuses a real customer.
        d = Number(coupon.free_delivery_amount || coupon.discount_value || 0);
    } else {
        d = Number(coupon.discount_value || 0);          // fixed, free_item, other
    }
    return Math.min(Math.max(0, d), base);
}

async function hasActivePromotion(base44, restaurantId, promotionCodes) {
    const wanted = (Array.isArray(promotionCodes) ? promotionCodes : [])
        .map(c => String(c || '').trim().toLowerCase()).filter(Boolean);
    if (wanted.length === 0) return false;
    const promos = await base44.asServiceRole.entities.Promotion.filter({ restaurant_id: restaurantId, is_active: true });
    const now = new Date();
    return (promos || []).some(p => {
        const ids = [p.promotion_code, p.name].map(v => String(v || '').trim().toLowerCase()).filter(Boolean);
        if (!ids.some(id => wanted.includes(id))) return false;
        if (p.start_date && new Date(p.start_date) > now) return false;
        if (p.end_date && new Date(p.end_date) < now) return false;
        if (p.usage_limit && Number(p.usage_count || 0) >= Number(p.usage_limit)) return false;
        return true;
    });
}

async function validateOrderPricing(base44, { items, restaurantId, clientSubtotal, clientTotal, deliveryFee, smallOrderSurcharge, discount, isPOS, couponCodes = [], promotionCodes = [] }) {
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

        // FLOOR, not equality. Only a price BELOW the menu is refused. The old
        // check rejected any difference in either direction, so every place the
        // site and this function disagreed turned a paying customer away - which
        // is why validation was switched off. Extras only ever ADD cost, so a
        // genuine order is never below the menu price and can't be refused here.
        if (clientLineTotal < serverLineTotal - PRICE_TOLERANCE * quantity) {
            console.error(`${LOG} PRICE_MISMATCH item="${orderItem.name}" client=£${clientLineTotal.toFixed(2)} server=£${serverLineTotal.toFixed(2)} delta=£${delta.toFixed(4)} [${breakdown.join(',')}]`);
            return { valid: false, error: `Price mismatch detected for "${orderItem.name}". Please refresh and try again.`, code: 'PRICE_MISMATCH', itemResults };
        }
        serverSubtotal += serverLineTotal;
    }

    for (const dealItem of dealItems) {
        // Category deals are added to the cart as `deal_<id>_<Date.now()>` (see
        // Restaurant.jsx addCategoryDealToCart) so two of the same deal with
        // different picks stay separate lines. Stripping only `deal_` left the
        // timestamp on, the lookup missed, and every category deal was refused as
        // DEAL_NOT_FOUND. Base44 ids are hex with no underscores, so a trailing
        // `_<digits>` is always the timestamp.
        const dealId = String(dealItem.menu_item_id || dealItem.id || '')
            .replace(/^deal_/, '')
            .replace(/_\d{10,}$/, '');
        const dbDeal = dealMap.get(dealId);
        if (!dbDeal) return { valid: false, error: `Meal deal no longer available`, code: 'DEAL_NOT_FOUND', compensatable: true };
        if (dbDeal.is_active === false) return { valid: false, error: `Meal deal is no longer active`, code: 'DEAL_INACTIVE', compensatable: true };

        const quantity = Number(dealItem.quantity || 1);
        const clientDealPrice = Number(dealItem.price || 0);
        const serverDealPrice = Number(dbDeal.deal_price || 0);
        const clientLineTotal = clientDealPrice * quantity;
        const serverLineTotal = serverDealPrice * quantity;
        const delta = Math.abs(serverLineTotal - clientLineTotal);

        if (clientLineTotal < serverLineTotal - PRICE_TOLERANCE * quantity) {
            console.error(`${LOG} DEAL_PRICE_MISMATCH deal="${dbDeal.name}" client=£${clientLineTotal.toFixed(2)} server=£${serverLineTotal.toFixed(2)} delta=£${delta.toFixed(4)}`);
            return { valid: false, error: `Price mismatch for meal deal "${dbDeal.name}". Please refresh and try again.`, code: 'DEAL_PRICE_MISMATCH', itemResults };
        }
        serverSubtotal += serverLineTotal;
    }

    const subtotalDelta = Math.abs(serverSubtotal - Number(clientSubtotal));
    if (Number(clientSubtotal) < serverSubtotal - PRICE_TOLERANCE) {
        console.error(`${LOG} SUBTOTAL_MISMATCH client=£${clientSubtotal} server=£${serverSubtotal.toFixed(2)} delta=£${subtotalDelta.toFixed(4)}`);
        return { valid: false, serverSubtotal, error: 'Order subtotal mismatch. Please refresh and try again.', code: 'SUBTOTAL_MISMATCH', itemResults };
    }

    // ── Discount ───────────────────────────────────────────────────────────
    // Previously the browser's discount was used as-is, even inside this
    // validator: a customer could send any discount, compute a total with it,
    // and the check passed. Now a discount must be JUSTIFIED:
    //   - coupons are resolved here with the tested rules (order-logic.js);
    //     the browser's coupon amount is ignored
    //   - anything beyond that must be backed by a real, active promotion for
    //     this restaurant, and is capped by the tested promotion rule
    //   - the combined discount can never exceed 50% of the order
    // KNOWN LIMIT: promotion AMOUNTS (tiered, combo, BOGO...) are not
    // recomputed here - that needs the full promotion engine. What is enforced
    // is that a real promotion exists and the 50% ceiling.
    const clientDiscount = Math.max(0, Number(discount) || 0);
    const getCoupon = async (code) => {
        const rows = await base44.asServiceRole.entities.Coupon.filter({ code });
        return rows?.[0] || null;
    };
    const couponResult = await resolveCouponDiscount(couponCodes, serverSubtotal, restaurantId, getCoupon);
    if (couponResult.error) {
        console.error(`${LOG} COUPON_INVALID ${couponResult.error} codes=${JSON.stringify(couponCodes)}`);
        return { valid: false, error: 'That coupon can no longer be applied. Please remove it and try again.', code: `COUPON_${couponResult.error}` };
    }
    // resolveCouponDiscount above has decided ELIGIBILITY. The AMOUNT allowed
    // follows the live checkout's rules, on the higher of the two subtotals:
    // where this server under-counts (see the Ringer Burger note) the customer's
    // subtotal is the true one, and a percentage coupon on it is worth more. A
    // higher base is safe - the customer is paying correspondingly more.
    const couponBase = Math.max(serverSubtotal, Number(clientSubtotal) || 0);
    let couponDiscount = 0;
    for (const code of (couponResult.appliedCodes || [])) {
        const c = await getCoupon(code);
        if (c) couponDiscount += liveCouponDiscount(c, couponBase);
    }
    couponDiscount = Math.min(couponDiscount, couponBase);
    const promoClaim = Math.max(0, clientDiscount - couponDiscount);

    let promoAllowed = 0;
    if (promoClaim > PRICE_TOLERANCE) {
        const hasPromo = await hasActivePromotion(base44, restaurantId, promotionCodes);
        if (!hasPromo) {
            console.error(`${LOG} DISCOUNT_UNSUPPORTED claimed=£${clientDiscount} coupons=£${couponDiscount} promotions=${JSON.stringify(promotionCodes)}`);
            return { valid: false, error: 'That discount could not be verified. Please refresh and try again.', code: 'DISCOUNT_UNSUPPORTED' };
        }
        promoAllowed = capPromotionDiscount(promoClaim, serverSubtotal);
    }
    // A discount can't exceed the order itself. (Promotions alone stay capped at
    // 50% by capPromotionDiscount - their amounts aren't recomputed here, and
    // genuine promotions essentially never exceed half an order.)
    const combinedCap = Math.floor(couponBase * 100 + 1e-9) / 100;
    const allowedDiscount = Math.min(couponDiscount + promoAllowed, combinedCap);
    if (clientDiscount > allowedDiscount + PRICE_TOLERANCE) {
        console.error(`${LOG} DISCOUNT_TOO_LARGE claimed=£${clientDiscount} allowed=£${allowedDiscount}`);
        return { valid: false, error: 'That discount is larger than allowed. Please refresh and try again.', code: 'DISCOUNT_TOO_LARGE' };
    }

    // Total: FLOOR against the server-priced subtotal and the VERIFIED discount.
    const serverTotal = Math.max(0, serverSubtotal + Number(deliveryFee) + Number(smallOrderSurcharge) - Math.min(clientDiscount, allowedDiscount));
    const totalDelta = Math.abs(serverTotal - Number(clientTotal));
    if (Number(clientTotal) < serverTotal - PRICE_TOLERANCE) {
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

        // ── SERVER-SIDE PRICE VALIDATION ──────────────────────────────────────
        //
        // This was SKIPPED, with the justification that "kiosk orders are placed on
        // fixed locked devices" and "POS orders are verified at terminal". Neither
        // is true of this function: kiosk orders use kioskCreateOrder and POS
        // orders use posCreateOrder. This function serves only the PUBLIC online
        // checkout (useCreateOrder), so trusting the browser meant any customer
        // could set their own price.
        //
        // It was switched off because the validator rejected genuine orders. The
        // root causes are fixed in calcItemServerPrice (meal extras read from the
        // wrong place; blank-named option groups skipped), and the validator now
        // uses a FLOOR - only a price below the menu is refused - so a remaining
        // difference can never turn a paying customer away.
        //
        // The order is still charged and recorded at the customer's own total:
        // validation proves that total is at or above the menu price; it does not
        // replace it. Replacing it would make the Stripe check below reject a
        // genuine customer wherever this server's pricing under-counts.
        const pricing = await validateOrderPricing(base44, {
            items: normalizedItems,
            restaurantId: orderData.restaurant_id,
            clientSubtotal, clientTotal, deliveryFee, smallOrderSurcharge, discount, isPOS,
            couponCodes: Array.isArray(orderData.coupon_codes) ? orderData.coupon_codes : [],
            promotionCodes: Array.isArray(orderData.promotion_codes) ? orderData.promotion_codes : [],
        });

        if (!pricing.valid) {
            // A card customer has ALREADY been charged by the time we get here, and
            // the PaymentTransaction that reconcileOrphanedPayments scans for is
            // created LATER in this function. Refusing without refunding would keep
            // their money with no order and nothing to trigger a refund - so the
            // refund is issued here, immediately.
            let refunded = false;
            if (orderData.payment_method === 'card' && paymentIntentId) {
                try {
                    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
                    await stripe.refunds.create({ payment_intent: paymentIntentId });
                    refunded = true;
                    console.log(`${LOG} Refunded rejected order pi=${paymentIntentId} code=${pricing.code}`);
                } catch (refundErr) {
                    // Loud: a charge with no order and a failed refund needs a person.
                    console.error(`${LOG} REFUND_FAILED after pricing rejection pi=${paymentIntentId} code=${pricing.code}: ${refundErr?.message}`);
                }
            }
            return Response.json({
                error: pricing.error,
                success: false,
                code: pricing.code,
                refunded,
            }, { status: 409 });
        }

        const serverSubtotal = clientSubtotal;
        const serverTotal = clientTotal;

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

            // Verify Stripe charged amount matches client-supplied total (no price tolerance since we trust the client)
             const chargedAmountPence = stripeChargedAmountPence ?? paymentIntent.amount;
             const chargedGBP = chargedAmountPence / 100;
             const amountDelta = Math.abs(chargedGBP - serverTotal);
             if (amountDelta > 0.01) { // Allow 1p rounding
                 console.error(`${LOG} STRIPE_AMOUNT_MISMATCH charged=£${chargedGBP.toFixed(2)} clientTotal=£${serverTotal.toFixed(2)} delta=£${amountDelta.toFixed(4)} pi=${paymentIntentId}`);
                 // The card HAS been charged, and no order will be created. This
                 // used to return refunded:false and stop - but the
                 // PaymentTransaction that reconcileOrphanedPayments scans for is
                 // only written later in this function, so nothing would ever
                 // refund it. Refund here, the same way a pricing refusal does.
                 let refunded = false;
                 try {
                     await stripe.refunds.create({ payment_intent: paymentIntentId });
                     refunded = true;
                     console.log(`${LOG} Refunded amount-mismatch payment pi=${paymentIntentId}`);
                 } catch (refundErr) {
                     console.error(`${LOG} REFUND_FAILED after amount mismatch pi=${paymentIntentId}: ${refundErr?.message}`);
                 }
                 return Response.json({
                     error: refunded
                         ? 'Payment amount did not match the order, so it has been refunded. Please try again.'
                         : 'Payment amount does not match order total. Please contact support.',
                     success: false,
                     code: 'STRIPE_AMOUNT_MISMATCH',
                     refunded,
                 }, { status: 422 });
             }

             console.log(`${LOG} ✅ Stripe verified: pi=${paymentIntentId} charged=£${chargedGBP.toFixed(2)} total=£${serverTotal.toFixed(2)}`);
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