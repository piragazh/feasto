/**
 * Rate limiting middleware for orders
 * Prevents users from creating more than 5 orders per minute
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

        // Check orders created in last 60 seconds
        const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
        const recentOrders = await base44.asServiceRole.entities.Order.filter({
            created_by: user.email,
            created_date: { $gt: oneMinuteAgo }
        });

        const orderCount = Array.isArray(recentOrders) ? recentOrders.length : 0;

        // CRITICAL: Max 5 orders per minute
        if (orderCount >= 5) {
            return new Response(
                JSON.stringify({ 
                    error: 'Too many orders. Please wait before placing another order.',
                    retryAfter: 60
                }),
                { status: 429, headers: { 'Retry-After': '60' } }
            );
        }

        return new Response(JSON.stringify({ allowed: true, ordersThisMinute: orderCount }));

    } catch (error) {
        console.error('Rate limit check error:', error);
        return new Response(
            JSON.stringify({ error: 'Rate limit check failed' }),
            { status: 500 }
        );
    }
});