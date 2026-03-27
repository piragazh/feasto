/**
 * enforceRateLimiting
 *
 * Thin wrapper called from the Checkout page BEFORE verifyAndCreateOrder.
 * Delegates the full velocity check (per-user burst + platform burst +
 * duplicate basket) to orderVelocityThrottle, which is the authoritative
 * handler and the one that mirrors src/lib/order-logic.js.
 *
 * Kept as a separate entry point so the Checkout page can call it without
 * passing orderData (pre-submit check), while verifyAndCreateOrder calls
 * orderVelocityThrottle with the full payload for a more precise check.
 *
 * Business logic here (per-user burst only — no order data available yet):
 *   - same 5-orders-per-minute limit as orderVelocityThrottle
 *   - mirrors src/lib/order-logic.js: checkPerUserBurst
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/** Mirrors order-logic.js: checkPerUserBurst */
function checkPerUserBurst(recentOrders, limit = 5) {
    const count = Array.isArray(recentOrders) ? recentOrders.length : 0;
    if (count < limit) return { blocked: false, retryAfter: 0 };
    const now = Date.now();
    const oldest = recentOrders.slice().sort((a, b) => new Date(a.created_date) - new Date(b.created_date))[0];
    const retryAfter = Math.max(1, Math.ceil((new Date(oldest.created_date).getTime() + 60_000 - now) / 1000));
    return { blocked: true, retryAfter };
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            // Guest pre-submit check: no user context available yet, allow through.
            // Full guest throttling happens in orderVelocityThrottle using guest_email/phone.
            return new Response(JSON.stringify({ allowed: true }), { status: 200 });
        }

        const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
        const recentOrders = await base44.asServiceRole.entities.Order.filter({
            created_by: user.email,
            created_date: { $gt: oneMinuteAgo }
        });

        // Delegates to shared pure function — same logic tested in src/lib/__tests__/abuse-controls.test.js
        const { blocked, retryAfter } = checkPerUserBurst(recentOrders);

        if (blocked) {
            return new Response(
                JSON.stringify({
                    allowed: false,
                    error: 'Too many orders. Please wait before placing another order.',
                    retryAfter,
                    ordersThisMinute: recentOrders.length
                }),
                { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
        }

        return new Response(
            JSON.stringify({ allowed: true, ordersThisMinute: recentOrders.length }),
            { status: 200 }
        );

    } catch (error) {
        console.error('[RATE_LIMIT] enforceRateLimiting error:', error);
        return new Response(
            JSON.stringify({ error: 'Rate limit check failed' }),
            { status: 500 }
        );
    }
});