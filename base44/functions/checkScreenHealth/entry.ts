import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * checkScreenHealth — runs every 5 minutes (workflow "Screen Health Check — Every 5 Minutes").
 *
 * Health rules (same as src/components/mediascreen/screenHealth.js):
 *   online   last check-in within 2 × heartbeat interval
 *   warning  within 5 × interval
 *   offline  longer, or never
 *
 * Alerts managers only when a screen goes from online/warning → offline, so
 * screens that were already offline (old test screens) never trigger alerts.
 * Uptime = share of health checks that found the screen online in a rolling 24h window.
 */

const ONLINE_FACTOR = 2;
const WARNING_FACTOR = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const LEGACY_COMMAND_TIMEOUT_MS = 30 * 60 * 1000;

function healthOf(screen, nowMs) {
    if (!screen.last_heartbeat) return 'offline';
    const last = new Date(screen.last_heartbeat).getTime();
    if (!Number.isFinite(last)) return 'offline';
    const interval = Number(screen.heartbeat_interval) || 60;
    const seconds = (nowMs - last) / 1000;
    if (seconds <= interval * ONLINE_FACTOR) return 'online';
    if (seconds <= interval * WARNING_FACTOR) return 'warning';
    return 'offline';
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Logged-in non-admins may not trigger a platform-wide scan
        let user = null;
        try { user = await base44.auth.me(); } catch { user = null; }
        if (user && user.role !== 'admin') {
            return Response.json({ error: 'Not allowed' }, { status: 403 });
        }

        const sr = base44.asServiceRole;
        const screens = await sr.entities.Screen.filter({ is_active: true });
        const now = new Date();
        const nowMs = now.getTime();
        const nowIso = now.toISOString();
        let wentOffline = 0;
        let notificationsCreated = 0;
        let updated = 0;

        for (const screen of screens) {
            try {
                const previous = screen.health_status || 'offline';
                const status = healthOf(screen, nowMs);
                const updates = {};

                // Rolling 24h uptime sample
                const win = screen.uptime_window || {};
                const windowStart = win.window_start ? new Date(win.window_start).getTime() : 0;
                let online = Number(win.online_checks) || 0;
                let total = Number(win.total_checks) || 0;
                let start = win.window_start;
                if (!windowStart || nowMs - windowStart > WINDOW_MS) {
                    // Start a new window, carrying a little history so the % doesn't jump
                    const carry = total > 0 ? online / total : null;
                    total = carry === null ? 0 : 12;
                    online = carry === null ? 0 : Math.round(carry * 12);
                    start = nowIso;
                }
                total += 1;
                if (status === 'online') online += 1;
                const uptime = Math.round((online / total) * 1000) / 10;
                updates.uptime_window = { window_start: start, online_checks: online, total_checks: total };
                if (screen.uptime_percentage !== uptime) updates.uptime_percentage = uptime;

                if (status !== previous) {
                    updates.health_status = status;
                    if (status === 'offline') updates.last_offline_time = nowIso;
                    if (status === 'online') updates.notification_sent = false;
                }

                // Alert only on a real transition into offline
                const justWentOffline = status === 'offline' && previous !== 'offline' && !!screen.last_heartbeat;
                if (justWentOffline && !screen.notification_sent) {
                    wentOffline += 1;
                    try {
                        const [managers, restaurants] = await Promise.all([
                            sr.entities.RestaurantManager.filter({ restaurant_ids: screen.restaurant_id, is_active: true }),
                            sr.entities.Restaurant.filter({ id: screen.restaurant_id }),
                        ]);
                        const restaurantName = restaurants[0]?.name || 'your restaurant';
                        const lastSeen = new Date(screen.last_heartbeat).toLocaleString('en-GB', { timeZone: 'Europe/London' });
                        for (const manager of managers) {
                            await sr.entities.Notification.create({
                                user_email: manager.user_email,
                                title: '⚠️ Screen Offline Alert',
                                message: `Screen "${screen.screen_name}" at ${restaurantName} has gone offline. Last seen: ${lastSeen}`,
                                type: 'screen_offline',
                                priority: 'high',
                                is_read: false,
                                metadata: { screen_id: screen.id, screen_name: screen.screen_name, restaurant_id: screen.restaurant_id },
                            });
                            notificationsCreated += 1;
                        }
                        updates.notification_sent = true;
                    } catch (notifError) {
                        console.error('Failed to send notification:', notifError);
                    }
                }

                // Old single-slot commands nobody picked up (screen off) → clear
                if (screen.pending_command && screen.command_timestamp &&
                    nowMs - new Date(screen.command_timestamp).getTime() > LEGACY_COMMAND_TIMEOUT_MS) {
                    updates.pending_command = null;
                    updates.command_timestamp = null;
                }

                await sr.entities.Screen.update(screen.id, updates);
                updated += 1;
            } catch (screenError) {
                console.error('Health check failed for screen', screen.id, screenError);
            }
        }

        // Time out queued commands nobody picked up
        try {
            const stale = await sr.entities.ScreenCommandLog.filter({ status: 'pending' }, 'created_date', 100);
            await Promise.all(stale
                .filter(l => nowMs - new Date(l.created_date).getTime() > LEGACY_COMMAND_TIMEOUT_MS)
                .map(l => sr.entities.ScreenCommandLog.update(l.id, { status: 'timeout' })));
        } catch (e) {
            console.error('Command timeout sweep failed:', e);
        }

        return Response.json({
            success: true,
            total_screens: screens.length,
            updated,
            went_offline: wentOffline,
            notifications_sent: notificationsCreated,
        });
    } catch (error) {
        console.error('Screen health check error:', error);
        return Response.json({ error: 'Screen health check failed' }, { status: 500 });
    }
});
