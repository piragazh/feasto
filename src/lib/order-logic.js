/**
 * src/lib/order-logic.js
 * =======================
 * TESTED source of truth for order/pricing/discount/throttle business logic.
 *
 * The pure functions here are mirrored verbatim in the Deno handlers.
 * Vitest tests in src/lib/__tests__/ cover this file — those tests ARE
 * the production logic tests.
 *
 * SYNC RULE: Any change to a function here MUST be applied to its
 * corresponding inline copy in the Deno handler, and vice versa:
 *   - functions/verifyAndCreateOrder  → recomputeSubtotal, computeAndVerifyTotal,
 *                                        validateCoupon, capPromotionDiscount
 *   - functions/orderVelocityThrottle → basketFingerprint, checkPerUserBurst,
 *                                        checkPlatformBurst
 *   - functions/enforceRateLimiting   → checkPerUserBurst
 *
 * Architecture note: Deno functions cannot import from src/lib/ (separate
 * deployment targets). The mirror pattern is intentional — the test suite
 * provides the safety net that keeps them in sync.
 */

// ─────────────────────────────────────────────────────────────────────────────
// ORDER TOTAL INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recompute the server-authoritative subtotal from menu items.
 * Cart item prices are OVERWRITTEN with the canonical menu price.
 * Returns { serverSubtotal, mutatedItems } where mutatedItems is a new array
 * with prices corrected.
 *
 * @param {Array}  cartItems   - items from orderData.items (each must have menu_item_id, quantity)
 * @param {Map}    menuItemsMap - Map<id, MenuItem> fetched from DB
 * @returns {{ serverSubtotal: number, mutatedItems: Array, unavailableItem: string|null }}
 */
export function recomputeSubtotal(cartItems, menuItemsMap) {
    const mutatedItems = [];

    for (const cartItem of cartItems) {
        const menuItem = menuItemsMap.get(cartItem.menu_item_id);
        if (!menuItem) {
            return { serverSubtotal: 0, mutatedItems: [], unavailableItem: cartItem.name || cartItem.menu_item_id };
        }
        if (menuItem.is_available === false) {
            return { serverSubtotal: 0, mutatedItems: [], unavailableItem: cartItem.name || cartItem.menu_item_id };
        }
        // Server price wins — client-supplied price is ignored
        mutatedItems.push({ ...cartItem, price: menuItem.price });
    }

    const serverSubtotal = mutatedItems.reduce(
        (sum, item) => sum + (item.price * (item.quantity || 1)),
        0
    );

    return { serverSubtotal, mutatedItems, unavailableItem: null };
}

/**
 * Compute the final server total and verify it is within tolerance of the
 * client-submitted total.
 *
 * @param {{ serverSubtotal: number, deliveryFee: number, discount: number }} params
 * @param {number} clientTotal - the total submitted by the client
 * @param {number} tolerance   - allowed absolute difference (default £0.50)
 * @returns {{ serverTotal: number, mismatch: boolean }}
 */
export function computeAndVerifyTotal({ serverSubtotal, deliveryFee, discount }, clientTotal, tolerance = 0.50) {
    const serverTotal = Math.max(0, serverSubtotal + deliveryFee - discount);
    const mismatch = Math.abs(serverTotal - clientTotal) > tolerance;
    return { serverTotal, mismatch };
}

// ─────────────────────────────────────────────────────────────────────────────
// COUPON VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a single coupon record against the current order context.
 * Returns { valid: boolean, reason: string|null, discount: number }
 *
 * @param {object} coupon        - coupon record from DB
 * @param {number} serverSubtotal
 * @param {string} restaurantId
 * @param {Date}   [now]
 */
export function validateCoupon(coupon, serverSubtotal, restaurantId, now = new Date()) {
    if (!coupon.is_active) {
        return { valid: false, reason: 'inactive', discount: 0 };
    }

    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
        return { valid: false, reason: 'not_yet_valid', discount: 0 };
    }

    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
        return { valid: false, reason: 'expired', discount: 0 };
    }

    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
        return { valid: false, reason: 'usage_limit_reached', discount: 0 };
    }

    if (coupon.minimum_order && serverSubtotal < coupon.minimum_order) {
        return { valid: false, reason: 'below_minimum_order', discount: 0 };
    }

    if (coupon.restaurant_id && coupon.restaurant_id !== restaurantId) {
        return { valid: false, reason: 'wrong_restaurant', discount: 0 };
    }

    let d = 0;
    if (coupon.discount_type === 'percentage') {
        d = (serverSubtotal * coupon.discount_value) / 100;
        if (coupon.max_discount) d = Math.min(d, coupon.max_discount);
    } else {
        d = coupon.discount_value || 0;
    }
    // Discount can never exceed the subtotal
    d = Math.min(d, serverSubtotal);

    return { valid: true, reason: null, discount: d };
}

