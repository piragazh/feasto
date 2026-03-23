import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Get all non-expired earned transactions
        const oldTransactions = await base44.asServiceRole.entities.LoyaltyTransaction.filter({
            transaction_type: 'earned',
            is_expired: false
        });

        const now = new Date();
        const expiredTransactions = oldTransactions.filter(t => {
            // Expire if expires_at is set and has passed
            if (t.expires_at) return new Date(t.expires_at) < now;
            // Fallback: expire if created more than 1 year ago (and no explicit expires_at)
            const oneYearAgo = new Date(now - 365 * 24 * 60 * 60 * 1000);
            return new Date(t.created_date) < oneYearAgo;
        });

        let expiredCount = 0;
        const userPointsMap = {};

        // Mark transactions as expired and track points to deduct per user
        for (const transaction of expiredTransactions) {
            await base44.asServiceRole.entities.LoyaltyTransaction.update(transaction.id, {
                is_expired: true
            });

            // Track points to deduct per user (only positive earned points)
            const pts = Math.abs(transaction.points || 0);
            if (pts > 0) {
                if (!userPointsMap[transaction.user_email]) userPointsMap[transaction.user_email] = 0;
                userPointsMap[transaction.user_email] += pts;
            }
            expiredCount++;
        }

        // Update loyalty points for each affected user
        for (const userEmail in userPointsMap) {
            const userPoints = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email: userEmail });
            if (userPoints.length > 0) {
                const loyaltyRecord = userPoints[0];
                const pointsToDeduct = userPointsMap[userEmail];
                const newTotal = Math.max(0, (loyaltyRecord.total_points || 0) - pointsToDeduct);
                
                // Tier still based on lifetime earned - expiry doesn't change tier
                const totalEarned = loyaltyRecord.points_earned || 0;
                let tier = 'bronze';
                if (totalEarned >= 3000) tier = 'platinum';
                else if (totalEarned >= 1500) tier = 'gold';
                else if (totalEarned >= 500) tier = 'silver';

                await base44.asServiceRole.entities.LoyaltyPoints.update(loyaltyRecord.id, {
                    total_points: newTotal,
                    tier
                });

                // Create expiration transaction record
                await base44.asServiceRole.entities.LoyaltyTransaction.create({
                    user_email: userEmail,
                    transaction_type: 'expired',
                    points: -pointsToDeduct,
                    description: `${pointsToDeduct} points expired`
                });
            }
        }

        // Deactivate expired reward coupons
        const allCoupons = await base44.asServiceRole.entities.Coupon.list();
        let deactivatedCount = 0;

        for (const coupon of allCoupons) {
            if (coupon.expires_at && new Date(coupon.expires_at) < now && coupon.is_active) {
                await base44.asServiceRole.entities.Coupon.update(coupon.id, { is_active: false });
                deactivatedCount++;
            }
        }

        return Response.json({
            success: true,
            message: 'Expiration processing complete',
            expired_points_transactions: expiredCount,
            deactivated_coupons: deactivatedCount
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});