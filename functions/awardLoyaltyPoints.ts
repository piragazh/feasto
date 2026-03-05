import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        console.log('🎁 Starting loyalty points award process...');

        // Authenticate - only admins or the scheduler can invoke this
        // (no user auth needed for scheduled job context)

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

                // Use created_by only if it's a real authenticated user (not anonymous/guest)
                const createdBy = order.created_by;
                const isAnonymous = !createdBy || 
                    createdBy.includes('anonymous') || 
                    createdBy.startsWith('guest') ||
                    createdBy === 'undefined' ||
                    createdBy === 'null';

                const userEmail = isAnonymous ? null : createdBy;

                if (!userEmail) {
                    console.log(`⚠️ Skipping order ${order.id} - no authenticated user (anonymous/guest)`);
                    // Mark as awarded so it's not retried endlessly
                    await base44.asServiceRole.entities.Order.update(order.id, { loyalty_points_awarded: true });
                    continue;
                }

                // Get or create loyalty points record
                const loyaltyPoints = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email: userEmail });

                if (!loyaltyPoints || loyaltyPoints.length === 0) {
                    // Calculate tier even for new records
                    let initialTier = 'bronze';
                    if (pointsToAward >= 3000) initialTier = 'platinum';
                    else if (pointsToAward >= 1500) initialTier = 'gold';
                    else if (pointsToAward >= 500) initialTier = 'silver';

                    // Create new loyalty record
                    await base44.asServiceRole.entities.LoyaltyPoints.create({
                        user_email: userEmail,
                        total_points: pointsToAward,
                        points_earned: pointsToAward,
                        points_redeemed: 0,
                        orders_count: 1,
                        tier: initialTier
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

                // Create transaction record — set expires_at 1 year from now
                const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
                await base44.asServiceRole.entities.LoyaltyTransaction.create({
                    user_email: userEmail,
                    transaction_type: 'earned',
                    points: pointsToAward,
                    order_id: order.id,
                    restaurant_id: order.restaurant_id,
                    restaurant_name: order.restaurant_name,
                    description: `Earned ${pointsToAward} points from order at ${order.restaurant_name}`,
                    expires_at: expiresAt,
                    is_expired: false
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