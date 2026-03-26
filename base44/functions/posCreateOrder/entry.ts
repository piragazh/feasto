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
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const orderData = await req.json();

        if (!orderData.restaurant_id || !orderData.items || !orderData.total) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // TENANT CHECK: verify caller owns / manages this restaurant
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

        // Verify restaurant exists
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: orderData.restaurant_id });
        if (!restaurants || restaurants.length === 0) {
            return Response.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        // SECURITY: Verify item prices against menu (use pos_price if set, else standard price)
        const menuItems = await base44.asServiceRole.entities.MenuItem.filter({ restaurant_id: orderData.restaurant_id });
        const menuMap = new Map(menuItems.map(i => [i.id, i]));

        const verifiedItems = orderData.items.map(cartItem => {
            const menuItem = menuMap.get(cartItem.menu_item_id);
            if (menuItem) {
                // Use server-side authoritative POS price
                return { ...cartItem, price: menuItem.pos_price ?? menuItem.price };
            }
            return cartItem; // custom/ad-hoc POS items without a menu_item_id
        });

        const serverSubtotal = verifiedItems.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0);

        // SECURITY: Re-validate any client-supplied discount server-side.
        // The POSDiscountPanel calls posApplyDiscount first, then passes the approved
        // amount here. However posCreateOrder is a public endpoint — a caller hitting it
        // directly could inject an arbitrary discount. We close this by reapplying the
        // same threshold rules posApplyDiscount uses: managers are capped at 20% / £20,
        // admins may pass any value. A missing reason_code resets discount to 0.
        const MANAGER_MAX_PCT = 20;
        const MANAGER_MAX_FIXED = 20;

        let approvedDiscount = 0;
        const clientDiscount = typeof orderData.discount === 'number' ? orderData.discount : 0;
        const discountReasonCode = orderData.discount_reason_code || null;

        if (clientDiscount > 0) {
            if (!discountReasonCode) {
                // No reason code supplied — silently zero the discount and log
                console.warn(`[POS] posCreateOrder: discount ${clientDiscount} rejected — no reason_code. restaurant=${orderData.restaurant_id} user=${user.email}`);
                approvedDiscount = 0;
            } else if (user.role === 'admin') {
                approvedDiscount = clientDiscount;
            } else {
                // Manager threshold check
                const pct = serverSubtotal > 0 ? (clientDiscount / serverSubtotal) * 100 : 0;
                if (pct > MANAGER_MAX_PCT || clientDiscount > MANAGER_MAX_FIXED) {
                    console.warn(`[POS] posCreateOrder: discount ${clientDiscount} exceeds manager threshold (${pct.toFixed(1)}%). Zeroed. restaurant=${orderData.restaurant_id} user=${user.email}`);
                    approvedDiscount = 0;
                } else {
                    approvedDiscount = clientDiscount;
                }
            }
        }

        // ── Mutual exclusion: coupon vs manual discount ──────────────────────────
        // POLICY: A POS order may have a coupon OR a manual discount, not both.
        // Reason: allowing both creates an undetectable double-discount path and
        // complicates margin analysis. Staff must choose one mechanism.
        // This is enforced here (server authority) and mirrored in the UI.
        const rawCouponCodeCheck = typeof orderData.coupon_code === 'string' ? orderData.coupon_code.trim() : '';
        if (approvedDiscount > 0 && rawCouponCodeCheck) {
            console.warn(`[POS-POLICY] Combination rejected: manual_discount=${approvedDiscount} + coupon=${rawCouponCodeCheck} on same order. restaurant=${orderData.restaurant_id} user=${user.email}`);
            return Response.json({
                error: 'A coupon and a manual discount cannot be applied to the same order. Remove one before proceeding.',
                policy: 'mutual_exclusion',
            }, { status: 400 });
        }

        // ── Coupon validation (server-side) ─────────────────────────────────────
        // Coupons are separate from manual discounts. A coupon_code may be provided
        // from the POS coupon picker. If supplied, we re-validate it here.
        let approvedCouponDiscount = 0;
        let approvedCouponCode = null;
        let approvedCouponId = null;

        const rawCouponCode = typeof orderData.coupon_code === 'string' ? orderData.coupon_code.trim().toUpperCase() : null;

        if (rawCouponCode) {
            // One coupon only — if more than one comma-separated code, reject
            if (rawCouponCode.includes(',')) {
                return Response.json({ error: 'Only one coupon code per order is allowed' }, { status: 400 });
            }

            // Fetch coupon for server-side re-validation
            const coupons = await base44.asServiceRole.entities.Coupon.filter({ code: rawCouponCode });
            const coupon = coupons?.[0];

            if (!coupon || !coupon.is_active) {
                return Response.json({ error: `Coupon "${rawCouponCode}" is not valid` }, { status: 400 });
            }

            // Restaurant scope
            if (coupon.restaurant_id && coupon.restaurant_id !== orderData.restaurant_id) {
                return Response.json({ error: `Coupon "${rawCouponCode}" is not valid for this restaurant` }, { status: 400 });
            }

            // Date range
            const now = new Date();
            if (coupon.valid_from && new Date(coupon.valid_from) > now) {
                return Response.json({ error: `Coupon "${rawCouponCode}" is not yet valid` }, { status: 400 });
            }
            if (coupon.valid_until && new Date(coupon.valid_until) < now) {
                return Response.json({ error: `Coupon "${rawCouponCode}" has expired` }, { status: 400 });
            }
            if (coupon.expires_at && new Date(coupon.expires_at) < now) {
                return Response.json({ error: `Coupon "${rawCouponCode}" has expired` }, { status: 400 });
            }

            // Minimum spend (against server-computed subtotal)
            if (coupon.minimum_order && serverSubtotal < coupon.minimum_order) {
                return Response.json({
                    error: `Minimum order of £${coupon.minimum_order.toFixed(2)} required for coupon "${rawCouponCode}"`,
                }, { status: 400 });
            }

            // Global usage_limit
            if (coupon.usage_limit && (coupon.usage_count || 0) >= coupon.usage_limit) {
                return Response.json({ error: `Coupon "${rawCouponCode}" has reached its usage limit` }, { status: 400 });
            }

            // Per-customer limit (when customer identity available via phone order)
            const perCustomerLimit = coupon.per_customer_limit ?? 1;
            if (perCustomerLimit > 0) {
                const normalizedPhone = _normalizePhone(orderData.phone || orderData.guest_phone);
                const normalizedEmail = _normalizeEmail(orderData.guest_email);

                if (normalizedPhone || normalizedEmail) {
                    let customerUsageCount = 0;
                    if (normalizedPhone) {
                        const phoneOrders = await base44.asServiceRole.entities.Order.filter({
                            coupon_code: rawCouponCode,
                            phone: normalizedPhone,
                        });
                        customerUsageCount = Math.max(customerUsageCount, phoneOrders?.length || 0);
                    }
                    if (normalizedEmail) {
                        const emailOrders = await base44.asServiceRole.entities.Order.filter({
                            coupon_code: rawCouponCode,
                            guest_email: normalizedEmail,
                        });
                        customerUsageCount = Math.max(customerUsageCount, emailOrders?.length || 0);
                    }
                    if (customerUsageCount >= perCustomerLimit) {
                        return Response.json({
                            error: `Coupon "${rawCouponCode}" has already been used the maximum number of times for this customer`,
                        }, { status: 400 });
                    }
                }
                // No identity → global limit only (walk-in POS limitation — documented)
            }

            // Compute coupon discount amount
            if (coupon.discount_type === 'percentage') {
                const pct = Math.min(coupon.discount_value || 0, 100);
                approvedCouponDiscount = (serverSubtotal * pct) / 100;
                if (coupon.max_discount) approvedCouponDiscount = Math.min(approvedCouponDiscount, coupon.max_discount);
            } else if (coupon.discount_type === 'fixed') {
                approvedCouponDiscount = coupon.discount_value || 0;
            }
            // free_delivery / free_item / bogo: 0 monetary discount from coupon; caller handles non-monetary aspects
            approvedCouponDiscount = parseFloat(Math.min(approvedCouponDiscount, serverSubtotal).toFixed(2));
            approvedCouponCode = rawCouponCode;
            approvedCouponId = coupon.id;
        }

        // Total discount = manual discount XOR coupon discount (mutually exclusive — enforced above)
        const totalDiscount = approvedDiscount + approvedCouponDiscount;
        const serverTotal = Math.max(0, serverSubtotal - totalDiscount);

        // Strip any attempt to spoof created_by or inject financial fields directly
        const {
            created_by: _cb,
            discount: _d,
            total: _t,
            subtotal: _s,
            platform_commission_amount: _pc,
            restaurant_earnings: _re,
            coupon_code: _cc,  // strip client value — we write the server-validated one
            ...safeOrderData
        } = orderData;

        const order = await base44.asServiceRole.entities.Order.create({
            ...safeOrderData,
            items: verifiedItems,
            subtotal: serverSubtotal,
            discount: totalDiscount,
            discount_reason_code: approvedDiscount > 0 ? discountReasonCode : undefined,
            coupon_code: approvedCouponCode || undefined,
            total: serverTotal,
            status: 'confirmed',
            payment_method: orderData.payment_method || 'cash',
            order_type: orderData.order_type || 'collection'
        });

        // Increment coupon usage_count server-side after order is persisted
        if (approvedCouponId) {
            try {
                const freshCoupons = await base44.asServiceRole.entities.Coupon.filter({ id: approvedCouponId });
                const freshCoupon = freshCoupons?.[0];
                if (freshCoupon) {
                    await base44.asServiceRole.entities.Coupon.update(approvedCouponId, {
                        usage_count: (freshCoupon.usage_count || 0) + 1,
                    });
                }
            } catch (couponErr) {
                // Non-fatal: order is already created. Log for manual reconciliation.
                console.error(`[POS-COUPON] Failed to increment usage_count for coupon ${approvedCouponId} on order ${order.id}:`, couponErr.message);
            }
        }

        const discountSource = approvedCouponCode ? `coupon:${approvedCouponCode}` : (approvedDiscount > 0 ? `manual_discount:${discountReasonCode}` : 'none');
        console.log(`[POS] Order created: ${order.id} restaurant=${orderData.restaurant_id} total=£${serverTotal.toFixed(2)} discount_source=${discountSource} by=${user.email}`);
        return Response.json({ order });
    } catch (error) {
        console.error('[POS] posCreateOrder error:', error);
        return Response.json({ error: 'Order creation failed. Please try again.' }, { status: 500 });
    }
});