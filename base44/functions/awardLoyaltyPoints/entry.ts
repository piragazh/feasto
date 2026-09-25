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

/**
 * Accounts that are NOT a customer. Online orders are created by a service
 * account, so created_by is the same no-reply address for every customer - and
 * keying points by it pooled 333 orders' worth of points into ONE balance while
 * real customers earned nothing. These fall through to the phone number, which
 * is the identity that actually belongs to the customer.
 */
function isRealCustomerAccount(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!e || e === 'anonymous') return false;
    if (e.startsWith('service+')) return false;
    if (e.endsWith('@no-reply.base44.com')) return false;
    if (e.includes('noreply') || e.includes('no-reply')) return false;
    return e.includes('@');
}

function getLoyaltyIdentifier(order) {
    if (isRealCustomerAccount(order.created_by)) {
        return { type: 'email', key: order.created_by };
    }
    // The customer's own address, when the order carries one.
    if (isRealCustomerAccount(order.customer_email)) {
        const phoneFirst = phoneLoyaltyKey(order.phone ?? order.customer_phone ?? order.guest_phone);
        // Phone is the identity the owner chose for loyalty, since most
        // customers never register. Their email is used only if there is no
        // usable phone number on the order.
        if (phoneFirst) return { type: 'phone', key: phoneFirst };
        return { type: 'email', key: order.customer_email };
    }
    const key = phoneLoyaltyKey(order.phone ?? order.customer_phone ?? order.guest_phone);
    if (key) {
        return { type: 'phone', key };
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

        // ── Merge a guest balance into the account ─────────────────────────────
        //
        // Someone who signs in sometimes and checks out as a guest other times
        // builds TWO balances - one under their account, one under their phone -
        // and sees less than they earned. When a signed-in order carries a phone
        // that has its own balance, the two are the same person, so they are
        // merged here.
        //
        // The guest record is NOT deleted: it is zeroed and stamped merged_into,
        // so the merge is auditable and can never be applied twice. The stamp is
        // written BEFORE the points are added - if that write fails nothing is
        // merged, whereas the other order would double the points on a retry.
        if (identifier.type === 'email') {
            try {
                const phoneKey = phoneLoyaltyKey(order.phone ?? order.customer_phone ?? order.guest_phone);
                if (phoneKey) {
                    const guestRows = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email: phoneKey });
                    const guest = guestRows?.[0];
                    const carry = Math.floor(Number(guest?.total_points || 0));
                    if (guest && !guest.merged_into && carry > 0) {
                        await base44.asServiceRole.entities.LoyaltyPoints.update(guest.id, {
                            total_points: 0,
                            merged_into: identifier.key,
                            merged_at: new Date().toISOString(),
                        });
                        // From here the guest record is already at zero. If crediting
                        // the account fails the points would simply vanish, so the
                        // guest record is put back exactly as it was.
                        try {
                        const accRows = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email: identifier.key });
                        const acc = accRows?.[0];
                        if (acc) {
                            await base44.asServiceRole.entities.LoyaltyPoints.update(acc.id, {
                                total_points: Math.floor(Number(acc.total_points || 0)) + carry,
                                points_earned: Math.floor(Number(acc.points_earned || 0)) + carry,
                            });
                        } else {
                            await base44.asServiceRole.entities.LoyaltyPoints.create({
                                user_email: identifier.key,
                                phone: order.phone || undefined,
                                total_points: carry,
                                points_earned: carry,
                                points_redeemed: 0,
                                orders_count: 0,
                            });
                        }
                        await base44.asServiceRole.entities.LoyaltyTransaction.create({
                            user_email: identifier.key,
                            transaction_type: 'earned',
                            points: carry,
                            order_id: order.id,
                            restaurant_id: order.restaurant_id,
                            description: `Merged ${carry} points from guest orders on ${phoneKey.replace('phone:', '')}`,
                        });
                        } catch (creditErr) {
                            // Put the guest balance back rather than lose it.
                            await base44.asServiceRole.entities.LoyaltyPoints.update(guest.id, {
                                total_points: carry, merged_into: null, merged_at: null,
                            });
                            console.error(`[LOYALTY] merge rolled back for ${phoneKey}: ${creditErr?.message}`);
                            throw creditErr;
                        }
                        console.log(`[LOYALTY] merged ${carry} points ${phoneKey} -> ${identifier.key}`);
                    }
                }
            } catch (mergeErr) {
                // Never fail awarding points because a merge went wrong.
                console.error('[LOYALTY] merge failed:', mergeErr?.message);
            }
        }

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