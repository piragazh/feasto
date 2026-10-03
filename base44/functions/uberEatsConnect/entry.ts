/**
 * uberEatsConnect — let a restaurant authorise MealDrop on Uber's own site
 *
 * Uber only sends a store's orders to an app that the MERCHANT has provisioned.
 * Typing a store id into a settings screen does not do that. The real flow
 * (developer.uber.com/docs/eats/guides/authentication + pos-provision):
 *
 *   1. start      we send the manager to Uber's login with scope
 *                 eats.pos_provisioning (authorization_code grant)
 *   2. exchange   Uber redirects back with a single-use code; we swap it for a
 *                 MERCHANT token and list the stores that login can manage
 *   3. provision  the manager picks the store; we POST /stores/{id}/pos_data,
 *                 which is what switches order webhooks on for our app, then
 *                 save the store id against the restaurant
 *
 * The restaurant types their Uber password into Uber's page, never into ours.
 *
 * TOKENS
 *   The merchant token is needed for one more call after step 2 and nothing
 *   after that, so it is not stored. It is handed back to the browser SEALED
 *   (AES-GCM, key derived from the client secret, 15 minute expiry, bound to the
 *   user and restaurant) and unsealed in step 3. The browser cannot read it.
 *   Order, menu and status calls use the separate client_credentials token -
 *   Uber does not allow one token to carry both kinds of scope.
 *
 * ENV
 *   UBER_EATS_CLIENT_ID, UBER_EATS_CLIENT_SECRET   required
 *   UBER_EATS_REDIRECT_URI   required - must match a redirect URI registered in
 *                            the Uber developer dashboard EXACTLY, and must be
 *                            the RestaurantDashboard page of this app, e.g.
 *                            https://<your-domain>/RestaurantDashboard
 *   UBER_EATS_SANDBOX        "true" to use Uber's test environment
 *
 * CUSTOM DOMAINS
 *   Only the redirect URI's own domain can finish the flow. "start" called from
 *   any other origin answers { handoff } - the same dashboard on the main
 *   domain - instead of an Uber URL. See src/lib/uberConnectIntent.js.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SANDBOX = String(Deno.env.get('UBER_EATS_SANDBOX') || '').toLowerCase() === 'true';
const UBER = {
    authorizeUrl: SANDBOX
        ? 'https://sandbox-login.uber.com/oauth/v2/authorize'
        : 'https://auth.uber.com/oauth/v2/authorize',
    tokenUrl: SANDBOX
        ? 'https://sandbox-login.uber.com/oauth/v2/token'
        : 'https://auth.uber.com/oauth/v2/token',
    api: SANDBOX ? 'https://test-api.uber.com/v1/eats' : 'https://api.uber.com/v1/eats',
    scope: 'eats.pos_provisioning',
};

const STATE_TTL_MS = 15 * 60_000;
const GRANT_TTL_MS = 15 * 60_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ── base64url ───────────────────────────────────────────────────────────────
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => {
    const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(b, c => c.charCodeAt(0));
};

// ── state: signed, so the callback cannot be pointed at another restaurant ──
async function hmacHex(secret, text) {
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, enc.encode(text));
    return Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const safeEqual = (a, b) => {
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
};

/** "ue.<payload>.<sig>" - the dashboard reads payload.r to reopen the right restaurant. */
async function signState(secret, payload) {
    const body = b64u(enc.encode(JSON.stringify(payload)));
    return `ue.${body}.${await hmacHex(secret, `state:${body}`)}`;
}
async function readState(secret, state) {
    const [tag, body, sig] = String(state || '').split('.');
    if (tag !== 'ue' || !body || !sig) return null;
    if (!safeEqual(sig, await hmacHex(secret, `state:${body}`))) return null;
    try {
        const p = JSON.parse(dec.decode(unb64u(body)));
        return p?.x > Date.now() ? p : null;
    } catch { return null; }
}

