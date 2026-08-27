import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const MANAGER_MAX_PCT   = 20;   // %  — above this requires admin
const MANAGER_MAX_FIXED = 20;   // £  — above this requires admin

const VALID_DISCOUNT_REASON_CODES = [
    'customer_complaint',
    'staff_meal',
    'loyalty_gesture',
    'promotional_event',
    'pricing_error_correction',
    'manager_discretion',
    'other',
];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { order_id, updates } = await req.json();

        if (!order_id || !updates) {
            return Response.json({ error: 'order_id and updates required' }, { status: 400 });
        }

        // CRITICAL TENANT CHECK: fetch the order first and verify ownership
        const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
        if (!orders || orders.length === 0) {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }
        const existingOrder = orders[0];

        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(existingOrder.restaurant_id));
            if (!hasAccess) {
                console.error(`[SECURITY] ${user.email} attempted to update order ${order_id} belonging to restaurant ${existingOrder.restaurant_id}`);
                return Response.json({ error: 'Access denied to this order' }, { status: 403 });
            }
        }

        // Strip immutable fields — never allow spoofing of owner or restaurant
        const {
            restaurant_id: _rid,
            created_by: _cb,
            payment_intent_id: _pi,
            idempotency_key: _ik,
            // Financial fields must not be modified directly via posUpdateOrder
            total: _total,
            subtotal: _subtotal,
            platform_commission_amount: _comm,
            restaurant_earnings: _earn,
            ...safeUpdates
        } = updates;

        // Cancellation must go through posVoidOrder (has audit + reason requirement)
        if (safeUpdates.status === 'cancelled') {
            return Response.json({
                error: 'Use posVoidOrder to cancel orders. A reason code is required.',
            }, { status: 400 });
        }

        // ── Discount handling with reason code + threshold + audit ───────────────
        // When items or discount change, we recompute subtotal and total server-side.
        const hasItemsUpdate = Array.isArray(safeUpdates.items);
        const hasDiscountUpdate = 'discount' in safeUpdates;

        if (hasDiscountUpdate) {
            const reasonCode = safeUpdates.discount_reason_code;
            if (!reasonCode || !VALID_DISCOUNT_REASON_CODES.includes(reasonCode)) {
                return Response.json({
                    error: 'A valid discount_reason_code is required when applying a discount',
                    valid_codes: VALID_DISCOUNT_REASON_CODES,
                }, { status: 400 });
            }

            const newDiscount = parseFloat(safeUpdates.discount) || 0;
            if (newDiscount < 0) {
                return Response.json({ error: 'Discount cannot be negative' }, { status: 400 });
            }

            // Compute the discount as a percentage of subtotal for threshold check
            const baseSubtotal = hasItemsUpdate
                ? safeUpdates.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
                : (existingOrder.subtotal || 0);
            const discountPct = baseSubtotal > 0 ? (newDiscount / baseSubtotal) * 100 : 0;

            const exceedsThreshold = newDiscount > MANAGER_MAX_FIXED || discountPct > MANAGER_MAX_PCT;
            if (exceedsThreshold && user.role !== 'admin') {
                console.warn(`[POS-ORDER-EDIT] Discount threshold exceeded by ${user.email}: £${newDiscount} (${discountPct.toFixed(1)}%) — requires admin`);
                return Response.json({
                    error: `Discounts above £${MANAGER_MAX_FIXED} or ${MANAGER_MAX_PCT}% require admin approval`,
                    requires_admin: true,
                }, { status: 403 });
            }

            // Audit log the discount
            try {
                await base44.asServiceRole.entities.DashboardActivity.create({
                    user_email: user.email,
                    action: 'POS_ORDER_DISCOUNT_EDITED',
                    resource_type: 'Order',
                    resource_id: order_id,
                    details: JSON.stringify({
                        restaurant_id: existingOrder.restaurant_id,
                        order_id,
                        old_discount: existingOrder.discount || 0,
                        new_discount: newDiscount,
                        subtotal: baseSubtotal,
                        reason_code: reasonCode,
                        actor_role: user.role === 'admin' ? 'admin' : 'manager',
                        exceeded_threshold: exceedsThreshold,
                    }),
                    severity: exceedsThreshold ? 'high' : 'info',
                });
            } catch (dbErr) {
                console.warn('[AUDIT] Could not persist POS order edit discount audit log:', dbErr.message);
            }
        }

        // ── Server-side total recompute when items or discount change ─────────────
        if (hasItemsUpdate || hasDiscountUpdate) {
            const finalItems = hasItemsUpdate ? safeUpdates.items : (existingOrder.items || []);
            const recomputedSubtotal = finalItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const finalDiscount = hasDiscountUpdate ? (parseFloat(safeUpdates.discount) || 0) : (existingOrder.discount || 0);
            const deliveryFee = existingOrder.delivery_fee || 0;
            const smallOrderSurcharge = existingOrder.small_order_surcharge || 0;
            const recomputedTotal = Math.max(0, recomputedSubtotal + deliveryFee + smallOrderSurcharge - finalDiscount);

            safeUpdates.subtotal = parseFloat(recomputedSubtotal.toFixed(2));
            safeUpdates.total = parseFloat(recomputedTotal.toFixed(2));
        }

        const order = await base44.asServiceRole.entities.Order.update(order_id, safeUpdates);

        // Lightweight audit for status transitions
        if (safeUpdates.status && safeUpdates.status !== existingOrder.status) {
            console.log(`[AUDIT] ORDER_STATUS_CHANGED: actor=${user.email} order=${order_id} from=${existingOrder.status} to=${safeUpdates.status}`);
        }

        return Response.json({ order });
    } catch (error) {
        console.error('[posUpdateOrder] error:', error.message);
        return Response.json({ error: 'Order update failed. Please try again.' }, { status: 500 });
    }
});