/**
 * driverAction — everything a driver does from the driver app, checked on the server
 *
 * The driver app used to write straight to the Driver and Order tables from the
 * phone. Nothing checked that the driver was who they said, that the order was
 * theirs, or that it was still free - two drivers could accept the same order,
 * and any signed-in account could mark any order delivered.
 *
 * Every action here:
 *   1. identifies the driver from the signed-in account (never from the request body)
 *   2. checks the order belongs to that driver / one of their restaurants
 *   3. checks the order is in the right state
 *   4. writes with the service role
 *
 * ACTIONS (POST { action, ... })
 *   me                                  -> { driver } (null if this account is not a driver)
 *   setAvailability  { isAvailable }    -> { driver }
 *   updateLocation   { lat, lng }       -> { success }   also copied onto the driver's live orders
 *   acceptOrder      { orderId }        -> { order, driver }
 *   completeDelivery { orderId, proofUrl? } -> { order, driver, remaining }
 *   messageRestaurant { orderId, message }  -> { message }   driver -> restaurant chat
 *   messageCustomer   { orderId, message }  -> { message }   driver -> customer chat
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
    Response.json({ success: false, error, ...extra }, { status });

/** The Driver row for the signed-in account. Email match is case-insensitive. */
async function findDriver(base44: any, email: string) {
    const Driver = base44.asServiceRole.entities.Driver;
    const wanted = String(email || '').toLowerCase();
    if (!wanted) return null;

    try {
        const exact = await Driver.filter({ email });
        const hit = (exact || []).find((d: any) => String(d.email || '').toLowerCase() === wanted);
        if (hit) return hit;
    } catch { /* fall through to the scan */ }

    // Older rows may have been saved with different capitalisation.
    const all = await Driver.list();
    return (all || []).find((d: any) => String(d.email || '').toLowerCase() === wanted) || null;
}

async function loadOrder(base44: any, orderId: string) {
    const found = await base44.asServiceRole.entities.Order.filter({ id: orderId });
    return found?.[0] || null;
}

