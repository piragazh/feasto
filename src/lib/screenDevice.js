import { base44 } from '@/api/base44Client';

/**
 * Client helpers for paired media-screen devices.
 *
 * Storage keys deliberately do NOT start with "screen_cache_", so the
 * clear_cache command never unpairs a device.
 */

const SECRET_KEY = 'mealdrop_screen_device_secret';
const ACKS_KEY = 'mealdrop_screen_pending_acks';
const MANIFEST_KEY = 'screen_cache_v1_paired_manifest'; // cleared by clear_cache (re-downloaded)
const CLOCK_KEY = 'mealdrop_screen_clock_offset';

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const safeDel = (k) => { try { localStorage.removeItem(k); } catch {} };

export const deviceSecret = {
    get: () => safeGet(SECRET_KEY),
    set: (s) => safeSet(SECRET_KEY, s),
    clear: () => safeDel(SECRET_KEY),
};

export const cachedManifest = {
    get: () => { try { return JSON.parse(safeGet(MANIFEST_KEY) || 'null'); } catch { return null; } },
    set: (m) => safeSet(MANIFEST_KEY, JSON.stringify(m)),
    clear: () => safeDel(MANIFEST_KEY),
};

// Acks survive a reload so "reload"/"clear_cache" commands can still be confirmed
export const pendingAcks = {
    get: () => { try { return JSON.parse(safeGet(ACKS_KEY) || '[]'); } catch { return []; } },
    add: (ack) => {
        const list = pendingAcks.get().filter(a => a.id !== ack.id);
        list.push(ack);
        safeSet(ACKS_KEY, JSON.stringify(list.slice(-20)));
    },
    clear: () => safeDel(ACKS_KEY),
};

// ── Server clock (keeps media-wall screens in step) ────────────────────────
let clockOffsetMs = Number(safeGet(CLOCK_KEY)) || 0;

export function updateClockOffset(serverTimeIso, sentAt, receivedAt) {
    const server = new Date(serverTimeIso).getTime();
    if (!Number.isFinite(server)) return;
    const midpoint = sentAt + (receivedAt - sentAt) / 2;
    const offset = server - midpoint;
    // Ignore samples from very slow round trips — they're inaccurate
    if (receivedAt - sentAt > 3000) return;
    clockOffsetMs = offset;
    safeSet(CLOCK_KEY, String(Math.round(offset)));
}

export const serverNow = () => Date.now() + clockOffsetMs;

let lastClockSync = 0;
export async function syncServerClock(force = false) {
    if (!force && Date.now() - lastClockSync < 10 * 60 * 1000) return;
    lastClockSync = Date.now();
    try {
        const sentAt = Date.now();
        const res = await base44.functions.invoke('screenDevice', { action: 'time' });
        const receivedAt = Date.now();
        const data = res?.data ?? res;
        if (data?.server_time) updateClockOffset(data.server_time, sentAt, receivedAt);
    } catch {}
}

export function getDeviceInfo() {
    return {
        user_agent: navigator.userAgent,
        resolution: `${window.screen.width}x${window.screen.height}`,
        platform: navigator.userAgentData?.platform || navigator.platform || '',
        app_version: 'mediascreen-2',
    };
}

export async function callScreenApi(payload) {
    const sentAt = Date.now();
    const res = await base44.functions.invoke('screenDevice', payload);
    const receivedAt = Date.now();
    const data = res?.data ?? res;
    if (data?.server_time) updateClockOffset(data.server_time, sentAt, receivedAt);
    return data;
}
