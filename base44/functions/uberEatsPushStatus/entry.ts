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
 *
 * REJECT vs CANCEL
 *   Uber has two different calls. An order the kitchen REJECTS before accepting
 *   it is a deny (deny_pos_order); one it cancels AFTER accepting is a cancel.
 *   Both arrive here as status "cancelled", so the choice is made on whether an
 *   accept was ever sent. Sending cancel for an un-accepted order does not
 *   reject it - it sits unanswered until Uber times it out.
 *
 * RETRIES ARE BOUNDED
 *   The workflow fires on EVERY order update, including the ones this function
 *   makes. A failed push used to un-claim itself with a write, which re-fired
 *   the workflow, which failed again... for as long as Uber was down. Now:
 *     - transient failures (network, 5xx, 429, 401) are retried a couple of
 *       times inside the call, then recorded ONCE with a next-retry time
 *     - any invocation arriving before that time returns without writing, so
 *       the write->workflow->write chain stops after one hop
 *     - permanent failures (other 4xx) are never retried
 *     - after MAX_ATTEMPTS it gives up and leaves uber_push_error for staff
 *   Later retries come from the "Retry Failed Uber Eats Pushes" scheduled
 *   workflow, which calls this function with { sweep: true }.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// ── Uber specifics ──────────────────────────────────────────────────────────
// Sources: developer.uber.com/docs/eats — Authentication, Accept Order, Deny
// Order, Sandbox.
//
// VERIFIED against those docs:
//   token endpoint, scope, accept / deny / cancel paths and bodies, and the
//   allowed reason codes for deny and cancel.
//   (The token URL was previously login.uber.com, which is wrong: it is
//   auth.uber.com for production and sandbox-login.uber.com for sandbox.)
//
// NOT YET VERIFIED - confirm before relying on them:
//   the "ready" path, and the sandbox domains.
//
// Set UBER_EATS_SANDBOX=true to use Uber's test environment. Mixing sandbox
// credentials with production domains is their most common integration error.
const SANDBOX = String(Deno.env.get('UBER_EATS_SANDBOX') || '').toLowerCase() === 'true';

const UBER_API = {
    tokenUrl: SANDBOX
        ? 'https://sandbox-login.uber.com/oauth/v2/token'
        : 'https://auth.uber.com/oauth/v2/token',
    // Space-delimited. Only list scopes Uber has approved for the app - asking
    // for one that is not approved makes the token request fail. Must match
    // uberEatsWebhook, which shares the stored token.
    scope: (Deno.env.get('UBER_EATS_SCOPES') || 'eats.order').trim().replace(/\s+/g, ' '),
    base: SANDBOX ? 'https://test-api.uber.com/v1/eats' : 'https://api.uber.com/v1/eats',
    endpoints: {
        // VERIFIED
        accept: (id, _reason, ref) => ({
            path: `/orders/${id}/accept_pos_order`,
            body: { reason: 'Accepted in MealDrop POS', external_reference_id: ref || undefined },
        }),
        // VERIFIED. code must be one of Uber's fixed list.
        deny: (id, reason) => ({
            path: `/orders/${id}/deny_pos_order`,
            body: { reason: { explanation: (reason || 'Unable to fulfil this order').slice(0, 250), code: denyCode(reason) } },
        }),
        // UNVERIFIED
        ready: (id) => ({ path: `/orders/${id}/restaurant_order_ready`, body: {} }),
        // VERIFIED. reason must be one of Uber's fixed list; free text goes in
        // details. (This previously sent the free text AS the reason, which is
        // not an allowed value.)
        cancel: (id, reason) => {
            const code = cancelCode(reason);
            return {
                path: `/orders/${id}/cancel`,
                body: { reason: code, ...(code === 'OTHER' ? { details: (reason || 'Cancelled by restaurant').slice(0, 250) } : {}) },
            };
        },
    },
};

