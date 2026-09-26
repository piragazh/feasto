/**
 * expireUnpaidKioskOrders — clear kiosk orders nobody came to pay for
 *
 * A customer orders at the kiosk and should walk to the till to pay. Some change
 * their mind and leave. Their order was never cooked (unpaid orders are held from
 * the kitchen), but it sat in the till's Awaiting Payment lane forever, pushing
 * real customers further down and making the count meaningless.
 *
 * Runs on a schedule, so it works even when no till is open.
 *
 * SAFE NO MATTER WHO CALLS IT
 *   A scheduled run has no user session, so the function cannot tell a
 *   schedule from anyone else. Safety comes from the criteria instead: it only
 *   ever cancels a kiosk order that is STILL unpaid, STILL pending, and older than
 *   the restaurant's limit. The most any caller can do is what the schedule would
 *   have done anyway. A paid order can never be touched.
 *
 * NOTHING TO UNDO
 *   An unpaid order was never sent to the kitchen and never deducted stock
 *   (stock moves only once an order is confirmed), so cancelling it needs no
 *   reversal.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const DEFAULT_TIMEOUT_MINUTES = 15;

/** created_date is UTC without a zone marker on this platform. */
function createdAtMs(order) {
    const raw = String(order?.created_date || '');
    const t = new Date(/Z|[+-]\d\d:?\d\d$/.test(raw) ? raw : raw + 'Z').getTime();
    return Number.isFinite(t) ? t : null;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const unpaid = await base44.asServiceRole.entities.Order.filter({
            order_source: 'kiosk',
            payment_status: 'pending_payment',
            status: 'pending',
        }, 'created_date', 500);

        if (!unpaid?.length) return Response.json({ expired: 0 });

        // Each restaurant can set its own limit.
        const restaurantIds = [...new Set(unpaid.map(o => o.restaurant_id).filter(Boolean))];
        const limits = new Map();
        for (const id of restaurantIds) {
            const rows = await base44.asServiceRole.entities.Restaurant.filter({ id });
            const mins = Number(rows?.[0]?.kiosk_config?.unpaid_timeout_minutes);
            limits.set(id, Number.isFinite(mins) && mins >= 5 ? mins : DEFAULT_TIMEOUT_MINUTES);
        }

        const now = Date.now();
        let expired = 0;
        for (const order of unpaid) {
            const created = createdAtMs(order);
            const limit = limits.get(order.restaurant_id) ?? DEFAULT_TIMEOUT_MINUTES;
            if (created === null || now - created < limit * 60 * 1000) continue;

            // Re-read just before cancelling: a cashier may have taken payment
            // in the moments since the list was fetched.
            const fresh = (await base44.asServiceRole.entities.Order.filter({ id: order.id }))?.[0];
            if (!fresh || fresh.payment_status !== 'pending_payment' || fresh.status !== 'pending') continue;

            await base44.asServiceRole.entities.Order.update(order.id, {
                status: 'cancelled',
                // The kitchen display tracks kiosk orders by order_status, not
                // status. Setting only status left a cancelled walk-away showing
                // as 'new' - and, with its payment no longer "pending", as
                // COOKABLE. Both fields must say cancelled.
                order_status: 'cancelled',
                payment_status: 'cancelled_payment',
                cancellation_reason: `Not paid at the counter within ${limit} minutes of ordering at the kiosk.`,
            });
            try {
                await base44.asServiceRole.entities.PosAuditLog.create({
                    restaurant_id: order.restaurant_id,
                    action: 'kiosk.expired_unpaid',
                    outcome: 'allowed',
                    staff_name: 'System',
                    order_id: order.id,
                    amount: Number(order.total || 0),
                    detail: `Kiosk order ${order.order_number || order.id.slice(-6)} cancelled - not paid within ${limit} minutes.`,
                });
            } catch { /* the cancellation stands even if the log write fails */ }
            expired++;
        }

        console.log(`[KIOSK EXPIRY] cancelled ${expired} unpaid kiosk order(s)`);
        return Response.json({ expired });
    } catch (error) {
        console.error('[KIOSK EXPIRY] error:', error?.message || error);
        return Response.json({ error: 'Expiry run failed' }, { status: 500 });
    }
});
