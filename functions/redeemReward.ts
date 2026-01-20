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
        const reward = await base44.entities.LoyaltyReward.list();
        const targetReward = reward.find(r => r.id === reward_id);

        if (!targetReward) {
            return Response.json({ error: 'Reward not found' }, { status: 404 });
        }

        // Get user's loyalty points
        const userPoints = await base44.entities.LoyaltyPoints.filter({ user_email: user.email });
        const loyaltyRecord = userPoints[0];

        if (!loyaltyRecord || loyaltyRecord.total_points < targetReward.points_required) {
            return Response.json({ error: 'Insufficient points' }, { status: 400 });
        }

        // Deduct points
        const newTotal = loyaltyRecord.total_points - targetReward.points_required;
        await base44.entities.LoyaltyPoints.update(loyaltyRecord.id, {
            total_points: newTotal,
            points_redeemed: (loyaltyRecord.points_redeemed || 0) + targetReward.points_required
        });

        // Record transaction
        await base44.entities.LoyaltyTransaction.create({
            user_email: user.email,
            transaction_type: 'redeemed',
            points: targetReward.points_required,
            description: `Redeemed: ${targetReward.name}`,
            reward_id: reward_id
        });

        // Create coupon for user to use on next order
        const couponCode = `REWARD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 30); // Valid for 30 days

        const coupon = await base44.entities.Coupon.create({
            code: couponCode,
            description: `From loyalty reward: ${targetReward.name}`,
            discount_type: targetReward.reward_type === 'percentage_discount' ? 'percentage' : 'fixed',
            discount_value: targetReward.discount_value,
            valid_from: new Date().toISOString().split('T')[0],
            valid_until: validUntil.toISOString().split('T')[0],
            usage_limit: 1,
            is_active: true,
            assigned_to_user_email: user.email,
            loyalty_reward_id: reward_id
        });

        return Response.json({ 
            success: true, 
            message: `Successfully redeemed ${targetReward.name}! You received a discount coupon: ${couponCode}`,
            new_balance: newTotal,
            reward: targetReward,
            coupon: coupon
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});