/** Staff type a free-text reason; Uber wants one of a fixed set of codes. */
function denyCode(reason) {
    const r = String(reason || '').toLowerCase();
    if (/stock|sold out|unavailable|run out|ran out|out of/.test(r)) return 'ITEM_AVAILABILITY';
    if (/busy|capacity|too many|backlog/.test(r)) return 'CAPACITY';
    if (/closed|closing/.test(r)) return 'STORE_CLOSED';
    if (/address/.test(r)) return 'ADDRESS';
    if (/price|pricing/.test(r)) return 'PRICING';
    return 'OTHER';
}
function cancelCode(reason) {
    const r = String(reason || '').toLowerCase();
    if (/stock|sold out|unavailable|run out|ran out|out of/.test(r)) return 'OUT_OF_ITEMS';
    if (/busy|capacity|too many|backlog/.test(r)) return 'RESTAURANT_TOO_BUSY';
    if (/closed|closing/.test(r)) return 'KITCHEN_CLOSED';
    if (/customer (called|asked|requested|cancel)/.test(r)) return 'CUSTOMER_CALLED_TO_CANCEL';
    return 'OTHER';
}

/**
 * Which Uber calls an order in this status still needs, in order.
 *
 *   confirmed / preparing     accept
 *   ready / out for delivery  accept first if it never went, then ready
 *   cancelled / refunded      deny if it was never accepted, otherwise cancel -
 *                             and nothing if Uber already knows (it cancelled
 *                             the order itself, or we already denied it)
 */
function actionsFor(order) {
    const pushed = order.uber_status_pushed || {};
    switch (order.status) {
        case 'confirmed':
        case 'preparing':
            return pushed.accept ? [] : ['accept'];
        case 'ready_for_collection':
        case 'out_for_delivery':
            return [...(pushed.accept ? [] : ['accept']), ...(pushed.ready ? [] : ['ready'])];
        case 'cancelled':
        case 'refunded':
            if (pushed.cancel || pushed.deny) return [];
            return [pushed.accept ? 'cancel' : 'deny'];
        default:
            return null;   // no Uber action for this status
    }
}

// ── Retry policy ────────────────────────────────────────────────────────────
// Uber auto-cancels an order not accepted or denied within 11.5 minutes, so the
// schedule is front-loaded: everything useful happens inside that window.
const MAX_ATTEMPTS = 6;
const BACKOFF_MS = [30_000, 60_000, 120_000, 180_000, 240_000];
const IN_CALL_WAITS_MS = [800, 2000];          // 3 tries per invocation
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/** Worth trying again: network error (status 0), auth refresh, throttling, server errors. */
const isTransient = (status) => status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;

// ── Application token ───────────────────────────────────────────────────────
// Tokens last 30 days and Uber allows only 100 per hour (the 101st invalidates
// the oldest). An in-memory cache alone is lost on every cold start, so the
// token is also kept in the server-only UberCredential entity and shared with
// uberEatsWebhook. If that entity is unavailable this degrades to memory only.
let cachedToken = null;   // { token, scope, expiresAt }
const TOKEN_KEY = `client_credentials:${SANDBOX ? 'sandbox' : 'production'}`;
const FRESH_FOR_MS = 5 * 60_000;

function tokenStore(base44) {
    try {
        const s = base44.asServiceRole.entities.UberCredential;
        return s && typeof s.filter === 'function' ? s : null;
    } catch { return null; }
}

/** A 401 from Uber means the cached token is dead: forget it everywhere. */
async function invalidateAccessToken(base44) {
    cachedToken = null;
    const store = tokenStore(base44);
    if (!store) return;
    try {
        const row = (await store.filter({ key: TOKEN_KEY }))?.[0];
        if (row?.id) await store.update(row.id, { expires_at: new Date(0).toISOString() });
    } catch { /* best effort */ }
}

async function getAccessToken(base44, clientId, clientSecret) {
    const now = Date.now();
    if (cachedToken && cachedToken.scope === UBER_API.scope && cachedToken.expiresAt > now + FRESH_FOR_MS) return cachedToken.token;

    const store = tokenStore(base44);
    let row = null;
    if (store) {
        try { row = (await store.filter({ key: TOKEN_KEY }))?.[0] || null; } catch { row = null; }
        const exp = row?.expires_at ? new Date(row.expires_at).getTime() : 0;
        if (row?.access_token && row.scope === UBER_API.scope && exp > now + FRESH_FOR_MS) {
            cachedToken = { token: row.access_token, scope: row.scope, expiresAt: exp };
            return cachedToken.token;
        }
    }

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
        scope: UBER_API.scope,
        expiresAt: now + (Number(json.expires_in || 3000) * 1000),
    };
    if (store) {
        const data = { access_token: json.access_token, scope: UBER_API.scope, expires_at: new Date(cachedToken.expiresAt).toISOString() };
        try {
            if (row?.id) await store.update(row.id, data);
            else await store.create({ key: TOKEN_KEY, ...data });
        } catch (e) {
            console.error('[UBER PUSH] could not persist token (still cached in memory):', e?.message);
        }
    }
    return cachedToken.token;
}

