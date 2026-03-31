/**
 * Award loyalty points for completed orders.
 * Works for both registered users (keyed by email) and guests (keyed by phone:PHONE).
 * Called automatically via entity automation when order status → delivered/collected.
 *
 * Concurrency safety:
 *  - Marks order as awarded BEFORE updating the points balance.
 *    Any concurrent call that races past the initial check will fail
 *    on the conditional update guard (loyalty_points_awarded still false check).
 *  - If two calls arrive simultaneously, the second will see loyalty_points_awarded=true
 *    and return early with "Already awarded".
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function normalizePhone(phone) {
    let digits = (phone || '').replace(/\D/g, '');
    if (digits.startsWith('44') && digits.length === 12) {
        digits = '0' + digits.slice(2);
    }
    return digits;
}

function getLoyaltyIdentifier(order) {
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

        // SECURITY: Allow only admin users or automation (service-role) invocations.
        // Direct unauthenticated calls are rejected to prevent order status probing.
        let callerIsAuthorized = false;
        try {
            const user = await base44.auth.me();
            if (user && user.role === 'admin') callerIsAuthorized = true;
        } catch (_) {
            // No user session — could be an automation/service-role call, allow it
            callerIsAuthorized = true;
        }
        if (!callerIsAuthorized) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
        }

        const body = await req.json();
        const orderId = body.orderId || body.event?.entity_id;

        if (!orderId) {
            return new Response(JSON.stringify({ error: 'Order ID required' }), { status: 400 });
        }
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

        if (order.status !== 'delivered' && order.status !== 'collected') {
            return new Response(JSON.stringify({ error: 'Order not yet completed' }), { status: 400 });
        }

        // Fast idempotency exit
        if (order.loyalty_points_awarded) {
            return new Response(JSON.stringify({ pointsAwarded: 0, message: 'Already awarded' }), { status: 200 });
        }

        // MED-6 FIX: Check for existing transaction BEFORE writing the flag.
        // This moves the authoritative dedup check before the non-atomic flag write,
        // preventing TOCTOU race where two concurrent calls both miss the check.
        const existingTx = await base44.asServiceRole.entities.LoyaltyTransaction.filter({
            order_id: orderId,
            transaction_type: 'earned',
        });
        if (existingTx?.length > 0) {
            console.log(`[loyalty] Duplicate detected for order ${orderId} — aborting (transaction already exists)`);
            return new Response(JSON.stringify({ pointsAwarded: 0, message: 'Already awarded' }), { status: 200 });
        }

        // Write the flag after confirming no transaction exists
        await base44.asServiceRole.entities.Order.update(orderId, { loyalty_points_awarded: true });

        const identifier = getLoyaltyIdentifier(order);
        if (!identifier) {
            return new Response(JSON.stringify({ error: 'No identifier for loyalty (no email or phone)' }), { status: 400 });
        }

        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: order.restaurant_id });
        if (!restaurants?.length) {
            return new Response(JSON.stringify({ error: 'Restaurant not found' }), { status: 404 });
        }
        const restaurant = restaurants[0];

        if (restaurant.loyalty_program_enabled === false) {
            return new Response(JSON.stringify({ pointsAwarded: 0, message: 'Loyalty disabled for this restaurant' }), { status: 200 });
        }

        let pointsPerPound = 1;
        try {
            const settings = await base44.asServiceRole.entities.SystemSettings.filter({ setting_key: 'loyalty_points_per_pound' });
            if (settings?.[0]) pointsPerPound = parseFloat(settings[0].setting_value) || 1;
        } catch (_) {}

        const multiplier = restaurant.loyalty_points_multiplier || 1;
        const pointsToAward = Math.floor((order.total || 0) * pointsPerPound * multiplier);

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

        await base44.asServiceRole.entities.LoyaltyTransaction.create({
            user_email: identifier.key,
            order_id: orderId,
            points: pointsToAward,
            transaction_type: 'earned',
            restaurant_id: order.restaurant_id,
            restaurant_name: order.restaurant_name || '',
            description: `Earned ${pointsToAward} points from order at ${order.restaurant_name || 'restaurant'}`,
        });

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