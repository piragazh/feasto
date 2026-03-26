/**
 * Rate limiting middleware for orders
 * Prevents users from creating more than 5 orders per minute
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

        // CRITICAL SECURITY: Max 5 orders per minute with dynamic retry calculation
         if (orderCount >= 5) {
             // Calculate precise retry-after based on oldest order
             const oldestOrder = recentOrders.sort((a, b) => 
                 new Date(a.created_date).getTime() - new Date(b.created_date).getTime()
             )[0];

             const oldestTime = new Date(oldestOrder.created_date).getTime();
             const retryAfter = Math.max(1, Math.ceil((oldestTime + 60000 - Date.now()) / 1000));

             return new Response(
                 JSON.stringify({ 
                     allowed: false,
                     error: 'Too many orders. Please wait before placing another order.',
                     retryAfter: retryAfter,
                     ordersThisMinute: orderCount
                 }),
                 { status: 429, headers: { 'Retry-After': String(retryAfter) } }
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