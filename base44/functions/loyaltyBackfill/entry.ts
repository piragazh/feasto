/**
 * loyaltyBackfill — redistribute points pooled under a service account
 *
 * Online orders are created by a service account, so created_by was the same
 * no-reply address for every customer. Keying loyalty points by it pooled
 * hundreds of orders' worth of points into ONE balance while the customers who
 * earned them got nothing.
 *
 * Awarding is fixed going forward. This repairs the history.
 *
 * ALWAYS DRY RUN FIRST
 *   { "dry_run": true }  → reports exactly what would change, writes NOTHING.
 *   { "dry_run": false, "confirm": "YES" } → performs it.
 *
 * SAFETY
 *   - Only orders that actually earned points are counted (revenue statuses);
 *     cancelled and refunded orders are skipped.
 *   - Each order is credited at most once: a marker on the order (loyalty_backfilled)
 *     means a second run cannot double anyone's points.
 *   - Each credit is written as a LoyaltyTransaction, so every point is traceable
 *     and can be reversed.
 *   - The pooled balance is reduced by exactly what is redistributed, never below
 *     zero, and is left in place rather than deleted.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const REVENUE_STATUSES = ['confirmed', 'preparing', 'ready_for_collection', 'out_for_delivery', 'delivered', 'collected'];

// MIRROR of src/lib/loyalty-identity.js
function normalizeUkPhone(phone) {
    let digits = String(phone ?? '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('44') && digits.length >= 11) digits = '0' + digits.slice(2);
    if (digits.length === 10 && digits.startsWith('7')) digits = '0' + digits;
    return digits.length >= 9 ? digits : '';
}
const phoneLoyaltyKey = (p) => { const n = normalizeUkPhone(p); return n ? `phone:${n}` : null; };

Deno.serve(async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const dryRun = body.dry_run !== false;
        const pooledKey = String(body.pooled_key || '').trim();
        if (!pooledKey) return Response.json({ error: 'pooled_key is required' }, { status: 400 });
        if (!dryRun && body.confirm !== 'YES') {
            return Response.json({ error: 'Set confirm:"YES" to perform the backfill' }, { status: 400 });
        }

        const settings = await base44.asServiceRole.entities.SystemSettings.filter({ setting_key: 'loyalty_points_per_pound' });
        const pointsPerPound = Number(settings?.[0]?.setting_value ?? 1) || 1;

        // Every order created by the pooled account.
        const orders = await base44.asServiceRole.entities.Order.filter(
            { created_by: pooledKey }, '-created_date', 2000,
        );

        const byPhone = new Map();
        let skippedNoPhone = 0, skippedStatus = 0, skippedDone = 0, counted = 0;

        for (const o of orders || []) {
            if (o.loyalty_backfilled) { skippedDone++; continue; }
            if (!REVENUE_STATUSES.includes(o.status)) { skippedStatus++; continue; }
            const key = phoneLoyaltyKey(o.phone ?? o.customer_phone ?? o.guest_phone);
            if (!key) { skippedNoPhone++; continue; }
            const pts = Math.floor(Number(o.total || 0) * pointsPerPound);
            if (pts <= 0) continue;
            const row = byPhone.get(key) || { key, points: 0, orders: [] };
            row.points += pts;
            row.orders.push(o.id);
            byPhone.set(key, row);
            counted++;
        }

        const recipients = [...byPhone.values()].sort((a, b) => b.points - a.points);
        const totalPoints = recipients.reduce((s, r) => s + r.points, 0);

        const pooledRows = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email: pooledKey });
        const pooled = pooledRows?.[0];
        const pooledBalance = Math.floor(Number(pooled?.total_points || 0));

        const summary = {
            dry_run: dryRun,
            points_per_pound: pointsPerPound,
            orders_scanned: (orders || []).length,
            orders_counted: counted,
            skipped: { already_backfilled: skippedDone, not_completed: skippedStatus, no_phone: skippedNoPhone },
            customers: recipients.length,
            points_to_redistribute: totalPoints,
            pooled_balance_now: pooledBalance,
            pooled_balance_after: Math.max(0, pooledBalance - totalPoints),
            top_recipients: recipients.slice(0, 20).map(r => ({ phone: r.key.replace('phone:', ''), points: r.points, orders: r.orders.length })),
        };

        if (dryRun) return Response.json({ ...summary, note: 'Nothing was written. Re-run with dry_run:false and confirm:"YES".' });

        let credited = 0;
        for (const r of recipients) {
            try {
                const rows = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email: r.key });
                const rec = rows?.[0];
                if (rec) {
                    await base44.asServiceRole.entities.LoyaltyPoints.update(rec.id, {
                        total_points: Math.floor(Number(rec.total_points || 0)) + r.points,
                        points_earned: Math.floor(Number(rec.points_earned || 0)) + r.points,
                        orders_count: Math.floor(Number(rec.orders_count || 0)) + r.orders.length,
                    });
                } else {
                    await base44.asServiceRole.entities.LoyaltyPoints.create({
                        user_email: r.key, phone: r.key.replace('phone:', ''),
                        total_points: r.points, points_earned: r.points, points_redeemed: 0,
                        orders_count: r.orders.length,
                    });
                }
                await base44.asServiceRole.entities.LoyaltyTransaction.create({
                    user_email: r.key, transaction_type: 'earned', points: r.points,
                    description: `Backfill: points from ${r.orders.length} earlier order(s) that were credited to a service account`,
                });
                // Mark the orders so a second run cannot credit them again.
                for (const id of r.orders) {
                    await base44.asServiceRole.entities.Order.update(id, { loyalty_backfilled: true });
                }
                credited += r.points;
            } catch (e) {
                console.error(`[BACKFILL] failed for ${r.key}: ${e?.message}`);
            }
        }

        if (pooled && credited > 0) {
            await base44.asServiceRole.entities.LoyaltyPoints.update(pooled.id, {
                total_points: Math.max(0, pooledBalance - credited),
            });
        }

        console.log(`[BACKFILL] redistributed ${credited} points to ${recipients.length} customers`);
        return Response.json({ ...summary, points_credited: credited });
    } catch (error) {
        console.error('[BACKFILL] error:', error?.message || error);
        return Response.json({ error: 'Backfill failed' }, { status: 500 });
    }
});
