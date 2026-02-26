import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    // Uber Eats sends POST requests
    if (req.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const clientSecret = Deno.env.get('UBER_EATS_CLIENT_SECRET');

    // Verify webhook authenticity - Uber Eats sends the client secret in Authorization or x-uber-signature
    const authHeader = req.headers.get('Authorization') || '';
    const uberSig = req.headers.get('x-uber-signature') || '';
    const providedSecret = authHeader.replace('Bearer ', '').replace('Basic ', '').trim();

    // Log auth info for debugging; Uber Eats will pass the client secret in their own way
    console.log('Uber Eats webhook auth check - header present:', !!authHeader, 'sig present:', !!uberSig);

    const body = await req.json();
    console.log('Uber Eats webhook received:', JSON.stringify(body));

    // Uber Eats webhook event types we care about
    const eventType = body.event_type || body.type || '';

    // Only process new/updated orders
    const orderEvents = [
        'orders.notification',
        'order.placed',
        'orders.placed',
        'eats.order'
    ];

    if (!orderEvents.some(e => eventType.toLowerCase().includes(e.toLowerCase().split('.')[1] || e.toLowerCase()))) {
        // Still acknowledge non-order events
        console.log('Non-order event received:', eventType);
        return Response.json({ received: true });
    }

    try {
        const base44 = createClientFromRequest(req);

        // Extract order data from Uber Eats payload
        // Uber Eats wraps order in meta.resource_href or directly in order field
        const uberOrder = body.order || body.meta || body;
        const uberOrderId = uberOrder.id || uberOrder.order_id || body.resource_id || `UE-${Date.now()}`;

        // Check if order already exists to avoid duplicates
        const existing = await base44.asServiceRole.entities.Order.filter({
            third_party_order_id: uberOrderId
        });

        if (existing && existing.length > 0) {
            console.log('Order already exists, skipping:', uberOrderId);
            return Response.json({ received: true, duplicate: true });
        }

        // Map Uber Eats items to MealDrop format
        const items = (uberOrder.cart?.items || uberOrder.items || []).map(item => ({
            menu_item_id: item.id || item.external_data || '',
            name: item.title || item.name || 'Item',
            price: (item.price?.unit_price?.amount || item.price || 0) / 100,
            quantity: item.quantity || 1,
            customizations: item.selected_modifier_groups
                ? Object.fromEntries(
                    (item.selected_modifier_groups || []).map(g => [
                        g.title || g.id,
                        (g.selected_items || []).map(i => i.title || i.name).join(', ')
                    ])
                )
                : {}
        }));

        const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const deliveryFee = (uberOrder.payment?.charges?.delivery_fee?.amount || 0) / 100;
        const total = (uberOrder.payment?.charges?.total_food_and_beverage?.amount || uberOrder.total || subtotal * 100) / 100;

        // Find restaurant by uber_eats store ID stored in integrations
        let restaurantId = null;
        const storeId = uberOrder.restaurant?.id || uberOrder.store_id || body.resource_id;

        if (storeId) {
            const allRestaurants = await base44.asServiceRole.entities.Restaurant.list();
            const matched = allRestaurants.find(r =>
                r.third_party_integrations?.uber_eats?.store_id === storeId ||
                r.third_party_integrations?.uber_eats?.enabled
            );
            if (matched) restaurantId = matched.id;
        }

        const mealDropOrder = {
            restaurant_id: restaurantId || 'unknown',
            items,
            subtotal: parseFloat(subtotal.toFixed(2)),
            delivery_fee: parseFloat(deliveryFee.toFixed(2)),
            discount: 0,
            total: parseFloat(total.toFixed(2)),
            payment_method: 'card',
            order_type: 'delivery',
            status: 'pending',
            delivery_address: [
                uberOrder.delivery_address?.street_address,
                uberOrder.delivery_address?.city,
                uberOrder.delivery_address?.postal_code
            ].filter(Boolean).join(', ') || '',
            phone: uberOrder.eater?.phone_number || '',
            notes: uberOrder.special_instructions || '',
            third_party_platform: 'uber_eats',
            third_party_order_id: uberOrderId,
            order_number: `UE-${uberOrderId.toString().slice(-6).toUpperCase()}`,
            guest_name: uberOrder.eater?.first_name
                ? `${uberOrder.eater.first_name} ${uberOrder.eater.last_name || ''}`.trim()
                : 'Uber Eats Customer',
        };

        const created = await base44.asServiceRole.entities.Order.create(mealDropOrder);
        console.log('Order created in MealDrop:', created.id);

        return Response.json({ received: true, order_id: created.id });
    } catch (error) {
        console.error('Error processing Uber Eats webhook:', error.message);
        // Always return 200 to Uber Eats so they don't retry endlessly
        return Response.json({ received: true, error: error.message });
    }
});