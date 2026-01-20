import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Get all non-expired transactions that were earned more than 1 year ago
        const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
        const oldTransactions = await base44.entities.LoyaltyTransaction.filter({
            transaction_type: 'earned',
            is_expired: false
        });

        const expiredTransactions = oldTransactions.filter(t => {
            if (!t.expires_at) return false;
            return new Date(t.expires_at) < new Date();
        });

        let expiredCount = 0;
        const userPointsMap = {};

        // Mark transactions as expired and track points to deduct per user
        for (const transaction of expiredTransactions) {
            await base44.entities.LoyaltyTransaction.update(transaction.id, {
                is_expired: true
            });

            // Track points to deduct per user
            if (!userPointsMap[transaction.user_email]) {
                userPointsMap[transaction.user_email] = 0;
            }
            userPointsMap[transaction.user_email] += transaction.points;
            expiredCount++;
        }

        // Update loyalty points for each user
        for (const userEmail in userPointsMap) {
            const userPoints = await base44.entities.LoyaltyPoints.filter({ user_email: userEmail });
            if (userPoints.length > 0) {
                const loyaltyRecord = userPoints[0];
                const newTotal = Math.max(0, loyaltyRecord.total_points - userPointsMap[userEmail]);
                
                await base44.entities.LoyaltyPoints.update(loyaltyRecord.id, {
                    total_points: newTotal
                });

                // Create expiration record
                await base44.entities.LoyaltyTransaction.create({
                    user_email: userEmail,
                    transaction_type: 'expired',
                    points: -userPointsMap[userEmail],
                    description: `${userPointsMap[userEmail]} points expired after 1 year`
                });
            }
        }

        // Deactivate expired coupons
        const allCoupons = await base44.entities.Coupon.list();
        let deactivatedCount = 0;

        for (const coupon of allCoupons) {
            if (coupon.expires_at && new Date(coupon.expires_at) < new Date() && coupon.is_active) {
                await base44.entities.Coupon.update(coupon.id, {
                    is_active: false
                });
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