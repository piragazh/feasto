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
 *                                        validateCoupon, checkPerCustomerLimit,
 *                                        normalizeEmail, normalizePhone,
 *                                        guestCompositeFingerprint,
 *                                        capPromotionDiscount
 *   - functions/orderVelocityThrottle → basketFingerprint, checkPerUserBurst,
 *                                        checkPlatformBurst, normalizePhone,
 *                                        guestCompositeFingerprint
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
 * Does NOT check per-customer limits (requires async DB query — see checkPerCustomerLimit).
 * Returns { valid: boolean, reason: string|null, discount: number }
 *
 * SYNC RULE: Keep in sync with the inline coupon validation block in
 * functions/verifyAndCreateOrder (sections A-D + global usage limit).
 *
 * @param {object} coupon        - coupon record from DB
 * @param {number} serverSubtotal
 * @param {string} restaurantId
 * @param {Date}   [now]
 */
export function validateCoupon(coupon, serverSubtotal, restaurantId, now = new Date()) {
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

/**
 * Check per-customer coupon usage limit.
 * Separate from validateCoupon because it requires async DB access.
 *
 * SYNC RULE: Keep in sync with the per-customer check in functions/verifyAndCreateOrder.
 *
 * COMPATIBILITY: Orders may be stored with either or both of:
 *   - coupon_code (string): legacy single-code orders AND first code of new stacked orders
 *   - coupon_codes (array): new multi-coupon orders (all applied codes)
 *
 * The injected `getUniqueOrderCount` must query BOTH fields and return a deduplicated count
 * so that orders with both fields set are not double-counted. The function signature is:
 *   async (customerEmail: string, couponCode: string) => number
 *
 * For tests that only model one field, passing a simple count function is sufficient
 * provided the test data does not include mixed legacy/new orders.
 *
 * @param {object}   coupon                 - coupon record from DB
 * @param {string|null} customerEmail       - authenticated user email or guest email
 * @param {Function} getUniqueOrderCount    - async (email, code) => number — injected for testability
 * @returns {Promise<{ blocked: boolean, reason: string|null }>}
 */
export async function checkPerCustomerLimit(coupon, customerEmail, getUniqueOrderCount) {
    if (!coupon.per_customer_limit || coupon.per_customer_limit <= 0) {
        return { blocked: false, reason: null };
    }
    if (!customerEmail) {
        // No identifier — cannot enforce. Caller decides how to handle.
        return { blocked: false, reason: 'no_identifier' };
    }
    const count = await getUniqueOrderCount(customerEmail, coupon.code);
    if (count >= coupon.per_customer_limit) {
        return { blocked: true, reason: 'per_customer_limit_reached' };
    }
    return { blocked: false, reason: null };
}

// Stacking constants — must match functions/verifyAndCreateOrder and functions/posCreateOrder
const MAX_COUPONS_PER_ORDER = 3;
const MAX_COUPON_DISCOUNT_RATIO = 0.50; // 50% of subtotal cap

/**
 * Apply the coupon stacking policy to an array or comma-separated string of coupon codes.
 *
 * Policy (mirrors functions/verifyAndCreateOrder):
 *   - 0 codes: skipped (no coupon discount)
 *   - 1–3 codes: each validated individually; all must be stackable=true if > 1
 *   - > 3 codes: rejected (MAX_EXCEEDED)
 *   - Duplicate codes: rejected (DUPLICATE)
 *   - Not found: rejected (NOT_FOUND)
 *   - Invalid coupon: rejected (reason code from validateCoupon)
 *   - Combined discount capped at 50% of serverSubtotal
 *   - Application order: percentage coupons first (sorted by code asc), then fixed/other
 *
 * SYNC RULE: Keep in sync with the coupon stacking block in functions/verifyAndCreateOrder.
 *
 * @param {string|string[]|undefined} couponCodesInput - array or comma-separated codes
 * @param {number}   serverSubtotal
 * @param {string}   restaurantId
 * @param {Function} getCoupon   - async (code) => coupon|null (injected for testability)
 * @param {Date}     [now]
 * @returns {Promise<{ error: string|null, discount: number, appliedCodes?: string[], skipped?: boolean }>}
 */
export async function resolveCouponDiscount(couponCodesInput, serverSubtotal, restaurantId, getCoupon, now = new Date()) {
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

    return { error: null, discount: accumulated, appliedCodes };
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
// GUEST IDENTITY NORMALISATION
// ─────────────────────────────────────────────────────────────────────────────
//
// Guest identity is inherently weak — we cannot verify these signals.
// These helpers produce consistent keys for best-effort abuse detection only.
// They do NOT constitute identity verification.
//
// SYNC RULE: Keep in sync with inline copies in functions/verifyAndCreateOrder
// and functions/orderVelocityThrottle.

/**
 * Normalise an email address for consistent matching.
 * Lowercases, trims whitespace. Does NOT strip dots or plus-alias tricks
 * to avoid false positives (foo+a@gmail.com is a real separate inbox for
 * most providers and may be legitimately different users).
 *
 * @param {string|null|undefined} email
 * @returns {string|null}
 */
export function normalizeEmail(email) {
    if (!email || typeof email !== 'string') return null;
    return email.trim().toLowerCase() || null;
}

/**
 * Normalise a UK phone number to digits-only E.164-ish form.
 * Strips all non-digit characters, converts leading 07 → 447.
 * This makes 07123456789, +447123456789, and 07123 456789 all identical.
 *
 * @param {string|null|undefined} phone
 * @returns {string|null}
 */
export function normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') return null;
    // Strip all non-digit characters
    let digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    // Convert 07... → 447...
    if (digits.startsWith('07') && digits.length === 11) {
        digits = '44' + digits.slice(1);
    }
    // Must be 12 digits (44 + 10) after normalisation
    return digits.length >= 10 ? digits : null;
}

/**
 * Build a best-effort composite fingerprint for a guest user.
 *
 * Strategy:
 *   - Primary:   normalised phone (harder to rotate than email, tied to real device)
 *   - Secondary: normalised email (easy to rotate but still a signal)
 *   - Scope:     restaurant_id (prevents cross-restaurant false positives)
 *
 * Returns an object with individual components so callers can choose
 * which to use for different levels of enforcement.
 *
 * IMPORTANT: These signals are self-reported and unverified. Use for
 * best-effort abuse detection only. Authenticated users are enforced
 * via platform-set created_by, which is authoritative.
 *
 * @param {{ guest_email?: string, phone?: string, restaurant_id?: string }} orderData
 * @returns {{ phone: string|null, email: string|null, phoneKey: string|null, emailKey: string|null }}
 */
export function guestCompositeFingerprint(orderData) {
    const phone = normalizePhone(orderData?.phone);
    const email = normalizeEmail(orderData?.guest_email);
    const rid = orderData?.restaurant_id || '';

    return {
        phone,
        email,
        // Scoped keys for DB queries
        phoneKey: phone ? `${phone}::${rid}` : null,
        emailKey: email ? `${email}::${rid}` : null,
        // Combined key for logging/fingerprinting
        compositeKey: phone && email ? `${phone}|${email}::${rid}` : (phone ? `phone:${phone}::${rid}` : (email ? `email:${email}::${rid}` : null)),
    };
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