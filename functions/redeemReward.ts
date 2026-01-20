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

        // Generate unique coupon code
        const couponCode = `REWARD-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        
        // Create coupon record
        await base44.entities.Coupon.create({
            code: couponCode,
            description: `Reward: ${targetReward.name}`,
            discount_type: targetReward.discount_type || 'percentage',
            discount_value: targetReward.discount_value || 10,
            is_active: true,
            valid_until: expiresAt.split('T')[0],
            expires_at: expiresAt
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