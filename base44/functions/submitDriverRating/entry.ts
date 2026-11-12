/**
 * submitDriverRating — a customer rates the driver who delivered their order
 *
 * The tracking page used to create the DriverRating row and then recalculate and
 * write the driver's average from the customer's browser. Nothing checked that the
 * order existed, was delivered, or had not been rated already - so anyone could
 * post any number of ratings for any driver, or set a driver's average directly.
 *
 * RULES (all enforced here)
 *   - the order must exist, be delivered, and have a driver
 *   - one customer rating per order
 *   - rating is a whole number from 1 to 5
 *   - ratings close 30 days after delivery
 *   - a driver cannot rate their own delivery
 *   - the driver is taken from the order, never from the request
 *   - the driver's average is recalculated on the server
 *
 * Guests can rate too (the tracking page works without an account): knowing the
 * order id is what lets you rate it, exactly as it lets you track it.
 *
 * POST { orderId, rating, feedback? } -> { success, rating, average }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const RATING_WINDOW_DAYS = 30;

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
    Response.json({ success: false, error, ...extra }, { status });

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);

        let user = null;
        try { user = await base44.auth.me(); } catch { user = null; }

        let body: any = {};
        try { body = await req.json(); } catch { body = {}; }

        const orderId = String(body?.orderId || '');
        const rating = Number(body?.rating);
        const feedback = typeof body?.feedback === 'string' ? body.feedback.trim().slice(0, 1000) : '';

        if (!orderId) return fail(400, 'orderId is required');
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return fail(400, 'Please choose a rating from 1 to 5 stars');
        }

        const Order = base44.asServiceRole.entities.Order;
        const Driver = base44.asServiceRole.entities.Driver;
        const DriverRating = base44.asServiceRole.entities.DriverRating;

        const order = (await Order.filter({ id: orderId }))?.[0];
        if (!order) return fail(404, 'Order not found');
        if (order.status !== 'delivered') return fail(400, 'You can rate the driver once the order has been delivered');
        if (!order.driver_id) return fail(400, 'This order was not delivered by a driver');

        const deliveredAt = new Date(order.actual_delivery_time || order.updated_date || order.created_date).getTime();
        if (Number.isFinite(deliveredAt) && Date.now() - deliveredAt > RATING_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
            return fail(400, 'Ratings for this order have closed');
        }

        const driver = (await Driver.filter({ id: order.driver_id }))?.[0];
        if (!driver) return fail(404, 'Driver not found');

        if (user?.email && String(driver.email || '').toLowerCase() === String(user.email).toLowerCase()) {
            return fail(403, 'You cannot rate your own delivery');
        }

        const existing = await DriverRating.filter({ order_id: orderId, rated_by: 'customer' });
        if (existing?.length) {
            return fail(409, 'This order has already been rated. Thank you!', { code: 'ALREADY_RATED' });
        }

        const created = await DriverRating.create({
            driver_id: order.driver_id,
            order_id: orderId,
            rating,
            ...(feedback ? { feedback } : {}),
            rated_by: 'customer',
        });

        // Two taps can both pass the check above: keep the oldest, drop ours if we lost.
        try {
            const all = await DriverRating.filter({ order_id: orderId, rated_by: 'customer' });
            if (all?.length > 1) {
                const oldest = [...all].sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)))[0];
                if (oldest.id !== created.id) {
                    await DriverRating.delete(created.id);
                    return fail(409, 'This order has already been rated. Thank you!', { code: 'ALREADY_RATED' });
                }
            }
        } catch (e) {
            console.warn('[RATE-DRIVER] duplicate check failed:', e);
        }

        // Recalculate the driver's average on the server.
        let average = driver.rating ?? null;
        try {
            const ratings = await DriverRating.filter({ driver_id: order.driver_id });
            const valid = (ratings || []).map((r: any) => Number(r.rating)).filter((n: number) => n >= 1 && n <= 5);
            if (valid.length) {
                average = Number((valid.reduce((s: number, n: number) => s + n, 0) / valid.length).toFixed(1));
                await Driver.update(order.driver_id, { rating: average });
            }
        } catch (e) {
            console.error(`[RATE-DRIVER] average update failed for driver ${order.driver_id}:`, e);
        }

        console.log(`[RATE-DRIVER] ✓ order=${orderId} driver=${order.driver_id} rating=${rating} by=${user?.email || 'guest'}`);
        return Response.json({ success: true, rating, average });

    } catch (error) {
        console.error('[submitDriverRating] Unhandled error:', error);
        return fail(500, 'Could not save your rating. Please try again.');
    }
});
