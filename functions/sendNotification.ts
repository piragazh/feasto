import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { userId, title, message, type, orderId } = await req.json();

        // Store notification in database for in-app notifications
        await base44.asServiceRole.entities.Notification.create({
            user_email: userId,
            title,
            message,
            type,
            order_id: orderId,
            is_read: false
        });

        // Send browser push notification if supported
        // In production, you would use a service like Firebase Cloud Messaging
        // or OneSignal for actual push notifications

        return Response.json({ 
            success: true,
            message: 'Notification sent'
        });
    } catch (error) {
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});