/**
 * Order Velocity Throttle
 *
 * What this does:
 *   1. Per-user burst limit  — max 5 orders per 60 seconds per authenticated user (email)
 *   2. Guest phone burst     — max 5 orders per 60 seconds per normalised guest phone
 *   3. Platform-wide burst   — max 30 orders per 60 seconds across ALL users (circuit breaker)
 *   4. Duplicate basket guard — blocks re-submission of an identical basket to the same
 *      restaurant within 90 seconds (catches accidental double-taps and frontend retries)
 *
 * What this does NOT do:
 *   TRUE per-IP rate limiting is NOT implemented here.
 *   The Order entity does not store client IP addresses, so filtering by IP is not possible
 *   at the application layer. To add real per-IP controls, IP must be captured and stored
 *   on the Order entity at creation time (or enforced by an upstream reverse proxy / CDN rule).
 *
 * Available signals used: user.email, guest_email/phone (normalised), restaurant_id, item fingerprint, created_date
 *
 * SYNC RULE: normalizePhone and basketFingerprint are mirrored in lib/order-logic.js.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Normalise UK phone to digits-only E.164-ish form.
// Mirrors normalizePhone() in lib/order-logic.js.
const normalizePhone = (phone) => {
    if (!phone || typeof phone !== 'string') return null;
    let digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('07') && digits.length === 11) digits = '44' + digits.slice(1);
    return digits.length >= 10 ? digits : null;
};

// Stable fingerprint of a basket: restaurant + sorted item IDs + quantities
const basketFingerprint = (orderData) => {
    if (!orderData?.items?.length) return null;
    const sorted = [...orderData.items]
        .sort((a, b) => (a.menu_item_id || '').localeCompare(b.menu_item_id || ''))
        .map(i => `${i.menu_item_id}:${i.quantity || 1}`)
        .join('|');
    return `${orderData.restaurant_id}::${sorted}`;
};

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        let user = null;
        try { user = await base44.auth.me(); } catch (_) { /* guest — proceed without user */ }

        const { orderData } = await req.json();

        const normalizedGuestPhone = !user?.email ? normalizePhone(orderData?.phone) : null;

        // Determine the actor identifier (authenticated user email, or normalised guest phone/email)
        const actorId = user?.email || orderData?.guest_email || normalizedGuestPhone || null;

        const now = Date.now();
        const windowStart60s = new Date(now - 60_000).toISOString();
        const windowStart90s = new Date(now - 90_000).toISOString();

        // ── 1. Per-user burst limit ──────────────────────────────────────────────
        if (actorId) {
            // For authenticated users query created_by; for guests query guest_email
            const userFilter = user?.email
                ? { created_by: user.email, created_date: { $gt: windowStart60s } }
                : { guest_email: actorId, created_date: { $gt: windowStart60s } };
            const recentByUser = await base44.asServiceRole.entities.Order.filter(userFilter);

            const userCount = Array.isArray(recentByUser) ? recentByUser.length : 0;

            if (userCount >= 5) {
                const oldest = recentByUser
                    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))[0];
                const retryAfter = Math.max(1, Math.ceil(
                    (new Date(oldest.created_date).getTime() + 60_000 - now) / 1000
                ));
                console.warn(`[VELOCITY] User ${actorId} hit per-user burst limit (${userCount} in 60s)`);
                return new Response(
                    JSON.stringify({
                        allowed: false,
                        reason: 'per_user_burst',
                        error: 'Too many orders. Please wait a moment before placing another.',
                        retryAfter
                    }),
                    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
                );
            }
        }

        // ── 2. Guest phone burst limit ───────────────────────────────────────────
        // For guest checkouts: check the normalised phone number independently.
        // This catches rotating-email abuse where the attacker keeps the same phone.
        // Authenticated users already covered by #1 (email-based).
        if (!user?.email && normalizedGuestPhone) {
            const recentByPhone = await base44.asServiceRole.entities.Order.filter({
                phone: normalizedGuestPhone,
                created_date: { $gt: windowStart60s }
            });
            const phoneCount = Array.isArray(recentByPhone) ? recentByPhone.length : 0;
            if (phoneCount >= 5) {
                const oldest = recentByPhone
                    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))[0];
                const retryAfter = Math.max(1, Math.ceil(
                    (new Date(oldest.created_date).getTime() + 60_000 - Date.now()) / 1000
                ));
                console.warn(`[VELOCITY] Guest phone ${normalizedGuestPhone} hit burst limit (${phoneCount} in 60s)`);
                return new Response(
                    JSON.stringify({ allowed: false, reason: 'guest_phone_burst', error: 'Too many orders. Please wait a moment before placing another.', retryAfter }),
                    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
                );
            }
        }

        // ── 4. Platform-wide burst circuit breaker ───────────────────────────────
        // NOTE: This is a global safety valve, not per-IP. A sudden spike in platform-wide
        // order creation (e.g. from a bot farm) will trip this threshold.
        const recentAll = await base44.asServiceRole.entities.Order.filter({
            created_date: { $gt: windowStart60s }
        });
        const platformCount = Array.isArray(recentAll) ? recentAll.length : 0;

        if (platformCount >= 30) {
            console.warn(`[VELOCITY] Platform-wide burst threshold hit (${platformCount} orders in 60s)`);
            return new Response(
                JSON.stringify({
                    allowed: false,
                    reason: 'platform_burst',
                    error: 'High order volume detected. Please try again in a moment.',
                    retryAfter: 30
                }),
                { status: 429, headers: { 'Retry-After': '30' } }
            );
        }

        // ── 5. Duplicate basket fingerprint guard ────────────────────────────────
        // Catches accidental double-submits or aggressive frontend retries.
        // Compares basket fingerprint (restaurant + item IDs + quantities) within 90 seconds.
        if (actorId && orderData) {
            const fingerprint = basketFingerprint(orderData);

            if (fingerprint) {
                const recentByUserForRestaurant = await base44.asServiceRole.entities.Order.filter({
                    created_by: actorId,
                    restaurant_id: orderData.restaurant_id,
                    created_date: { $gt: windowStart90s }
                });

                const duplicate = (recentByUserForRestaurant || []).find(o => {
                    return basketFingerprint(o) === fingerprint;
                });

                if (duplicate) {
                    console.warn(`[VELOCITY] Duplicate basket blocked for ${actorId}, fingerprint=${fingerprint}, existing order=${duplicate.id}`);
                    return new Response(
                        JSON.stringify({
                            allowed: false,
                            reason: 'duplicate_basket',
                            error: 'This order looks like a duplicate. Please wait 90 seconds before re-submitting.',
                            existing_order_id: duplicate.id,
                            retryAfter: 90
                        }),
                        { status: 429, headers: { 'Retry-After': '90' } }
                    );
                }
            }
        }

        return new Response(
            JSON.stringify({
                allowed: true,
                userOrdersThisMinute: actorId ? undefined : 0,
                platformOrdersThisMinute: platformCount
            }),
            { status: 200 }
        );

    } catch (error) {
        console.error('[VELOCITY] orderVelocityThrottle error:', error);
        // Fail open — do not block legitimate orders on internal error
        return new Response(
            JSON.stringify({ allowed: true, warning: 'Throttle check failed' }),
            { status: 200 }
        );
    }
});