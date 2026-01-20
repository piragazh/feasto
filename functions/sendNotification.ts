import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();

        // Handle automation event payload
        if (body.event && body.event.type === 'update' && body.event.entity_name === 'Order') {
            const orderId = body.event.entity_id;
            const order = body.data;
            const oldOrder = body.old_data;

            // Check if status changed
            if (!oldOrder || order.status === oldOrder.status) {
                return Response.json({ success: true, message: 'No status change' });
            }

            const statusNotifications = {
                confirmed: { title: 'Order Confirmed', message: 'Your order has been confirmed and is being prepared!', type: 'order_confirmed' },
                preparing: { title: 'Preparing Your Order', message: 'The kitchen is preparing your delicious food!', type: 'order_confirmed' },
                out_for_delivery: { title: 'Out for Delivery', message: 'Your order is on the way! Track your driver in real-time.', type: 'out_for_delivery' },
                ready_for_collection: { title: 'Ready for Collection', message: 'Your order is ready! Come pick it up.', type: 'order_confirmed' },
                delivered: { title: 'Order Delivered', message: 'Your order has been delivered. Enjoy your meal!', type: 'delivered' },
                collected: { title: 'Order Collected', message: 'Thank you for collecting your order!', type: 'delivered' },
                cancelled: { title: 'Order Cancelled', message: 'Your order has been cancelled.', type: 'order_cancelled' }
            };

            const notification = statusNotifications[order.status];
            if (notification) {
                const userEmail = order.created_by || order.guest_email;
                
                if (userEmail) {
                    await base44.asServiceRole.entities.Notification.create({
                        user_email: userEmail,
                        title: notification.title,
                        message: notification.message,
                        type: notification.type,
                        order_id: orderId,
                        is_read: false
                    });

                    console.log(`✅ Notification sent for order ${orderId}: ${notification.title}`);
                }
            }

            return Response.json({ success: true, message: 'Notification created' });
        }

        // Handle direct notification request (backward compatibility)
        const { userId, title, message, type, orderId } = body;
        
        await base44.asServiceRole.entities.Notification.create({
            user_email: userId,
            title,
            message,
            type,
            order_id: orderId,
            is_read: false
        });

        return Response.json({ 
            success: true,
            message: 'Notification sent'
        });
    } catch (error) {
        console.error('Notification error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});