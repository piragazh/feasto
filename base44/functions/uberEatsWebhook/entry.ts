import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    console.log('Uber Eats webhook received:', JSON.stringify(body).slice(0, 500));

    // Verify Uber Eats client secret — ALWAYS enforce when secret is configured
    const clientSecret = Deno.env.get('UBER_EATS_CLIENT_SECRET');
    if (clientSecret) {
        const authHeader = req.headers.get('Authorization') || '';
        const uberSig = req.headers.get('x-uber-signature') || '';
        const providedSecret = authHeader.replace('Bearer ', '').replace('Basic ', '').trim();

        const signatureValid = (providedSecret && providedSecret === clientSecret) ||
                               (uberSig && uberSig === clientSecret);
        if (!signatureValid) {
            console.error('Uber Eats webhook: invalid or missing signature');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        const base44 = createClientFromRequest(req);

        const uberOrder = body.order || body;
        const uberOrderId = uberOrder.id || uberOrder.order_id || body.resource_id || `UE-${Date.now()}`;

        // ── DEDUP: use a deterministic third_party_order_id ─────────────────
        // Check BEFORE creating — rapid webhook retries from Uber Eats can race here.
        // We also store third_party_order_id and rely on it as the dedup key.
        const existing = await base44.asServiceRole.entities.Order.filter({ third_party_order_id: uberOrderId });
        if (existing && existing.length > 0) {
            console.log(`[DEDUP] Duplicate Uber Eats order ${uberOrderId}, skipping creation`);
            return Response.json({ received: true, duplicate: true, order_id: existing[0].id });
        }

        // Map items
        const items = (uberOrder.cart?.items || uberOrder.items || []).map(item => ({
            menu_item_id: item.id || '',
            name: item.title || item.name || 'Item',
            price: parseFloat(((item.price?.unit_price?.amount || item.base_price || 0) / 100).toFixed(2)),
            quantity: item.quantity || 1,
            customizations: (item.selected_modifier_groups || []).reduce((acc, g) => {
                acc[g.title || g.id] = (g.selected_items || []).map(i => i.title || i.name).join(', ');
                return acc;
            }, {})
        }));

        const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const total = parseFloat(((uberOrder.payment?.charges?.total_food_and_beverage?.amount || subtotal * 100) / 100).toFixed(2));
        const deliveryFee = parseFloat(((uberOrder.payment?.charges?.delivery_fee?.amount || 0) / 100).toFixed(2));

        // Match restaurant by store_id saved during integration setup
        let restaurantId = 'uber_eats_unassigned';
        const storeId = uberOrder.restaurant?.id || uberOrder.store_id || body.resource_id || '';
        if (storeId) {
            const allRestaurants = await base44.asServiceRole.entities.Restaurant.list();
            const matched = allRestaurants.find(r =>
                r.third_party_integrations?.uber_eats?.store_id === storeId
            );
            if (matched) restaurantId = matched.id;
        }

        const mealDropOrder = {
            restaurant_id: restaurantId,
            items,
            subtotal: parseFloat(subtotal.toFixed(2)),
            delivery_fee: deliveryFee,
            discount: 0,
            total,
            payment_method: 'card',
            order_type: 'delivery',
            status: 'pending',
            delivery_address: [
                uberOrder.delivery_address?.street_address,
                uberOrder.delivery_address?.city,
                uberOrder.delivery_address?.postal_code
            ].filter(Boolean).join(', '),
            phone: uberOrder.eater?.phone_number || '',
            notes: uberOrder.special_instructions || '',
            guest_name: uberOrder.eater
                ? `${uberOrder.eater.first_name || ''} ${uberOrder.eater.last_name || ''}`.trim()
                : 'Uber Eats Customer',
            third_party_platform: 'uber_eats',
            third_party_order_id: uberOrderId,  // dedup key — stored on create
            order_number: `UE-${String(uberOrderId).slice(-6).toUpperCase()}`,
        };

        const created = await base44.asServiceRole.entities.Order.create(mealDropOrder);
        console.log(`✅ MealDrop order created: ${created.id} from Uber Eats: ${uberOrderId}`);

        return Response.json({ received: true, order_id: created.id });
    } catch (error) {
        console.error('Error processing webhook:', error.message);
        // Always return 200 so Uber Eats doesn't retry indefinitely
        return Response.json({ received: true, processing_error: error.message });
    }
});