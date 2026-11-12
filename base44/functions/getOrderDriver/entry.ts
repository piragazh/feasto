/**
 * getOrderDriver — what a customer is allowed to see about the driver bringing their order
 *
 * The tracking page used to read the whole Driver row from the browser: email,
 * surname, pay rates per restaurant, every restaurant the driver works for.
 * This returns only what the tracking card shows, and only while the order is
 * actually out for delivery.
 *
 * Guests can call it (tracking works without an account): knowing the order id
 * is what lets you track the order.
 *
 * POST { orderId } -> { success, rated, driver: { full_name, vehicle_type, rating,
 *                       total_deliveries, phone, current_location } | null }
 *   rated says whether the customer has already rated this delivery.
 *   full_name is the driver's FIRST name only.
 *   phone is included so the customer can ring the driver during the delivery,
 *   as the tracking card already offered; it is not returned at any other time.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);

        let body: any = {};
        try { body = await req.json(); } catch { body = {}; }
        const orderId = String(body?.orderId || '');
        if (!orderId) {
            return Response.json({ success: false, error: 'orderId is required' }, { status: 400 });
        }

        const order = (await base44.asServiceRole.entities.Order.filter({ id: orderId }))?.[0];
        if (!order) {
            return Response.json({ success: false, error: 'Order not found' }, { status: 404 });
        }

        // Has this delivery been rated yet? (So the tracking page can hide the button.)
        let rated = false;
        if (order.status === 'delivered' && order.driver_id) {
            const ratings = await base44.asServiceRole.entities.DriverRating
                .filter({ order_id: orderId, rated_by: 'customer' }).catch(() => []);
            rated = (ratings || []).length > 0;
        }

        // Nothing about the driver before pickup or after the delivery is over.
        if (order.status !== 'out_for_delivery' || !order.driver_id) {
            return Response.json({ success: true, rated, driver: null });
        }

        const d = (await base44.asServiceRole.entities.Driver.filter({ id: order.driver_id }))?.[0];
        if (!d) {
            return Response.json({ success: true, driver: null });
        }

        const firstName = String(d.full_name || '').trim().split(/\s+/)[0] || 'Your driver';
        const loc = order.driver_location?.lat != null ? order.driver_location : d.current_location;

        return Response.json({
            success: true,
            rated,
            driver: {
                full_name: firstName,
                vehicle_type: d.vehicle_type || null,
                rating: typeof d.rating === 'number' ? d.rating : null,
                total_deliveries: d.total_deliveries || 0,
                phone: d.phone || null,
                current_location: loc?.lat != null && loc?.lng != null ? { lat: loc.lat, lng: loc.lng } : null,
            },
        });

    } catch (error) {
        console.error('[getOrderDriver] Unhandled error:', error);
        return Response.json({ success: false, error: 'Could not load driver details' }, { status: 500 });
    }
});
