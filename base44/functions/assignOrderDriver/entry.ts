/**
 * assignOrderDriver — Hardened driver assignment with role checks, restaurant scope, and audit
 *
 * This is the ONLY path a manager screen may use to put a driver on an order
 * (Live Orders, Driver Tracking and Order Batching all call it).
 *
 * Accepts one order ({ orderId }) or a batch for one driver ({ orderIds: [...] }).
 *
 * SECURITY CONTRACT:
 *   1. Authenticate requester and verify they are an admin, or an active
 *      RestaurantManager for this restaurant (the same rule updateOrderStatus uses)
 *   2. Enforce restaurant scope:
 *      - Every order must belong to the user's restaurant
 *      - Driver must belong to the same restaurant
 *   3. Validate order state: only 'preparing' orders with no driver can receive one
 *   4. Validate driver state: must be active and available
 *   5. Calculate ETA server-side from distance, vehicle and time of day (no AI call)
 *   6. Re-read driver and orders immediately before writing, so a driver or order
 *      taken in the meantime is refused instead of overwritten
 *   7. Update Orders and Driver, rolling the orders back if a later write fails
 *   8. Audit the change with actor, timestamp, old/new driver
 *   9. Send customer notification
 *
 * All financial and operational fields are server-controlled.
 * Frontend cannot inject or modify critical data.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Valid order statuses for driver assignment
const ASSIGNABLE_ORDER_STATUSES = ['preparing'];

// Most orders one driver can be given in a single batch
const MAX_BATCH_SIZE = 10;

// ── ETA ─────────────────────────────────────────────────────────────────────
// This used to ask the AI (InvokeLLM) on every assignment, with no real distance
// to work from - it spent integration credits to guess. Now it is worked out from
// the straight-line distance between the restaurant and the drop-off.
const SPEED_KMH: Record<string, number> = { bike: 15, scooter: 25, car: 25 };   // urban averages
const ROAD_FACTOR = 1.3;        // roads are longer than a straight line
const HANDOVER_MIN = 4;         // parking, finding the door, handing over - per drop
const EXTRA_DROP_MIN = 6;       // each additional order in a batch
const FALLBACK_KM = 4;          // when an order has no coordinates

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function ukHour(date = new Date()) {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(date)) % 24;
}

/** e.g. "20-30 min" */
function estimateEta(restaurant: any, orders: any[], vehicleType: string): string {
    const origin = Number.isFinite(restaurant?.latitude) && Number.isFinite(restaurant?.longitude)
        ? { lat: restaurant.latitude, lng: restaurant.longitude } : null;
    const kms = orders.map(o => {
        const c = o?.delivery_coordinates;
        return origin && Number.isFinite(c?.lat) && Number.isFinite(c?.lng) ? distanceKm(origin, c) : FALLBACK_KM;
    });
    const furthestKm = Math.max(FALLBACK_KM / 2, ...kms) * ROAD_FACTOR;
    const speed = SPEED_KMH[vehicleType] || SPEED_KMH.bike;
    const hour = ukHour();
    const peak = (hour >= 12 && hour < 14) || (hour >= 18 && hour < 21) ? 1.25 : 1;
    const minutes = (furthestKm / speed) * 60 * peak + HANDOVER_MIN + EXTRA_DROP_MIN * (orders.length - 1);
    const low = Math.max(10, Math.round(minutes / 5) * 5);
    return `${low}-${low + 10} min`;
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // ── Authentication ────────────────────────────────────────────────────
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // NOTE: there is no platform role called 'manager' in this app - every
        // restaurant login has the role 'user', and what makes someone a manager is
        // an active RestaurantManager record. This function used to demand
        // role 'manager', which no account has, so only the platform admin could
        // ever assign a driver. Authorisation is the restaurant check below.

        const { restaurantId, orderId, orderIds: rawOrderIds, driverId } = await req.json();

        // One order (orderId) or a batch (orderIds). De-duplicated, order preserved.
        const requestedIds = Array.isArray(rawOrderIds) && rawOrderIds.length > 0
            ? rawOrderIds
            : (orderId ? [orderId] : []);
        const orderIds: string[] = [...new Set(
            requestedIds.filter((id: unknown) => typeof id === 'string' && id)
        )] as string[];

        if (!restaurantId || orderIds.length === 0 || !driverId) {
            return Response.json({ error: 'restaurantId, orderId, and driverId are required', success: false }, { status: 400 });
        }

        if (orderIds.length > MAX_BATCH_SIZE) {
            return Response.json({
                error: `A driver can be given at most ${MAX_BATCH_SIZE} orders at once`,
                success: false
            }, { status: 400 });
        }

        // ── Restaurant scope enforcement ──────────────────────────────────────
        // Verify that the user has permission to manage this restaurant
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId });
        if (!restaurants?.length) {
            console.error(`[ASSIGN-DRIVER] Restaurant not found: ${restaurantId}`);
            return Response.json({ error: 'Restaurant not found', success: false }, { status: 404 });
        }
        const restaurant = restaurants[0];

        // For non-admin users, verify they manage this restaurant
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true,
            });
            const hasAccess = (managers || []).some((m: any) => m.restaurant_ids?.includes(restaurantId));
            if (!hasAccess) {
                console.error(`[ASSIGN-DRIVER] Manager ${user.email} not authorized for restaurant ${restaurantId}`);
                return Response.json({
                    error: 'You are not authorized to manage this restaurant',
                    success: false
                }, { status: 403 });
            }
        }

        // ── Fetch and validate Orders ─────────────────────────────────────────
        // Returns an error Response if the order cannot take a driver, else the order.
        const loadAssignableOrder = async (id: string) => {
            const found = await base44.asServiceRole.entities.Order.filter({ id });
            if (!found?.length) {
                console.error(`[ASSIGN-DRIVER] Order not found: ${id}`);
                return { error: Response.json({ error: 'Order not found', success: false }, { status: 404 }) };
            }
            const o = found[0];

            // Verify order belongs to the correct restaurant
            if (o.restaurant_id !== restaurantId) {
                console.error(`[ASSIGN-DRIVER] Order ${id} belongs to restaurant ${o.restaurant_id}, not ${restaurantId}`);
                return { error: Response.json({
                    error: 'Order does not belong to this restaurant',
                    success: false
                }, { status: 403 }) };
            }

            // Verify order is in an assignable state
            if (!ASSIGNABLE_ORDER_STATUSES.includes(o.status)) {
                console.error(`[ASSIGN-DRIVER] Cannot assign driver to order in status=${o.status}`);
                return { error: Response.json({
                    error: `Driver can only be assigned to orders in 'preparing' state. Current state: '${o.status}'`,
                    success: false
                }, { status: 400 }) };
            }

            // Verify nobody else has taken the order
            if (o.driver_id && o.driver_id !== driverId) {
                console.error(`[ASSIGN-DRIVER] Order ${id} already has driver ${o.driver_id}`);
                return { error: Response.json({
                    error: 'This order has already been given to another driver',
                    success: false
                }, { status: 409 }) };
            }

            return { order: o };
        };

        const orders: any[] = [];
        for (const id of orderIds) {
            const result = await loadAssignableOrder(id);
            if (result.error) return result.error;
            orders.push(result.order);
        }

        // ── Fetch and validate Driver ─────────────────────────────────────────
        // Returns an error Response if the driver cannot take the work, else the driver.
        const loadAssignableDriver = async () => {
            const found = await base44.asServiceRole.entities.Driver.filter({ id: driverId });
            if (!found?.length) {
                console.error(`[ASSIGN-DRIVER] Driver not found: ${driverId}`);
                return { error: Response.json({ error: 'Driver not found', success: false }, { status: 404 }) };
            }
            const d = found[0];

            // Verify driver belongs to the restaurant
            if (!d.restaurant_ids?.includes(restaurantId)) {
                console.error(`[ASSIGN-DRIVER] Driver ${driverId} not assigned to restaurant ${restaurantId}`);
                return { error: Response.json({
                    error: 'Driver does not belong to this restaurant',
                    success: false
                }, { status: 403 }) };
            }

            // Verify driver is active and available
            if (d.is_available !== true) {
                console.error(`[ASSIGN-DRIVER] Driver ${driverId} is not available (is_available=${d.is_available})`);
                return { error: Response.json({
                    error: 'Driver is not available for assignment',
                    success: false
                }, { status: 400 }) };
            }

            // Verify driver doesn't have an active order. current_order_id can be left
            // behind by an order that was cancelled or voided elsewhere, so trust the
            // orders themselves: the driver is busy only if one is still out for delivery.
            if (d.current_order_id) {
                const live = await base44.asServiceRole.entities.Order.filter({
                    driver_id: driverId,
                    status: 'out_for_delivery',
                });
                if (live?.length) {
                    console.error(`[ASSIGN-DRIVER] Driver ${driverId} already assigned to order ${d.current_order_id}`);
                    return { error: Response.json({
                        error: 'Driver is already assigned to another order',
                        success: false
                    }, { status: 400 }) };
                }
            }

            return { driver: d };
        };

        const driverResult = await loadAssignableDriver();
        if (driverResult.error) return driverResult.error;
        const driver = driverResult.driver;

        // ── Calculate ETA (server-side) ───────────────────────────────────────
        let eta = '30-45 min';
        try {
            eta = estimateEta(restaurant, orders, driver.vehicle_type);
        } catch (etaErr) {
            console.warn(`[ASSIGN-DRIVER] ETA calculation failed, using fallback: ${(etaErr as any)?.message}`);
        }

        // ── Re-check just before writing ──────────────────────────────────────
        // Read the driver and the orders again so that anything taken in the
        // meantime is refused, not overwritten.
        const freshDriverResult = await loadAssignableDriver();
        if (freshDriverResult.error) return freshDriverResult.error;

        const freshOrders: any[] = [];
        for (const id of orderIds) {
            const result = await loadAssignableOrder(id);
            if (result.error) return result.error;
            freshOrders.push(result.order);
        }

        // ── Update Orders ─────────────────────────────────────────────────────
        const nowIso = new Date().toISOString();
        const batchNote = orderIds.length > 1
            ? `Batch assigned to ${driver.full_name}`
            : `Assigned to ${driver.full_name}`;

        const rollbackOrders = async (done: any[]) => {
            for (const original of done) {
                await base44.asServiceRole.entities.Order.update(original.id, {
                    driver_id: original.driver_id || null,
                    status: original.status,
                    status_history: original.status_history || [],
                }).catch((e: unknown) => console.error('[ASSIGN-DRIVER] Rollback failed:', e));
            }
        };

        const updatedOrders: any[] = [];
        const writtenOriginals: any[] = [];
        for (const original of freshOrders) {
            let updated = null;
            try {
                updated = await base44.asServiceRole.entities.Order.update(original.id, {
                    driver_id: driverId,
                    estimated_delivery: eta,
                    status: 'out_for_delivery',
                    status_history: [
                        ...(original.status_history || []),
                        { status: 'out_for_delivery', timestamp: nowIso, note: batchNote },
                    ],
                });
            } catch (updateErr) {
                console.error(`[ASSIGN-DRIVER] Order update threw for ${original.id}:`, updateErr);
            }

            if (!updated?.id) {
                await rollbackOrders(writtenOriginals);
                console.error(`[ASSIGN-DRIVER] Order update failed for ${original.id}`);
                return Response.json({ error: 'Failed to update order', success: false }, { status: 500 });
            }
            updatedOrders.push(updated);
            writtenOriginals.push(original);
        }

        // ── Update Driver ─────────────────────────────────────────────────────
        let updatedDriver = null;
        try {
            updatedDriver = await base44.asServiceRole.entities.Driver.update(driverId, {
                current_order_id: orderIds[0], // primary order of the run
                is_available: false,
            });
        } catch (driverErr) {
            console.error(`[ASSIGN-DRIVER] Driver update threw for ${driverId}:`, driverErr);
        }

        if (!updatedDriver?.id) {
            // Rollback order updates on driver failure
            await rollbackOrders(writtenOriginals);
            console.error(`[ASSIGN-DRIVER] Driver update failed for ${driverId}`);
            return Response.json({ error: 'Failed to update driver assignment', success: false }, { status: 500 });
        }

        // ── Audit Log + customer notification (per order, non-fatal) ──────────
        for (const original of freshOrders) {
            try {
                await base44.asServiceRole.functions.invoke('auditLog', {
                    action: 'assign_driver',
                    actor_email: user.email,
                    actor_role: user.role,
                    restaurant_id: restaurantId,
                    order_id: original.id,
                    old_driver_id: original.driver_id || null,
                    new_driver_id: driverId,
                    driver_name: driver.full_name,
                    estimated_delivery: eta,
                    timestamp: nowIso,
                    notes: `Driver assigned to order ${original.id}. ETA: ${eta}`,
                });
            } catch (auditErr) {
                console.warn('[ASSIGN-DRIVER] Audit log failed:', auditErr.message);
                // Non-fatal — order assignment succeeded
            }

            try {
                await base44.asServiceRole.functions.invoke('sendSMS', {
                    to: original.phone,
                    message: `Your order is on its way! Driver ${driver.full_name} will arrive in ${eta}. 🚗`,
                    orderId: original.id,
                    restaurantId,
                    restaurantName: restaurant.name,
                    smsType: 'driver_assignment',
                });
            } catch (notifyErr) {
                console.warn('[ASSIGN-DRIVER] Customer notification failed:', notifyErr.message);
                // Non-fatal
            }
        }

        console.log(`[ASSIGN-DRIVER] ✓ Assigned driver=${driverId} (${driver.full_name}) to orders=${orderIds.join(',')} restaurant=${restaurantId} actor=${user.email} eta="${eta}"`);

        return Response.json({
            success: true,
            order: updatedOrders[0],
            orders: updatedOrders,
            driver: updatedDriver,
            driver_name: driver.full_name,
            eta,
        }, { status: 200 });

    } catch (error) {
        console.error('[assignOrderDriver] Unhandled error:', error);
        return Response.json({
            error: 'Driver assignment failed. Please try again.',
            success: false
        }, { status: 500 });
    }
});
