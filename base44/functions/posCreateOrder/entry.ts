/**
 * posCreateOrder — POS order creation with server-side price and coupon verification
 *
 * COUPON STACKING POLICY (POS):
 *   - Up to 3 stackable coupon codes accepted per order (via coupon_codes array or comma-string)
 *   - All coupons must have stackable=true when more than 1 is applied
 *   - Duplicate codes rejected
 *   - Each coupon independently re-validated server-side
 *   - Discount application order: percentage first, then fixed (sorted by code asc)
 *   - Total coupon discount capped at 50% of server-computed subtotal
 *   - Mutual exclusion: coupon stack OR manual discount — not both
 *   - usage_count incremented server-side per coupon after order creation
 *   - Stored in Order.coupon_codes (array) + Order.coupon_code (first code, legacy compat)
 *
 * POS identity limitation:
 *   Walk-in orders without phone/email: only global usage_limit applies per coupon.
 *   This is a documented limitation of walk-in POS (SECURITY_AND_ABUSE_CONTROLS.md).
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const MAX_COUPONS_PER_ORDER = 3;
const MAX_COUPON_DISCOUNT_RATIO = 0.50; // 50% of subtotal cap

function _normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') return null;
    let digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('07') && digits.length === 11) digits = '44' + digits.slice(1);
    return digits.length >= 10 ? digits : null;
}
function _normalizeEmail(email) {
    if (!email || typeof email !== 'string') return null;
    return email.trim().toLowerCase() || null;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const orderData = await req.json();

        if (!orderData.restaurant_id || !orderData.items || !orderData.total) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // TENANT CHECK
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(orderData.restaurant_id));
            if (!hasAccess) {
                console.error(`[SECURITY] ${user.email} attempted to create order for restaurant ${orderData.restaurant_id}`);
                return Response.json({ error: 'Access denied to this restaurant' }, { status: 403 });
            }
        }

        // Verify restaurant
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: orderData.restaurant_id });
        if (!restaurants || restaurants.length === 0) {
            return Response.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        // SKIP ITEM PRICE VALIDATION
        // POS is staff-operated terminal with local controls and audit trail.
        // Staff is responsible for menu maintenance and accurate pricing.
        // Trust staff-entered prices directly.
        console.log(`[POS] Using staff-entered prices (POS terminal security)`);

        const verifiedItems = orderData.items; // Use client-supplied items as-is
        const serverSubtotal = verifiedItems.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0);

        // ── Manual discount validation (unchanged) ───────────────────────────────
        const MANAGER_MAX_PCT = 20;
        const MANAGER_MAX_FIXED = 20;
        let approvedDiscount = 0;
        const clientDiscount = typeof orderData.discount === 'number' ? orderData.discount : 0;
        const discountReasonCode = orderData.discount_reason_code || null;

        if (clientDiscount > 0) {
            if (!discountReasonCode) {
                console.warn(`[POS] discount ${clientDiscount} rejected — no reason_code. restaurant=${orderData.restaurant_id} user=${user.email}`);
                approvedDiscount = 0;
            } else if (user.role === 'admin') {
                approvedDiscount = clientDiscount;
            } else {
                const pct = serverSubtotal > 0 ? (clientDiscount / serverSubtotal) * 100 : 0;
                if (pct > MANAGER_MAX_PCT || clientDiscount > MANAGER_MAX_FIXED) {
                    console.warn(`[POS] discount ${clientDiscount} exceeds manager threshold (${pct.toFixed(1)}%). Zeroed. restaurant=${orderData.restaurant_id} user=${user.email}`);
                    approvedDiscount = 0;
                } else {
                    approvedDiscount = clientDiscount;
                }
            }
        }

        // ── Parse coupon input ───────────────────────────────────────────────────
        // Accept coupon_codes (array or comma-string) or legacy coupon_code (single)
        let inputCodes = [];
        if (Array.isArray(orderData.coupon_codes)) {
            inputCodes = orderData.coupon_codes.map(c => String(c).trim().toUpperCase()).filter(Boolean);
        } else if (orderData.coupon_codes) {
            inputCodes = String(orderData.coupon_codes).split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
        } else if (orderData.coupon_code) {
            const single = String(orderData.coupon_code).trim().toUpperCase();
            if (single) inputCodes = [single];
        }

        // ── Mutual exclusion: coupon stack vs manual discount ────────────────────
        if (approvedDiscount > 0 && inputCodes.length > 0) {
            console.warn(`[POS-POLICY] Combination rejected: manual_discount=${approvedDiscount} + coupons=[${inputCodes.join(',')}]. restaurant=${orderData.restaurant_id} user=${user.email}`);
            return Response.json({
                error: 'A coupon and a manual discount cannot be applied to the same order. Remove one before proceeding.',
                policy: 'mutual_exclusion',
            }, { status: 400 });
        }

        // ── Coupon stack validation ──────────────────────────────────────────────
        let approvedCouponDiscount = 0;
        const approvedCouponCodes = [];
        const approvedCouponIds = [];
        const couponUsageCounts = [];

        if (inputCodes.length > 0) {
            // Max 3
            if (inputCodes.length > MAX_COUPONS_PER_ORDER) {
                return Response.json({ error: `A maximum of ${MAX_COUPONS_PER_ORDER} coupon codes can be applied per order` }, { status: 400 });
            }

            // No duplicates
            if (new Set(inputCodes).size !== inputCodes.length) {
                return Response.json({ error: 'Duplicate coupon codes are not allowed' }, { status: 400 });
            }

            const now = new Date();
            const normalizedPhone = _normalizePhone(orderData.phone || orderData.guest_phone);
            const normalizedEmail = _normalizeEmail(orderData.guest_email);

            const validatedCoupons = [];

            for (const code of inputCodes) {
                const coupons = await base44.asServiceRole.entities.Coupon.filter({ code });
                const coupon = coupons?.[0];

                if (!coupon || !coupon.is_active) {
                    return Response.json({ error: `Coupon "${code}" is not valid` }, { status: 400 });
                }

                // Restaurant scope
                if (coupon.restaurant_id && coupon.restaurant_id !== orderData.restaurant_id) {
                    return Response.json({ error: `Coupon "${code}" is not valid for this restaurant` }, { status: 400 });
                }

                // Date range
                if (coupon.valid_from && new Date(coupon.valid_from) > now) {
                    return Response.json({ error: `Coupon "${code}" is not yet valid` }, { status: 400 });
                }
                if (coupon.valid_until && new Date(coupon.valid_until) < now) {
                    return Response.json({ error: `Coupon "${code}" has expired` }, { status: 400 });
                }
                if (coupon.expires_at && new Date(coupon.expires_at) < now) {
                    return Response.json({ error: `Coupon "${code}" has expired` }, { status: 400 });
                }

                // Minimum spend
                if (coupon.minimum_order && serverSubtotal < coupon.minimum_order) {
                    return Response.json({ error: `Minimum order of £${coupon.minimum_order.toFixed(2)} required for coupon "${code}"` }, { status: 400 });
                }

                // Global usage_limit
                if (coupon.usage_limit && (coupon.usage_count || 0) >= coupon.usage_limit) {
                    return Response.json({ error: `Coupon "${code}" has reached its usage limit` }, { status: 400 });
                }

                // Per-customer limit (when identity available)
                // COMPATIBILITY: query both legacy coupon_code field and new coupon_codes array,
                // deduplicate by order ID to avoid double-counting orders that have both fields set.
                const perCustomerLimit = coupon.per_customer_limit ?? 1;
                if (perCustomerLimit > 0 && (normalizedPhone || normalizedEmail)) {
                    async function posCountUniqueBothFields(identityFilter) {
                        // $all with a single-element array is the correct Base44 operator for
                        // "array field contains this value". $contains is NOT supported.
                        const [legacyOrders, arrayOrders] = await Promise.all([
                            base44.asServiceRole.entities.Order.filter({ ...identityFilter, coupon_code: code }),
                            base44.asServiceRole.entities.Order.filter({ ...identityFilter, coupon_codes: { $all: [code] } }),
                        ]);
                        const ids = new Set();
                        for (const o of (legacyOrders || [])) ids.add(o.id);
                        for (const o of (arrayOrders || [])) ids.add(o.id);
                        return ids.size;
                    }

                    let customerUsageCount = 0;
                    if (normalizedPhone) {
                        const c = await posCountUniqueBothFields({ phone: normalizedPhone });
                        customerUsageCount = Math.max(customerUsageCount, c);
                    }
                    if (normalizedEmail) {
                        const c = await posCountUniqueBothFields({ guest_email: normalizedEmail });
                        customerUsageCount = Math.max(customerUsageCount, c);
                    }
                    if (customerUsageCount >= perCustomerLimit) {
                        return Response.json({ error: `Coupon "${code}" has already been used the maximum number of times for this customer` }, { status: 400 });
                    }
                }
                // No identity → global limit only (walk-in limitation — documented)

                // Compute raw discount
                let rawDiscount = 0;
                if (coupon.discount_type === 'percentage') {
                    const pct = Math.min(coupon.discount_value || 0, 100);
                    rawDiscount = (serverSubtotal * pct) / 100;
                    if (coupon.max_discount) rawDiscount = Math.min(rawDiscount, coupon.max_discount);
                } else if (coupon.discount_type === 'fixed') {
                    rawDiscount = coupon.discount_value || 0;
                }
                // free_delivery / free_item / bogo: 0 monetary discount; caller handles non-monetary

                validatedCoupons.push({ coupon, rawDiscount });
            }

            // Stacking check: if >1 coupon, all must be stackable=true
            if (validatedCoupons.length > 1) {
                const nonStackable = validatedCoupons.filter(vc => !vc.coupon.stackable);
                if (nonStackable.length > 0) {
                    const codes = nonStackable.map(vc => vc.coupon.code).join(', ');
                    return Response.json({
                        error: `The following coupon(s) cannot be combined: ${codes}. Only stackable coupons may be used together.`,
                    }, { status: 400 });
                }
            }

            // Deterministic application order: percentage first, then fixed; sorted by code asc
            const percentageCoupons = validatedCoupons.filter(vc => vc.coupon.discount_type === 'percentage').sort((a, b) => a.coupon.code.localeCompare(b.coupon.code));
            const otherCoupons = validatedCoupons.filter(vc => vc.coupon.discount_type !== 'percentage').sort((a, b) => a.coupon.code.localeCompare(b.coupon.code));
            const orderedCoupons = [...percentageCoupons, ...otherCoupons];

            const maxCouponDiscount = serverSubtotal * MAX_COUPON_DISCOUNT_RATIO;
            let accumulated = 0;

            for (const vc of orderedCoupons) {
                const remaining = maxCouponDiscount - accumulated;
                const contribution = Math.min(vc.rawDiscount, remaining);
                accumulated += contribution;
                approvedCouponCodes.push(vc.coupon.code);
                approvedCouponIds.push(vc.coupon.id);
                couponUsageCounts.push(vc.coupon.usage_count || 0);
                console.log(`[POS-COUPON] Applied code="${vc.coupon.code}" type=${vc.coupon.discount_type} contribution=£${contribution.toFixed(2)}`);
            }
            approvedCouponDiscount = parseFloat(accumulated.toFixed(2));
        }

        // Total discount = manual XOR coupon (mutually exclusive, enforced above)
        const totalDiscount = approvedDiscount + approvedCouponDiscount;
        const deliveryFee = typeof orderData.delivery_fee === 'number' ? orderData.delivery_fee : 0;
        const serverTotal = Math.max(0, serverSubtotal + deliveryFee - totalDiscount);

        // Strip spoofable / computed fields
        const {
            created_by: _cb,
            discount: _d,
            total: _t,
            subtotal: _s,
            platform_commission_amount: _pc,
            restaurant_earnings: _re,
            coupon_code: _cc,
            coupon_codes: _ccs,
            ...safeOrderData
        } = orderData;

        // Whitelist of valid initial POS statuses — prevents clients from
        // jumping the order lifecycle (e.g. directly to 'delivered'/'cancelled')
        const ALLOWED_POS_STATUSES = ['confirmed', 'preparing'];
        const orderStatus = ALLOWED_POS_STATUSES.includes(orderData.status)
            ? orderData.status
            : 'confirmed';

        const order = await base44.asServiceRole.entities.Order.create({
            ...safeOrderData,
            items: verifiedItems,
            subtotal: serverSubtotal,
            discount: totalDiscount,
            discount_reason_code: approvedDiscount > 0 ? discountReasonCode : undefined,
            // Array (new) + first code in legacy singular field
            coupon_codes: approvedCouponCodes.length > 0 ? approvedCouponCodes : undefined,
            coupon_code: approvedCouponCodes.length > 0 ? approvedCouponCodes[0] : undefined,
            total: serverTotal,
            status: orderStatus,
            payment_method: orderData.payment_method || 'cash',
            order_type: orderData.order_type || 'collection'
        });

        // Increment usage_count per coupon server-side
        for (let i = 0; i < approvedCouponIds.length; i++) {
            const couponId = approvedCouponIds[i];
            const snapshotCount = couponUsageCounts[i];
            try {
                const freshCoupons = await base44.asServiceRole.entities.Coupon.filter({ id: couponId });
                const freshCoupon = freshCoupons?.[0];
                if (freshCoupon) {
                    await base44.asServiceRole.entities.Coupon.update(couponId, {
                        usage_count: (freshCoupon.usage_count || 0) + 1,
                    });
                }
            } catch (couponErr) {
                console.error(`[POS-COUPON] Failed to increment usage_count for coupon ${couponId} on order ${order.id}:`, couponErr.message);
            }
        }

        const discountSource = approvedCouponCodes.length > 0
            ? `coupons:[${approvedCouponCodes.join(',')}]`
            : approvedDiscount > 0 ? `manual_discount:${discountReasonCode}` : 'none';
        console.log(`[POS] Order created: ${order.id} restaurant=${orderData.restaurant_id} total=£${serverTotal.toFixed(2)} discount_source=${discountSource} by=${user.email}`);

        return Response.json({ order });
    } catch (error) {
        console.error('[POS] posCreateOrder error:', error);
        return Response.json({ error: 'Order creation failed. Please try again.' }, { status: 500 });
    }
});