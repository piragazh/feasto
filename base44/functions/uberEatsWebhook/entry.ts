/**
 * uberEatsWebhook — receive Uber Eats notifications and turn orders into MealDrop orders
 *
 * HOW UBER ACTUALLY DELIVERS AN ORDER (developer.uber.com/docs/eats/guides/webhooks)
 *
 * The webhook is a THIN NOTIFICATION. It does not contain the order:
 *
 *   { event_type: "orders.notification",
 *     meta: { user_id: <STORE ID>, resource_id: <ORDER ID>, status: "pos" },
 *     resource_href: "https://api.uber.com/v2/eats/order/<ORDER ID>" }
 *
 * The full order has to be fetched from resource_href with an application
 * (client_credentials) token. This function previously read items, customer and
 * store straight from the webhook body - none of which are there - so the store
 * id always resolved to empty and every real order was answered 503 until Uber
 * gave up retrying. No genuine Uber order could ever be created.
 *
 * WHAT IT DOES NOW
 *   1. verifies X-Uber-Signature (HMAC-SHA256 of the raw body, keyed by the webhook
 *      signing key set in Uber's dashboard, or the client secret on older apps)
 *   2. routes on event_type - a cancellation or a store event is never mistaken
 *      for a new order
 *   3. for a new order: matches the store (meta.user_id) to a restaurant, fetches
 *      the order, maps it, creates it once (dedup on Uber's order id)
 *   4. answers 200 with an empty body, as Uber asks
 *
 * FAILURE RULE
 *   Anything that stops an order being created answers 5xx, so Uber retries
 *   (10s, 30s, 60s, 120s ... 7 attempts). The dedup check makes a retry safe.
 *   Only events that can never succeed (malformed, unknown type) are acknowledged.
 *
 * Accept/deny is NOT sent from here - it is sent by uberEatsPushStatus when the
 * kitchen confirms the order. Uber auto-cancels an order that is not accepted or
 * denied within 11.5 minutes.
 *
 * ENV
 *   UBER_EATS_CLIENT_ID, UBER_EATS_CLIENT_SECRET   required
 *   UBER_EATS_WEBHOOK_SIGNING_KEY             the Signing Key typed into Uber's
 *                       webhook form (Basic HMAC). Optional _SECONDARY for rotation.
 *   UBER_EATS_SCOPES    optional, default "eats.order" - space delimited. Only
 *                       list scopes Uber has approved for the app: asking for one
 *                       that is not approved makes the token request fail.
 *   UBER_EATS_SANDBOX   "true" to use Uber's test environment
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SANDBOX = String(Deno.env.get('UBER_EATS_SANDBOX') || '').toLowerCase() === 'true';
const UBER = {
    tokenUrl: SANDBOX
        ? 'https://sandbox-login.uber.com/oauth/v2/token'
        : 'https://auth.uber.com/oauth/v2/token',
    apiOrigin: SANDBOX ? 'https://test-api.uber.com' : 'https://api.uber.com',
    scopes: (Deno.env.get('UBER_EATS_SCOPES') || 'eats.order').trim().replace(/\s+/g, ' '),
};
// The bearer token is only ever sent to these hosts, whatever resource_href says.
const UBER_API_HOSTS = ['api.uber.com', 'test-api.uber.com', 'sandbox-api.uber.com'];

const NEW_ORDER_EVENTS = ['orders.notification', 'orders.scheduled.notification'];
const CANCEL_EVENTS = ['orders.cancel', 'orders.failure'];
const FINAL_STATUSES = ['cancelled', 'refunded', 'delivered', 'collected'];

/** Uber wants a 200 with an empty body. */
const ack = () => new Response(null, { status: 200 });
const retryLater = (status, payload) => Response.json(payload, { status });

// ── Application token ───────────────────────────────────────────────────────
// Tokens last 30 days and Uber allows only 100 per hour (the 101st invalidates
// the oldest), so the token is cached in memory AND in the server-only
// UberCredential entity - a function cold start must not mint a new one.
// The same helper lives in uberEatsPushStatus; both share the stored row.
let memToken = null;   // { token, scope, expiresAt }
const TOKEN_KEY = `client_credentials:${SANDBOX ? 'sandbox' : 'production'}`;
const FRESH_FOR_MS = 5 * 60_000;

function tokenStore(base44) {
    try {
        const s = base44.asServiceRole.entities.UberCredential;
        return s && typeof s.filter === 'function' ? s : null;
    } catch { return null; }
}