/**
 * Apply the coupon policy to a coupon_codes string.
 * Policy: exactly 0 or 1 codes are allowed.
 *
 * @param {string|undefined} couponCodesString - comma-separated codes from orderData
 * @param {number}           serverSubtotal
 * @param {string}           restaurantId
 * @param {Function}         getCoupon   - async (code) => coupon|null (injected for testability)
 * @param {Date}             [now]
 * @returns {Promise<{ error: string|null, discount: number }>}
 */
export async function resolveCouponDiscount(couponCodesString, serverSubtotal, restaurantId, getCoupon, now = new Date()) {
    if (!couponCodesString) {
        return { error: null, discount: 0, skipped: true };
    }

    const codes = couponCodesString.split(',').map(c => c.trim()).filter(Boolean);

    if (codes.length > 1) {
        return { error: 'STACKING', discount: 0 };
    }

    if (codes.length === 0) {
        return { error: null, discount: 0, skipped: true };
    }

    const coupon = await getCoupon(codes[0]);
    if (!coupon) {
        return { error: 'NOT_FOUND', discount: 0 };
    }

    const result = validateCoupon(coupon, serverSubtotal, restaurantId, now);
    if (!result.valid) {
        return { error: result.reason.toUpperCase(), discount: 0 };
    }

    return { error: null, discount: result.discount };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMOTION DISCOUNT (server-side sanity cap only — restaurant-controlled)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cap the client-supplied promotion discount to a safe maximum.
 * Used when no coupon code is present and discount is purely promotion-driven.
 *
 * @param {number} clientDiscount
 * @param {number} serverSubtotal
 * @returns {number} safeDiscount
 */
export function capPromotionDiscount(clientDiscount, serverSubtotal) {
    return Math.min(Math.max(0, clientDiscount), serverSubtotal * 0.5);
}

// ─────────────────────────────────────────────────────────────────────────────
// BASKET FINGERPRINTING (mirrors orderVelocityThrottle)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stable fingerprint of a basket: restaurant + sorted item IDs + quantities.
 * Mirrors the implementation in functions/orderVelocityThrottle exactly.
 *
 * @param {{ restaurant_id: string, items: Array }} orderData
 * @returns {string|null}
 */
export function basketFingerprint(orderData) {
    if (!orderData?.items?.length) return null;
    const sorted = [...orderData.items]
        .sort((a, b) => (a.menu_item_id || '').localeCompare(b.menu_item_id || ''))
        .map(i => `${i.menu_item_id}:${i.quantity || 1}`)
        .join('|');
    return `${orderData.restaurant_id}::${sorted}`;
}

/**
 * Check if a user has hit the per-user burst limit.
 *
 * @param {Array}  recentOrders  - orders placed by this user in the last 60 s
 * @param {number} limit         - default 5
 * @returns {{ blocked: boolean, retryAfter: number }}
 */
export function checkPerUserBurst(recentOrders, limit = 5) {
    const count = Array.isArray(recentOrders) ? recentOrders.length : 0;
    if (count < limit) return { blocked: false, retryAfter: 0 };

    const now = Date.now();
    const oldest = recentOrders.slice().sort((a, b) => new Date(a.created_date) - new Date(b.created_date))[0];
    const retryAfter = Math.max(1, Math.ceil((new Date(oldest.created_date).getTime() + 60_000 - now) / 1000));
    return { blocked: true, retryAfter };
}

/**
 * Check if the platform-wide circuit breaker should trip.
 *
 * @param {number} platformOrderCount - orders in the last 60 s across all users
 * @param {number} limit              - default 30
 * @returns {boolean}
 */
export function checkPlatformBurst(platformOrderCount, limit = 30) {
    return platformOrderCount >= limit;
}