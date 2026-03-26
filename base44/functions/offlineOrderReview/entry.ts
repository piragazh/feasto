import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Offline Order Review Action
 * 
 * Server-controlled manager workflow for flagged offline orders:
 * - acknowledge (confirmed receipt of flag)
 * - resolved (order acceptable, no issues)
 * - escalated (needs further investigation)
 * 
 * SECURITY:
 * - Manager access enforced (RestaurantManager check)
 * - Tenant scope enforced (restaurant_id check)
 * - All review state writes server-side (no client-side writes)
 * - Audit logged via DashboardActivity
 */

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { order_id, restaurant_id, action, review_notes } = await req.json();

        if (!order_id || !restaurant_id || !action) {
            return Response.json({ error: 'order_id, restaurant_id, action required' }, { status: 400 });
        }

        const validActions = ['acknowledge', 'resolved', 'escalated'];
        if (!validActions.includes(action)) {
            return Response.json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` }, { status: 400 });
        }

        // ── TENANT CHECK ────────────────────────────────────────────────────────
        // Verify manager has access to this restaurant
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email,
                is_active: true,
            });
            const hasAccess = managers.some(m => m.restaurant_ids?.includes(restaurant_id));
            if (!hasAccess) {
                console.error(`[SECURITY] ${user.email} attempted offline review action for restaurant ${restaurant_id}`);
                return Response.json({ error: 'Access denied to this restaurant' }, { status: 403 });
            }
        }

        // ── FETCH AND VERIFY ORDER ──────────────────────────────────────────────
        const orders = await base44.asServiceRole.entities.Order.filter({
            id: order_id,
            restaurant_id: restaurant_id,
        });

        if (!orders || orders.length === 0) {
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }

        const order = orders[0];

        // Only offline + flagged orders can be reviewed
        if (!order.offline_created || !order.needs_review) {
            return Response.json({
                error: 'Only flagged offline orders (needs_review=true) can be reviewed',
            }, { status: 400 });
        }

        // ── DETERMINE NEW STATUS ────────────────────────────────────────────────
        let newStatus;
        if (action === 'acknowledge') {
            newStatus = 'acknowledged';
        } else if (action === 'resolved') {
            newStatus = 'resolved';
        } else if (action === 'escalated') {
            newStatus = 'escalated';
        }

        // ── UPDATE ORDER WITH REVIEW STATE ──────────────────────────────────────
        const reviewUpdate = {
            offline_review_status: newStatus,
            offline_review_by: user.email,
            offline_review_at: new Date().toISOString(),
        };

        if (review_notes && typeof review_notes === 'string') {
            reviewUpdate.offline_review_notes = review_notes.trim();
        }

        await base44.asServiceRole.entities.Order.update(order_id, reviewUpdate);

        // ── AUDIT LOG ────────────────────────────────────────────────────────────
        const auditDetails = {
            order_id,
            restaurant_id,
            action,
            new_status: newStatus,
            review_notes: review_notes || null,
            sync_validation_notes: order.sync_validation_notes,
        };

        console.log(`[AUDIT] OFFLINE_ORDER_REVIEW: order=${order_id} action=${action} status=${newStatus} by=${user.email} restaurant=${restaurant_id}`);

        try {
            await base44.asServiceRole.entities.DashboardActivity.create({
                user_email: user.email,
                action: 'OFFLINE_ORDER_REVIEW',
                resource_type: 'Order',
                resource_id: order_id,
                details: JSON.stringify(auditDetails),
                severity: 'info',
            });
        } catch (dbErr) {
            console.error('[AUDIT] Could not persist offline review audit log:', dbErr.message);
        }

        return Response.json({
            success: true,
            order_id,
            new_status: newStatus,
            reviewed_by: user.email,
            reviewed_at: reviewUpdate.offline_review_at,
        });

    } catch (error) {
        console.error('[OFFLINE-REVIEW] Error:', error);
        return Response.json({ error: 'Review action failed. Please try again.' }, { status: 500 });
    }
});