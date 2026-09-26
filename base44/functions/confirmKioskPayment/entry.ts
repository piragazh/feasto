/**
 * confirmKioskPayment — take payment for a kiosk "pay at counter" order
 *
 * A customer orders at the kiosk and pays at the till. Until they do, the order
 * must NOT be cooked (a walk-away leaves food nobody pays for). Once paid, it is
 * released to the kitchen.
 *
 * WHAT CHANGED, AND WHY
 *
 *  1. It now RELEASES THE ORDER. It used to update payment_status only and leave
 *     the order 'pending'. Reports and the cash drawer count only confirmed-or-
 *     later orders, so a kiosk order paid at the counter did not appear in the
 *     day's takings at all until someone separately moved it along - and stock
 *     never deducted.
 *
 *  2. It records HOW it was paid. With no tender recorded, cash taken at the
 *     till for a kiosk order was missing from the drawer's expected total, so a
 *     correct drawer looked OVER by that amount with no explanation. The tender
 *     and amount are now written in the same fields every other order uses.
 *
 *  3. Access is checked by RESTAURANT, not user role. The role allowlist
 *     (cashier, manager...) would refuse the till, which signs in as the
 *     restaurant account and identifies staff by PIN session; and it had no
 *     tenant check at all, so staff at one restaurant could confirm payment on
 *     another's order.
 *
 * Called from the till (with a tender) and from the dashboard's Live Orders (the
 * older call, without one - still supported).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const TENDERS = ['cash', 'card'];

async function verifyStaffSession(token, restaurantId) {
    try {
        if (!token || typeof token !== 'string') return null;
        const secret = Deno.env.get('STAFF_SESSION_SECRET');
        if (!secret) return null;
        const [body, sig] = token.split('.');
        if (!body || !sig) return null;
        const key = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
        );
        const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
        const hex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (hex.length !== sig.length) return null;
        let diff = 0;
        for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
        if (diff !== 0) return null;
        const payload = JSON.parse(atob(body));
        if (payload.exp && new Date(payload.exp) < new Date()) return null;
        if (restaurantId && payload.restaurant_id !== restaurantId) return null;
        return payload;
    } catch { return null; }
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized: Must be logged in' }, { status: 401 });

        const { order_id, tender, terminal, staff_session } = await req.json();
        if (!order_id || typeof order_id !== 'string') {
            return Response.json({ error: 'Invalid request: order_id required' }, { status: 400 });
        }
        if (tender !== undefined && !TENDERS.includes(tender)) {
            return Response.json({ error: `tender must be one of: ${TENDERS.join(', ')}` }, { status: 400 });
        }

        const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
        const order = orders?.[0];
        if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

        // ── Tenant check ─────────────────────────────────────────────────────
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email, is_active: true,
            });
            if (!managers.some(m => m.restaurant_ids?.includes(order.restaurant_id))) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // ── State checks: only an unpaid kiosk counter order ─────────────────
        if (order.order_source !== 'kiosk') {
            return Response.json({ error: 'This is not a kiosk order' }, { status: 409 });
        }
        // "Already paid" is checked FIRST. Taking payment changes payment_method
        // from pay_at_counter to the tender used, so checking the method first
        // told a staff member who double-tapped "not set to pay at the counter"
        // - true, but useless - instead of "already paid".
        if (order.payment_status === 'payment_confirmed' || order.payment_status === 'paid') {
            return Response.json({ error: 'This order has already been paid.', code: 'ALREADY_HANDLED' }, { status: 409 });
        }
        if (order.payment_method !== 'pay_at_counter') {
            return Response.json({ error: 'This order was not set to pay at the counter' }, { status: 409 });
        }
        if (order.payment_status !== 'pending_payment') {
            return Response.json({
                error: order.payment_status === 'payment_confirmed' || order.payment_status === 'paid'
                    ? 'This order has already been paid.'
                    : `This order cannot be paid now (${order.payment_status || 'unknown'}).`,
                code: 'ALREADY_HANDLED',
            }, { status: 409 });
        }
        if (['cancelled', 'refunded'].includes(order.status)) {
            return Response.json({ error: 'This order has been cancelled.' }, { status: 409 });
        }

        const staff = await verifyStaffSession(staff_session, order.restaurant_id);
        const actor = staff?.staff_name || user.full_name || user.email;
        const timestamp = new Date().toISOString();
        const total = Math.round(Number(order.total || 0) * 100) / 100;

        const update = {
            payment_status: 'payment_confirmed',
            payment_confirmed_at: timestamp,
            payment_confirmed_by: actor,
            payment_audit_trail: [
                ...(order.payment_audit_trail || []),
                {
                    action: 'payment_confirmed_at_counter',
                    actor_email: user.email,
                    actor_name: actor,
                    tender: tender || 'unrecorded',
                    timestamp,
                    note: `Kiosk counter payment taken by ${actor}${tender ? ` (${tender})` : ''}`,
                },
            ],
            // Release to the kitchen. A pending order moves to confirmed; one the
            // kitchen has somehow already started is left where it is.
            ...(order.status === 'pending' || !order.status ? { status: 'confirmed' } : {}),
            // The kitchen display reads order_status for kiosk orders, so it is
            // moved in step - otherwise the till and the kitchen disagree about
            // whether this order is ready to cook.
            ...(order.order_status === 'new' || !order.order_status ? { order_status: 'confirmed' } : {}),
        };

        // The tender, in the fields every other order uses - so the cash drawer
        // and the cash/card split in Reports both count it.
        if (tender) {
            update.payment_method = tender;
            update.cash_amount = tender === 'cash' ? total : 0;
            update.card_amount = tender === 'card' ? total : 0;
            if (Number.isInteger(Number(terminal)) && Number(terminal) > 0) update.terminal = Number(terminal);
        }
        if (staff?.staff_id) {
            update.staff_id = staff.staff_id;
            update.staff_name = staff.staff_name;
            update.staff_role = staff.role;
        }

        const updated = await base44.asServiceRole.entities.Order.update(order_id, update);

        try {
            await base44.asServiceRole.entities.PosAuditLog.create({
                restaurant_id: order.restaurant_id,
                action: 'kiosk.payment_taken',
                outcome: 'allowed',
                staff_id: staff?.staff_id,
                staff_name: actor,
                staff_role: staff?.role,
                order_id,
                amount: total,
                detail: `Took £${total.toFixed(2)}${tender ? ` by ${tender}` : ''} for kiosk order ${order.order_number || order_id.slice(-6)}`,
            });
        } catch { /* the payment is recorded on the order - never fail it over the log */ }

        return Response.json({
            success: true,
            order: updated,
            order_number: order.order_number,
            message: 'Payment taken — order sent to the kitchen',
        });
    } catch (error) {
        console.error('[confirmKioskPayment] Error:', error?.message || error);
        return Response.json({ error: 'Failed to confirm payment. Please try again.' }, { status: 500 });
    }
});
