import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * adminPurgeExpiredCoupons — admin only. Moves to the trash every coupon that has an expiry date
 * in the past AND was never used. Coupons with no expiry, or used at least once, are kept
 * (used ones are part of order history). Trashed records can be restored from "Recently deleted".
 * Body: { dry_run?: boolean }
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (user?.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const { dry_run = false } = await req.json().catch(() => ({}));
        const today = new Date().toISOString().slice(0, 10);
        const query = { valid_until: { $lt: today, $gt: '2000-01-01' }, usage_count: { $in: [0, null] } };
        const db = base44.asServiceRole.entities;

        const matches = [];
        for (let skip = 0; ; skip += 500) {
            const page = await db.Coupon.filter(query, 'created_date', 500, skip);
            matches.push(...page);
            if (page.length < 500) break;
        }
        const safe = matches.filter(c => !(Number(c.usage_count) > 0) && c.valid_until && c.valid_until < today);
        const summary = {
            today,
            matched: safe.length,
            win_back_codes: safe.filter(c => String(c.code).startsWith('WB-')).length,
            other_codes: safe.filter(c => !String(c.code).startsWith('WB-')).map(c => `${c.code} (until ${c.valid_until})`),
        };
        if (dry_run) return Response.json({ dry_run: true, ...summary });

        let deleted = 0;
        for (let i = 0; i < safe.length; i += 100) {
            const ids = safe.slice(i, i + 100).map(c => c.id);
            const r = await db.Coupon.deleteMany({ id: { $in: ids } });
            deleted += r?.deleted || 0;
        }
        console.log('[adminPurgeExpiredCoupons]', JSON.stringify({ ...summary, deleted }));
        return Response.json({ success: true, ...summary, deleted });
    } catch (error) {
        console.error('[adminPurgeExpiredCoupons] Error:', error?.message);
        return Response.json({ error: error?.message }, { status: 500 });
    }
});
