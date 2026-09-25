/**
 * uberEatsPushStatus — tell Uber Eats what the kitchen has done
 *
 * Order capture already works: a webhook creates the order and the KDS shows it.
 * But nothing ever told Uber. An order the kitchen has accepted still looks
 * UNACKNOWLEDGED to Uber, which auto-cancels it after its window - the customer
 * is told the restaurant never took the order while it cooks happily on the pass.
 * Courier dispatch is timed off the same missing information.
 *
 * Fired by a workflow whenever an Order changes, so no screen has to remember to
 * call it.
 *
 * ── VERIFY BEFORE GOING LIVE ────────────────────────────────────────────────
 * Every Uber-specific detail is in UBER_API below. These were written from
 * general knowledge of their partner API, NOT from your account's documentation,
 * and Uber changes them. Check each path and payload against your partner docs
 * before enabling. Nothing else in this file needs to change to correct them.
 *
 * SAFE BY DEFAULT
 *   - does nothing unless UBER_EATS_CLIENT_ID / _SECRET are set
 *   - never throws into the caller: a failed push is logged, never breaks service
 *   - exactly-once per action, recorded on the order, so a workflow firing twice
 *     cannot accept the same order twice
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// ── Uber specifics: CONFIRM AGAINST YOUR PARTNER DOCUMENTATION ──────────────
const UBER_API = {
    tokenUrl: 'https://login.uber.com/oauth/v2/token',
    scope: 'eats.order',
    base: 'https://api.uber.com/v1/eats',
    // action -> how to call it for a given platform order id
    endpoints: {
        accept: (id) => ({ path: `/orders/${id}/accept_pos_order`, body: {} }),
        deny: (id, reason) => ({ path: `/orders/${id}/deny_pos_order`, body: { reason: { explanation: reason || 'Unable to fulfil', code: 'STORE_CLOSED' } } }),
        ready: (id) => ({ path: `/orders/${id}/restaurant_order_ready`, body: {} }),
        cancel: (id, reason) => ({ path: `/orders/${id}/cancel`, body: { reason: reason || 'Cancelled by restaurant' } }),
    },
};

/** Our order status -> the Uber action it should trigger. */
const STATUS_ACTION = {
    confirmed: 'accept',
    preparing: 'accept',            // accepting covers it; sent once
    ready_for_collection: 'ready',
    out_for_delivery: 'ready',
    cancelled: 'cancel',
    refunded: 'cancel',
};

let cachedToken = null;   // { token, expiresAt }

async function getAccessToken(clientId, clientSecret) {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
    const res = await fetch(UBER_API.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
            scope: UBER_API.scope,
        }),
    });
    if (!res.ok) throw new Error(`token request failed: ${res.status} ${await res.text().catch(() => '')}`);
    const json = await res.json();
    if (!json.access_token) throw new Error('token response had no access_token');
    cachedToken = {
        token: json.access_token,
        expiresAt: Date.now() + (Number(json.expires_in || 3000) * 1000),
    };
    return cachedToken.token;
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const orderId = body.orderId || body.event?.entity_id;
        if (!orderId) return Response.json({ error: 'Order ID required' }, { status: 400 });

        const clientId = Deno.env.get('UBER_EATS_CLIENT_ID');
        const clientSecret = Deno.env.get('UBER_EATS_CLIENT_SECRET');
        if (!clientId || !clientSecret) {
            return Response.json({ skipped: 'Uber Eats credentials not configured' });
        }

        const rows = await base44.asServiceRole.entities.Order.filter({ id: orderId });
        const order = rows?.[0];
        if (!order) return Response.json({ skipped: 'order not found' });
        if (order.third_party_platform !== 'uber_eats' || !order.third_party_order_id) {
            return Response.json({ skipped: 'not an Uber Eats order' });
        }

        const action = STATUS_ACTION[order.status];
        if (!action) return Response.json({ skipped: `no Uber action for status ${order.status}` });

        // Exactly once per action. The workflow fires on every order change, and
        // accepting an order twice is an error on Uber's side.
        const pushed = order.uber_status_pushed || {};
        if (pushed[action]) return Response.json({ skipped: `${action} already sent` });

        const reason = order.cancellation_reason || order.void_reason || '';
        const { path, body: payload } = UBER_API.endpoints[action](order.third_party_order_id, reason);

        // Claim it BEFORE sending. If the call then fails we retry via the
        // failure record rather than risk sending accept twice.
        await base44.asServiceRole.entities.Order.update(order.id, {
            uber_status_pushed: { ...pushed, [action]: new Date().toISOString() },
        });

        let ok = false, detail = '';
        try {
            const token = await getAccessToken(clientId, clientSecret);
            const res = await fetch(`${UBER_API.base}${path}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            ok = res.ok;
            detail = ok ? '' : `${res.status} ${await res.text().catch(() => '')}`.slice(0, 300);
        } catch (err) {
            detail = err?.message || String(err);
        }

        if (!ok) {
            // Un-claim so it can be retried, and record the failure loudly: an
            // order Uber never heard about will be auto-cancelled on them.
            await base44.asServiceRole.entities.Order.update(order.id, {
                uber_status_pushed: pushed,
                uber_push_error: `${action}: ${detail}`.slice(0, 500),
            });
            console.error(`[UBER PUSH] FAILED ${action} order=${order.id} uber=${order.third_party_order_id}: ${detail}`);
            return Response.json({ pushed: false, action, error: detail }, { status: 502 });
        }

        console.log(`[UBER PUSH] ${action} sent for order=${order.id} uber=${order.third_party_order_id}`);
        return Response.json({ pushed: true, action });
    } catch (error) {
        console.error('[UBER PUSH] error:', error?.message || error);
        return Response.json({ error: 'Status push failed' }, { status: 500 });
    }
});
