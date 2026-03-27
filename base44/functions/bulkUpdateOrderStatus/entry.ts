import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * bulkUpdateOrderStatus — Hardened bulk order status update
 * 
 * SECURITY GATES:
 * 1. Role check: only manager, admin allowed
 * 2. Restaurant scope: all orders must belong to user's restaurant
 * 3. Status transition validation: same as single update
 * 4. Audit logging: each update logged individually
 * 5. Atomic: all or nothing (fails if any order violates rules)
 */

const ALLOWED_ROLES = ['admin', 'manager'];

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
        { error: `Role '${user.role}' cannot bulk update orders` },
        { status: 403 }
      );
    }

    const { order_ids, new_status } = await req.json();

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return Response.json(
        { error: 'Missing or empty order_ids array' },
        { status: 400 }
      );
    }

    if (!new_status) {
      return Response.json({ error: 'Missing required field: new_status' }, { status: 400 });
    }

    // SECURITY: Block 'cancelled' status — must use rejectOrderWithRefund instead
    if (new_status === 'cancelled') {
      return Response.json(
        { error: 'Bulk cancellation not allowed. Use rejectOrderWithRefund for individual order rejection to ensure refund processing.' },
        { status: 400 }
      );
    }

    if (order_ids.length > 100) {
      return Response.json(
        { error: 'Bulk update limited to 100 orders per request' },
        { status: 400 }
      );
    }

    // Fetch all orders
    const orders = await base44.asServiceRole.entities.Order.filter({
      id: { $in: order_ids },
    });

    if (orders.length !== order_ids.length) {
      return Response.json(
        { error: `Only ${orders.length} of ${order_ids.length} orders found` },
        { status: 404 }
      );
    }

    // Scope check: all orders must belong to user's restaurant(s)
    if (user.role !== 'admin') {
      const managerAccess = await base44.asServiceRole.entities.RestaurantManager.filter({
        user_email: user.email,
      });

      const allowedRestaurants = new Set();
      managerAccess.forEach(m => {
        if (m.restaurant_ids) {
          m.restaurant_ids.forEach(rid => allowedRestaurants.add(rid));
        }
      });

      const unauthorizedOrders = orders.filter(o => !allowedRestaurants.has(o.restaurant_id));
      if (unauthorizedOrders.length > 0) {
        return Response.json(
          { error: 'Access denied: not authorized for all orders' },
          { status: 403 }
        );
      }
    }

    // Validate all status transitions (atomic check)
    const transitionErrors = [];
    orders.forEach((order) => {
      const allowedTransitions = VALID_STATUS_TRANSITIONS[order.status] || [];
      if (!allowedTransitions.includes(new_status)) {
        transitionErrors.push({
          order_id: order.id,
          current: order.status,
          requested: new_status,
        });
      }
    });

    if (transitionErrors.length > 0) {
      return Response.json(
        {
          error: 'One or more orders have invalid status transitions',
          details: transitionErrors,
        },
        { status: 400 }
      );
    }

    // Perform bulk update
    const results = await Promise.all(
      orders.map(async (order) => {
        const updateData = { status: new_status };

        const statusHistory = order.status_history || [];
        statusHistory.push({
          status: new_status,
          timestamp: new Date().toISOString(),
          note: 'Bulk updated',
        });
        updateData.status_history = statusHistory;

        // Audit log each update
        const auditPayload = {
          action: 'bulk_order_status_update',
          entity_type: 'Order',
          entity_id: order.id,
          actor_email: user.email,
          actor_name: user.full_name || user.email,
          actor_role: user.role,
          restaurant_id: order.restaurant_id,
          old_value: order.status,
          new_value: new_status,
          timestamp: new Date().toISOString(),
          batch_size: order_ids.length,
        };

        try {
          await base44.functions.invoke('auditLog', auditPayload);
        } catch (e) {
          console.error('[bulkUpdateOrderStatus] Audit log failed for order', order.id, e);
          // Continue despite audit failure
        }

        return base44.asServiceRole.entities.Order.update(order.id, updateData);
      })
    );

    return Response.json({
      success: true,
      updated_count: results.length,
      new_status,
      order_ids,
      message: `Updated ${results.length} orders to ${new_status}`,
    });
  } catch (error) {
    console.error('[bulkUpdateOrderStatus] Error:', error);
    return Response.json(
      { error: error.message || 'Failed to bulk update orders' },
      { status: 500 }
    );
  }
});