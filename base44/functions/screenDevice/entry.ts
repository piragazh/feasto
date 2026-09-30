import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * screenDevice — the single API for paired media-screen devices.
 *
 * Device actions (no login; authenticated by the device secret):
 *   start      → new pairing session, returns { secret, code }
 *   status     → pairing state for a secret
 *   heartbeat  → check-in: returns queued commands, server time and the
 *                screen manifest (only when it changed since known_version)
 *   time       → server time (used by media walls for clock sync)
 *   kiosk_promo → read-only promo playlist for a kiosk's idle screen. Only the
 *                screen named in the restaurant's kiosk settings, only active
 *                promo content — no heartbeat, no commands.
 *
 * Manager actions (require a logged-in admin or manager of the restaurant):
 *   claim         { code, screen_id }      pair a device to a screen
 *   list          { screen_id }            paired devices for a screen
 *   revoke        { session_id }           unpair a device
 *   send_command  { screen_ids, command }  queue a command
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL_S = 20;
const ALLOWED_COMMANDS = ['refresh_content', 'reload', 'reboot', 'clear_cache'];

const json = (body, status = 200) => Response.json(body, { status });

async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomCode() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return String(a[0] % 1000000).padStart(6, '0');
}

function cleanDeviceInfo(info) {
    if (!info || typeof info !== 'object') return {};
    const pick = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : undefined);
    return {
        user_agent: pick(info.user_agent, 300),
        resolution: pick(info.resolution, 30),
        platform: pick(info.platform, 60),
        app_version: pick(info.app_version, 60),
    };
}

async function getUser(base44) {
    try { return await base44.auth.me(); } catch { return null; }
}

async function canManage(base44, user, restaurantId) {
    if (!user || !restaurantId) return false;
    if (user.role === 'admin') return true;
    const managers = await base44.asServiceRole.entities.RestaurantManager.filter({ user_email: user.email });
    return managers.some(m => m.is_active !== false && Array.isArray(m.restaurant_ids) && m.restaurant_ids.includes(restaurantId));
}

async function findSession(sr, secret) {
    if (typeof secret !== 'string' || secret.length < 32 || secret.length > 128) return null;
    const hash = await sha256Hex(secret);
    const rows = await sr.entities.ScreenDeviceSession.filter({ token_hash: hash });
    return rows[0] || null;
}

