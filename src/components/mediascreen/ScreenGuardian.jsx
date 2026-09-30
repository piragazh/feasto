import React, { useEffect } from 'react';

/**
 * Keeps an unattended signage screen alive. Used by the MediaScreen page only
 * (never inside the kiosk, where an automatic reload would interrupt customers).
 *
 *  - Error boundary: a crash shows a dark "recovering" screen, then reloads
 *  - Stall recovery: reloads when the player reports its rotation is stuck
 *  - Nightly refresh: one reload at ~04:00 local time picks up new code and frees memory
 *  - Wake lock: asks the browser not to dim/sleep the display
 *  - Hides the mouse cursor
 *
 * A reload guard stops recovery loops (max one automatic recovery per 10 minutes).
 */

const RECOVERY_KEY = 'mealdrop_screen_last_recovery';
const NIGHTLY_KEY = 'mealdrop_screen_last_nightly';
const RECOVERY_COOLDOWN_MS = 10 * 60 * 1000;
const NIGHTLY_HOUR = 4;
const pageStartedAt = Date.now();

function recoverySafe() {
    try {
        const last = Number(localStorage.getItem(RECOVERY_KEY)) || 0;
        return Date.now() - last > RECOVERY_COOLDOWN_MS;
    } catch { return true; }
}

export function recoverReload(reason) {
    if (!recoverySafe()) {
        console.warn('[MediaScreen] recovery skipped (cooldown):', reason);
        return false;
    }
    try { localStorage.setItem(RECOVERY_KEY, String(Date.now())); } catch {}
    console.warn('[MediaScreen] recovering:', reason);
    window.location.reload();
    return true;
}

export class ScreenErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
        this.timer = null;
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error) {
        console.error('[MediaScreen] render error:', error);
        const delay = recoverySafe() ? 30 * 1000 : RECOVERY_COOLDOWN_MS;
        this.timer = setTimeout(() => {
            if (!recoverReload('render error')) {
                // Still in cooldown: try rendering again instead of staying dark
                this.setState({ hasError: false });
            }
        }, delay);
    }

    componentWillUnmount() {
        clearTimeout(this.timer);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-screen flex items-center justify-center bg-gray-950">
                    <div className="text-center text-gray-500">
                        <div className="w-10 h-10 border-4 border-gray-700 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-sm">Recovering…</p>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export function useScreenGuardian() {
    // Stall recovery
    useEffect(() => {
        const onStalled = () => recoverReload('rotation stalled');
        window.addEventListener('mediascreen:stalled', onStalled);
        return () => window.removeEventListener('mediascreen:stalled', onStalled);
    }, []);

    // Nightly refresh
    useEffect(() => {
        const check = () => {
            const now = new Date();
            if (now.getHours() !== NIGHTLY_HOUR) return;
            if (Date.now() - pageStartedAt < 60 * 60 * 1000) return;
            if (!navigator.onLine) return;
            const today = now.toISOString().slice(0, 10);
            try {
                if (localStorage.getItem(NIGHTLY_KEY) === today) return;
                localStorage.setItem(NIGHTLY_KEY, today);
            } catch {}
            window.location.reload();
        };
        const t = setInterval(check, 5 * 60 * 1000);
        return () => clearInterval(t);
    }, []);

    // Wake lock
    useEffect(() => {
        let lock = null;
        const request = async () => {
            try {
                if ('wakeLock' in navigator && document.visibilityState === 'visible') {
                    lock = await navigator.wakeLock.request('screen');
                }
            } catch {}
        };
        request();
        const onVisible = () => { if (document.visibilityState === 'visible') request(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            try { lock?.release(); } catch {}
        };
    }, []);

    // Hide cursor
    useEffect(() => {
        const prev = document.body.style.cursor;
        document.body.style.cursor = 'none';
        return () => { document.body.style.cursor = prev; };
    }, []);
}
