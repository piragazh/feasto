/**
 * Public endpoint: look up loyalty points balance by phone number.
 * Used by guests on the TrackOrder page to see their points balance.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const { phone, orderId } = await req.json();

        if (!phone && !orderId) {
            return new Response(JSON.stringify({ error: 'phone or orderId required' }), { status: 400 });
        }

        let normalizedPhone = (phone || '').replace(/\D/g, '');

        // If orderId provided, verify phone matches order (security check)
        if (orderId) {
            const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
            if (!orders?.length) {
                return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404 });
            }
            const order = orders[0];
            const orderPhone = (order.phone || '').replace(/\D/g, '');

            // If phone provided, verify it matches the order
            if (phone && orderPhone !== normalizedPhone) {
                return new Response(JSON.stringify({ error: 'Phone does not match order' }), { status: 403 });
            }
            normalizedPhone = orderPhone;
        }

        if (!normalizedPhone) {
            return new Response(JSON.stringify({ error: 'No valid phone number' }), { status: 400 });
        }

        const identifier = `phone:${normalizedPhone}`;

        // Look up loyalty points record
        const records = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email: identifier });

        if (!records?.length) {
            return new Response(JSON.stringify({
                found: false,
                total_points: 0,
                points_earned: 0,
                points_redeemed: 0,
                orders_count: 0,
                tier: 'bronze',
            }), { status: 200 });
        }

        const record = records[0];

        // Fetch recent transactions
        const transactions = await base44.asServiceRole.entities.LoyaltyTransaction.filter({ user_email: identifier });

        return new Response(JSON.stringify({
            found: true,
            total_points: record.total_points || 0,
            points_earned: record.points_earned || 0,
            points_redeemed: record.points_redeemed || 0,
            orders_count: record.orders_count || 0,
            tier: record.tier || 'bronze',
            transactions: (transactions || []).slice(-5), // last 5
        }), { status: 200 });

    } catch (error) {
        console.error('Guest loyalty lookup error:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});