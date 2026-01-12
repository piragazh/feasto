import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        console.log('🎁 Starting loyalty points award process...');

        // Get all completed orders that haven't been awarded points yet
        const completedOrders = await base44.asServiceRole.entities.Order.filter({
            status: { $in: ['delivered', 'collected'] },
            loyalty_points_awarded: false,
            loyalty_points_earned: { $gt: 0 }
        });

        console.log(`📦 Found ${completedOrders.length} orders to process`);

        let successCount = 0;
        let errorCount = 0;

        for (const order of completedOrders) {
            try {
                const pointsToAward = order.loyalty_points_earned || 0;
                if (pointsToAward <= 0) continue;

                const userEmail = order.created_by || order.guest_email;
                if (!userEmail) {
                    console.log(`⚠️ No user email for order ${order.id}`);
                    continue;
                }

                // Get or create loyalty points record
                let loyaltyPoints = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email: userEmail });
                
                if (!loyaltyPoints || loyaltyPoints.length === 0) {
                    // Create new loyalty record
                    await base44.asServiceRole.entities.LoyaltyPoints.create({
                        user_email: userEmail,
                        total_points: pointsToAward,
                        points_earned: pointsToAward,
                        points_redeemed: 0,
                        orders_count: 1,
                        tier: 'bronze'
                    });
                    console.log(`✨ Created new loyalty account for ${userEmail}: ${pointsToAward} points`);
                } else {
                    // Update existing loyalty record
                    const current = loyaltyPoints[0];
                    const newTotalEarned = (current.points_earned || 0) + pointsToAward;
                    const newTotal = (current.total_points || 0) + pointsToAward;
                    const newOrdersCount = (current.orders_count || 0) + 1;

                    // Calculate new tier
                    let newTier = 'bronze';
                    if (newTotalEarned >= 3000) newTier = 'platinum';
                    else if (newTotalEarned >= 1500) newTier = 'gold';
                    else if (newTotalEarned >= 500) newTier = 'silver';

                    await base44.asServiceRole.entities.LoyaltyPoints.update(current.id, {
                        total_points: newTotal,
                        points_earned: newTotalEarned,
                        orders_count: newOrdersCount,
                        tier: newTier
                    });
                    console.log(`✅ Updated ${userEmail}: +${pointsToAward} points (Total: ${newTotal})`);
                }

                // Create transaction record
                await base44.asServiceRole.entities.LoyaltyTransaction.create({
                    user_email: userEmail,
                    transaction_type: 'earned',
                    points: pointsToAward,
                    order_id: order.id,
                    restaurant_id: order.restaurant_id,
                    restaurant_name: order.restaurant_name,
                    description: `Earned ${pointsToAward} points from order at ${order.restaurant_name}`
                });

                // Mark order as awarded
                await base44.asServiceRole.entities.Order.update(order.id, {
                    loyalty_points_awarded: true
                });

                successCount++;
            } catch (error) {
                console.error(`❌ Error processing order ${order.id}:`, error.message);
                errorCount++;
            }
        }

        console.log(`✅ Loyalty points award complete: ${successCount} successful, ${errorCount} errors`);

        return Response.json({
            success: true,
            processed: completedOrders.length,
            successful: successCount,
            errors: errorCount
        });
    } catch (error) {
        console.error('❌ Loyalty points award failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});