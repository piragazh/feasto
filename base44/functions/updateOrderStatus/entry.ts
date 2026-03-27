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

const ALLOWED_ROLES = ['admin', 'manager', 'cashier', 'waiter', 'kitchen_staff'];

const VALID_STATUS_TRANSITIONS = {
  'pending': ['confirmed', 'cancelled'],
  'confirmed': ['preparing', 'cancelled'],
  'preparing': ['out_for_delivery', 'ready_for_collection', 'cancelled'],
  'out_for_delivery': ['delivered', 'cancelled'],
  'ready_for_collection': ['collected', 'cancelled'],
  'delivered': ['refund_requested'],
  'collected': ['refund_requested'],
  'cancelled': [],
  'refund_requested': ['refund_rejected_by_restaurant', 'refund_under_platform_review'],
  'refund_rejected_by_restaurant': [],
  'refund_under_platform_review': ['refunded', 'refund_rejected_by_restaurant'],
  'refunded': [],
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      return Response.json(
        { error: `Role '${user.role}' cannot update order status` },
        { status: 403 }
      );
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

    // Scope check: user must belong to restaurant or be admin
    if (user.role !== 'admin') {
      const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
        user_email: user.email,
        restaurant_ids: { $elemMatch: { $eq: order.restaurant_id } },
      });
      if (managers.length === 0) {
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
      await base44.functions.invoke('auditLog', auditPayload);
    } catch (e) {
      console.error('[updateOrderStatus] Audit log failed:', e);
      // Don't block the operation on audit failure
    }

    // Perform update
    const result = await base44.asServiceRole.entities.Order.update(order_id, updateData);

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