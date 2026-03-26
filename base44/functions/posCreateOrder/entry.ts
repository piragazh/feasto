import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

        const serverTotal = Math.max(0, serverSubtotal - approvedDiscount);

        // Strip any attempt to spoof created_by or inject financial fields directly
        const {
            created_by: _cb,
            discount: _d,
            total: _t,
            subtotal: _s,
            platform_commission_amount: _pc,
            restaurant_earnings: _re,
            ...safeOrderData
        } = orderData;

        const order = await base44.asServiceRole.entities.Order.create({
            ...safeOrderData,
            items: verifiedItems,
            subtotal: serverSubtotal,
            discount: approvedDiscount,
            discount_reason_code: approvedDiscount > 0 ? discountReasonCode : undefined,
            total: serverTotal,
            status: 'confirmed',
            payment_method: orderData.payment_method || 'cash',
            order_type: orderData.order_type || 'collection'
        });

        console.log(`[POS] Order created: ${order.id} restaurant=${orderData.restaurant_id} total=£${serverTotal.toFixed(2)} by=${user.email}`);
        return Response.json({ order });
    } catch (error) {
        console.error('[POS] posCreateOrder error:', error);
        return Response.json({ error: 'Order creation failed. Please try again.' }, { status: 500 });
    }
});