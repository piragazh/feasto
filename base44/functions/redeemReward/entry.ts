import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { reward_id } = await req.json();

        // Get reward details
        const rewards = await base44.entities.LoyaltyReward.filter({ id: reward_id });
        const targetReward = rewards[0];

        if (!targetReward) {
            return Response.json({ error: 'Reward not found' }, { status: 404 });
        }

        // Get user's loyalty points
        const userPoints = await base44.entities.LoyaltyPoints.filter({ user_email: user.email });
        const loyaltyRecord = userPoints[0];

        if (!loyaltyRecord || loyaltyRecord.total_points < targetReward.points_required) {
            return Response.json({ error: 'Insufficient points' }, { status: 400 });
        }

        // Deduct points — recalculate tier after deduction
        const newTotal = loyaltyRecord.total_points - targetReward.points_required;
        const totalEarned = loyaltyRecord.points_earned || 0; // tier is based on lifetime earned, not current balance
        let newTier = 'bronze';
        if (totalEarned >= 3000) newTier = 'platinum';
        else if (totalEarned >= 1500) newTier = 'gold';
        else if (totalEarned >= 500) newTier = 'silver';

        await base44.entities.LoyaltyPoints.update(loyaltyRecord.id, {
            total_points: newTotal,
            points_redeemed: (loyaltyRecord.points_redeemed || 0) + targetReward.points_required,
            tier: newTier
        });

        // Generate unique coupon code
        const couponCode = `REWARD-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        
        // Map reward_type to coupon discount_type
        let couponDiscountType = 'percentage';
        if (targetReward.reward_type === 'fixed_discount') couponDiscountType = 'fixed';
        else if (targetReward.reward_type === 'percentage_discount') couponDiscountType = 'percentage';
        else if (targetReward.reward_type === 'free_delivery') couponDiscountType = 'fixed'; // handled at checkout level

        // Create coupon record - scoped to this user via restaurant_id trick:
        // We store user_email in a dedicated field by using the description uniquely,
        // and set a restaurant_id of "loyalty_user_<email>" so we can filter by user
        await base44.entities.Coupon.create({
            code: couponCode,
            description: `Reward: ${targetReward.name}`,
            discount_type: couponDiscountType,
            discount_value: targetReward.discount_value || 0,
            is_active: true,
            valid_until: expiresAt.split('T')[0],
            expires_at: expiresAt,
            // Tag coupon with user email so they can only see their own
            restaurant_id: `loyalty_user_${user.email}`
        });

        // Record transaction
        await base44.entities.LoyaltyTransaction.create({
            user_email: user.email,
            transaction_type: 'redeemed',
            points: targetReward.points_required,
            description: `Redeemed: ${targetReward.name}`,
            reward_id: reward_id
        });

        return Response.json({ 
            success: true, 
            message: `Successfully redeemed ${targetReward.name}!`,
            new_balance: newTotal,
            reward: targetReward,
            coupon_code: couponCode
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});