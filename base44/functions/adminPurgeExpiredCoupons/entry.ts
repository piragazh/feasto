import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * adminPurgeExpiredCoupons — "Clear expired coupons" button.
 *
 * Moves to the trash every coupon whose expiry date has passed AND that was never used.
 * Coupons with no expiry date, or used at least once (part of order history), are kept.
 * Trashed records can be restored from Base44 "Recently deleted".
 *
 * Body: { restaurant_id?: string, dry_run?: boolean }
 *   restaurant_id  only that restaurant's coupons; allowed for Super Admin or a manager of it
 *   (none)         every coupon on the platform; Super Admin only
 *   dry_run        count only, delete nothing
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const { restaurant_id = null, dry_run = false } = await req.json().catch(() => ({}));

        if (user.role !== 'admin') {
            if (!restaurant_id) return Response.json({ error: 'Super Admin only' }, { status: 403 });
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({ user_email: user.email, is_active: true });
            if (!managers.some(m => (m.restaurant_ids || []).includes(restaurant_id))) {
                return Response.json({ error: 'Access denied to this restaurant' }, { status: 403 });
            }
        }

        const today = new Date().toISOString().slice(0, 10);
        const query = { valid_until: { $lt: today, $gt: '2000-01-01' }, usage_count: { $in: [0, null] } };
        if (restaurant_id) query.restaurant_id = restaurant_id;
        const db = base44.asServiceRole.entities;

        const matches = [];
        for (let skip = 0; ; skip += 500) {
            const page = await db.Coupon.filter(query, 'created_date', 500, skip);
            matches.push(...page);
            if (page.length < 500) break;
        }
        // Double-check each one in code: must have an expiry in the past and no recorded use.
        const safe = matches.filter(c => !(Number(c.usage_count) > 0) && c.valid_until && c.valid_until < today
            && (!restaurant_id || c.restaurant_id === restaurant_id));
        const summary = { today, restaurant_id, matched: safe.length, codes: safe.slice(0, 20).map(c => c.code) };
        if (dry_run) return Response.json({ dry_run: true, ...summary });

        let deleted = 0;
        for (let i = 0; i < safe.length; i += 100) {
            const r = await db.Coupon.deleteMany({ id: { $in: safe.slice(i, i + 100).map(c => c.id) } });
            deleted += r?.deleted || 0;
        }
        console.log('[adminPurgeExpiredCoupons]', JSON.stringify({ by: user.email, restaurant_id, matched: safe.length, deleted }));
        return Response.json({ success: true, ...summary, deleted });
    } catch (error) {
        console.error('[adminPurgeExpiredCoupons] Error:', error?.message);
        return Response.json({ error: error?.message }, { status: 500 });
    }
});
