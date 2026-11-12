/**
 * manageDrivers — everything a restaurant does with its drivers, scoped to that restaurant
 *
 * The restaurant screens used to read the whole Driver table in the browser and
 * filter it there, so every restaurant's browser received every other
 * restaurant's drivers: names, phones, emails, pay rates and live positions.
 * They also created, edited and deleted Driver rows directly.
 *
 * Every action here checks the caller manages `restaurantId` (admin, or an
 * active RestaurantManager for it - the same rule updateOrderStatus uses) and
 * only ever returns or changes drivers that belong to that restaurant. A driver
 * shared with other restaurants is returned with THIS restaurant's pay rates only.
 *
 * ACTIONS (POST { action, restaurantId, ... })
 *   list                                        -> { drivers }
 *   addDriver     { data }                      -> { driver, created }   created=false: an existing driver was linked
 *   updateDriver  { driverId, data }            -> { driver }
 *   removeDriver  { driverId }                  -> { removed: 'unlinked' | 'deleted' }
 *   ratings                                     -> { ratings }
 *   messages      { driverId, orderId? }        -> { messages }
 *   sendMessage   { driverId, orderId, message }-> { message }
 *   releaseDriver { orderId }                   -> { success }   frees the order's driver if nothing else is in the bag
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const VEHICLES = ['bike', 'scooter', 'car'];

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
    Response.json({ success: false, error, ...extra }, { status });

const rate = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** What a restaurant may see of one of its drivers. */
function shape(d: any, restaurantId: string) {
    return {
        id: d.id,
        email: d.email,
        full_name: d.full_name,
        phone: d.phone,
        vehicle_type: d.vehicle_type,
        current_location: d.current_location || null,
        is_available: d.is_available === true,
        current_order_id: d.current_order_id || null,
        total_deliveries: d.total_deliveries || 0,
        rating: d.rating,
        created_date: d.created_date,
        // Only this restaurant's link and pay rates - never the other restaurants'.
        restaurant_ids: [restaurantId],
        payment_config: { [restaurantId]: d.payment_config?.[restaurantId] || {} },
    };
}

async function driversOf(base44: any, restaurantId: string) {
    const Driver = base44.asServiceRole.entities.Driver;
    let rows: any[] | null = null;
    try {
        rows = await Driver.filter({ restaurant_ids: { $elemMatch: { $eq: restaurantId } } });
    } catch { rows = null; }
    // An unsupported filter can come back empty instead of failing, so an empty
    // result is double-checked with a plain scan.
    if (!Array.isArray(rows) || rows.length === 0) rows = await Driver.list();
    return (rows || []).filter((d: any) => d.restaurant_ids?.includes(restaurantId));
}

async function driverOfRestaurant(base44: any, driverId: string, restaurantId: string) {
    const d = (await base44.asServiceRole.entities.Driver.filter({ id: driverId }))?.[0];
    return d && d.restaurant_ids?.includes(restaurantId) ? d : null;
}

