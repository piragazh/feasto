/**
 * Award loyalty points for completed orders
 * CRITICAL: This runs server-side to prevent tampering with points calculation
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        const { orderId } = await req.json();

        if (!orderId) {
            return new Response(JSON.stringify({ error: 'Order ID required' }), { status: 400 });
        }

        // Fetch order details
        const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
        if (!orders || orders.length === 0) {
            return new Response(
                JSON.stringify({ error: 'Order not found' }),
                { status: 404 }
            );
        }

        const order = orders[0];

        // CRITICAL SECURITY: Verify order belongs to authenticated user
        if (order.created_by !== user.email) {
            return new Response(
                JSON.stringify({ error: 'Order does not belong to user' }),
                { status: 403 }
            );
        }

        // CRITICAL: Check if already awarded
        if (order.loyalty_points_awarded) {
            return new Response(
                JSON.stringify({ error: 'Points already awarded for this order' }),
                { status: 400 }
            );
        }

        // Fetch restaurant to check loyalty settings
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({
            id: order.restaurant_id
        });
        
        if (!restaurants || restaurants.length === 0) {
            return new Response(
                JSON.stringify({ error: 'Restaurant not found' }),
                { status: 404 }
            );
        }

        const restaurant = restaurants[0];

        // Check if restaurant has loyalty enabled
        if (restaurant.loyalty_program_enabled === false) {
            return new Response(
                JSON.stringify({ pointsAwarded: 0, message: 'Loyalty disabled' }),
                { status: 200 }
            );
        }

        // Fetch system loyalty points setting
        let pointsPerPound = 1;
        try {
            const settings = await base44.asServiceRole.entities.SystemSettings.filter({
                setting_key: 'loyalty_points_per_pound'
            });
            if (settings && settings[0]) {
                pointsPerPound = parseFloat(settings[0].setting_value) || 1;
            }
        } catch (_) {
            // Use default
        }

        // Calculate points server-side (prevents frontend manipulation)
        // CRITICAL: Use actual total paid, not subtotal (includes all discounts)
        const multiplier = restaurant.loyalty_points_multiplier || 1;
        const orderTotal = order.total || 0;
        const pointsToAward = Math.floor(orderTotal * pointsPerPound * multiplier);

        // Create loyalty transaction record
        try {
            await base44.asServiceRole.entities.LoyaltyTransaction.create({
                user_email: user.email,
                order_id: orderId,
                points: pointsToAward,
                transaction_type: 'order',
                created_date: new Date().toISOString()
            });
        } catch (err) {
            console.error('Failed to create loyalty transaction:', err);
            // Continue anyway - main record is order update
        }

        // Mark order as having points awarded
        await base44.asServiceRole.entities.Order.update(orderId, {
            loyalty_points_awarded: true
        });

        return new Response(
            JSON.stringify({ 
                success: true,
                pointsAwarded: pointsToAward,
                multiplier: multiplier,
                perPound: pointsPerPound
            }),
            { status: 200 }
        );

    } catch (error) {
        console.error('Award loyalty points error:', error);
        return new Response(
            JSON.stringify({ error: 'Points award failed' }),
            { status: 500 }
        );
    }
});