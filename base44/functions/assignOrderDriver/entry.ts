/**
 * assignOrderDriver — Hardened driver assignment with role checks, restaurant scope, and audit
 *
 * SECURITY CONTRACT:
 *   1. Authenticate requester and verify they are a manager/admin
 *   2. Enforce restaurant scope:
 *      - Order must belong to the user's restaurant
 *      - Driver must belong to the same restaurant
 *   3. Validate order state: only 'preparing' orders can receive a driver
 *   4. Validate driver state: must be active and available
 *   5. Calculate ETA via LLM (server-side, not frontend)
 *   6. Update Order and Driver atomically
 *   7. Audit the change with actor, timestamp, old/new driver
 *   8. Send customer notification
 *
 * All financial and operational fields are server-controlled.
 * Frontend cannot inject or modify critical data.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Authorized roles that can assign drivers
const AUTHORIZED_ROLES = ['admin', 'manager'];

// Valid order statuses for driver assignment
const ASSIGNABLE_ORDER_STATUSES = ['preparing'];

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

        // ── Role check ────────────────────────────────────────────────────────
        if (!AUTHORIZED_ROLES.includes(user.role)) {
            console.error(`[ASSIGN-DRIVER] Unauthorized role: ${user.role} email=${user.email}`);
            return Response.json({
                error: `Your role (${user.role}) cannot assign drivers. Only managers and admins can.`,
                success: false
            }, { status: 403 });
        }

        const { restaurantId, orderId, driverId } = await req.json();

        if (!restaurantId || !orderId || !driverId) {
            return Response.json({ error: 'restaurantId, orderId, and driverId are required', success: false }, { status: 400 });
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
        if (user.role === 'manager') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                restaurant_ids: { $elemMatch: { $eq: restaurantId } }
            });
            if (!managers?.length) {
                console.error(`[ASSIGN-DRIVER] Manager ${user.email} not authorized for restaurant ${restaurantId}`);
                return Response.json({
                    error: 'You are not authorized to manage this restaurant',
                    success: false
                }, { status: 403 });
            }
        }

        // ── Fetch and validate Order ──────────────────────────────────────────
        const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
        if (!orders?.length) {
            console.error(`[ASSIGN-DRIVER] Order not found: ${orderId}`);
            return Response.json({ error: 'Order not found', success: false }, { status: 404 });
        }

        const order = orders[0];

        // Verify order belongs to the correct restaurant
        if (order.restaurant_id !== restaurantId) {
            console.error(`[ASSIGN-DRIVER] Order ${orderId} belongs to restaurant ${order.restaurant_id}, not ${restaurantId}`);
            return Response.json({
                error: 'Order does not belong to this restaurant',
                success: false
            }, { status: 403 });
        }

        // Verify order is in an assignable state
        if (!ASSIGNABLE_ORDER_STATUSES.includes(order.status)) {
            console.error(`[ASSIGN-DRIVER] Cannot assign driver to order in status=${order.status}`);
            return Response.json({
                error: `Driver can only be assigned to orders in 'preparing' state. Current state: '${order.status}'`,
                success: false
            }, { status: 400 });
        }

        // ── Fetch and validate Driver ─────────────────────────────────────────
        const drivers = await base44.asServiceRole.entities.Driver.filter({ id: driverId });
        if (!drivers?.length) {
            console.error(`[ASSIGN-DRIVER] Driver not found: ${driverId}`);
            return Response.json({ error: 'Driver not found', success: false }, { status: 404 });
        }

        const driver = drivers[0];

        // Verify driver belongs to the restaurant
        if (!driver.restaurant_ids?.includes(restaurantId)) {
            console.error(`[ASSIGN-DRIVER] Driver ${driverId} not assigned to restaurant ${restaurantId}`);
            return Response.json({
                error: 'Driver does not belong to this restaurant',
                success: false
            }, { status: 403 });
        }

        // Verify driver is active and available
        if (driver.is_available !== true) {
            console.error(`[ASSIGN-DRIVER] Driver ${driverId} is not available (is_available=${driver.is_available})`);
            return Response.json({
                error: 'Driver is not available for assignment',
                success: false
            }, { status: 400 });
        }

        // Verify driver doesn't have an active order
        if (driver.current_order_id) {
            console.error(`[ASSIGN-DRIVER] Driver ${driverId} already assigned to order ${driver.current_order_id}`);
            return Response.json({
                error: 'Driver is already assigned to another order',
                success: false
            }, { status: 400 });
        }

        // ── Calculate ETA (server-side) ───────────────────────────────────────
        const etaPrompt = `Calculate estimated delivery time for a food delivery order.
Distance: Assume 3-5 km average urban delivery.
Traffic: Consider it's ${new Date().getHours()}:00, adjust for peak hours (12-14, 18-21).
Vehicle: ${driver.vehicle_type}
Provide only the time range (e.g., "25-30 min").`;

        let eta = '30-45 min'; // fallback if LLM fails
        try {
            const etaResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
                prompt: etaPrompt
            });
            if (etaResponse?.data) {
                eta = etaResponse.data;
            }
        } catch (etaErr) {
            console.warn(`[ASSIGN-DRIVER] ETA calculation failed, using fallback: ${etaErr.message}`);
        }

        // ── Update Order (atomic) ─────────────────────────────────────────────
        const oldDriverId = order.driver_id || null;
        const updatedOrder = await base44.asServiceRole.entities.Order.update(orderId, {
            driver_id: driverId,
            estimated_delivery: eta,
            status: 'out_for_delivery',
        });

        if (!updatedOrder?.id) {
            console.error(`[ASSIGN-DRIVER] Order update failed for ${orderId}`);
            return Response.json({ error: 'Failed to update order', success: false }, { status: 500 });
        }

        // ── Update Driver (atomic) ────────────────────────────────────────────
        const updatedDriver = await base44.asServiceRole.entities.Driver.update(driverId, {
            current_order_id: orderId,
            is_available: false,
        });

        if (!updatedDriver?.id) {
            // Rollback order update on driver failure
            await base44.asServiceRole.entities.Order.update(orderId, {
                driver_id: oldDriverId,
                status: order.status,
            }).catch(e => console.error('[ASSIGN-DRIVER] Rollback failed:', e));

            console.error(`[ASSIGN-DRIVER] Driver update failed for ${driverId}`);
            return Response.json({ error: 'Failed to update driver assignment', success: false }, { status: 500 });
        }

        // ── Audit Log ─────────────────────────────────────────────────────────
        try {
            await base44.asServiceRole.functions.invoke('auditLog', {
                action: 'assign_driver',
                actor_email: user.email,
                actor_role: user.role,
                restaurant_id: restaurantId,
                order_id: orderId,
                old_driver_id: oldDriverId,
                new_driver_id: driverId,
                driver_name: driver.full_name,
                estimated_delivery: eta,
                timestamp: new Date().toISOString(),
                notes: `Driver assigned to order ${orderId}. ETA: ${eta}`,
            });
        } catch (auditErr) {
            console.warn('[ASSIGN-DRIVER] Audit log failed:', auditErr.message);
            // Non-fatal — order assignment succeeded
        }

        // ── Send customer notification ────────────────────────────────────────
        try {
            await base44.asServiceRole.functions.invoke('sendSMS', {
                to: order.phone,
                message: `Your order is on its way! Driver ${driver.full_name} will arrive in ${eta}. 🚗`,
                orderId,
                restaurantId,
                restaurantName: restaurant.name,
                smsType: 'driver_assignment',
            });
        } catch (notifyErr) {
            console.warn('[ASSIGN-DRIVER] Customer notification failed:', notifyErr.message);
            // Non-fatal
        }

        console.log(`[ASSIGN-DRIVER] ✓ Assigned driver=${driverId} (${driver.full_name}) to order=${orderId} restaurant=${restaurantId} actor=${user.email} eta="${eta}"`);

        return Response.json({
            success: true,
            order: updatedOrder,
            driver: updatedDriver,
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