// ── grant: the merchant token, sealed so the browser can carry but not read it ─
async function sealKey(secret) {
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${secret}|uber-merchant-grant`));
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function seal(secret, payload) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(secret), enc.encode(JSON.stringify(payload))));
    const out = new Uint8Array(iv.length + ct.length);
    out.set(iv); out.set(ct, iv.length);
    return b64u(out);
}
async function unseal(secret, sealed) {
    try {
        const raw = unb64u(sealed);
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await sealKey(secret), raw.slice(12));
        const p = JSON.parse(dec.decode(pt));
        return p?.x > Date.now() ? p : null;
    } catch { return null; }
}

// ── tenancy ─────────────────────────────────────────────────────────────────
async function canManage(base44, user, restaurantId) {
    if (user.role === 'admin') return true;
    const managers = await base44.asServiceRole.entities.RestaurantManager.filter({ user_email: user.email, is_active: true });
    return managers.some(m => m.restaurant_ids?.includes(restaurantId));
}

const fail = (status, error, code) => Response.json({ error, ...(code ? { code } : {}) }, { status });

function storeSummary(s) {
    const loc = s?.location || {};
    return {
        store_id: String(s?.store_id || s?.id || ''),
        name: String(s?.name || 'Unnamed store'),
        address: [loc.address || loc.street_address, loc.address_2, loc.city, loc.postal_code].filter(Boolean).join(', '),
        // An existing integration is shown so nobody takes over a store by accident.
        already_integrated: Boolean(s?.pos_data?.integration_enabled || s?.pos_data?.pos_integration_enabled),
    };
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return fail(405, 'POST only');

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return fail(401, 'Unauthorized');

        const clientId = Deno.env.get('UBER_EATS_CLIENT_ID');
        const clientSecret = Deno.env.get('UBER_EATS_CLIENT_SECRET');
        const redirectUri = Deno.env.get('UBER_EATS_REDIRECT_URI');
        if (!clientId || !clientSecret || !redirectUri) {
            return fail(503, 'Uber Eats sign-in is not set up yet. Ask MealDrop support to finish the Uber configuration.', 'UBER_NOT_CONFIGURED');
        }

        const body = await req.json().catch(() => ({}));
        const action = String(body.action || '');

        // ── 1. start ────────────────────────────────────────────────────────
        if (action === 'start') {
            const restaurantId = String(body.restaurantId || '');
            if (!restaurantId) return fail(400, 'restaurantId is required');
            if (!(await canManage(base44, user, restaurantId))) return fail(403, 'Access denied');

            // Uber returns the manager to ONE fixed address (the redirect URI),
            // and finishing requires the session that started. A manager on a
            // restaurant's custom domain has no session on that address, so the
            // flow is restarted THERE instead: the browser goes to the same
            // dashboard on the main domain, signs in if needed, and carries on.
            // The reported origin is only compared - the handoff address is
            // built from our own configuration, never from the request.
            const home = new URL(redirectUri);
            const here = String(body.origin || '');
            if (here && here !== home.origin) {
                return Response.json({
                    handoff: `${home.origin}${home.pathname}?${new URLSearchParams({ restaurantId, uber_connect: '1' })}`,
                });
            }

            const state = await signState(clientSecret, {
                r: restaurantId, e: user.email, x: Date.now() + STATE_TTL_MS, n: crypto.randomUUID(),
            });
            const url = `${UBER.authorizeUrl}?${new URLSearchParams({
                client_id: clientId,
                response_type: 'code',
                redirect_uri: redirectUri,
                scope: UBER.scope,
                state,
            })}`;
            return Response.json({ url });
        }

        // ── 2. exchange ─────────────────────────────────────────────────────
        if (action === 'exchange') {
            const st = await readState(clientSecret, body.state);
            if (!st || st.e !== user.email) return fail(400, 'This Uber sign-in link has expired. Please start again.', 'STATE_INVALID');
            if (!(await canManage(base44, user, st.r))) return fail(403, 'Access denied');
            if (!body.code) return fail(400, 'Missing authorisation code');

            const tokenRes = await fetch(UBER.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri,
                    code: String(body.code),
                }),
            });
            if (!tokenRes.ok) {
                console.error('[UBER CONNECT] code exchange failed:', tokenRes.status, (await tokenRes.text().catch(() => '')).slice(0, 300));
                return fail(502, 'Uber did not accept the sign-in. Please try connecting again.', 'CODE_EXCHANGE_FAILED');
            }
            const merchantToken = (await tokenRes.json())?.access_token;
            if (!merchantToken) return fail(502, 'Uber did not return an access token.', 'CODE_EXCHANGE_FAILED');

            const storesRes = await fetch(`${UBER.api}/stores?limit=50`, {
                headers: { Authorization: `Bearer ${merchantToken}`, Accept: 'application/json' },
            });
            if (!storesRes.ok) {
                console.error('[UBER CONNECT] store list failed:', storesRes.status, (await storesRes.text().catch(() => '')).slice(0, 300));
                return fail(502, 'Could not load your Uber Eats stores.', 'STORE_LIST_FAILED');
            }
            const stores = ((await storesRes.json())?.stores || []).map(storeSummary).filter(s => s.store_id);
            if (!stores.length) return fail(404, 'That Uber login does not manage any Uber Eats stores.', 'NO_STORES');

            const grant = await seal(clientSecret, { t: merchantToken, r: st.r, e: user.email, x: Date.now() + GRANT_TTL_MS });
            return Response.json({ restaurantId: st.r, stores, grant });
        }

        // ── 3. provision ────────────────────────────────────────────────────
        if (action === 'provision') {
            const restaurantId = String(body.restaurantId || '');
            const storeId = String(body.storeId || '').trim();
            const g = await unseal(clientSecret, body.grant);
            if (!g || g.r !== restaurantId || g.e !== user.email) {
                return fail(400, 'This Uber sign-in has expired. Please start again.', 'GRANT_INVALID');
            }
            if (!storeId) return fail(400, 'storeId is required');
            if (!(await canManage(base44, user, restaurantId))) return fail(403, 'Access denied');

            const Restaurant = base44.asServiceRole.entities.Restaurant;
            const restaurant = (await Restaurant.filter({ id: restaurantId }))?.[0];
            if (!restaurant) return fail(404, 'Restaurant not found');

            // One Uber store feeds exactly one restaurant - otherwise its orders
            // would land on whichever kitchen happened to match first.
            const everyone = await Restaurant.list();
            const clash = (everyone || []).find(r => r.id !== restaurantId && r.third_party_integrations?.uber_eats?.store_id === storeId);
            if (clash) return fail(409, 'That Uber Eats store is already connected to another restaurant.', 'STORE_IN_USE');

            // is_order_manager: we accept/deny orders for this store. Uber allows
            // only one order manager, so this replaces any other app in that role.
            const params = { integrator_store_id: restaurantId, is_order_manager: true };
            const posRes = await fetch(`${UBER.api}/stores/${encodeURIComponent(storeId)}/pos_data?${new URLSearchParams({ integrator_store_id: restaurantId, is_order_manager: 'true' })}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${g.t}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
            });
            if (!posRes.ok) {
                const detail = (await posRes.text().catch(() => '')).slice(0, 300);
                console.error(`[UBER CONNECT] pos_data failed for store ${storeId}:`, posRes.status, detail);
                return fail(502, 'Uber would not activate the integration for that store.', 'PROVISION_FAILED');
            }

            const now = new Date().toISOString();
            const current = restaurant.third_party_integrations || {};
            current.uber_eats = {
                store_id: storeId,
                store_name: String(body.storeName || '').slice(0, 160) || null,
                enabled: true,
                provisioned: true,
                provisioned_at: now,
                connected_at: current.uber_eats?.connected_at || now,
                updated_at: now,
            };
            await Restaurant.update(restaurantId, { third_party_integrations: current });

            console.log(`[UBER CONNECT] store ${storeId} provisioned for restaurant ${restaurantId} by ${user.email}`);
            return Response.json({ success: true, store_id: storeId });
        }

        return fail(400, 'Unknown action');
    } catch (error) {
        console.error('[UBER CONNECT] error:', error?.message || error);
        return fail(500, 'Uber Eats connection failed');
    }
});
