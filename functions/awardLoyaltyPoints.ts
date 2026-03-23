/**
 * Award loyalty points for completed orders.
 * Works for both registered users (keyed by email) and guests (keyed by phone:PHONE).
 * Called automatically via entity automation when order status → delivered/collected.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

function normalizePhone(phone) {
    // Strip all non-digits for consistent keying
    return (phone || '').replace(/\D/g, '');
}

function getLoyaltyIdentifier(order) {
    // Registered users: use email. Guests/anonymous: use phone:PHONE
    if (order.created_by && order.created_by !== 'anonymous') {
        return { type: 'email', key: order.created_by };
    }
    const phone = normalizePhone(order.phone);
    if (phone) {
        return { type: 'phone', key: `phone:${phone}` };
    }
    return null;
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        // Support both direct call { orderId } and entity automation payload { event: { entity_id } }
        const orderId = body.orderId || body.event?.entity_id;

        if (!orderId) {
            return new Response(JSON.stringify({ error: 'Order ID required' }), { status: 400 });
        }
        // Reject non-string IDs (e.g. numbers) before hitting the database
        if (typeof orderId !== 'string') {
            return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404 });
        }

        let orders;
        try {
            orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
        } catch (_) {
            return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404 });
        }
        if (!orders?.length) {
            return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404 });
        }

        const order = orders[0];

        // Only award for delivered or collected orders
        if (order.status !== 'delivered' && order.status !== 'collected') {
            return new Response(JSON.stringify({ error: 'Order not yet completed' }), { status: 400 });
        }

        // Idempotency: already awarded
        if (order.loyalty_points_awarded) {
            return new Response(JSON.stringify({ pointsAwarded: 0, message: 'Already awarded' }), { status: 200 });
        }

        // Determine identifier
        const identifier = getLoyaltyIdentifier(order);
        if (!identifier) {
            return new Response(JSON.stringify({ error: 'No identifier for loyalty (no email or phone)' }), { status: 400 });
        }

        // Check restaurant loyalty settings
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: order.restaurant_id });
        if (!restaurants?.length) {
            return new Response(JSON.stringify({ error: 'Restaurant not found' }), { status: 404 });
        }
        const restaurant = restaurants[0];

        if (restaurant.loyalty_program_enabled === false) {
            await base44.asServiceRole.entities.Order.update(orderId, { loyalty_points_awarded: true });
            return new Response(JSON.stringify({ pointsAwarded: 0, message: 'Loyalty disabled for this restaurant' }), { status: 200 });
        }

        // Get points rate from system settings
        let pointsPerPound = 1;
        try {
            const settings = await base44.asServiceRole.entities.SystemSettings.filter({ setting_key: 'loyalty_points_per_pound' });
            if (settings?.[0]) pointsPerPound = parseFloat(settings[0].setting_value) || 1;
        } catch (_) {}

        const multiplier = restaurant.loyalty_points_multiplier || 1;
        const pointsToAward = Math.floor((order.total || 0) * pointsPerPound * multiplier);

        // Find or create LoyaltyPoints record for this identifier
        const existing = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email: identifier.key });
        
        if (existing?.length) {
            const record = existing[0];
            const newEarned = (record.points_earned || 0) + pointsToAward;
            const newTotal = (record.total_points || 0) + pointsToAward;
            const newOrdersCount = (record.orders_count || 0) + 1;
            const tier = newTotal >= 500 ? 'gold' : newTotal >= 200 ? 'silver' : 'bronze';
            await base44.asServiceRole.entities.LoyaltyPoints.update(record.id, {
                points_earned: newEarned,
                total_points: newTotal,
                orders_count: newOrdersCount,
                tier,
                phone: identifier.type === 'phone' ? normalizePhone(order.phone) : record.phone,
            });
        } else {
            const tier = pointsToAward >= 500 ? 'gold' : pointsToAward >= 200 ? 'silver' : 'bronze';
            await base44.asServiceRole.entities.LoyaltyPoints.create({
                user_email: identifier.key,
                phone: identifier.type === 'phone' ? normalizePhone(order.phone) : null,
                points_earned: pointsToAward,
                points_redeemed: 0,
                total_points: pointsToAward,
                orders_count: 1,
                tier,
            });
        }

        // Create transaction record
        await base44.asServiceRole.entities.LoyaltyTransaction.create({
            user_email: identifier.key,
            order_id: orderId,
            points: pointsToAward,
            transaction_type: 'earned',
            restaurant_id: order.restaurant_id,
            restaurant_name: order.restaurant_name || '',
            description: `Earned ${pointsToAward} points from order at ${order.restaurant_name || 'restaurant'}`,
        });

        // Mark order as awarded
        await base44.asServiceRole.entities.Order.update(orderId, { loyalty_points_awarded: true });

        console.log(`✅ Awarded ${pointsToAward} points to ${identifier.key} for order ${orderId}`);

        return new Response(JSON.stringify({
            success: true,
            pointsAwarded: pointsToAward,
            identifier: identifier.key,
            identifierType: identifier.type,
        }), { status: 200 });

    } catch (error) {
        console.error('Award loyalty points error:', error);
        return new Response(JSON.stringify({ error: error.message || 'Points award failed' }), { status: 500 });
    }
});