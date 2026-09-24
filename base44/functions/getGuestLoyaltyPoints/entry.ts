/**
 * Public endpoint: look up loyalty points balance by phone number.
 * Used by guests on the TrackOrder page to see their points balance.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Loyalty phone identity: MIRROR of src/lib/loyalty-identity.js.
// Points were awarded under one normalisation and looked up under another, so
// a customer who typed +44... was told they had no points. One rule, everywhere.
function normalizeUkPhone(phone) {
    let digits = String(phone ?? '').replace(/\D/g, '');
    if (!digits) return '';

    // International dialling prefix, e.g. 0044…
    if (digits.startsWith('00')) digits = digits.slice(2);

    // UK country code in any remaining form, e.g. 447123456789
    if (digits.startsWith('44') && digits.length >= 11) {
        digits = '0' + digits.slice(2);
    }

    // A UK national number without its leading 0, e.g. 7123456789
    if (digits.length === 10 && digits.startsWith('7')) {
        digits = '0' + digits;
    }

    // Too short to be real - treat as no number rather than inventing a key
    // that several different customers could collide on.
    return digits.length >= 9 ? digits : '';
}

function phoneLoyaltyKey(phone) {
    const n = normalizeUkPhone(phone);
    return n ? `phone:${n}` : null;
}

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

        // Coerce to string first to prevent crash if number is passed
        // Same rule as awarding - these two disagreed, so a customer who typed
        // their number in international form was shown a balance of zero.
        let normalizedPhone = normalizeUkPhone(phone);

        // If orderId provided, verify phone matches order (security check)
        if (orderId) {
            const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
            if (!orders?.length) {
                return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404 });
            }
            const order = orders[0];
            // Normalised the same way, or a customer whose order stored
            // "+447..." is told their own phone "does not match" and refused.
            const orderPhone = normalizeUkPhone(order.phone ?? order.customer_phone ?? order.guest_phone);

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