async function buildManifest(sr, screen, { includeWall = true } = {}) {
    const restaurantRows = await sr.entities.Restaurant.filter({ id: screen.restaurant_id });
    const r = restaurantRows[0] || {};
    const wall = includeWall && screen.media_wall_config?.enabled && screen.media_wall_config?.wall_name
        ? screen.media_wall_config.wall_name : null;

    const [content, widgetConfigs, playlists, wallContent] = await Promise.all([
        sr.entities.PromotionalContent.filter({ restaurant_id: screen.restaurant_id, screen_name: screen.screen_name, is_active: true }),
        sr.entities.WidgetConfiguration.filter({ restaurant_id: screen.restaurant_id }),
        wall ? sr.entities.MediaWallPlaylist.filter({ restaurant_id: screen.restaurant_id, wall_name: wall, is_active: true }) : Promise.resolve([]),
        wall ? sr.entities.MediaWallContent.filter({ restaurant_id: screen.restaurant_id, wall_name: wall }) : Promise.resolve([]),
    ]);

    const manifest = {
        restaurant: {
            id: r.id, name: r.name, logo_url: r.logo_url, description: r.description,
            latitude: r.latitude, longitude: r.longitude, timezone: r.timezone,
            theme_primary_color: r.theme_primary_color,
        },
        screen: {
            id: screen.id, restaurant_id: screen.restaurant_id, screen_name: screen.screen_name,
            is_active: screen.is_active, orientation: screen.orientation,
            media_wall_config: screen.media_wall_config || null,
            layout_template: screen.layout_template || null,
            heartbeat_interval: screen.heartbeat_interval,
        },
        content,
        widget_configs: widgetConfigs,
        playlists,
        wall_content: wallContent,
    };
    const version = (await sha256Hex(JSON.stringify(manifest))).slice(0, 16);
    return { ...manifest, version };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const sr = base44.asServiceRole;
        let body = {};
        try { body = await req.json(); } catch { body = {}; }
        const action = body.action;
        const now = new Date();
        const nowIso = now.toISOString();

        // ── time ────────────────────────────────────────────────────────────
        if (action === 'time') {
            return json({ server_time: nowIso });
        }

        // kiosk_promo: read-only idle promo playlist for a kiosk
        if (action === 'kiosk_promo') {
            const restaurantId = typeof body.restaurant_id === 'string' ? body.restaurant_id : '';
            if (!restaurantId) return json({ error: 'restaurant_id required' }, 400);
            const rows = await sr.entities.Restaurant.filter({ id: restaurantId });
            const restaurant = rows[0];
            if (!restaurant) return json({ error: 'Restaurant not found' }, 404);

            const cfg = restaurant.kiosk_config || {};
            if (cfg.kiosk_idle_media_enabled === false) {
                return json({ enabled: false, server_time: nowIso });
            }
            // Only the promo screen this restaurant configured for its kiosks
            const screenName = cfg.idle_media_screen_name || 'Kiosk Promo';

            const screens = await sr.entities.Screen.filter({ restaurant_id: restaurantId, screen_name: screenName });
            const s = screens[0];
            const screen = {
                id: s?.id || null,
                restaurant_id: restaurantId,
                screen_name: screenName,
                is_active: s ? s.is_active !== false : true,
                orientation: 'landscape',          // the kiosk page is already the right way up
                media_wall_config: null,            // walls never run on a kiosk
                layout_template: s?.layout_template || null,
                heartbeat_interval: s?.heartbeat_interval,
            };
            const manifest = await buildManifest(sr, screen, { includeWall: false });
            return json({ enabled: true, manifest, server_time: nowIso });
        }

        // ── start ───────────────────────────────────────────────────────────
        if (action === 'start') {
            // Housekeeping: remove long-expired unpaired sessions (bounded)
            try {
                const stale = await sr.entities.ScreenDeviceSession.filter({ status: 'pending' }, 'created_date', 50);
                const cutoff = now.getTime() - 60 * 60 * 1000;
                await Promise.all(stale
                    .filter(s => s.code_expires_at && new Date(s.code_expires_at).getTime() < cutoff)
                    .map(s => sr.entities.ScreenDeviceSession.delete(s.id)));
            } catch (e) { console.error('pairing cleanup failed', e); }

            let code = randomCode();
            for (let i = 0; i < 5; i++) {
                const clash = await sr.entities.ScreenDeviceSession.filter({ pairing_code: code, status: 'pending' });
                if (!clash.some(s => new Date(s.code_expires_at) > now)) break;
                code = randomCode();
            }
            const secret = randomHex(32);
            const expires = new Date(now.getTime() + CODE_TTL_MS).toISOString();
            await sr.entities.ScreenDeviceSession.create({
                status: 'pending',
                pairing_code: code,
                code_expires_at: expires,
                token_hash: await sha256Hex(secret),
                device_info: cleanDeviceInfo(body.device_info),
                last_seen: nowIso,
            });
            return json({ secret, code, expires_at: expires, server_time: nowIso });
        }

        // ── status ──────────────────────────────────────────────────────────
        if (action === 'status') {
            const session = await findSession(sr, body.secret);
            if (!session) return json({ status: 'unknown', server_time: nowIso });
            if (session.status === 'pending') {
                const expired = !session.code_expires_at || new Date(session.code_expires_at) < now;
                return json({ status: expired ? 'expired' : 'pending', code: session.pairing_code, expires_at: session.code_expires_at, server_time: nowIso });
            }
            return json({ status: session.status, screen_id: session.screen_id, restaurant_id: session.restaurant_id, server_time: nowIso });
        }

        // ── heartbeat ───────────────────────────────────────────────────────
        if (action === 'heartbeat') {
            const session = await findSession(sr, body.secret);
            if (!session) return json({ status: 'unknown', server_time: nowIso });
            if (session.status !== 'paired') return json({ status: session.status, server_time: nowIso });

            const screenRows = await sr.entities.Screen.filter({ id: session.screen_id });
            const screen = screenRows[0];
            if (!screen) return json({ status: 'screen_deleted', server_time: nowIso });

            const info = cleanDeviceInfo(body.device_info);
            await Promise.all([
                sr.entities.Screen.update(screen.id, {
                    last_heartbeat: nowIso,
                    health_status: 'online',
                    screen_info: { browser: info.user_agent, resolution: info.resolution, os: info.platform, app_version: info.app_version, paired: true },
                }),
                sr.entities.ScreenDeviceSession.update(session.id, { last_seen: nowIso, device_info: info }),
            ]);

            // Acknowledgements from the device (possibly sent after a reload)
            const acks = Array.isArray(body.acks) ? body.acks.slice(0, 20) : [];
            for (const ack of acks) {
                if (!ack?.id) continue;
                try {
                    const logRows = await sr.entities.ScreenCommandLog.filter({ id: ack.id });
                    const log = logRows[0];
                    if (!log || log.screen_id !== screen.id) continue;
                    await sr.entities.ScreenCommandLog.update(log.id, {
                        status: ack.status === 'failed' ? 'failed' : 'executed',
                        executed_at: nowIso,
                        ...(ack.error_message ? { error_message: String(ack.error_message).slice(0, 300) } : {}),
                    });
                } catch (e) { console.error('ack failed', e); }
            }

            // Time out commands a device picked up but never confirmed
            const delivered = await sr.entities.ScreenCommandLog.filter({ screen_id: screen.id, status: 'delivered' }, 'created_date', 20);
            await Promise.all(delivered
                .filter(l => new Date(l.delivered_at || l.created_date).getTime() < now.getTime() - COMMAND_TIMEOUT_MS)
                .map(l => sr.entities.ScreenCommandLog.update(l.id, { status: 'timeout' })));

            // Queued commands (oldest first), marked delivered
            const pending = await sr.entities.ScreenCommandLog.filter({ screen_id: screen.id, status: 'pending' }, 'created_date', 10);
            const commands = [];
            for (const log of pending) {
                const age = now.getTime() - new Date(log.created_date).getTime();
                if (age > COMMAND_TIMEOUT_MS) {
                    await sr.entities.ScreenCommandLog.update(log.id, { status: 'timeout' });
                    continue;
                }
                await sr.entities.ScreenCommandLog.update(log.id, { status: 'delivered', delivered_at: nowIso });
                commands.push({ id: log.id, command: log.command });
            }

            // Legacy single-slot command (set by older admin screens) — deliver once, no duplicates
            if (screen.pending_command) {
                if (!commands.some(c => c.command === screen.pending_command) && ALLOWED_COMMANDS.includes(screen.pending_command)) {
                    commands.push({ id: null, command: screen.pending_command });
                }
                await sr.entities.Screen.update(screen.id, { pending_command: null, command_timestamp: null });
            }

            const manifest = await buildManifest(sr, screen);
            const changed = manifest.version !== body.known_version;

            return json({
                status: 'paired',
                server_time: nowIso,
                heartbeat_interval: HEARTBEAT_INTERVAL_S,
                commands,
                manifest_version: manifest.version,
                ...(changed ? { manifest } : {}),
            });
        }

        // ── Manager actions ─────────────────────────────────────────────────
        const user = await getUser(base44);
        if (!user) return json({ error: 'Login required' }, 401);

        if (action === 'claim') {
            const code = String(body.code || '').replace(/\D/g, '');
            if (code.length !== 6) return json({ error: 'Enter the 6-digit code shown on the screen' }, 400);
            const screenRows = await sr.entities.Screen.filter({ id: body.screen_id });
            const screen = screenRows[0];
            if (!screen) return json({ error: 'Screen not found' }, 404);
            if (!(await canManage(base44, user, screen.restaurant_id))) return json({ error: 'Not allowed' }, 403);

            const sessions = await sr.entities.ScreenDeviceSession.filter({ pairing_code: code, status: 'pending' });
            const session = sessions.find(s => s.code_expires_at && new Date(s.code_expires_at) > now);
            if (!session) return json({ error: 'Code not found or expired. Check the screen for the current code.' }, 404);

            await sr.entities.ScreenDeviceSession.update(session.id, {
                status: 'paired',
                pairing_code: null,
                screen_id: screen.id,
                restaurant_id: screen.restaurant_id,
                paired_by: user.email,
                paired_at: nowIso,
            });
            return json({ ok: true, screen_name: screen.screen_name });
        }

        if (action === 'list') {
            const screenRows = await sr.entities.Screen.filter({ id: body.screen_id });
            const screen = screenRows[0];
            if (!screen) return json({ error: 'Screen not found' }, 404);
            if (!(await canManage(base44, user, screen.restaurant_id))) return json({ error: 'Not allowed' }, 403);
            const sessions = await sr.entities.ScreenDeviceSession.filter({ screen_id: screen.id, status: 'paired' });
            return json({
                devices: sessions.map(s => ({
                    id: s.id, paired_at: s.paired_at, paired_by: s.paired_by,
                    last_seen: s.last_seen, device_info: s.device_info || {},
                })),
            });
        }

        if (action === 'revoke') {
            const rows = await sr.entities.ScreenDeviceSession.filter({ id: body.session_id });
            const session = rows[0];
            if (!session) return json({ error: 'Device not found' }, 404);
            if (!(await canManage(base44, user, session.restaurant_id))) return json({ error: 'Not allowed' }, 403);
            await sr.entities.ScreenDeviceSession.update(session.id, { status: 'revoked', revoked_at: nowIso });
            return json({ ok: true });
        }

        if (action === 'send_command') {
            const command = body.command;
            if (!ALLOWED_COMMANDS.includes(command)) return json({ error: 'Unknown command' }, 400);
            const ids = Array.isArray(body.screen_ids) ? body.screen_ids.slice(0, 100) : [];
            if (!ids.length) return json({ error: 'No screens selected' }, 400);

            const results = [];
            for (const id of ids) {
                const screenRows = await sr.entities.Screen.filter({ id });
                const screen = screenRows[0];
                if (!screen || !(await canManage(base44, user, screen.restaurant_id))) {
                    results.push({ screen_id: id, ok: false });
                    continue;
                }
                await sr.entities.ScreenCommandLog.create({
                    screen_id: screen.id,
                    restaurant_id: screen.restaurant_id,
                    screen_name: screen.screen_name,
                    command,
                    issued_by: user.email,
                    status: 'pending',
                });
                // Screens still running the old URL-based player only watch this field
                const paired = await sr.entities.ScreenDeviceSession.filter({ screen_id: screen.id, status: 'paired' });
                if (!paired.length) {
                    await sr.entities.Screen.update(screen.id, { pending_command: command, command_timestamp: nowIso });
                }
                results.push({ screen_id: id, ok: true });
            }
            return json({ ok: results.every(r => r.ok), results });
        }

        return json({ error: 'Unknown action' }, 400);
    } catch (error) {
        console.error('screenDevice error:', error);
        return json({ error: 'Screen service error' }, 500);
    }
});