async function liveOrdersOf(base44: any, driverId: string) {
    const rows = await base44.asServiceRole.entities.Order.filter({
        driver_id: driverId,
        status: 'out_for_delivery',
    });
    return rows || [];
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);

        let user = null;
        try { user = await base44.auth.me(); } catch { user = null; }
        if (!user?.email) return fail(401, 'Unauthorized');

        let body: any = {};
        try { body = await req.json(); } catch { body = {}; }
        const action = String(body?.action || '');

        const driver = await findDriver(base44, user.email);

        // ── me ────────────────────────────────────────────────────────────────
        if (action === 'me') {
            return Response.json({ success: true, driver: driver || null });
        }

        if (!driver) {
            return fail(403, 'Your account is not registered as a driver');
        }

        const Driver = base44.asServiceRole.entities.Driver;
        const Order = base44.asServiceRole.entities.Order;

        // ── setAvailability ───────────────────────────────────────────────────
        if (action === 'setAvailability') {
            if (typeof body.isAvailable !== 'boolean') {
                return fail(400, 'isAvailable must be true or false');
            }
            const updated = await Driver.update(driver.id, { is_available: body.isAvailable });
            return Response.json({ success: true, driver: updated });
        }

        // ── updateLocation ────────────────────────────────────────────────────
        if (action === 'updateLocation') {
            const lat = Number(body.lat);
            const lng = Number(body.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
                return fail(400, 'A valid lat and lng are required');
            }
            const loc = { lat, lng };
            await Driver.update(driver.id, { current_location: loc });

            // Copy onto the orders this driver is carrying, so the restaurant and
            // the customer see the same position.
            const live = await liveOrdersOf(base44, driver.id);
            for (const o of live) {
                await Order.update(o.id, { driver_location: loc })
                    .catch((e: unknown) => console.warn(`[DRIVER] location copy failed for order ${o.id}:`, e));
            }
            return Response.json({ success: true });
        }

        // ── acceptOrder ───────────────────────────────────────────────────────
        if (action === 'acceptOrder') {
            const orderId = String(body.orderId || '');
            if (!orderId) return fail(400, 'orderId is required');

            if (driver.is_available !== true) {
                return fail(400, 'Go online before accepting orders');
            }
            const carrying = await liveOrdersOf(base44, driver.id);
            if (carrying.length > 0) {
                return fail(400, 'Finish your current delivery before accepting another order');
            }

            const order = await loadOrder(base44, orderId);
            if (!order) return fail(404, 'Order not found');

            if (!driver.restaurant_ids?.includes(order.restaurant_id)) {
                console.error(`[DRIVER] ${user.email} tried to accept order ${orderId} of restaurant ${order.restaurant_id}`);
                return fail(403, 'This order is not from one of your restaurants');
            }
            if (order.driver_id && order.driver_id !== driver.id) {
                return fail(409, 'Another driver has already taken this order', { code: 'ORDER_TAKEN' });
            }
            if (order.status !== 'preparing') {
                return fail(409, 'This order is no longer available', { code: 'ORDER_NOT_AVAILABLE' });
            }

            const nowIso = new Date().toISOString();
            const updatedOrder = await Order.update(orderId, {
                driver_id: driver.id,
                status: 'out_for_delivery',
                estimated_delivery: new Date(Date.now() + 30 * 60000).toISOString(),
                status_history: [
                    ...(order.status_history || []),
                    { status: 'out_for_delivery', timestamp: nowIso, note: `Accepted by driver ${driver.full_name}` },
                ],
            });

            // Two drivers can pass the checks above at the same moment. Read the
            // order back: whoever is on it now keeps it, the other backs off.
            const confirmed = await loadOrder(base44, orderId);
            if (!confirmed || confirmed.driver_id !== driver.id) {
                console.warn(`[DRIVER] ${user.email} lost the race for order ${orderId}`);
                return fail(409, 'Another driver has already taken this order', { code: 'ORDER_TAKEN' });
            }

            let updatedDriver = null;
            try {
                updatedDriver = await Driver.update(driver.id, {
                    current_order_id: orderId,
                    is_available: false,
                });
            } catch (e) {
                console.error(`[DRIVER] driver update failed after accepting ${orderId}:`, e);
            }
            if (!updatedDriver?.id) {
                // Put the order back so it is not stranded with a driver who is not marked busy.
                await Order.update(orderId, {
                    driver_id: null,
                    status: order.status,
                    status_history: order.status_history || [],
                }).catch((e: unknown) => console.error('[DRIVER] accept rollback failed:', e));
                return fail(500, 'Could not accept the order. Please try again.');
            }

            // Tell the customer (same message the app used to post from the phone).
            await base44.asServiceRole.entities.Message.create({
                order_id: orderId,
                restaurant_id: order.restaurant_id,
                sender_type: 'restaurant',
                message: 'Your order is now out for delivery! The driver is on the way.',
            }).catch((e: unknown) => console.warn('[DRIVER] customer message failed:', e));

            console.log(`[DRIVER] ✓ ${user.email} accepted order ${orderId}`);
            return Response.json({ success: true, order: updatedOrder, driver: updatedDriver });
        }

        // ── completeDelivery ──────────────────────────────────────────────────
        if (action === 'completeDelivery') {
            const orderId = String(body.orderId || '');
            if (!orderId) return fail(400, 'orderId is required');

            const order = await loadOrder(base44, orderId);
            if (!order) return fail(404, 'Order not found');

            if (order.driver_id !== driver.id) {
                console.error(`[DRIVER] ${user.email} tried to complete order ${orderId} assigned to ${order.driver_id}`);
                return fail(403, 'This order is not assigned to you');
            }
            if (order.status === 'delivered') {
                // Already done (double tap, or a retry after a dropped connection).
                return Response.json({ success: true, order, driver, remaining: (await liveOrdersOf(base44, driver.id)).length, alreadyDelivered: true });
            }
            if (order.status !== 'out_for_delivery') {
                return fail(409, `This order cannot be marked delivered (it is ${order.status})`);
            }

            const proofUrl = typeof body.proofUrl === 'string' && /^https:\/\//.test(body.proofUrl)
                ? body.proofUrl.slice(0, 2000)
                : null;

            const nowIso = new Date().toISOString();
            const updatedOrder = await Order.update(orderId, {
                status: 'delivered',
                actual_delivery_time: nowIso,
                ...(proofUrl ? { proof_of_delivery: proofUrl } : {}),
                status_history: [
                    ...(order.status_history || []),
                    { status: 'delivered', timestamp: nowIso, note: 'Order delivered successfully' },
                ],
            });

            // The driver is only free once nothing else is in the bag.
            const remaining = (await liveOrdersOf(base44, driver.id)).filter((o: any) => o.id !== orderId);
            const fresh = (await Driver.filter({ id: driver.id }))?.[0] || driver;
            const updatedDriver = await Driver.update(driver.id, {
                total_deliveries: (fresh.total_deliveries || 0) + 1,
                ...(remaining.length === 0
                    ? { current_order_id: null, is_available: true }
                    : { current_order_id: remaining[0].id, is_available: false }),
            }).catch((e: unknown) => {
                console.error(`[DRIVER] driver update failed after delivering ${orderId}:`, e);
                return fresh;
            });

            // The customer notification is sent by the "Send Order Status
            // Notifications" workflow when the order status changes.

            console.log(`[DRIVER] ✓ ${user.email} delivered order ${orderId} (${remaining.length} left)`);
            return Response.json({ success: true, order: updatedOrder, driver: updatedDriver, remaining: remaining.length });
        }

        // ── messageRestaurant / messageCustomer ───────────────────────────────
        if (action === 'messageRestaurant' || action === 'messageCustomer') {
            const orderId = String(body.orderId || '');
            const text = typeof body.message === 'string' ? body.message.trim().slice(0, 1000) : '';
            if (!orderId) return fail(400, 'orderId is required');
            if (!text) return fail(400, 'Type a message first');

            const order = await loadOrder(base44, orderId);
            if (!order) return fail(404, 'Order not found');
            if (order.driver_id !== driver.id) {
                console.error(`[DRIVER] ${user.email} tried to message on order ${orderId} assigned to ${order.driver_id}`);
                return fail(403, 'This order is not assigned to you');
            }
            if (!['out_for_delivery', 'delivered'].includes(order.status)) {
                return fail(409, 'Messages are closed for this order');
            }

            if (action === 'messageRestaurant') {
                const created = await base44.asServiceRole.entities.DriverMessage.create({
                    order_id: orderId,
                    driver_id: driver.id,
                    restaurant_id: order.restaurant_id,
                    sender_type: 'driver',
                    message: text,
                    is_read: false,
                });
                return Response.json({ success: true, message: created });
            }

            // The customer chat only knows two sides (customer / restaurant), so the
            // driver's message appears on the restaurant side. sent_by_driver_id
            // records that it was really the driver, and which one.
            const created = await base44.asServiceRole.entities.Message.create({
                order_id: orderId,
                restaurant_id: order.restaurant_id,
                sender_type: 'restaurant',
                sent_by_driver_id: driver.id,
                message: text,
                is_read: false,
            });
            return Response.json({ success: true, message: created });
        }

        return fail(400, `Unknown action: ${action || '(none)'}`);

    } catch (error) {
        console.error('[driverAction] Unhandled error:', error);
        return fail(500, 'Something went wrong. Please try again.');
    }
});