/** Free the order's driver, unless they are still carrying another live order. */
async function releaseDriverForOrder(base44: any, order: any) {
    if (!order?.driver_id) return;
    const live = await base44.asServiceRole.entities.Order.filter({
        driver_id: order.driver_id,
        status: 'out_for_delivery',
    });
    const others = (live || []).filter((o: any) => o.id !== order.id);
    await base44.asServiceRole.entities.Driver.update(order.driver_id, others.length === 0
        ? { current_order_id: null, is_available: true }
        : { current_order_id: others[0].id, is_available: false });
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
        const restaurantId = String(body?.restaurantId || '');
        if (!restaurantId) return fail(400, 'restaurantId is required');

        // ── Restaurant scope ──────────────────────────────────────────────────
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true,
            });
            const hasAccess = (managers || []).some((m: any) => m.restaurant_ids?.includes(restaurantId));
            if (!hasAccess) {
                console.error(`[MANAGE-DRIVERS] ${user.email} is not authorised for restaurant ${restaurantId}`);
                return fail(403, 'Access denied: not authorized for this restaurant');
            }
        }

        const Driver = base44.asServiceRole.entities.Driver;

        // ── list ──────────────────────────────────────────────────────────────
        if (action === 'list') {
            const rows = await driversOf(base44, restaurantId);
            return Response.json({ success: true, drivers: rows.map((d: any) => shape(d, restaurantId)) });
        }

        // ── addDriver ─────────────────────────────────────────────────────────
        if (action === 'addDriver') {
            const data = body.data || {};
            const email = String(data.email || '').trim();
            const fullName = String(data.full_name || '').trim();
            const phone = String(data.phone || '').trim();
            if (!email || !fullName || !phone) return fail(400, 'Name, phone and email are required');
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Enter a valid email address');

            const cfg = {
                hourly_rate: rate(data.hourly_rate),
                per_mile_rate: rate(data.per_mile_rate),
                per_delivery_fee: rate(data.per_delivery_fee),
            };

            // Same person already drives for another restaurant: link them, do not duplicate.
            const wanted = email.toLowerCase();
            let existing: any = null;
            try {
                existing = ((await Driver.filter({ email })) || [])
                    .find((d: any) => String(d.email || '').toLowerCase() === wanted) || null;
            } catch { existing = null; }
            if (!existing) {
                existing = ((await Driver.list()) || [])
                    .find((d: any) => String(d.email || '').toLowerCase() === wanted) || null;
            }

            if (existing) {
                if (existing.restaurant_ids?.includes(restaurantId)) {
                    return fail(409, 'Driver is already associated with this restaurant');
                }
                const updated = await Driver.update(existing.id, {
                    restaurant_ids: [...(existing.restaurant_ids || []), restaurantId],
                    payment_config: { ...(existing.payment_config || {}), [restaurantId]: cfg },
                });
                console.log(`[MANAGE-DRIVERS] ${user.email} linked driver ${existing.id} to restaurant ${restaurantId}`);
                return Response.json({ success: true, created: false, driver: shape(updated, restaurantId) });
            }

            const created = await Driver.create({
                full_name: fullName,
                phone,
                email,
                vehicle_type: VEHICLES.includes(data.vehicle_type) ? data.vehicle_type : 'bike',
                is_available: data.is_available === true,
                restaurant_ids: [restaurantId],
                payment_config: { [restaurantId]: cfg },
            });
            console.log(`[MANAGE-DRIVERS] ${user.email} created driver ${created.id} for restaurant ${restaurantId}`);
            return Response.json({ success: true, created: true, driver: shape(created, restaurantId) });
        }

        // ── updateDriver ──────────────────────────────────────────────────────
        if (action === 'updateDriver') {
            const driver = await driverOfRestaurant(base44, String(body.driverId || ''), restaurantId);
            if (!driver) return fail(404, 'Driver not found for this restaurant');

            const data = body.data || {};
            const patch: Record<string, unknown> = {};
            if (typeof data.full_name === 'string' && data.full_name.trim()) patch.full_name = data.full_name.trim();
            if (typeof data.phone === 'string' && data.phone.trim()) patch.phone = data.phone.trim();
            if (VEHICLES.includes(data.vehicle_type)) patch.vehicle_type = data.vehicle_type;
            if (typeof data.is_available === 'boolean') patch.is_available = data.is_available;

            // Pay rates: change THIS restaurant's entry on the latest server copy, so
            // another restaurant's rates can never be overwritten from here.
            if (['hourly_rate', 'per_mile_rate', 'per_delivery_fee'].some(k => data[k] !== undefined)) {
                const current = driver.payment_config?.[restaurantId] || {};
                patch.payment_config = {
                    ...(driver.payment_config || {}),
                    [restaurantId]: {
                        hourly_rate: data.hourly_rate !== undefined ? rate(data.hourly_rate) : rate(current.hourly_rate),
                        per_mile_rate: data.per_mile_rate !== undefined ? rate(data.per_mile_rate) : rate(current.per_mile_rate),
                        per_delivery_fee: data.per_delivery_fee !== undefined ? rate(data.per_delivery_fee) : rate(current.per_delivery_fee),
                    },
                };
            }

            const updated = await Driver.update(driver.id, patch);
            return Response.json({ success: true, driver: shape(updated, restaurantId) });
        }

        // ── removeDriver ──────────────────────────────────────────────────────
        if (action === 'removeDriver') {
            const driver = await driverOfRestaurant(base44, String(body.driverId || ''), restaurantId);
            if (!driver) return fail(404, 'Driver not found for this restaurant');

            const live = await base44.asServiceRole.entities.Order.filter({
                driver_id: driver.id,
                restaurant_id: restaurantId,
                status: 'out_for_delivery',
            });
            if (live?.length) {
                return fail(409, 'This driver has a delivery in progress. Remove them once it is finished.');
            }

            const remaining = (driver.restaurant_ids || []).filter((r: string) => r !== restaurantId);
            if (remaining.length === 0) {
                await Driver.delete(driver.id);
                console.log(`[MANAGE-DRIVERS] ${user.email} deleted driver ${driver.id} (last restaurant ${restaurantId})`);
                return Response.json({ success: true, removed: 'deleted' });
            }
            const cfg = { ...(driver.payment_config || {}) };
            delete cfg[restaurantId];
            await Driver.update(driver.id, { restaurant_ids: remaining, payment_config: cfg });
            console.log(`[MANAGE-DRIVERS] ${user.email} unlinked driver ${driver.id} from restaurant ${restaurantId}`);
            return Response.json({ success: true, removed: 'unlinked' });
        }

        // ── ratings ───────────────────────────────────────────────────────────
        if (action === 'ratings') {
            const rows = await driversOf(base44, restaurantId);
            const lists = await Promise.all(rows.map((d: any) =>
                base44.asServiceRole.entities.DriverRating.filter({ driver_id: d.id }).catch(() => [])));
            return Response.json({ success: true, ratings: lists.flat() });
        }

        // ── messages / sendMessage ────────────────────────────────────────────
        if (action === 'messages' || action === 'sendMessage') {
            const driver = await driverOfRestaurant(base44, String(body.driverId || ''), restaurantId);
            if (!driver) return fail(404, 'Driver not found for this restaurant');
            const orderId = String(body.orderId || '');
            const DriverMessage = base44.asServiceRole.entities.DriverMessage;

            if (action === 'messages') {
                const rows = await DriverMessage.filter({
                    restaurant_id: restaurantId,
                    driver_id: driver.id,
                    ...(orderId ? { order_id: orderId } : {}),
                }, 'created_date');
                return Response.json({ success: true, messages: rows || [] });
            }

            const text = typeof body.message === 'string' ? body.message.trim().slice(0, 1000) : '';
            if (!orderId) return fail(400, 'orderId is required');
            if (!text) return fail(400, 'Type a message first');
            const order = (await base44.asServiceRole.entities.Order.filter({ id: orderId }))?.[0];
            if (!order || order.restaurant_id !== restaurantId) return fail(404, 'Order not found for this restaurant');

            const created = await DriverMessage.create({
                order_id: orderId,
                driver_id: driver.id,
                restaurant_id: restaurantId,
                sender_type: 'restaurant',
                message: text,
                is_read: false,
            });
            return Response.json({ success: true, message: created });
        }

        // ── releaseDriver ─────────────────────────────────────────────────────
        if (action === 'releaseDriver') {
            const orderId = String(body.orderId || '');
            if (!orderId) return fail(400, 'orderId is required');
            const order = (await base44.asServiceRole.entities.Order.filter({ id: orderId }))?.[0];
            if (!order || order.restaurant_id !== restaurantId) return fail(404, 'Order not found for this restaurant');
            await releaseDriverForOrder(base44, order);
            return Response.json({ success: true });
        }

        return fail(400, `Unknown action: ${action || '(none)'}`);

    } catch (error) {
        console.error('[manageDrivers] Unhandled error:', error);
        return fail(500, 'Something went wrong. Please try again.');
    }
});
