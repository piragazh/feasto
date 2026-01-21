import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * Component that monitors order status and sends notifications for delivery milestones
 */
export default function DeliveryMilestoneNotifier({ order }) {
    const previousStatus = useRef(order.status);
    const hasRequested = useRef(false);

    // Request notification permission on mount
    useEffect(() => {
        if ('Notification' in window && !hasRequested.current) {
            if (Notification.permission === 'default') {
                Notification.requestPermission();
            }
            hasRequested.current = true;
        }
    }, []);

    // Monitor status changes and send notifications
    useEffect(() => {
        if (previousStatus.current !== order.status) {
            handleStatusChange(order.status, order);
            previousStatus.current = order.status;
        }
    }, [order.status, order]);

    const handleStatusChange = (newStatus, orderData) => {
        const notifications = {
            confirmed: {
                title: 'Order Confirmed! ✅',
                body: `Your order from ${orderData.restaurant_name} has been confirmed.`,
                toast: true,
                push: true
            },
            preparing: {
                title: 'Preparing Your Order 👨‍🍳',
                body: `The restaurant is now preparing your order.`,
                toast: true,
                push: true
            },
            out_for_delivery: {
                title: 'Driver is On the Way! 🚴',
                body: `Your order is now out for delivery. Track your driver in real-time.`,
                toast: true,
                push: true,
                sound: true
            },
            ready_for_collection: {
                title: 'Ready for Collection! 📦',
                body: `Your order is ready for pickup at ${orderData.restaurant_name}.`,
                toast: true,
                push: true,
                sound: true
            },
            delivered: {
                title: 'Order Delivered! 🎉',
                body: 'Your order has been successfully delivered. Enjoy your meal!',
                toast: true,
                push: true,
                sound: true
            },
            collected: {
                title: 'Order Collected! 🎉',
                body: 'Thank you for collecting your order. Enjoy your meal!',
                toast: true,
                push: true
            }
        };

        const notification = notifications[newStatus];
        if (!notification) return;

        // Show toast notification
        if (notification.toast) {
            if (notification.sound) {
                toast.success(notification.title, {
                    description: notification.body,
                    duration: 5000
                });
            } else {
                toast.info(notification.title, {
                    description: notification.body,
                    duration: 4000
                });
            }
        }

        // Send browser push notification
        if (notification.push && 'Notification' in window) {
            if (Notification.permission === 'granted') {
                try {
                    const pushNotification = new Notification(notification.title, {
                        body: notification.body,
                        icon: '/icon-192.png',
                        badge: '/icon-192.png',
                        tag: `order-${orderData.id}-${newStatus}`,
                        requireInteraction: notification.sound,
                        silent: !notification.sound
                    });

                    // Auto-close after 10 seconds
                    setTimeout(() => pushNotification.close(), 10000);

                    // Handle click to open app
                    pushNotification.onclick = () => {
                        window.focus();
                        pushNotification.close();
                    };
                } catch (error) {
                    console.error('Push notification error:', error);
                }
            }
        }

        // Send to database for notification history
        try {
            base44.functions.invoke('sendNotification', {
                userId: orderData.created_by,
                title: notification.title,
                message: notification.body,
                type: newStatus,
                orderId: orderData.id
            });
        } catch (error) {
            console.error('Failed to save notification:', error);
        }
    };

    return null; // This is a logical component with no UI
}