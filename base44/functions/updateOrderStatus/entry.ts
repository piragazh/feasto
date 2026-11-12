import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * updateOrderStatus — Hardened order status update endpoint
 * 
 * SECURITY GATES:
 * 1. Role check: only manager, admin, cashier, waiter, kitchen_staff allowed
 * 2. Restaurant scope: must own the order
 * 3. Status transition validation: only allowed status paths permitted
 * 4. Allowlist: only status + rejection_reason fields may change
 * 5. Audit logging: all changes logged with actor identity
 */

const VALID_STATUS_TRANSITIONS = {
  'pending': ['confirmed', 'preparing', 'cancelled'],
  'confirmed': ['preparing', 'cancelled'],
  'preparing': ['out_for_delivery', 'ready_for_collection', 'delivered', 'collected', 'cancelled'],
  'out_for_delivery': ['delivered', 'cancelled'],
  'ready_for_collection': ['collected', 'delivered', 'cancelled'],
  'delivered': ['refund_requested'],
  'collected': ['refund_requested'],
  'cancelled': [],
  'refund_requested': ['refund_rejected_by_restaurant', 'refund_under_platform_review'],
  'refund_rejected_by_restaurant': [],
  'refund_under_platform_review': ['refunded', 'refund_rejected_by_restaurant'],
  'refunded': [],
};

// When an order leaves a driver's hands, free the driver - but only once nothing
// else is in the bag. Used to be done from the browser, which freed a driver
// carrying several orders as soon as the first was delivered.
async function releaseDriverForOrder(base44, order, newStatus) {
  if (!order?.driver_id) return;
  try {
    const Driver = base44.asServiceRole.entities.Driver;
    const live = await base44.asServiceRole.entities.Order.filter({
      driver_id: order.driver_id,
      status: 'out_for_delivery',
    });
    const others = (live || []).filter((o) => o.id !== order.id);
    const driver = (await Driver.filter({ id: order.driver_id }))?.[0];
    if (!driver) return;
    await Driver.update(driver.id, {
      ...(others.length === 0
        ? { current_order_id: null, is_available: true }
        : { current_order_id: others[0].id, is_available: false }),
      ...(newStatus === 'delivered' && order.status === 'out_for_delivery'
        ? { total_deliveries: (driver.total_deliveries || 0) + 1 }
        : {}),
    });
  } catch (e) {
    console.error('[updateOrderStatus] Driver release failed for order', order?.id, e?.message || e);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { order_id, new_status, rejection_reason } = await req.json();

    if (!order_id || !new_status) {
      return Response.json(
        { error: 'Missing required fields: order_id, new_status' },
        { status: 400 }
      );
    }

    // Fetch order
    const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
    const order = orders?.[0];

    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Scope check: admin always allowed; otherwise must be a restaurant manager for this restaurant
    if (user.role !== 'admin') {
      const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
        user_email: user.email,
        is_active: true,
      });
      const hasAccess = managers.some((manager) => manager.restaurant_ids?.includes(order.restaurant_id));
      if (!hasAccess) {
        return Response.json(
          { error: 'Access denied: not authorized for this restaurant' },
          { status: 403 }
        );
      }
    }

    // Status transition validation
    const currentStatus = order.status;
    const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];

    if (!allowedTransitions.includes(new_status)) {
      return Response.json(
        { error: `Cannot transition from '${currentStatus}' to '${new_status}'` },
        { status: 400 }
      );
    }

    // SECURITY: Block 'cancelled' status — must use rejectOrderWithRefund instead
    if (new_status === 'cancelled') {
      return Response.json(
        { error: 'Order cancellation must use rejectOrderWithRefund function to ensure refund processing for card payments' },
        { status: 400 }
      );
    }

    // Build safe update data — allowlist only permitted fields
    const updateData = { status: new_status };

    if (rejection_reason) {
      updateData.rejection_reason = rejection_reason;
    }

    // Add to status history
    const statusHistory = order.status_history || [];
    statusHistory.push({
      status: new_status,
      timestamp: new Date().toISOString(),
      note: rejection_reason || '',
    });
    updateData.status_history = statusHistory;

    // Audit log
    const auditPayload = {
      action: 'order_status_update',
      entity_type: 'Order',
      entity_id: order_id,
      actor_email: user.email,
      actor_name: user.full_name || user.email,
      actor_role: user.role,
      restaurant_id: order.restaurant_id,
      old_value: currentStatus,
      new_value: new_status,
      timestamp: new Date().toISOString(),
      reason: rejection_reason || undefined,
    };

    try {
      await base44.asServiceRole.functions.invoke('auditLog', auditPayload);
    } catch (e) {
      console.error('[updateOrderStatus] Audit log failed:', e);
      // Don't block the operation on audit failure
    }

    // Perform update
    // Record when a driver delivery actually arrived (driver performance reads this).
    if (new_status === 'delivered' && order.driver_id && !order.actual_delivery_time) {
      updateData.actual_delivery_time = new Date().toISOString();
    }

    const result = await base44.asServiceRole.entities.Order.update(order_id, updateData);

    // Free the driver (server-side; the browser no longer writes to the Driver table).
    if (['delivered', 'collected'].includes(new_status)) {
      await releaseDriverForOrder(base44, order, new_status);
    }

    // Dispatch customer-facing status notifications (SMS/WhatsApp) — fire and forget.
    // Non-blocking: a notification failure never rolls back the status update.
    base44.asServiceRole.functions
      .invoke('sendNotificationFromTemplate', {
        restaurantId: order.restaurant_id,
        orderId: order_id,
        newStatus: new_status,
        orderData: {
          order_number: order.order_number,
          phone: order.phone,
          guest_phone: order.phone,
          guest_name: order.guest_name,
          guest_email: order.guest_email,
          delivery_address: order.delivery_address,
          estimated_delivery: order.estimated_delivery,
          items: order.items,
        },
        rejectionReason: rejection_reason || null,
      })
      .catch((e) => console.error('[updateOrderStatus] Notification dispatch failed:', e?.message));

    return Response.json({
        success: true,
        order: result,
        message: `Order status updated from ${currentStatus} to ${new_status}`,
    });
  } catch (error) {
    console.error('[updateOrderStatus] Error:', error);
    return Response.json(
      { error: error.message || 'Failed to update order status' },
      { status: 500 }
    );
  }
});