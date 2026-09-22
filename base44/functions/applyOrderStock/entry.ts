/**
 * applyOrderStock — deduct and restore item stock, fired on every Order change
 *
 * ONE IMPLEMENTATION FOR EIGHT ORDER PATHS
 *   Orders are created by eight different functions: till, offline sync, kiosk,
 *   QR table, online checkout, and three marketplace integrations. Copying stock
 *   logic into each would mean eight copies to keep in step, and any path missed
 *   would silently oversell. Instead a workflow fires this on every Order create
 *   and update, whichever path produced it.
 *
 * SAFE NO MATTER WHO CALLS IT
 *   A workflow invocation carries no user session, so it cannot be told apart
 *   from an anonymous request. (awardLoyaltyPoints "handles" this by AUTHORISING
 *   any caller whose auth check throws - i.e. every anonymous caller. That
 *   pattern is deliberately not copied here.)
 *
 *   Safety comes from the design instead: this takes only an order ID, reads the
 *   order and menu from the database, and applies each order EXACTLY ONCE via the
 *   stock_applied / stock_restored markers. The most any caller can do is trigger
 *   what would have happened anyway.
 *
 * WHEN STOCK FALLS
 *   Only once an order is COMMITTED (the revenue statuses). Online checkout
 *   creates orders as 'pending' before payment; deducting then would let every
 *   abandoned basket remove portions that were never sold. When a pending order
 *   is confirmed, the update trigger fires and stock is deducted then.
 *
 * WHEN IT COMES BACK
 *   When a committed order is cancelled or refunded - once.
 *
 * KNOWN LIMIT: the platform has no atomic decrement or transaction. Two orders
 * for the last portion processed at the same instant can both succeed. That is
 * reported as an oversell rather than prevented - see applySale.
 *
 * SYNC RULE: stockDemand / applySale / applyRestore mirror
 * src/lib/pos-stock-logic.js. Keep them in step.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const COMMITTED = ['confirmed', 'preparing', 'ready_for_collection', 'out_for_delivery', 'delivered', 'collected'];
const REVERSED = ['cancelled', 'refunded'];

// ── Mirrors of the tested logic ────────────────────────────────────────────
const isCustom = (id) => String(id || '').startsWith('custom-');

function stockDemand(order) {
    const demand = new Map();
    for (const line of order?.items || []) {
        const id = line?.menu_item_id;
        if (!id || isCustom(id)) continue;
        const qty = Math.floor(Number(line.quantity || 0));
        if (!(qty > 0)) continue;
        demand.set(id, (demand.get(id) || 0) + qty);
    }
    return demand;
}

function applySale(item, qty) {
    if (!item?.track_stock) return null;
    const current = Math.floor(Number(item.stock_quantity || 0));
    const want = Math.floor(Number(qty || 0));
    const remaining = current - want;
    const next = Math.max(0, remaining);
    const hitZero = next === 0;
    const threshold = Math.floor(Number(item.low_stock_threshold ?? 0));
    return {
        stock_quantity: next,
        is_available: hitZero ? false : item.is_available,
        auto_86ed: hitZero ? true : Boolean(item.auto_86ed),
        oversold: remaining < 0 ? -remaining : 0,
        hitZero,
        low: !hitZero && threshold > 0 && next <= threshold,
    };
}

function applyRestore(item, qty) {
    if (!item?.track_stock) return null;
    const current = Math.floor(Number(item.stock_quantity || 0));
    const back = Math.floor(Number(qty || 0));
    const next = current + Math.max(0, back);
    const revive = Boolean(item.auto_86ed) && next > 0;
    return {
        stock_quantity: next,
        is_available: revive ? true : item.is_available,
        auto_86ed: revive ? false : Boolean(item.auto_86ed),
    };
}
// ────────────────────────────────────────────────────────────────────────────

async function audit(base44, entry) {
    try { await base44.asServiceRole.entities.PosAuditLog.create(entry); }
    catch (e) { console.warn('[STOCK] audit write failed:', e?.message); }
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const orderId = body.orderId || body.event?.entity_id;
        if (!orderId || typeof orderId !== 'string') {
            return Response.json({ error: 'Order ID required' }, { status: 400 });
        }

        const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
        const order = orders?.[0];
        if (!order) return Response.json({ skipped: 'order not found' });

        const committed = COMMITTED.includes(order.status);
        const reversed = REVERSED.includes(order.status);

        let mode = null;
        if (committed && !order.stock_applied) mode = 'sale';
        else if (reversed && order.stock_applied && !order.stock_restored) mode = 'restore';
        if (!mode) return Response.json({ skipped: 'nothing to do' });

        // Claim the order BEFORE touching stock. Updating the marker re-fires
        // this workflow; that second run sees the marker and exits, so there is
        // no loop. If this run then fails part-way, the cost is an under-count,
        // which staff correct by recounting - preferable to deducting twice.
        await base44.asServiceRole.entities.Order.update(order.id, mode === 'sale'
            ? { stock_applied: true }
            : { stock_restored: true });

        const demand = stockDemand(order);
        if (demand.size === 0) return Response.json({ mode, items: 0 });

        const menu = await base44.asServiceRole.entities.MenuItem.filter({ restaurant_id: order.restaurant_id });
        const byId = new Map(menu.map(m => [m.id, m]));

        const changed = [];
        for (const [id, qty] of demand) {
            const item = byId.get(id);
            const result = mode === 'sale' ? applySale(item, qty) : applyRestore(item, qty);
            if (!result) continue;                        // untracked or deleted
            const { oversold, hitZero, low, ...patch } = result;
            await base44.asServiceRole.entities.MenuItem.update(id, patch);
            changed.push({ name: item.name, qty, now: patch.stock_quantity });

            if (oversold > 0) {
                await audit(base44, {
                    restaurant_id: order.restaurant_id, action: 'stock.oversold', outcome: 'denied',
                    order_id: order.id,
                    detail: `${item.name}: sold ${qty} with only ${Math.floor(Number(item.stock_quantity || 0))} left - ${oversold} over. Check the kitchen can fulfil order ${order.order_number || order.id.slice(-6)}.`,
                });
            }
            if (hitZero && mode === 'sale') {
                await audit(base44, {
                    restaurant_id: order.restaurant_id, action: 'stock.auto_86', outcome: 'allowed',
                    order_id: order.id, detail: `${item.name} sold out and was taken off sale on every channel`,
                });
            }
        }

        console.log(`[STOCK] ${mode} order=${order.id} items=${changed.length}`);
        return Response.json({ mode, changed });
    } catch (error) {
        console.error('[STOCK] error:', error?.message || error);
        return Response.json({ error: 'Stock update failed' }, { status: 500 });
    }
});
