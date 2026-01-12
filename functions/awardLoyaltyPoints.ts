import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { orderId } = await req.json();

        if (!orderId) {
            return Response.json({ error: 'Order ID required' }, { status: 400 });
        }

        // Get order details
        const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
        if (!orders || orders.length === 0) {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }

        const order = orders[0];

        // Check if points already awarded
        if (order.loyalty_points_awarded) {
            return Response.json({ message: 'Points already awarded' });
        }

        // Only award points for delivered/collected orders
        if (!['delivered', 'collected'].includes(order.status)) {
            return Response.json({ error: 'Order must be completed' }, { status: 400 });
        }

        const pointsToAward = order.loyalty_points_earned || 0;
        if (pointsToAward <= 0) {
            return Response.json({ message: 'No points to award' });
        }

        const userEmail = order.created_by;

        // Get or create loyalty points record
        let loyaltyPoints = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email: userEmail });
        
        if (!loyaltyPoints || loyaltyPoints.length === 0) {
            // Create new
            loyaltyPoints = await base44.asServiceRole.entities.LoyaltyPoints.create({
                user_email: userEmail,
                total_points: pointsToAward,
                points_earned: pointsToAward,
                points_redeemed: 0,
                orders_count: 1,
                tier: 'bronze'
            });
        } else {
            // Update existing
            const current = loyaltyPoints[0];
            const newTotalEarned = (current.points_earned || 0) + pointsToAward;
            const newTotal = (current.total_points || 0) + pointsToAward;
            const newOrdersCount = (current.orders_count || 0) + 1;

            // Determine tier based on total earned
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
        }

        // Create transaction record
        await base44.asServiceRole.entities.LoyaltyTransaction.create({
            user_email: userEmail,
            transaction_type: 'earned',
            points: pointsToAward,
            order_id: orderId,
            restaurant_id: order.restaurant_id,
            restaurant_name: order.restaurant_name,
            description: `Earned ${pointsToAward} points from order at ${order.restaurant_name}`
        });

        // Mark order as awarded
        await base44.asServiceRole.entities.Order.update(orderId, {
            loyalty_points_awarded: true
        });

        return Response.json({
            success: true,
            pointsAwarded: pointsToAward
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});