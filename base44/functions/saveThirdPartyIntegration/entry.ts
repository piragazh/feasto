/**
 * saveThirdPartyIntegration — record which marketplace a restaurant is connected to
 *
 * THIS NO LONGER ACCEPTS PASSWORDS, AND NEVER WILL.
 *
 * It used to store the restaurant's marketplace email and password in plain text
 * on the Restaurant record - which the browser reads directly in ~100 places -
 * and neither this function nor its read counterpart checked that the caller had
 * anything to do with the restaurant. Any logged-in user could pass any
 * restaurantId and receive that restaurant's Just Eat or Deliveroo login.
 *
 * A marketplace login is not order access: it is full account access - payouts,
 * bank details, menu, pricing, the ability to close the store. Holding one for
 * every customer concentrates a risk no takeaway POS should carry, breaches the
 * platforms' terms, and brings UK GDPR duties with it.
 *
 * The only reason it existed was the Just Eat scraper, which needed to log in AS
 * the restaurant. That scraper is retired.
 *
 * WHAT A REAL INTEGRATION STORES
 *   - MealDrop's partner client_id / client_secret: server-side secrets, one set
 *     for the whole platform, never per restaurant and never sent to a browser
 *   - Per restaurant: the platform's STORE ID, plus OAuth tokens the restaurant
 *     granted on the platform's own site. The restaurant types their password
 *     into Uber's page, never into ours.
 *
 * Tokens are deliberately NOT stored here yet: this record is readable by the
 * browser, so it holds only non-secret connection state until a proper
 * server-only store exists. See the note in getThirdPartyIntegrations.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const PLATFORMS = ['uber_eats', 'deliveroo', 'just_eat'];

Deno.serve(async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { restaurantId, platform, store_id, enabled } = body;

        // Refuse credentials outright, and say why - so an older client that still
        // sends them fails loudly instead of quietly storing a password.
        if (body.password !== undefined || body.email !== undefined || body.api_key !== undefined) {
            return Response.json({
                error: 'Marketplace logins are no longer accepted. Connect through the platform\'s own authorisation page instead — MealDrop never stores your marketplace password.',
                code: 'CREDENTIALS_NOT_ACCEPTED',
            }, { status: 400 });
        }

        if (!restaurantId || !PLATFORMS.includes(platform)) {
            return Response.json({ error: 'restaurantId and a valid platform are required' }, { status: 400 });
        }

        // Tenant check: this was missing, so any logged-in user could write to any
        // restaurant's integrations.
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

        const current = restaurants[0].third_party_integrations || {};
        current[platform] = {
            // Non-secret connection state only.
            store_id: store_id ? String(store_id).trim().slice(0, 120) : (current[platform]?.store_id || null),
            enabled: enabled !== undefined ? Boolean(enabled) : true,
            connected_at: current[platform]?.connected_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        await base44.asServiceRole.entities.Restaurant.update(restaurantId, {
            third_party_integrations: current,
        });

        return Response.json({ success: true, platform, store_id: current[platform].store_id });
    } catch (error) {
        console.error('[3P] save failed:', error?.message || error);
        return Response.json({ error: 'Could not save that integration' }, { status: 500 });
    }
});
