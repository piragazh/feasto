/**
 * redeemGuestReward — spend points earned as a guest, identified by phone
 *
 * Most customers never register, so points earned by phone were unreachable:
 * redeemReward requires a signed-in account. A guest could accumulate points
 * forever and never spend them, which is worse than having no scheme at all.
 *
 * WHAT PROTECTS IT
 *   A phone number is not a password, so this cannot be made theft-proof and is
 *   not pretended to be. What it does:
 *     - the coupon is OWNED by that phone (loyalty_owner), so it can only be
 *       used on an order placed with that number
 *     - it is single use and short lived
 *     - points are deducted BEFORE the coupon exists, so a failure can never
 *       hand out a coupon that was not paid for
 *   The residual risk - someone ordering with a stranger's number - is bounded
 *   by one reward, which is the trade the owner accepted for a checkout with no
 *   codes or logins in the way.
 *
 * SYNC RULE: normalizeUkPhone / phoneLoyaltyKey mirror src/lib/loyalty-identity.js.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Loyalty phone identity: MIRROR of src/lib/loyalty-identity.js.
function normalizeUkPhone(phone) {
    let digits = String(phone ?? '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('44') && digits.length >= 11) {
        digits = '0' + digits.slice(2);
    }
    if (digits.length === 10 && digits.startsWith('7')) {
        digits = '0' + digits;
    }
    return digits.length >= 9 ? digits : '';
}

function phoneLoyaltyKey(phone) {
    const n = normalizeUkPhone(phone);
    return n ? `phone:${n}` : null;
}

const REWARD_COUPON_HOURS = 24;

Deno.serve(async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    try {
        const base44 = createClientFromRequest(req);
        const { phone, reward_id, restaurant_id } = await req.json();

        const key = phoneLoyaltyKey(phone);
        if (!key || !reward_id) {
            return Response.json({ error: 'A phone number and a reward are required' }, { status: 400 });
        }

        const rewards = await base44.asServiceRole.entities.LoyaltyReward.filter({ id: reward_id });
        const reward = rewards?.[0];
        if (!reward || reward.is_active === false) {
            return Response.json({ error: 'That reward is no longer available' }, { status: 404 });
        }
        if (reward.restaurant_id && restaurant_id && reward.restaurant_id !== restaurant_id) {
            return Response.json({ error: 'That reward is not available here' }, { status: 403 });
        }

        const cost = Math.floor(Number(reward.points_required || 0));
        const rows = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email: key });
        const record = rows?.[0];
        const balance = Math.floor(Number(record?.total_points || 0));
        if (!record || balance < cost) {
            return Response.json({
                error: `You need ${cost} points for this reward. You have ${balance}.`,
                balance,
            }, { status: 400 });
        }

        // Deduct FIRST. If creating the coupon then fails the points are put
        // back; doing it the other way round could hand out a reward that was
        // never paid for, which is the costlier mistake.
        await base44.asServiceRole.entities.LoyaltyPoints.update(record.id, {
            total_points: balance - cost,
            points_redeemed: Math.floor(Number(record.points_redeemed || 0)) + cost,
        });

        const code = `RW-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        const expiresAt = new Date(Date.now() + REWARD_COUPON_HOURS * 3600 * 1000).toISOString();
        let couponDiscountType = 'fixed';
        if (reward.reward_type === 'percentage_discount') couponDiscountType = 'percentage';

        try {
            await base44.asServiceRole.entities.Coupon.create({
                code,
                description: `Reward: ${reward.name}`,
                discount_type: couponDiscountType,
                discount_value: reward.discount_value || 0,
                is_active: true,
                usage_limit: 1,
                usage_count: 0,
                valid_until: expiresAt.split('T')[0],
                expires_at: expiresAt,
                // Only usable on an order placed with this phone number.
                loyalty_owner: key,
                restaurant_id: reward.restaurant_id || restaurant_id || null,
            });
        } catch (couponErr) {
            await base44.asServiceRole.entities.LoyaltyPoints.update(record.id, {
                total_points: balance,
                points_redeemed: Math.floor(Number(record.points_redeemed || 0)),
            });
            console.error(`[LOYALTY] guest redemption rolled back for ${key}: ${couponErr?.message}`);
            return Response.json({ error: 'Could not create your reward. Your points have not been used.' }, { status: 500 });
        }

        try {
            await base44.asServiceRole.entities.LoyaltyTransaction.create({
                user_email: key,
                transaction_type: 'redeemed',
                points: cost,
                restaurant_id: reward.restaurant_id || restaurant_id || undefined,
                description: `Redeemed: ${reward.name}`,
                reward_id,
            });
        } catch { /* the coupon exists and points are spent - a missing log entry must not fail it */ }

        console.log(`[LOYALTY] guest ${key} redeemed ${reward.name} for ${cost} points -> ${code}`);
        return Response.json({
            success: true,
            code,
            reward_name: reward.name,
            points_spent: cost,
            balance: balance - cost,
            expires_at: expiresAt,
        });
    } catch (error) {
        console.error('[LOYALTY] guest redemption error:', error?.message || error);
        return Response.json({ error: 'Could not redeem that reward' }, { status: 500 });
    }
});
