import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const LIVE_STATUSES = ['pending', 'new', 'confirmed', 'preparing', 'out_for_delivery', 'ready_for_collection'];
const ALLOWED_STATUSES = ['confirmed', 'preparing', 'out_for_delivery', 'ready_for_collection', 'delivered', 'collected', 'cancelled'];

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
        let body = {};

        if (req.method === 'POST') {
            body = await req.json();
        } else if (req.method === 'GET') {
            // Support GET with query params for easy Android testing
            const url = new URL(req.url);
            body = {
                action: url.searchParams.get('action') || 'getOrders',
                restaurantId: url.searchParams.get('restaurantId'),
                orderId: url.searchParams.get('orderId'),
                status: url.searchParams.get('status'),
                apiKey: url.searchParams.get('apiKey'),
            };
        }

        // Validate API Key — accept from header OR body/query
        const androidApiKey = req.headers.get('X-API-Key') || body.apiKey;
        const expectedApiKey = Deno.env.get("ANDROID_APP_API_KEY");

        if (!androidApiKey || androidApiKey !== expectedApiKey) {
            return Response.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401, headers: CORS_HEADERS });
        }

        const { action, restaurantId, orderId, status } = body;

        // ── ACTION: Get live orders ──────────────────────────────────────
        if (action === 'getOrders' || !action) {
            if (!restaurantId) {
                return Response.json({ error: 'restaurantId is required' }, { status: 400, headers: CORS_HEADERS });
            }

            const base44 = createClientFromRequest(req);
            const orders = await base44.asServiceRole.entities.Order.filter({ restaurant_id: restaurantId });
            const liveOrders = orders.filter(o => LIVE_STATUSES.includes(o.status));

            return Response.json({ orders: liveOrders, count: liveOrders.length }, { headers: CORS_HEADERS });
        }

        // ── ACTION: Update order status ──────────────────────────────────
        if (action === 'updateStatus') {
            if (!orderId) return Response.json({ error: 'orderId is required' }, { status: 400, headers: CORS_HEADERS });
            if (!status)  return Response.json({ error: 'status is required' }, { status: 400, headers: CORS_HEADERS });

            if (!ALLOWED_STATUSES.includes(status)) {
                return Response.json({
                    error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}`
                }, { status: 400, headers: CORS_HEADERS });
            }

            const base44 = createClientFromRequest(req);
            const updated = await base44.asServiceRole.entities.Order.update(orderId, { status });

            return Response.json({ success: true, order: updated }, { headers: CORS_HEADERS });
        }

        // ── ACTION: Reject order ─────────────────────────────────────────
        if (action === 'rejectOrder') {
            if (!orderId) return Response.json({ error: 'orderId is required' }, { status: 400, headers: CORS_HEADERS });

            const base44 = createClientFromRequest(req);
            const rejectionReason = body.rejectionReason || 'Rejected by restaurant';
            const updated = await base44.asServiceRole.entities.Order.update(orderId, {
                status: 'cancelled',
                rejection_reason: rejectionReason,
            });

            return Response.json({ success: true, order: updated }, { headers: CORS_HEADERS });
        }

        return Response.json({ error: 'Unknown action. Use: getOrders, updateStatus, rejectOrder' }, { status: 400, headers: CORS_HEADERS });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
    }
});