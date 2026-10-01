import React, { useState, useEffect, useRef, useCallback } from 'react';
import ScreenDisplay from './ScreenDisplay';
import { ScreenManifestContext } from './ScreenManifestContext';
import { clearScreenCache } from './scheduleUtils';
import {
    deviceSecret, cachedManifest, pendingAcks, callScreenApi, getDeviceInfo,
} from '@/lib/screenDevice';

const PAIRING_POLL_MS = 4000;
const DEFAULT_HEARTBEAT_S = 20;
const RELOAD_COMMANDS = ['reload', 'reboot', 'refresh_content', 'clear_cache'];
const PLAYS_KEY = 'mealdrop_screen_pending_plays';

// Proof-of-play totals waiting to be sent (kept across reloads / offline spells)
const pendingPlays = {
    get: () => { try { return JSON.parse(localStorage.getItem(PLAYS_KEY) || '{}'); } catch { return {}; } },
    add: (p) => {
        const all = pendingPlays.get();
        const cur = all[p.content_id] || { content_id: p.content_id, plays: 0, seconds: 0 };
        cur.plays += p.plays || 0;
        cur.seconds += p.seconds || 0;
        cur.title = p.title || cur.title;
        cur.media_type = p.media_type || cur.media_type;
        all[p.content_id] = cur;
        // cap: never let an offline device grow this without limit
        const keys = Object.keys(all);
        if (keys.length > 200) delete all[keys[0]];
        try { localStorage.setItem(PLAYS_KEY, JSON.stringify(all)); } catch {}
    },
    take: () => { const all = pendingPlays.get(); try { localStorage.removeItem(PLAYS_KEY); } catch {} return Object.values(all); },
    restore: (list) => list.forEach(p => pendingPlays.add(p)),
};

function PairingScreen({ code, expiresAt, error }) {
    const [, force] = useState(0);
    useEffect(() => {
        const t = setInterval(() => force(n => n + 1), 1000);
        return () => clearInterval(t);
    }, []);
    const secondsLeft = expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)) : null;

    return (
        <div className="h-screen w-screen flex items-center justify-center bg-gray-950 text-white">
            <div className="text-center px-8 max-w-3xl">
                <p className="text-orange-400 font-semibold tracking-widest uppercase text-sm mb-4">MealDrop Media Screen</p>
                <h1 className="text-3xl md:text-4xl font-bold mb-8">Pair this screen</h1>
                {code ? (
                    <div className="font-mono font-black tracking-[0.3em] text-7xl md:text-9xl mb-8 tabular-nums">
                        {code.slice(0, 3)} {code.slice(3)}
                    </div>
                ) : (
                    <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-8" />
                )}
                <p className="text-lg text-gray-300 mb-2">
                    In MealDrop <span className="text-white font-semibold">Screen Studio → Screens &amp; Playlists</span>, select the screen and tap <span className="text-white font-semibold">Pair device</span>.
                </p>
                {secondsLeft !== null && code && (
                    <p className="text-sm text-gray-500">New code in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</p>
                )}
                {error && <p className="text-sm text-red-400 mt-4">{error}</p>}
            </div>
        </div>
    );
}

