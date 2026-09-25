/**
 * getThirdPartyIntegrations — connection STATUS only, never secrets
 *
 * This used to return the whole integration record - including the restaurant's
 * marketplace email and password in plain text - with no check that the caller
 * had anything to do with the restaurant. Any logged-in user could pass any
 * restaurantId and read another business's Just Eat or Deliveroo login.
 *
 * It now returns only what a settings screen legitimately needs: whether a
 * platform is connected, its store id, and when. Anything that looks like a
 * credential is stripped on the way out, so a record written by an older version
 * can never be read back.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SECRET_KEYS = ['password', 'email', 'api_key', 'access_token', 'refresh_token', 'client_secret', 'secret', 'token'];

/** Connection state a browser may see. Everything else is dropped. */
function publicView(entry) {
    if (!entry || typeof entry !== 'object') return null;
    return {
        enabled: Boolean(entry.enabled),
        store_id: entry.store_id || null,
        connected_at: entry.connected_at || null,
        updated_at: entry.updated_at || entry.last_sync || null,
        // Tells the UI a legacy record still holds credentials, WITHOUT returning
        // them - so the screen can prompt the restaurant to reconnect properly.
        needs_reconnect: SECRET_KEYS.some(k => entry[k] !== undefined && entry[k] !== null && entry[k] !== ''),
    };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { restaurantId } = await req.json();
        if (!restaurantId) return Response.json({ error: 'restaurantId is required' }, { status: 400 });

        // Tenant check: previously absent, which is what made this readable across
        // every restaurant on the platform.
        if (user.role !== 'admin') {
            const managers = await base44.asServiceRole.entities.RestaurantManager.filter({
                user_email: user.email, is_active: true,
            });
            if (!managers.some(m => m.restaurant_ids?.includes(restaurantId))) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: restaurantId });
        if (!restaurants?.length) return Response.json({ error: 'Restaurant not found' }, { status: 404 });

        const stored = restaurants[0].third_party_integrations || {};
        const data = {};
        for (const [platform, entry] of Object.entries(stored)) {
            const view = publicView(entry);
            if (view) data[platform] = view;
        }

        return Response.json({ data });
    } catch (error) {
        console.error('[3P] read failed:', error?.message || error);
        return Response.json({ error: 'Could not load integrations' }, { status: 500 });
    }
});
