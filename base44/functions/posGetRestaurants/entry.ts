import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Sensitive fields stripped from restaurant data when returned to non-admin users
const SENSITIVE_FIELDS = [
    'printer_config', 'kiosk_config', 'commission_rate', 'commission_type',
    'fixed_commission_amount', 'onboarding_token', 'alert_phone',
    'whatsapp_alerts_enabled', 'sms_alerts_enabled', 'sms_notification_settings',
];

function stripSensitiveFields(restaurant) {
    const safe = { ...restaurant };
    SENSITIVE_FIELDS.forEach(f => delete safe[f]);
    return safe;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { restaurant_id } = await req.json();

        if (restaurant_id) {
            // Single restaurant lookup
            const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurant_id });
            const restaurant = restaurants[0] || null;

            if (!restaurant) {
                return Response.json({ restaurant: null });
            }

            // Non-admin: must be assigned manager of this restaurant to get full data
            if (user.role !== 'admin') {
                const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                    user_email: user.email,
                    is_active: true
                });
                const hasAccess = managers.some(m => m.restaurant_ids?.includes(restaurant_id));
                // Return full data to managers, stripped data for others (e.g. kiosk public lookup)
                return Response.json({ restaurant: hasAccess ? restaurant : stripSensitiveFields(restaurant) });
            }

            return Response.json({ restaurant });
        } else {
            // List all — only admins may list all restaurants with full data
            if (user.role !== 'admin') {
                // Managers only get their own assigned restaurants (stripped)
                const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                    user_email: user.email,
                    is_active: true
                });
                const assignedIds = managers.flatMap(m => m.restaurant_ids || []);
                if (assignedIds.length === 0) {
                    return Response.json({ restaurants: [] });
                }
                // Fetch only assigned restaurants
                const all = await base44.asServiceRole.entities.Restaurant.list();
                const scoped = all.filter(r => assignedIds.includes(r.id));
                return Response.json({ restaurants: scoped });
            }

            const restaurants = await base44.asServiceRole.entities.Restaurant.list();
            return Response.json({ restaurants });
        }
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});