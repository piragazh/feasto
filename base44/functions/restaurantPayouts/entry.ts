/**
 * A restaurant's own payout statements.
 *
 * The Payout table is admin-read-only (it holds every restaurant's takings), so
 * restaurant screens read through here. Allowed: admins, and active managers
 * whose RestaurantManager.restaurant_ids include the restaurant.
 * Body: { restaurant_id }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const HIDDEN = ['order_ids', 'refund_order_ids', 'generated_by', 'finance_commission_entry_id', 'finance_payment_entry_id'];

Deno.serve(async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Please sign in' }, { status: 401 });
        const { restaurant_id } = await req.json().catch(() => ({}));
        if (!restaurant_id || typeof restaurant_id !== 'string') return Response.json({ error: 'restaurant_id required' }, { status: 400 });

        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({ user_email: user.email, is_active: true });
            if (!(managers || []).some((m) => m.restaurant_ids?.includes(restaurant_id))) {
                console.error(`[SECURITY] ${user.email} tried to read payouts for restaurant ${restaurant_id}`);
                return Response.json({ error: 'Access denied to this restaurant' }, { status: 403 });
            }
        }

        const rows = [];
        for (let skip = 0; skip < 5000; skip += 200) {
            const page = await base44.asServiceRole.entities.Payout.filter({ restaurant_id }, '-period_start', 200, skip);
            rows.push(...(page || []));
            if (!page || page.length < 200) break;
        }
        const payouts = rows.map((p) => {
            const out = { ...p };
            for (const k of HIDDEN) delete out[k];
            return out;
        });
        return Response.json({ success: true, payouts });
    } catch (error) {
        console.error('[restaurantPayouts]', error);
        return Response.json({ error: 'Could not load payouts' }, { status: 500 });
    }
});
