/**
 * posValidateCoupon — Server-side POS coupon validation
 *
 * Validates a coupon code for a POS order and returns the approved discount amount.
 * Does NOT increment usage_count here — that happens atomically in posCreateOrder
 * when the order is persisted.
 *
 * Policy:
 *   - Must be active (is_active)
 *   - Date range enforced (valid_from, valid_until, expires_at)
 *   - Restaurant scope enforced (restaurant_id or platform-wide)
 *   - Minimum spend enforced (minimum_order)
 *   - Global usage_limit enforced
 *   - Per-customer limit enforced when customer_phone is provided (walk-in POS)
 *   - One coupon per order — enforced by caller (posCreateOrder)
 *   - Caller must be authenticated staff for this restaurant
 *
 * Customer identity note:
 *   POS walk-in orders often have no customer identity. If customer_phone is provided
 *   (e.g. phone orders taken at the counter), per-customer limits are enforced against
 *   the phone number. If absent, only global limits apply — this is a documented
 *   limitation of walk-in POS and is noted in SECURITY_AND_ABUSE_CONTROLS.md.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/** Mirrors order-logic.js: normalizePhone */
function _normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') return null;
    let digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('07') && digits.length === 11) {
        digits = '44' + digits.slice(1);
    }
    return digits.length >= 10 ? digits : null;
}

/** Mirrors order-logic.js: normalizeEmail */
function _normalizeEmail(email) {
    if (!email || typeof email !== 'string') return null;
    return email.trim().toLowerCase() || null;
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const {
            restaurant_id,
            coupon_code,
            subtotal,
            customer_phone,    // optional — walk-in may not have this
            customer_email,    // optional
        } = await req.json();

        // ── Input validation ─────────────────────────────────────────────────
        if (!restaurant_id) {
            return Response.json({ error: 'restaurant_id required' }, { status: 400 });
        }
        if (!coupon_code || typeof coupon_code !== 'string') {
            return Response.json({ error: 'coupon_code required' }, { status: 400 });
        }
        const orderSubtotal = parseFloat(subtotal);
        if (!isFinite(orderSubtotal) || orderSubtotal <= 0) {
            return Response.json({ error: 'subtotal must be a positive number' }, { status: 400 });
        }

        // ── Tenant check ──────────────────────────────────────────────────────
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true,
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(restaurant_id));
            if (!hasAccess) {
                console.error(`[SECURITY] ${user.email} attempted POS coupon validation for restaurant ${restaurant_id}`);
                return Response.json({ error: 'Access denied to this restaurant' }, { status: 403 });
            }
        }

        // ── Fetch coupon ──────────────────────────────────────────────────────
        const normalizedCode = coupon_code.trim().toUpperCase();
        const coupons = await base44.asServiceRole.entities.Coupon.filter({ code: normalizedCode });
        const coupon = coupons?.[0];

        if (!coupon) {
            return Response.json({ valid: false, error: 'Coupon code not found' }, { status: 200 });
        }

        // ── Active check ──────────────────────────────────────────────────────
        if (!coupon.is_active) {
            return Response.json({ valid: false, error: 'This coupon is no longer active' }, { status: 200 });
        }

        // ── Restaurant scope ──────────────────────────────────────────────────
        if (coupon.restaurant_id && coupon.restaurant_id !== restaurant_id) {
            return Response.json({ valid: false, error: 'This coupon is not valid for this restaurant' }, { status: 200 });
        }

        // ── Date range ────────────────────────────────────────────────────────
        const now = new Date();
        if (coupon.valid_from && new Date(coupon.valid_from) > now) {
            return Response.json({ valid: false, error: 'This coupon is not yet valid' }, { status: 200 });
        }
        if (coupon.valid_until && new Date(coupon.valid_until) < now) {
            return Response.json({ valid: false, error: 'This coupon has expired' }, { status: 200 });
        }
        if (coupon.expires_at && new Date(coupon.expires_at) < now) {
            return Response.json({ valid: false, error: 'This coupon has expired' }, { status: 200 });
        }

        // ── Minimum spend ─────────────────────────────────────────────────────
        if (coupon.minimum_order && orderSubtotal < coupon.minimum_order) {
            return Response.json({
                valid: false,
                error: `Minimum order of £${coupon.minimum_order.toFixed(2)} required for this coupon`,
            }, { status: 200 });
        }

        // ── Global usage_limit ────────────────────────────────────────────────
        if (coupon.usage_limit && (coupon.usage_count || 0) >= coupon.usage_limit) {
            return Response.json({ valid: false, error: 'This coupon has reached its usage limit' }, { status: 200 });
        }

        // ── Per-customer limit (when identity available) ───────────────────────
        const perCustomerLimit = coupon.per_customer_limit ?? 1;
        if (perCustomerLimit > 0) {
            const normalizedPhone = _normalizePhone(customer_phone);
            const normalizedEmail = _normalizeEmail(customer_email);

            if (normalizedPhone || normalizedEmail) {
                // Query orders that used this coupon, filtering by available identity signals
                // Use phone as primary (stronger signal), email as secondary
                let usageCount = 0;

                if (normalizedPhone) {
                    const phoneOrders = await base44.asServiceRole.entities.Order.filter({
                        coupon_code: normalizedCode,
                        phone: normalizedPhone,
                    });
                    usageCount = Math.max(usageCount, phoneOrders?.length || 0);
                }

                if (normalizedEmail) {
                    const emailOrders = await base44.asServiceRole.entities.Order.filter({
                        coupon_code: normalizedCode,
                        guest_email: normalizedEmail,
                    });
                    usageCount = Math.max(usageCount, emailOrders?.length || 0);
                }

                if (usageCount >= perCustomerLimit) {
                    return Response.json({
                        valid: false,
                        error: 'This coupon has already been used the maximum number of times for this customer',
                    }, { status: 200 });
                }
            }
            // If no customer identity at all — only global limit applies (walk-in limitation)
        }

        // ── Compute discount amount ───────────────────────────────────────────
        let discountAmount = 0;
        if (coupon.discount_type === 'percentage') {
            const pct = Math.min(coupon.discount_value || 0, 100);
            discountAmount = (orderSubtotal * pct) / 100;
            if (coupon.max_discount) {
                discountAmount = Math.min(discountAmount, coupon.max_discount);
            }
        } else if (coupon.discount_type === 'fixed') {
            discountAmount = coupon.discount_value || 0;
        } else if (coupon.discount_type === 'free_delivery') {
            discountAmount = 0; // POS has no delivery fee — no effect, but accept as valid
        } else if (coupon.discount_type === 'free_item') {
            discountAmount = 0; // Free item coupons: return 0 discount, caller handles item
        } else if (coupon.discount_type === 'buy_one_get_one') {
            discountAmount = 0; // BOGO: caller must handle — not computable here without item detail
        }

        discountAmount = Math.min(discountAmount, orderSubtotal);
        discountAmount = parseFloat(discountAmount.toFixed(2));

        console.log(`[POS-COUPON] Validated: code=${normalizedCode} restaurant=${restaurant_id} discount=£${discountAmount} by=${user.email}`);

        return Response.json({
            valid: true,
            coupon_id: coupon.id,
            coupon_code: normalizedCode,
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value,
            discount_amount: discountAmount,
            description: coupon.description || null,
        });

    } catch (error) {
        console.error('[POS-COUPON] posValidateCoupon error:', error);
        return Response.json({ error: 'Coupon validation failed. Please try again.' }, { status: 500 });
    }
});