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

        const offlineOrderData = await req.json();

        if (!offlineOrderData.restaurant_id || !offlineOrderData.items || typeof offlineOrderData.total !== 'number') {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // TENANT CHECK
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(offlineOrderData.restaurant_id));
            if (!hasAccess) {
                console.error(`[SECURITY] ${user.email} attempted to sync offline order for restaurant ${offlineOrderData.restaurant_id}`);
                return Response.json({ error: 'Access denied to this restaurant' }, { status: 403 });
            }
        }

        // Idempotency check — prevent duplicate sync on retry using the stable offline_id UUID
        const offlineId = offlineOrderData.offline_id;
        if (offlineId) {
            const existingWithOfflineId = await base44.asServiceRole.entities.Order.filter({
                offline_id: offlineId,
            });
            if (existingWithOfflineId?.length > 0) {
                const existing = existingWithOfflineId[0];
                console.log(`[OFFLINE-SYNC] Duplicate suppressed — offline_id=${offlineId} already synced as order=${existing.id}`);
                return Response.json({
                    order: existing,
                    isDuplicate: true,
                    needs_review: existing.needs_review || false,
                }, { status: 200 });
            }
        }

        // Verify restaurant exists
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: offlineOrderData.restaurant_id });
        if (!restaurants || restaurants.length === 0) {
            return Response.json({ error: 'Restaurant not found' }, { status: 404 });
        }

        // SECURITY: Verify item prices against current menu
        const menuItems = await base44.asServiceRole.entities.MenuItem.filter({ restaurant_id: offlineOrderData.restaurant_id });
        const menuMap = new Map(menuItems.map(i => [i.id, i]));

        const verifiedItems = offlineOrderData.items.map(cartItem => {
            const menuItem = menuMap.get(cartItem.menu_item_id);
            if (menuItem) {
                return { ...cartItem, price: menuItem.pos_price ?? menuItem.price };
            }
            return cartItem; // custom POS items
        });

        const serverSubtotal = verifiedItems.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0);

        // ── OFFLINE DISCOUNT RE-VALIDATION ──────────────────────────────────────
        // Offline orders may have had a discount applied without threshold enforcement.
        // Re-validate server-side before syncing.
        const MANAGER_MAX_PCT = 20;
        const MANAGER_MAX_FIXED = 20;

        let approvedDiscount = 0;
        let discountWasOffline = false;
        const clientDiscount = typeof offlineOrderData.discount === 'number' ? offlineOrderData.discount : 0;
        const discountReasonCode = offlineOrderData.discount_reason_code || null;

        if (clientDiscount > 0) {
            discountWasOffline = true;
            if (!discountReasonCode) {
                console.warn(`[OFFLINE-SYNC] Discount ${clientDiscount} rejected — no reason_code. restaurant=${offlineOrderData.restaurant_id} user=${user.email} offline_id=${offlineOrderData.offline_id || 'unknown'}`);
                approvedDiscount = 0;
            } else if (user.role === 'admin') {
                approvedDiscount = clientDiscount;
            } else {
                // Manager threshold check
                const pct = serverSubtotal > 0 ? (clientDiscount / serverSubtotal) * 100 : 0;
                if (pct > MANAGER_MAX_PCT || clientDiscount > MANAGER_MAX_FIXED) {
                    console.warn(`[OFFLINE-SYNC] Discount ${clientDiscount} exceeds manager threshold (${pct.toFixed(1)}%). Capped. restaurant=${offlineOrderData.restaurant_id} user=${user.email}`);
                    approvedDiscount = Math.min(clientDiscount, MANAGER_MAX_FIXED);
                } else {
                    approvedDiscount = clientDiscount;
                }
            }
        }

        // ── OFFLINE COUPON RE-VALIDATION ───────────────────────────────────────
        // Offline mode should block coupons entirely (new policy), but in case an offline
        // order somehow has a coupon code (e.g., legacy sync, or UI bypass), re-validate.
        let approvedCouponDiscount = 0;
        let approvedCouponCode = null;
        let approvedCouponId = null;
        let couponValidationNote = null;

        const rawCouponCode = typeof offlineOrderData.coupon_code === 'string' ? offlineOrderData.coupon_code.trim().toUpperCase() : null;

        if (rawCouponCode) {
            if (rawCouponCode.includes(',')) {
                console.warn(`[OFFLINE-SYNC] Multiple coupons rejected. restaurant=${offlineOrderData.restaurant_id} user=${user.email}`);
                couponValidationNote = 'Offline coupon validation: multiple codes not allowed';
                approvedCouponCode = null;
            } else {
                const coupons = await base44.asServiceRole.entities.Coupon.filter({ code: rawCouponCode });
                const coupon = coupons?.[0];

                if (!coupon || !coupon.is_active) {
                    couponValidationNote = `Coupon "${rawCouponCode}" is not active or does not exist`;
                    console.warn(`[OFFLINE-SYNC] ${couponValidationNote}. restaurant=${offlineOrderData.restaurant_id} user=${user.email}`);
                } else if (coupon.restaurant_id && coupon.restaurant_id !== offlineOrderData.restaurant_id) {
                    couponValidationNote = `Coupon "${rawCouponCode}" is not valid for this restaurant`;
                    console.warn(`[OFFLINE-SYNC] ${couponValidationNote}. restaurant=${offlineOrderData.restaurant_id} user=${user.email}`);
                } else {
                    // Date range checks
                    const now = new Date();
                    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
                        couponValidationNote = `Coupon "${rawCouponCode}" is not yet valid`;
                        console.warn(`[OFFLINE-SYNC] ${couponValidationNote}. restaurant=${offlineOrderData.restaurant_id} user=${user.email}`);
                    } else if (coupon.valid_until && new Date(coupon.valid_until) < now) {
                        couponValidationNote = `Coupon "${rawCouponCode}" has expired (valid_until)`;
                        console.warn(`[OFFLINE-SYNC] ${couponValidationNote}. restaurant=${offlineOrderData.restaurant_id} user=${user.email}`);
                    } else if (coupon.expires_at && new Date(coupon.expires_at) < now) {
                        couponValidationNote = `Coupon "${rawCouponCode}" has expired (expires_at)`;
                        console.warn(`[OFFLINE-SYNC] ${couponValidationNote}. restaurant=${offlineOrderData.restaurant_id} user=${user.email}`);
                    } else if (coupon.minimum_order && serverSubtotal < coupon.minimum_order) {
                        couponValidationNote = `Coupon "${rawCouponCode}" requires minimum order £${coupon.minimum_order.toFixed(2)}`;
                        console.warn(`[OFFLINE-SYNC] ${couponValidationNote}. restaurant=${offlineOrderData.restaurant_id} user=${user.email}`);
                    } else if (coupon.usage_limit && (coupon.usage_count || 0) >= coupon.usage_limit) {
                        couponValidationNote = `Coupon "${rawCouponCode}" has reached its usage limit`;
                        console.warn(`[OFFLINE-SYNC] ${couponValidationNote}. restaurant=${offlineOrderData.restaurant_id} user=${user.email}`);
                    } else {
                        // Per-customer limit check
                        const perCustomerLimit = coupon.per_customer_limit ?? 1;
                        if (perCustomerLimit > 0) {
                            const normalizedPhone = _normalizePhone(offlineOrderData.phone || offlineOrderData.guest_phone);
                            const normalizedEmail = _normalizeEmail(offlineOrderData.guest_email);

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
                                couponValidationNote = `Coupon "${rawCouponCode}" has reached per-customer limit`;
                                console.warn(`[OFFLINE-SYNC] ${couponValidationNote}. customer_count=${customerUsageCount} restaurant=${offlineOrderData.restaurant_id} user=${user.email}`);
                            } else {
                                // All checks passed — compute discount
                                if (coupon.discount_type === 'percentage') {
                                    const pct = Math.min(coupon.discount_value || 0, 100);
                                    approvedCouponDiscount = (serverSubtotal * pct) / 100;
                                    if (coupon.max_discount) approvedCouponDiscount = Math.min(approvedCouponDiscount, coupon.max_discount);
                                } else if (coupon.discount_type === 'fixed') {
                                    approvedCouponDiscount = coupon.discount_value || 0;
                                }
                                approvedCouponDiscount = parseFloat(Math.min(approvedCouponDiscount, serverSubtotal).toFixed(2));
                                approvedCouponCode = rawCouponCode;
                                approvedCouponId = coupon.id;
                            }
                        } else {
                            // No per-customer limit
                            if (coupon.discount_type === 'percentage') {
                                const pct = Math.min(coupon.discount_value || 0, 100);
                                approvedCouponDiscount = (serverSubtotal * pct) / 100;
                                if (coupon.max_discount) approvedCouponDiscount = Math.min(approvedCouponDiscount, coupon.max_discount);
                            } else if (coupon.discount_type === 'fixed') {
                                approvedCouponDiscount = coupon.discount_value || 0;
                            }
                            approvedCouponDiscount = parseFloat(Math.min(approvedCouponDiscount, serverSubtotal).toFixed(2));
                            approvedCouponCode = rawCouponCode;
                            approvedCouponId = coupon.id;
                        }
                    }
                }
            }
        }

        // Mutual exclusion: coupon vs manual discount
        if (approvedDiscount > 0 && approvedCouponCode) {
            console.warn(`[OFFLINE-SYNC] Mutual exclusion violated: manual_discount=${approvedDiscount} + coupon=${approvedCouponCode}. Removing coupon. restaurant=${offlineOrderData.restaurant_id} user=${user.email}`);
            approvedCouponDiscount = 0;
            approvedCouponCode = null;
            approvedCouponId = null;
            couponValidationNote = 'Manual discount already applied; coupon removed (mutual exclusion policy)';
        }

        // ── COLLECT VALIDATION ISSUES FOR AUDIT ────────────────────────────────
        const validationIssues = [];
        if (discountWasOffline && approvedDiscount === 0 && clientDiscount > 0) {
            validationIssues.push('Offline discount zeroed: no reason code');
        }
        if (discountWasOffline && approvedDiscount < clientDiscount) {
            validationIssues.push(`Offline discount capped: ${clientDiscount} → ${approvedDiscount}`);
        }
        if (couponValidationNote) {
            validationIssues.push(couponValidationNote);
        }

        const needsReview = validationIssues.length > 0;
        const syncValidationNotes = validationIssues.join('; ');

        // ── COMPUTE FINAL TOTAL ────────────────────────────────────────────────
        const totalDiscount = approvedDiscount + approvedCouponDiscount;
        const serverTotal = Math.max(0, serverSubtotal - totalDiscount);

        // Strip client-supplied financial fields — we recompute them
        const {
            created_by: _cb,
            discount: _d,
            total: _t,
            subtotal: _s,
            platform_commission_amount: _pc,
            restaurant_earnings: _re,
            coupon_code: _cc,
            synced: _synced,
            created_at: offlineCreatedAt,
            ...safeOrderData
        } = offlineOrderData;

        const order = await base44.asServiceRole.entities.Order.create({
            ...safeOrderData,
            items: verifiedItems,
            subtotal: serverSubtotal,
            discount: totalDiscount,
            discount_reason_code: approvedDiscount > 0 ? discountReasonCode : undefined,
            coupon_code: approvedCouponCode || undefined,
            total: serverTotal,
            offline_created: true,
            offline_created_at: offlineCreatedAt || new Date().toISOString(),
            offline_synced_at: new Date().toISOString(),
            needs_review: needsReview,
            sync_validation_notes: syncValidationNotes || undefined,
            status: 'confirmed',
        });

        // Increment coupon usage_count server-side
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
                console.error(`[OFFLINE-SYNC-COUPON] Failed to increment usage_count for coupon ${approvedCouponId} on order ${order.id}:`, couponErr.message);
            }
        }

        // Audit log
        const discountSource = approvedCouponCode ? `coupon:${approvedCouponCode}` : (approvedDiscount > 0 ? `manual_discount:${discountReasonCode}` : 'none');
        console.log(`[OFFLINE-SYNC] Order synced: ${order.id} restaurant=${offlineOrderData.restaurant_id} total=£${serverTotal.toFixed(2)} discount_source=${discountSource} needs_review=${needsReview} by=${user.email}`);

        return Response.json({
            order,
            needs_review: needsReview,
            validation_notes: syncValidationNotes || undefined,
        });
    } catch (error) {
        console.error('[OFFLINE-SYNC] Error syncing offline order:', error);
        return Response.json({ error: 'Sync failed. Please try again.' }, { status: 500 });
    }
});