/** One Uber call, retried in place for transient failures. Never throws. */
async function sendToUber(base44, creds, path, payload) {
    let status = 0, detail = '';
    for (let attempt = 0; ; attempt++) {
        try {
            const token = await getAccessToken(base44, creds.clientId, creds.clientSecret);
            const res = await fetch(`${UBER_API.base}${path}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) return { ok: true, status: res.status || 200, detail: '' };
            status = Number(res.status) || 0;
            detail = `${status} ${await res.text().catch(() => '')}`.slice(0, 300);
            // Stale token: drop it so the next try mints a fresh one.
            if (status === 401) await invalidateAccessToken(base44);
        } catch (err) {
            status = 0;
            detail = err?.message || String(err);
        }
        if (!isTransient(status) || attempt >= IN_CALL_WAITS_MS.length) return { ok: false, status, detail };
        await sleep(IN_CALL_WAITS_MS[attempt]);
    }
}

/**
 * Bring Uber up to date with one order. Returns a plain result object; the
 * caller decides the HTTP status.
 *
 * WRITES ARE COUNTED DELIBERATELY - every write here can re-fire the workflow:
 *   skip paths            0 writes
 *   success               1 (the claim), +1 only if an old error needs clearing
 *   failure               2 (claim, then one combined un-claim + retry record)
 * and the invocation those writes trigger always lands on a 0-write skip path.
 */
async function pushOrder(base44, order, creds, { force = false } = {}) {
    if (order.third_party_platform !== 'uber_eats' || !order.third_party_order_id) {
        return { skipped: 'not an Uber Eats order' };
    }
    const actions = actionsFor(order);
    if (actions === null) return { skipped: `no Uber action for status ${order.status}` };
    if (!actions.length) {
        const last = { confirmed: 'accept', preparing: 'accept', ready_for_collection: 'ready', out_for_delivery: 'ready' }[order.status] || 'cancel';
        return { skipped: `${last} already sent` };
    }

    const Order = base44.asServiceRole.entities.Order;
    const reason = order.rejection_reason || order.cancellation_reason || order.void_reason || '';
    let pushed = { ...(order.uber_status_pushed || {}) };
    let hadError = Boolean(order.uber_push_error || order.uber_push_pending);
    let lastAction = null;

    for (const action of actions) {
        lastAction = action;

        // Retry gate. No writes on either branch - this is what ends the
        // write -> workflow -> write chain after a failure.
        const retry = order.uber_push_retry?.action === action ? order.uber_push_retry : null;
        if (retry?.gave_up && !force) return { skipped: `${action} gave up after ${retry.attempts} attempts`, action };
        if (retry?.next_retry_at && new Date(retry.next_retry_at).getTime() > Date.now() && !force) {
            return { skipped: `${action} backing off until ${retry.next_retry_at}`, action };
        }

        const { path, body: payload } = UBER_API.endpoints[action](order.third_party_order_id, reason, order.order_number);

        // Claim it BEFORE sending, so a second invocation racing this one sees
        // the action as taken and cannot send accept twice.
        const claimed = { ...pushed, [action]: new Date().toISOString() };
        await Order.update(order.id, { uber_status_pushed: claimed });

        let result = await sendToUber(base44, creds, path, payload);

        // Uber answers 404 to a cancel when the order is already finished or
        // cancelled on their side. There is nothing left to tell them.
        if (!result.ok && action === 'cancel' && result.status === 404) {
            result = { ok: true, status: 404, detail: '' };
        }

        if (result.ok) {
            pushed = claimed;
            console.log(`[UBER PUSH] ${action} sent for order=${order.id} uber=${order.third_party_order_id}`);
            continue;
        }

        // Failed. ONE write: un-claim (so it is not recorded as sent) and the
        // retry record together.
        const attempts = (retry?.attempts || 0) + 1;
        const permanent = !isTransient(result.status);
        const gaveUp = permanent || attempts >= MAX_ATTEMPTS;
        const nextRetryAt = gaveUp ? null : new Date(Date.now() + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]).toISOString();
        await Order.update(order.id, {
            uber_status_pushed: pushed,
            uber_push_error: `${action}: ${result.detail}${gaveUp ? (permanent ? ' — not retried (Uber rejected the request)' : ` — gave up after ${attempts} attempts`) : ''}`.slice(0, 500),
            uber_push_pending: !gaveUp,
            uber_push_retry: { action, attempts, next_retry_at: nextRetryAt, gave_up: gaveUp },
        });
        console.error(`[UBER PUSH] FAILED ${action} order=${order.id} uber=${order.third_party_order_id} attempt=${attempts}${gaveUp ? ' GAVE UP' : ` next=${nextRetryAt}`}: ${result.detail}`);
        return { pushed: false, action, error: result.detail, attempts, gave_up: gaveUp };
    }

    // Everything went. Clear an earlier failure - but only if there was one, so
    // the normal path stays at a single write.
    if (hadError) {
        await Order.update(order.id, { uber_push_error: '', uber_push_pending: false, uber_push_retry: {} });
    }
    return { pushed: true, action: lastAction };
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));

        const clientId = Deno.env.get('UBER_EATS_CLIENT_ID');
        const clientSecret = Deno.env.get('UBER_EATS_CLIENT_SECRET');
        const creds = { clientId, clientSecret };

        // ── Sweep: retry pushes whose back-off has elapsed ──────────────────
        // Called by the scheduled workflow. Orders only carry uber_push_pending
        // while a retry is genuinely outstanding, so this is normally empty.
        if (body.sweep === true) {
            if (!clientId || !clientSecret) return Response.json({ skipped: 'Uber Eats credentials not configured' });
            const pending = await base44.asServiceRole.entities.Order.filter({ third_party_platform: 'uber_eats', uber_push_pending: true });
            const results = [];
            for (const order of (pending || []).slice(0, 25)) {
                const due = !order.uber_push_retry?.next_retry_at || new Date(order.uber_push_retry.next_retry_at).getTime() <= Date.now();
                if (!due) continue;
                try {
                    results.push({ order_id: order.id, ...(await pushOrder(base44, order, creds)) });
                } catch (e) {
                    results.push({ order_id: order.id, error: e?.message || String(e) });
                }
            }
            return Response.json({ sweep: true, pending: pending?.length || 0, retried: results.length, results });
        }

        // ── Single order (workflow on Order update, or a direct call) ───────
        // Workflows send the order two ways: those created before Sep 2026 send
        // { event: { entity_id } }, newer ones send { entity_id, data } at the top level.
        // Reading only event.entity_id made every newer workflow fail ("Order ID
        // required") - stock never deducted, Uber never told. Accept both, and a
        // direct call's orderId / order_id.
        const orderId = body.orderId || body.order_id || body.entity_id || body.event?.entity_id || body.data?.id;
        if (!orderId) return Response.json({ error: 'Order ID required' }, { status: 400 });

        if (!clientId || !clientSecret) {
            return Response.json({ skipped: 'Uber Eats credentials not configured' });
        }

        const rows = await base44.asServiceRole.entities.Order.filter({ id: orderId });
        const order = rows?.[0];
        if (!order) return Response.json({ skipped: 'order not found' });

        // force: a manual "Retry now" from staff ignores back-off and gave-up.
        // The workflow never sends it, so it must come from a signed-in person -
        // otherwise anyone who could reach this URL could hammer Uber's API.
        let force = false;
        if (body.force === true) {
            const user = await base44.auth.me().catch(() => null);
            if (!user) return Response.json({ error: 'Sign in to retry' }, { status: 401 });
            force = true;
            console.log(`[UBER PUSH] manual retry of order=${order.id} by ${user.email}`);
        }
        const result = await pushOrder(base44, order, creds, { force });
        return Response.json(result, { status: result.pushed === false ? 502 : 200 });
    } catch (error) {
        console.error('[UBER PUSH] error:', error?.message || error);
        return Response.json({ error: 'Status push failed' }, { status: 500 });
    }
});