async function getAppToken(base44, clientId, clientSecret) {
    const now = Date.now();
    if (memToken && memToken.scope === UBER.scopes && memToken.expiresAt > now + FRESH_FOR_MS) return memToken.token;

    const store = tokenStore(base44);
    let row = null;
    if (store) {
        try { row = (await store.filter({ key: TOKEN_KEY }))?.[0] || null; } catch { row = null; }
        const exp = row?.expires_at ? new Date(row.expires_at).getTime() : 0;
        if (row?.access_token && row.scope === UBER.scopes && exp > now + FRESH_FOR_MS) {
            memToken = { token: row.access_token, scope: row.scope, expiresAt: exp };
            return memToken.token;
        }
    }

    const res = await fetch(UBER.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
            scope: UBER.scopes,
        }),
    });
    if (!res.ok) throw new Error(`token request failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const json = await res.json();
    if (!json.access_token) throw new Error('token response had no access_token');

    const expiresAt = now + Number(json.expires_in || 3000) * 1000;
    memToken = { token: json.access_token, scope: UBER.scopes, expiresAt };
    if (store) {
        const data = { access_token: json.access_token, scope: UBER.scopes, expires_at: new Date(expiresAt).toISOString() };
        try {
            if (row?.id) await store.update(row.id, data);
            else await store.create({ key: TOKEN_KEY, ...data });
        } catch (e) {
            console.error('[UBER] could not persist token (still cached in memory):', e?.message);
        }
    }
    return memToken.token;
}

/** A 401 from Uber means the cached token is dead (revoked, or pushed out by the 100/hour rule). */
async function invalidateAppToken(base44) {
    memToken = null;
    const store = tokenStore(base44);
    if (!store) return;
    try {
        const row = (await store.filter({ key: TOKEN_KEY }))?.[0];
        if (row?.id) await store.update(row.id, { expires_at: new Date(0).toISOString() });
    } catch { /* best effort */ }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const money = (m) => Number(((Number(m?.amount) || 0) / 100).toFixed(2));

async function findRestaurantByStore(base44, storeId) {
    if (!storeId) return null;
    const R = base44.asServiceRole.entities.Restaurant;
    const matches = (r) => r?.third_party_integrations?.uber_eats?.store_id === storeId;
    try {
        const hit = await R.filter({ 'third_party_integrations.uber_eats.store_id': storeId });
        const m = (hit || []).find(matches);
        if (m) return m;
    } catch { /* nested filter unsupported - fall through to the scan */ }
    const all = await R.list();
    return (all || []).find(matches) || null;
}

async function setUberIntegration(base44, restaurant, patch) {
    const current = restaurant.third_party_integrations || {};
    current.uber_eats = { ...(current.uber_eats || {}), ...patch, updated_at: new Date().toISOString() };
    await base44.asServiceRole.entities.Restaurant.update(restaurant.id, { third_party_integrations: current });
}

/**
 * Our menu upload sends OUR item id as Uber's id and { mealdrop_id } in
 * external_data, so prefer that; otherwise fall back to whatever id Uber has.
 */
function mealdropItemId(item) {
    try {
        const ext = typeof item?.external_data === 'string' ? JSON.parse(item.external_data) : null;
        if (ext?.mealdrop_id) return String(ext.mealdrop_id);
    } catch { /* external_data is free text for menus we did not upload */ }
    return String(item?.id || '');
}

/** Modifier groups (and their nested groups) -> { "Group title": "Choice, 2x Other, No Onion" }. */
function flattenGroups(groups, acc, prefix = '') {
    for (const g of groups || []) {
        const title = `${prefix ? `${prefix} › ` : ''}${g?.title || g?.id || 'Options'}`;
        const picked = (g?.selected_items || []).map(i => `${Number(i?.quantity) > 1 ? `${i.quantity}x ` : ''}${i?.title || i?.id || 'Option'}`);
        const removed = (g?.removed_items || []).map(i => `No ${i?.title || i?.id || 'item'}`);
        const parts = [...picked, ...removed];
        if (parts.length) acc[title] = acc[title] ? `${acc[title]}, ${parts.join(', ')}` : parts.join(', ');
        for (const i of g?.selected_items || []) {
            if (i?.selected_modifier_groups?.length) flattenGroups(i.selected_modifier_groups, acc, i.title || i.id || '');
        }
    }
    return acc;
}

function allergyText(item) {
    const reqs = Array.isArray(item?.special_requests) ? item.special_requests : (item?.special_requests ? [item.special_requests] : []);
    const out = [];
    for (const r of reqs) {
        const a = r?.allergy;
        if (!a) continue;
        const list = (a.allergens_to_exclude || []).map(x => (x?.type === 'OTHER' ? x?.freeform_text : x?.type)).filter(Boolean);
        if (list.length) out.push(list.join(', '));
        if (a.allergy_instructions) out.push(String(a.allergy_instructions));
    }
    return out.join(' — ');
}

/** Uber v2 order (GET /v2/eats/order/{id}) -> MealDrop Order. */
function mapUberOrder(uberOrder, { restaurantId, uberOrderId, scheduled }) {
    const allergyNotes = [];
    const items = (uberOrder?.cart?.items || []).map(item => {
        const customizations = flattenGroups(item?.selected_modifier_groups, {});
        if (item?.special_instructions) customizations['Special instructions'] = String(item.special_instructions);
        const allergy = allergyText(item);
        if (allergy) {
            customizations['ALLERGY'] = allergy;
            allergyNotes.push(`ALLERGY (${item?.title || 'item'}): ${allergy}`);
        }
        return {
            menu_item_id: mealdropItemId(item),
            name: item?.title || 'Item',
            // unit_price already includes the selected options.
            price: money(item?.price?.unit_price),
            quantity: Number(item?.quantity) || 1,
            customizations,
        };
    });

    const charges = uberOrder?.payment?.charges || {};
    const itemsTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const subtotal = charges.sub_total ? money(charges.sub_total) : Number(itemsTotal.toFixed(2));
    const total = charges.total ? money(charges.total) : subtotal;

    const type = String(uberOrder?.type || 'DELIVERY_BY_UBER');
    const orderType = type === 'PICK_UP' ? 'collection' : type === 'DINE_IN' ? 'dine_in' : 'delivery';

    // Only merchant-delivered orders carry an address or a cash amount; an
    // Uber-couriered order is prepaid and the courier collects from the store.
    const merchantDelivery = type === 'DELIVERY_BY_RESTAURANT';
    const loc = uberOrder?.eater?.delivery?.location;
    const address = merchantDelivery
        ? [loc?.unit_number, loc?.business_name, loc?.street_address || loc?.title].filter(Boolean).join(', ')
        : (orderType === 'delivery' ? 'Uber Eats courier collects from store' : '');
    const cashDue = merchantDelivery ? money(charges.cash_amount_due) : 0;

    const eater = uberOrder?.eater || {};
    const phone = [eater.phone, eater.phone_code ? `code ${eater.phone_code}` : ''].filter(Boolean).join(' ');
    const notes = [
        uberOrder?.cart?.special_instructions,
        merchantDelivery ? eater?.delivery?.notes : '',
        ...allergyNotes,
    ].filter(Boolean).join(' | ');

    const displayId = String(uberOrder?.display_id || String(uberOrderId).slice(-5)).toUpperCase();

    return {
        restaurant_id: restaurantId,
        items,
        subtotal,
        delivery_fee: merchantDelivery ? money(charges.delivery_fee) : 0,
        discount: 0,
        total,
        payment_method: cashDue > 0 ? 'cash' : 'card',
        // Paid to Uber, not through MealDrop - there is no payment intent.
        payment_status: cashDue > 0 ? 'pending_payment' : 'paid_card',
        order_type: orderType,
        status: 'pending',
        delivery_address: address,
        phone,
        notes,
        guest_name: `${eater.first_name || ''} ${eater.last_name || ''}`.trim() || 'Uber Eats Customer',
        order_source: 'third_party',
        third_party_platform: 'uber_eats',
        third_party_order_id: uberOrderId,   // dedup key
        order_number: `UE-${displayId}`,
        ...(scheduled && uberOrder?.estimated_ready_for_pickup_at
            ? { is_scheduled: true, scheduled_for: uberOrder.estimated_ready_for_pickup_at }
            : {}),
    };
}

// ── Event handlers ──────────────────────────────────────────────────────────
async function handleNewOrder(base44, body, eventType) {
    const storeId = String(body?.meta?.user_id || '').trim();
    const uberOrderId = String(body?.meta?.resource_id || '').trim();
    if (!uberOrderId) {
        // Nothing to fetch and nothing a retry could fix.
        console.error('[UBER] order notification without meta.resource_id — ignored');
        return ack();
    }

    const Order = base44.asServiceRole.entities.Order;
    const existing = await Order.filter({ third_party_order_id: uberOrderId });
    if (existing?.length) {
        console.log(`[UBER] duplicate notification for ${uberOrderId} — already order ${existing[0].id}`);
        return ack();
    }

    const restaurant = await findRestaurantByStore(base44, storeId);
    if (!restaurant) {
        // A mistyped or unlinked store id must not silently lose orders: 503 makes
        // Uber retry, and the log line says exactly which store id to link.
        console.error(`[UBER] UNROUTED ORDER uber_order_id=${uberOrderId} store_id=${storeId || '(none)'} — no restaurant has this store id. Not created; Uber will retry.`);
        return retryLater(503, { error: 'Store not recognised', code: 'STORE_NOT_MAPPED', store_id: storeId || null });
    }
    if (restaurant.third_party_integrations?.uber_eats?.enabled === false) {
        console.log(`[UBER] order ${uberOrderId} for restaurant ${restaurant.id} ignored — Uber Eats integration is switched off`);
        return ack();
    }

    const clientId = Deno.env.get('UBER_EATS_CLIENT_ID');
    const clientSecret = Deno.env.get('UBER_EATS_CLIENT_SECRET');
    if (!clientId) {
        console.error('[UBER] UBER_EATS_CLIENT_ID not set — cannot fetch order details');
        return retryLater(503, { error: 'Integration not configured' });
    }

    // Only ever call Uber's own hosts with the bearer token.
    let href = `${UBER.apiOrigin}/v2/eats/order/${encodeURIComponent(uberOrderId)}`;
    try {
        const u = new URL(String(body?.resource_href || ''));
        if (u.protocol === 'https:' && UBER_API_HOSTS.includes(u.hostname)) href = u.toString();
    } catch { /* keep the constructed URL */ }

    let res = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        const token = await getAppToken(base44, clientId, clientSecret);
        res = await fetch(href, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
        if (res.status !== 401) break;
        await invalidateAppToken(base44);   // stale token: mint one fresh and try once more
    }
    if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        console.error(`[UBER] could not fetch order ${uberOrderId}: ${res.status} ${detail}`);
        return retryLater(502, { error: 'Could not fetch order from Uber', status: res.status });
    }
    const uberOrder = await res.json();

    if (['CANCELED', 'DENIED', 'FINISHED'].includes(String(uberOrder?.current_state || ''))) {
        console.log(`[UBER] order ${uberOrderId} is already ${uberOrder.current_state} on Uber — not created`);
        return ack();
    }
    if (!uberOrder?.cart?.items?.length) {
        console.error(`[UBER] order ${uberOrderId} came back with no items — not created; Uber will retry`);
        return retryLater(502, { error: 'Order had no items' });
    }

    const order = mapUberOrder(uberOrder, {
        restaurantId: restaurant.id,
        uberOrderId,
        scheduled: eventType === 'orders.scheduled.notification',
    });
    const created = await Order.create(order);

    // Two deliveries of the same notification can both pass the check above.
    // Keep the oldest, remove ours if we lost the race.
    try {
        const all = await Order.filter({ third_party_order_id: uberOrderId });
        if (all?.length > 1) {
            const oldest = [...all].sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)))[0];
            if (oldest.id !== created.id) {
                await Order.delete(created.id);
                console.log(`[UBER] removed racing duplicate ${created.id} of order ${uberOrderId}`);
                return ack();
            }
        }
    } catch (e) {
        console.error('[UBER] post-create duplicate check failed:', e?.message);
    }

    console.log(`[UBER] order created: ${created.id} (${order.order_number}) for restaurant ${restaurant.id} from Uber order ${uberOrderId}`);
    return ack();
}

async function handleCancel(base44, body) {
    const uberOrderId = String(body?.meta?.resource_id || '').trim();
    if (!uberOrderId) return ack();
    const Order = base44.asServiceRole.entities.Order;
    const order = (await Order.filter({ third_party_order_id: uberOrderId }))?.[0];
    if (!order) {
        console.log(`[UBER] cancel for unknown order ${uberOrderId} — nothing to do`);
        return ack();
    }
    if (!FINAL_STATUSES.includes(order.status)) {
        await Order.update(order.id, {
            status: 'cancelled',
            cancellation_reason: 'Cancelled on Uber Eats',
            // Uber already knows - stops uberEatsPushStatus sending a cancel back.
            uber_status_pushed: { ...(order.uber_status_pushed || {}), cancel: new Date().toISOString() },
        });
        console.log(`[UBER] order ${order.id} cancelled by Uber (${uberOrderId})`);
    }
    return ack();
}

async function handleStoreEvent(base44, body, provisioned) {
    const storeId = String(body?.store_id || body?.meta?.user_id || '').trim();
    const restaurant = await findRestaurantByStore(base44, storeId);
    if (!restaurant) {
        console.log(`[UBER] ${body?.event_type} for store ${storeId || '(none)'} — not linked to any restaurant`);
        return ack();
    }
    await setUberIntegration(base44, restaurant, provisioned
        ? { provisioned: true, provisioned_at: new Date().toISOString() }
        : { provisioned: false, enabled: false });
    console.log(`[UBER] store ${storeId} ${provisioned ? 'provisioned' : 'DEPROVISIONED'} for restaurant ${restaurant.id}`);
    return ack();
}

// ── Entry point ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Signature: lowercased hex HMAC-SHA256 of the RAW body. The body is read as
    // text and only parsed afterwards - re-serialising JSON changes the bytes and
    // breaks the signature.
    //
    // WHICH KEY: Uber's dashboard ("Add New Webhook" > Basic HMAC) now asks for a
    // Signing Key of your choosing, plus an optional Secondary Signing Key used
    // while rotating. Older apps are signed with the client secret instead. A
    // signature made with ANY configured key is accepted, so switching from one
    // to the other, or rotating keys, never drops an order.
    const signingKeys = [
        Deno.env.get('UBER_EATS_WEBHOOK_SIGNING_KEY'),
        Deno.env.get('UBER_EATS_WEBHOOK_SIGNING_KEY_SECONDARY'),
        Deno.env.get('UBER_EATS_CLIENT_SECRET'),
    ].map(k => String(k || '').trim()).filter(Boolean);
    if (!signingKeys.length) {
        console.error('[SECURITY] no Uber webhook signing key or client secret set — rejecting all webhook requests');
        return Response.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    const rawBody = await req.text();
    const providedSig = (req.headers.get('x-uber-signature') || '').trim().toLowerCase();

    let verified = false;
    try {
        for (const secret of new Set(signingKeys)) {
            const key = await crypto.subtle.importKey(
                'raw', new TextEncoder().encode(secret),
                { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
            );
            const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
            const expectedSig = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
            // Constant-time comparison; every key is always checked.
            let diff = providedSig.length ^ expectedSig.length;
            for (let i = 0; i < Math.max(providedSig.length, expectedSig.length); i++) {
                diff |= (providedSig.charCodeAt(i) || 0) ^ (expectedSig.charCodeAt(i) || 0);
            }
            if (diff === 0) verified = true;
        }
    } catch (e) {
        console.error('[UBER] could not compute signature:', e?.message);
        return Response.json({ error: 'Signature check failed' }, { status: 500 });
    }
    if (!verified) {
        console.error('[UBER] webhook rejected: signature mismatch');
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const eventType = String(body?.event_type || '');
    console.log(`[UBER] webhook ${eventType || '(no event_type)'} event_id=${body?.event_id || '-'} store=${body?.meta?.user_id || body?.store_id || '-'} resource=${body?.meta?.resource_id || '-'}`);

    try {
        const base44 = createClientFromRequest(req);

        if (NEW_ORDER_EVENTS.includes(eventType)) return await handleNewOrder(base44, body, eventType);
        if (CANCEL_EVENTS.includes(eventType)) return await handleCancel(base44, body);
        if (eventType === 'store.provisioned') return await handleStoreEvent(base44, body, true);
        if (eventType === 'store.deprovisioned') return await handleStoreEvent(base44, body, false);

        // orders.release, store.status.changed, order.fulfillment_issues.resolved...
        // Acknowledged so Uber does not retry something we do not act on.
        console.log(`[UBER] event ${eventType} acknowledged, no action taken`);
        return ack();
    } catch (error) {
        // 5xx, not 200: a 200 tells Uber the order reached us and it never retries,
        // so a transient failure here would lose the order for good.
        console.error(`[UBER] error processing ${eventType}:`, error?.message || error);
        return retryLater(500, { error: 'Processing failed' });
    }
});