export default function PairedScreenPlayer() {
    const [manifest, setManifest] = useState(() => (deviceSecret.get() ? cachedManifest.get() : null));
    const [phase, setPhase] = useState(() => (deviceSecret.get() ? 'running' : 'pairing'));
    const [pairing, setPairing] = useState({ code: null, expiresAt: null, error: null });
    const manifestVersionRef = useRef(manifest?.version || null);
    const heartbeatSecondsRef = useRef(DEFAULT_HEARTBEAT_S);
    const reloadingRef = useRef(false);

    const resetToPairing = useCallback(() => {
        deviceSecret.clear();
        cachedManifest.clear();
        pendingAcks.clear();
        manifestVersionRef.current = null;
        setManifest(null);
        setPairing({ code: null, expiresAt: null, error: null });
        setPhase('pairing');
    }, []);

    // ── Pairing: get a code, then poll until a manager claims it ───────────
    useEffect(() => {
        if (phase !== 'pairing') return;
        let cancelled = false;
        let timer;

        const startSession = async () => {
            const data = await callScreenApi({ action: 'start', device_info: getDeviceInfo() });
            if (data?.secret) {
                deviceSecret.set(data.secret);
                setPairing({ code: data.code, expiresAt: data.expires_at, error: null });
            }
        };

        const poll = async () => {
            if (cancelled) return;
            try {
                const secret = deviceSecret.get();
                if (!secret) {
                    await startSession();
                } else {
                    const data = await callScreenApi({ action: 'status', secret });
                    if (data?.status === 'paired') {
                        setPhase('running');
                        return;
                    }
                    if (data?.status === 'pending') {
                        setPairing({ code: data.code, expiresAt: data.expires_at, error: null });
                    } else {
                        // expired / revoked / unknown → fresh code
                        deviceSecret.clear();
                        await startSession();
                    }
                }
            } catch {
                setPairing(p => ({ ...p, error: navigator.onLine ? 'Could not reach MealDrop — retrying…' : 'Waiting for internet connection…' }));
            }
            if (!cancelled) timer = setTimeout(poll, PAIRING_POLL_MS);
        };

        poll();
        return () => { cancelled = true; clearTimeout(timer); };
    }, [phase]);

    // ── Commands from the queue ─────────────────────────────────────────────
    const runCommands = useCallback((commands) => {
        if (!commands?.length || reloadingRef.current) return;
        let needsReload = false;
        let wipeCache = false;
        for (const c of commands) {
            if (!RELOAD_COMMANDS.includes(c.command)) {
                if (c.id) pendingAcks.add({ id: c.id, status: 'failed', error_message: 'Unsupported command' });
                continue;
            }
            if (c.id) pendingAcks.add({ id: c.id, status: 'executed' });
            needsReload = true;
            if (c.command === 'clear_cache') wipeCache = true;
        }
        if (!needsReload) return;
        reloadingRef.current = true;
        (async () => {
            if (wipeCache) {
                clearScreenCache();
                try { if ('caches' in window) await caches.delete('mealdrop-media-v1'); } catch {}
            }
            setTimeout(() => window.location.reload(), 500);
        })();
    }, []);

    // ── Proof of play: collect what the player reports ────────────────────────────
    useEffect(() => {
        const onPlayed = (e) => { if (e.detail?.content_id) pendingPlays.add(e.detail); };
        window.addEventListener('mediascreen:played', onPlayed);
        return () => window.removeEventListener('mediascreen:played', onPlayed);
    }, []);

    // ── Heartbeat: check-in, pick up commands and manifest updates ─────────
    useEffect(() => {
        if (phase !== 'running') return;
        let cancelled = false;
        let timer;

        const beat = async () => {
            if (cancelled) return;
            const secret = deviceSecret.get();
            if (!secret) { resetToPairing(); return; }
            if (navigator.onLine) {
                const plays = pendingPlays.take();
                try {
                    const acks = pendingAcks.get();
                    const data = await callScreenApi({
                        action: 'heartbeat',
                        secret,
                        known_version: manifestVersionRef.current,
                        acks,
                        plays,
                        device_info: getDeviceInfo(),
                    });
                    if (acks.length) pendingAcks.clear();

                    if (data?.status === 'paired') {
                        if (data.heartbeat_interval) heartbeatSecondsRef.current = data.heartbeat_interval;
                        if (data.manifest) {
                            manifestVersionRef.current = data.manifest.version;
                            cachedManifest.set(data.manifest);
                            setManifest(data.manifest);
                        }
                        runCommands(data.commands);
                    } else if (data?.status === 'pending') {
                        setPhase('pairing');
                        return;
                    } else if (['unknown', 'revoked', 'screen_deleted'].includes(data?.status)) {
                        resetToPairing();
                        return;
                    }
                } catch (e) {
                    // Offline or server error: keep playing the cached manifest, keep the play counts
                    pendingPlays.restore(plays);
                    console.warn('[MediaScreen] heartbeat failed', e?.message || e);
                }
            }
            if (!cancelled) timer = setTimeout(beat, heartbeatSecondsRef.current * 1000);
        };

        beat();
        const onOnline = () => { clearTimeout(timer); beat(); };
        window.addEventListener('online', onOnline);
        return () => { cancelled = true; clearTimeout(timer); window.removeEventListener('online', onOnline); };
    }, [phase, resetToPairing, runCommands]);

    if (phase === 'pairing') {
        return <PairingScreen code={pairing.code} expiresAt={pairing.expiresAt} error={pairing.error} />;
    }

    if (!manifest) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-gray-900">
                <div className="text-center text-white">
                    <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-lg opacity-70">{navigator.onLine ? 'Loading screen…' : 'Waiting for internet connection…'}</p>
                </div>
            </div>
        );
    }

    return (
        <ScreenManifestContext.Provider value={manifest}>
            <ScreenDisplay restaurantId={manifest.screen.restaurant_id} screenName={manifest.screen.screen_name} />
        </ScreenManifestContext.Provider>
    );
}
