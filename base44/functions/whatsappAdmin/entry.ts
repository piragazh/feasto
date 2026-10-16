/**
 * whatsappAdmin — connect restaurant WhatsApp numbers and run the staff inbox
 *
 * Admins can act on any restaurant; managers only on the restaurants listed in
 * their RestaurantManager record (same rule as updateRestaurantSettings).
 * The access token and PIN are never returned to the browser.
 *
 * ACTIONS (POST { action, ...params })
 *   config                 -> what the Connect button needs (app id, Embedded Signup config id)
 *   list_channels          { restaurant_id? }
 *   complete_signup        { restaurant_id, code, waba_id, phone_number_id, coexistence? }
 *                          exchanges the Embedded Signup code for a business token,
 *                          subscribes our app to the WABA, registers the number
 *                          (skipped for coexistence numbers) and saves the channel
 *   connect_manual         { restaurant_id, waba_id, phone_number_id, access_token }   admin only
 *   update_channel         { channel_id, ai_enabled?, welcome_message? }
 *   disconnect             { channel_id }
 *   list_conversations     { restaurant_id }
 *   get_messages           { conversation_id }
 *   staff_reply            { conversation_id, text }   pauses the AI for that chat
 *   set_handoff            { conversation_id, handoff: boolean }
 *
 * ENV  WHATSAPP_APP_ID, WHATSAPP_APP_SECRET, WHATSAPP_ES_CONFIG_ID, WHATSAPP_GRAPH_VERSION
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const VERSION = Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v23.0';
const GRAPH = `https://graph.facebook.com/${VERSION}`;
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

const fail = (error, status = 400) => Response.json({ error }, { status });

async function graph(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${GRAPH}${path}`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.error_user_msg || data?.error?.message || `Graph API HTTP ${res.status}`);
    return data;
}

async function allowedRestaurantIds(db, user) {
    if (user.role === 'admin') return null; // null = all
    const managers = await db.RestaurantManager.filter({ user_email: user.email, is_active: true });
    return new Set(managers.flatMap((m) => m.restaurant_ids || []));
}

const canAccess = (allowed, restaurantId) => !!restaurantId && (allowed === null || allowed.has(restaurantId));

function publicChannel(c) {
    const { access_token: _t, registration_pin: _p, ...rest } = c;
    return rest;
}

async function saveChannel(db, { restaurant, waba_id, phone_number_id, token, via, coexistence, pin }) {
    const info = await graph(`/${phone_number_id}?fields=display_phone_number,verified_name`, { token });
    const existing = await db.WhatsAppChannel.filter({ phone_number_id });
    const other = existing.find((c) => c.restaurant_id !== restaurant.id && c.status === 'connected');
    if (other) throw Object.assign(new Error(`This number is already connected to ${other.restaurant_name || 'another restaurant'}.`), { status: 409 });

    const data = {
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.name,
        waba_id,
        phone_number_id,
        display_phone_number: info.display_phone_number,
        verified_name: info.verified_name,
        access_token: token,
        status: 'connected',
        connected_via: via,
        coexistence: !!coexistence,
        last_error: null,
        connected_at: new Date().toISOString(),
        ...(pin ? { registration_pin: pin } : {}),
    };
    // One live number per restaurant: retire any other connected number for it
    for (const c of await db.WhatsAppChannel.filter({ restaurant_id: restaurant.id })) {
        if (c.phone_number_id !== phone_number_id && c.status === 'connected') {
            await db.WhatsAppChannel.update(c.id, { status: 'disconnected' });
        }
    }
    const mine = existing.find((c) => c.restaurant_id === restaurant.id);
    const saved = mine
        ? await db.WhatsAppChannel.update(mine.id, data)
        : await db.WhatsAppChannel.create({ ...data, ai_enabled: true });
    return { ...(mine || {}), ...data, ...(saved || {}) };
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return fail('POST only', 405);
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);
        if (!user) return fail('Unauthorized', 401);

        const db = base44.asServiceRole.entities;
        const p = await req.json().catch(() => ({}));
        const allowed = await allowedRestaurantIds(db, user);

        const loadChannel = async (id) => {
            const c = (await db.WhatsAppChannel.filter({ id }))[0];
            if (!c || !canAccess(allowed, c.restaurant_id)) throw Object.assign(new Error('Not found'), { status: 404 });
            return c;
        };
        const loadConversation = async (id) => {
            const c = (await db.WaConversation.filter({ id }))[0];
            if (!c || !canAccess(allowed, c.restaurant_id)) throw Object.assign(new Error('Not found'), { status: 404 });
            return c;
        };

        switch (p.action) {
            case 'config': {
                const origin = new URL(req.url).origin;
                return Response.json({
                    app_id: Deno.env.get('WHATSAPP_APP_ID') || null,
                    config_id: Deno.env.get('WHATSAPP_ES_CONFIG_ID') || null,
                    graph_version: VERSION,
                    webhook_url: `${origin}/functions/whatsappWebhook`,
                    ready: !!(Deno.env.get('WHATSAPP_APP_ID') && Deno.env.get('WHATSAPP_APP_SECRET')
                        && Deno.env.get('WHATSAPP_ES_CONFIG_ID') && Deno.env.get('WHATSAPP_VERIFY_TOKEN')),
                    is_admin: user.role === 'admin',
                });
            }

            case 'list_channels': {
                let rows;
                if (p.restaurant_id) {
                    if (!canAccess(allowed, p.restaurant_id)) return fail('Access denied', 403);
                    rows = await db.WhatsAppChannel.filter({ restaurant_id: p.restaurant_id });
                } else {
                    rows = (await db.WhatsAppChannel.list('-created_date', 200))
                        .filter((c) => canAccess(allowed, c.restaurant_id));
                }
                return Response.json({ channels: rows.map(publicChannel) });
            }

            case 'complete_signup': {
                const { restaurant_id, code, waba_id, phone_number_id, coexistence } = p;
                if (!canAccess(allowed, restaurant_id)) return fail('Access denied', 403);
                if (!code || !waba_id || !phone_number_id) return fail('Signup did not return the number details. Please try again.');
                const restaurant = (await db.Restaurant.filter({ id: restaurant_id }))[0];
                if (!restaurant) return fail('Restaurant not found', 404);

                const appId = Deno.env.get('WHATSAPP_APP_ID');
                const secret = Deno.env.get('WHATSAPP_APP_SECRET');
                if (!appId || !secret) return fail('WhatsApp app credentials are not configured', 500);

                // 1. code -> business token (Embedded Signup codes expire after ~30 seconds)
                const tokenRes = await graph(`/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}`);
                const token = tokenRes.access_token;
                if (!token) return fail('Meta did not return an access token');

                // 2. receive this WABA's webhooks
                await graph(`/${waba_id}/subscribed_apps`, { method: 'POST', token });

                // 3. register the number for Cloud API (not for numbers shared with the Business app)
                let pin = null;
                let warning = null;
                if (!coexistence) {
                    pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
                    try {
                        await graph(`/${phone_number_id}/register`, { method: 'POST', token, body: { messaging_product: 'whatsapp', pin } });
                    } catch (e) {
                        warning = `Number registration: ${e.message}`;
                        pin = null;
                    }
                }

                const channel = await saveChannel(db, {
                    restaurant, waba_id, phone_number_id, token, via: 'embedded_signup', coexistence, pin,
                });
                return Response.json({ channel: publicChannel(channel), warning });
            }

            case 'connect_manual': {
                if (user.role !== 'admin') return fail('Admins only', 403);
                const { restaurant_id, waba_id, phone_number_id, access_token } = p;
                if (!restaurant_id || !phone_number_id || !access_token) return fail('restaurant_id, phone_number_id and access_token are required');
                const restaurant = (await db.Restaurant.filter({ id: restaurant_id }))[0];
                if (!restaurant) return fail('Restaurant not found', 404);
                if (waba_id) {
                    await graph(`/${waba_id}/subscribed_apps`, { method: 'POST', token: access_token }).catch((e) => {
                        console.warn('[whatsappAdmin] subscribe failed:', e.message);
                    });
                }
                const channel = await saveChannel(db, {
                    restaurant, waba_id, phone_number_id, token: access_token, via: 'manual', coexistence: false,
                });
                return Response.json({ channel: publicChannel(channel) });
            }

            case 'update_channel': {
                const c = await loadChannel(p.channel_id);
                const patch = {};
                if (typeof p.ai_enabled === 'boolean') patch.ai_enabled = p.ai_enabled;
                if (typeof p.welcome_message === 'string') patch.welcome_message = p.welcome_message.slice(0, 900);
                await db.WhatsAppChannel.update(c.id, patch);
                return Response.json({ channel: publicChannel({ ...c, ...patch }) });
            }

            case 'disconnect': {
                const c = await loadChannel(p.channel_id);
                await db.WhatsAppChannel.update(c.id, { status: 'disconnected' });
                return Response.json({ ok: true });
            }

            case 'list_conversations': {
                if (!canAccess(allowed, p.restaurant_id)) return fail('Access denied', 403);
                const rows = await db.WaConversation.filter({ restaurant_id: p.restaurant_id }, '-updated_date', 100);
                return Response.json({
                    conversations: rows.map(({ history: _h, checkout_token: _t, ...c }) => c),
                });
            }

            case 'get_messages': {
                const c = await loadConversation(p.conversation_id);
                const msgs = await db.WaMessage.filter({ conversation_id: c.id }, '-created_date', 100);
                if (c.unread_count) await db.WaConversation.update(c.id, { unread_count: 0 });
                return Response.json({ messages: msgs.reverse() });
            }

            case 'staff_reply': {
                const c = await loadConversation(p.conversation_id);
                const text = String(p.text || '').trim().slice(0, 4000);
                if (!text) return fail('Message is empty');
                if (!c.last_inbound_at || Date.now() - new Date(c.last_inbound_at).getTime() > SERVICE_WINDOW_MS) {
                    return fail('The customer last messaged over 24 hours ago, so WhatsApp only allows approved templates. Ask them to message you first.', 409);
                }
                const channel = (await db.WhatsAppChannel.filter({ id: c.channel_id }))[0];
                if (!channel || channel.status !== 'connected') return fail('WhatsApp is not connected for this restaurant', 409);

                let wamid = null;
                let error = null;
                try {
                    const res = await graph(`/${channel.phone_number_id}/messages`, {
                        method: 'POST', token: channel.access_token,
                        body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: c.customer_wa_id, type: 'text', text: { body: text } },
                    });
                    wamid = res?.messages?.[0]?.id || null;
                } catch (e) { error = e.message; }

                const message = await db.WaMessage.create({
                    conversation_id: c.id, restaurant_id: c.restaurant_id, wamid, direction: 'outbound',
                    sender: 'staff', msg_type: 'text', body: text, status: error ? 'failed' : 'sent', error: error || undefined,
                    payload: { staff_email: user.email },
                });
                await db.WaConversation.update(c.id, { state: 'handoff', unread_count: 0, last_message_preview: text.slice(0, 120) });
                if (error) return fail(`WhatsApp refused the message: ${error}`, 502);
                return Response.json({ message });
            }

            case 'set_handoff': {
                const c = await loadConversation(p.conversation_id);
                const state = p.handoff ? 'handoff' : ((c.cart || []).length ? 'cart' : 'browsing');
                await db.WaConversation.update(c.id, { state, unread_count: 0 });
                return Response.json({ state });
            }

            default:
                return fail('Unknown action');
        }
    } catch (e) {
        console.error('[whatsappAdmin]', e);
        return fail(e.message || 'Something went wrong', e.status || 500);
    }
});
