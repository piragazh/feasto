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

    // Verify Uber Eats client secret — ALWAYS required, fail closed if not configured
    const clientSecret = Deno.env.get('UBER_EATS_CLIENT_SECRET');
    if (!clientSecret) {
        console.error('[SECURITY] UBER_EATS_CLIENT_SECRET not set — rejecting all webhook requests');
        return Response.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const uberSig = req.headers.get('x-uber-signature') || '';
    const providedSecret = authHeader.replace('Bearer ', '').replace('Basic ', '').trim();

    const signatureValid = (providedSecret && providedSecret === clientSecret) ||
                           (uberSig && uberSig === clientSecret);
    if (!signatureValid) {
        console.error('Uber Eats webhook: invalid or missing signature');
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
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

        // Match restaurant by store_id saved during integration setup.
        //
        // An unmatched store used to fall back to a fake id ('uber_eats_unassigned'),
        // and the order was created anyway - belonging to a restaurant that does not
        // exist, so it appeared on NOBODY'S kitchen screen and was silently lost.
        // One mistyped store id in settings and a restaurant's Uber orders vanish
        // with no error anywhere.
        //
        // Now it fails loudly and returns 5xx, so Uber RETRIES rather than
        // considering the order delivered to us. A real order is never dropped on
        // the floor because of a configuration mistake.
        const storeId = uberOrder.restaurant?.id || uberOrder.store_id || body.resource_id || '';
        const allRestaurants = await base44.asServiceRole.entities.Restaurant.list();
        const matched = storeId
            ? allRestaurants.find(r => r.third_party_integrations?.uber_eats?.store_id === storeId)
            : null;

        if (!matched) {
            console.error(`[UBER] UNROUTED ORDER uber_order_id=${uberOrderId} store_id=${storeId || '(none supplied)'} — no restaurant has this store id in its Uber Eats integration. Order NOT created; Uber will retry.`);
            try {
                await base44.asServiceRole.entities.DashboardActivity.create({
                    activity_type: 'error',
                    title: 'Uber Eats order could not be routed',
                    description: `An Uber Eats order arrived for store id "${storeId || 'unknown'}" but no restaurant is set up with it. Check the store id in Third-Party Integrations. The order has NOT been accepted.`,
                });
            } catch { /* alerting is best effort - the 5xx is what protects the order */ }
            return Response.json({
                error: 'Store not recognised',
                code: 'STORE_NOT_MAPPED',
                store_id: storeId || null,
            }, { status: 503 });
        }
        const restaurantId = matched.id;

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
            // The canonical channel field. It was never set, so marketplace orders
            // showed no channel badge in the POS queue (which tests
            // order_source === 'third_party') and every report that segments by
            // channel miscounted them. third_party_platform says WHICH platform;
            // this says it came from one at all.
            order_source: 'third_party',
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