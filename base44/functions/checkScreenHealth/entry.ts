import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get all active screens
        const screens = await base44.asServiceRole.entities.Screen.filter({ is_active: true });
        
        const now = new Date();
        const offlineScreens = [];
        
        for (const screen of screens) {
            const lastHeartbeat = screen.last_heartbeat ? new Date(screen.last_heartbeat) : null;
            const heartbeatInterval = screen.heartbeat_interval || 60;
            
            let newStatus = 'offline';
            let shouldNotify = false;
            
            if (lastHeartbeat) {
                const secondsSinceHeartbeat = (now - lastHeartbeat) / 1000;
                
                if (secondsSinceHeartbeat <= heartbeatInterval * 2) {
                    newStatus = 'online';
                } else if (secondsSinceHeartbeat <= heartbeatInterval * 4) {
                    newStatus = 'warning';
                } else {
                    newStatus = 'offline';
                    
                    // Check if we need to notify
                    if (!screen.notification_sent || screen.health_status !== 'offline') {
                        shouldNotify = true;
                        offlineScreens.push(screen);
                    }
                }
            }
            
            // Update screen status if changed
            if (screen.health_status !== newStatus) {
                const updates = {
                    health_status: newStatus
                };
                
                // Track when screen went offline
                if (newStatus === 'offline' && screen.health_status !== 'offline') {
                    updates.last_offline_time = now.toISOString();
                    updates.notification_sent = false;
                }
                
                // Reset notification flag when back online
                if (newStatus === 'online') {
                    updates.notification_sent = false;
                }
                
                await base44.asServiceRole.entities.Screen.update(screen.id, updates);
            }
            
            // Send notification if screen went offline
            if (shouldNotify) {
                try {
                    // Get restaurant managers
                    const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                        restaurant_ids: screen.restaurant_id,
                        is_active: true
                    });
                    
                    // Get restaurant admins
                    const restaurant = await base44.asServiceRole.entities.Restaurant.filter({
                        id: screen.restaurant_id
                    });
                    
                    const restaurantName = restaurant[0]?.name || 'Unknown';
                    
                    // Send notifications to managers
                    for (const manager of managers) {
                        await base44.asServiceRole.entities.Notification.create({
                            user_email: manager.user_email,
                            title: '⚠️ Screen Offline Alert',
                            message: `Screen "${screen.screen_name}" at ${restaurantName} has gone offline. Last seen: ${lastHeartbeat ? new Date(lastHeartbeat).toLocaleString() : 'Never'}`,
                            type: 'screen_offline',
                            priority: 'high',
                            is_read: false,
                            metadata: {
                                screen_id: screen.id,
                                screen_name: screen.screen_name,
                                restaurant_id: screen.restaurant_id
                            }
                        });
                    }
                    
                    // Mark notification as sent
                    await base44.asServiceRole.entities.Screen.update(screen.id, {
                        notification_sent: true
                    });
                } catch (notifError) {
                    console.error('Failed to send notification:', notifError);
                }
            }
            
            // Calculate uptime percentage (last 24 hours)
            if (lastHeartbeat) {
                const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                const totalSeconds = 24 * 60 * 60;
                
                let uptimeSeconds = totalSeconds;
                if (screen.last_offline_time) {
                    const offlineTime = new Date(screen.last_offline_time);
                    if (offlineTime > twentyFourHoursAgo) {
                        const offlineDuration = (now - offlineTime) / 1000;
                        uptimeSeconds = Math.max(0, totalSeconds - offlineDuration);
                    }
                }
                
                const uptimePercentage = (uptimeSeconds / totalSeconds) * 100;
                
                await base44.asServiceRole.entities.Screen.update(screen.id, {
                    uptime_percentage: uptimePercentage
                });
            }
        }
        
        return Response.json({
            success: true,
            total_screens: screens.length,
            offline_screens: offlineScreens.length,
            notifications_sent: offlineScreens.filter(s => !s.notification_sent).length
        });
    } catch (error) {
        console.error('Screen health check error:', error);
        return Response.json({ 
            error: error.message,
            stack: error.stack 
        }, { status: 500 });
    }
});