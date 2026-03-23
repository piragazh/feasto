import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

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
        const discount = orderData.discount || 0;
        const serverTotal = Math.max(0, serverSubtotal - discount);

        // Strip any attempt to spoof created_by
        const { created_by: _cb, ...safeOrderData } = orderData;

        const order = await base44.asServiceRole.entities.Order.create({
            ...safeOrderData,
            items: verifiedItems,
            subtotal: serverSubtotal,
            total: serverTotal,
            status: 'confirmed',
            payment_method: orderData.payment_method || 'cash',
            order_type: orderData.order_type || 'collection'
        });

        return Response.json({ order });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});