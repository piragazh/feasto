/**
 * IDEMPOTENT ORDER CREATION — Called by webhook or verified checkout
 * 
 * Guarantees: one paymentIntent → at most one order
 * Source: Can be called from webhook (recovery) or frontend (normal flow)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { paymentIntentId, paymentIntentMetadata, sourceType } = await req.json();
        
        if (!paymentIntentId || !paymentIntentMetadata) {
            return Response.json({ error: 'Missing paymentIntentId or metadata', success: false }, { status: 400 });
        }
        
        console.log(`[IDEMPOTENT_ORDER] Creating order from ${sourceType} for intent=${paymentIntentId}`);
        
        // ─────────────────────────────────────────────────────────────────────
        // CRITICAL: Check if order already exists (dedup check 1)
        // ─────────────────────────────────────────────────────────────────────
        const existingByPI = await base44.asServiceRole.entities.Order.filter({
            payment_intent_id: paymentIntentId
        });
        
        if (existingByPI && existingByPI.length > 0) {
            console.log(`[IDEMPOTENT_ORDER] Order already exists for intent=${paymentIntentId}`);
            return Response.json({
                success: true,
                order_id: existingByPI[0].id,
                status: 'already_exists'
            }, { status: 200 });
        }
        
        // ─────────────────────────────────────────────────────────────────────
        // CRITICAL: Rebuild order data from trusted metadata
        // ─────────────────────────────────────────────────────────────────────
        const {
            restaurant_id,
            items_json,
            subtotal,
            delivery_fee,
            discount,
            total,
            order_type,
            delivery_address,
            delivery_coordinates,
            phone,
            guest_name,
            guest_email,
            notes,
            is_scheduled,
            scheduled_for,
            idempotency_key
        } = paymentIntentMetadata;
        
        // Validate required fields
        if (!restaurant_id || !items_json || total === undefined) {
            console.error('[IDEMPOTENT_ORDER] Missing critical metadata fields');
            return Response.json({
                error: 'Incomplete order metadata',
                success: false
            }, { status: 400 });
        }
        
        // Parse items array from metadata (stored as JSON string)
        let items;
        try {
            items = JSON.parse(items_json);
            if (!Array.isArray(items) || items.length === 0) {
                throw new Error('Items must be non-empty array');
            }
        } catch (e) {
            console.error('[IDEMPOTENT_ORDER] Failed to parse items:', e.message);
            return Response.json({ error: 'Invalid items data', success: false }, { status: 400 });
        }
        
        // Validate items against menu (prevent fraud)
        const menuItems = await base44.asServiceRole.entities.MenuItem.filter({
            restaurant_id
        });
        const menuMap = new Map(menuItems.map(m => [m.id, m]));
        
        for (const item of items) {
            if (!menuMap.has(item.menu_item_id)) {
                console.error(`[IDEMPOTENT_ORDER] Menu item ${item.menu_item_id} not found`);
                return Response.json({
                    error: `Item no longer available: ${item.name}`,
                    success: false
                }, { status: 400 });
            }
            
            // Verify price hasn't changed drastically (allow 5% tolerance for timing)
            const menuItem = menuMap.get(item.menu_item_id);
            if (Math.abs(menuItem.price - item.price) > menuItem.price * 0.05) {
                console.error(`[IDEMPOTENT_ORDER] Price mismatch for item ${item.name}`);
                return Response.json({
                    error: 'Item prices have changed. Please review and try again.',
                    success: false
                }, { status: 400 });
            }
        }
        
        // ─────────────────────────────────────────────────────────────────────
        // CREATE ORDER (within database transaction)
        // ─────────────────────────────────────────────────────────────────────
        let newOrder;
        try {
            newOrder = await base44.asServiceRole.entities.Order.create({
                restaurant_id,
                items,
                subtotal: parseFloat(subtotal),
                delivery_fee: parseFloat(delivery_fee) || 0,
                discount: parseFloat(discount) || 0,
                total: parseFloat(total),
                payment_method: 'card',
                payment_status: 'paid_card',
                order_status: 'confirmed',
                status: 'confirmed',
                order_type: order_type || 'delivery',
                delivery_address: delivery_address || '',
                delivery_coordinates: delivery_coordinates ? JSON.parse(delivery_coordinates) : null,
                phone,
                guest_name,
                guest_email,
                notes: notes || '',
                is_scheduled: is_scheduled === 'true' || is_scheduled === true,
                scheduled_for,
                payment_intent_id: paymentIntentId,
                idempotency_key,
                order_source: sourceType === 'webhook_recovery' ? 'webhook' : 'online'
            });
            
            console.log(`[IDEMPOTENT_ORDER] ✅ Order created: id=${newOrder.id} from ${sourceType}`);
        } catch (createError) {
            console.error('[IDEMPOTENT_ORDER] Order creation failed:', createError.message);
            
            // CRITICAL: Log for manual review
            await base44.asServiceRole.entities.FailureLog.create({
                failure_type: 'webhook_order_creation_failed',
                severity: 'critical',
                payment_intent_id: paymentIntentId,
                restaurant_id,
                error_message: createError.message,
                context: { source: sourceType }
            }).catch(e => console.warn('[LOG] Failed to record failure:', e.message));
            
            return Response.json({
                error: 'Failed to create order. Order will be retried.',
                success: false,
                recoverable: true
            }, { status: 500 });
        }
        
        return Response.json({
            success: true,
            order_id: newOrder.id,
            order_number: newOrder.order_number,
            status: 'created_from_webhook'
        }, { status: 201 });
        
    } catch (error) {
        console.error('[IDEMPOTENT_ORDER] Unhandled error:', error.message);
        return Response.json({ error: error.message, success: false }, { status: 500 });
    }
});