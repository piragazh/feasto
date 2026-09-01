import React, { useEffect, useRef, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, X, ArrowRight } from 'lucide-react';
import { playAlert, getSoundSettings, primeAudioOnFirstGesture } from '@/lib/posSound';

/**
 * Alerts the cashier when a NEW online order arrives.
 *
 * Design notes:
 *  - Runs at the POS root, not inside the Queue tab, because the whole point is
 *    to catch an order while the cashier is on some other screen.
 *  - Only orders that are BOTH pending and not from this till raise the alert
 *    (order_source 'pos' is excluded). POS and kiosk sales must never trigger it.
 *  - The first poll only records what already exists; it does not alert. Without
 *    that, opening the POS mid-service would fire for every historic pending
 *    order at once.
 *  - The tone repeats on an interval rather than playing once, because a single
 *    beep is easily missed in a busy kitchen. It stops as soon as the order is
 *    acknowledged or leaves pending (i.e. someone accepted it anywhere).
 */
const POLL_MS = 10000;
const REPEAT_TONE_MS = 8000;

/**
 * The restaurant's uploaded notification sound, if one is configured
 * (SystemSettings.notification_sound_url - set via Notification Sound Manager).
 * A real recorded tone cuts through kitchen noise far better than a synthesised
 * beep, so it is preferred; the oscillator in posSound is the fallback for
 * restaurants that never uploaded one, and for when the file fails to load.
 */
async function fetchAlertSoundUrl() {
    try {
        const rows = await base44.entities.SystemSettings.filter({ setting_key: 'notification_sound_url' });
        return rows?.[0]?.setting_value || null;
    } catch {
        return null;
    }
}

export default function POSNewOrderAlert({ restaurantId, onGoToQueue, onCountChange }) {
    const [pendingOrders, setPendingOrders] = useState([]);
    const seenRef = useRef(null);          // null = first poll not done yet
    const dismissedRef = useRef(new Set()); // ids the cashier explicitly dismissed
    const toneTimerRef = useRef(null);
    const audioRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        fetchAlertSoundUrl().then(url => {
            if (cancelled || !url) return;
            const a = new Audio(url);
            a.preload = 'auto';
            audioRef.current = a;
            // Unlock playback on the first tap so a later timer-driven alert
            // isn't blocked by the browser's autoplay policy.
            primeAudioOnFirstGesture(a);
        });
        const stopPriming = primeAudioOnFirstGesture(null);
        return () => { cancelled = true; stopPriming(); };
    }, []);

    const poll = useCallback(async () => {
        if (!restaurantId) return;
        try {
            const orders = await base44.entities.Order.filter(
                { restaurant_id: restaurantId, status: 'pending' }, '-created_date', 50
            );
            // Exclude anything raised at this till or the kiosk - only genuine
            // inbound online/third-party orders need a cashier's attention.
            const inbound = (orders || []).filter(
                o => o.order_source !== 'pos' && o.order_source !== 'kiosk'
            );

            if (seenRef.current === null) {
                // First run: prime the baseline, alert for nothing.
                seenRef.current = new Set(inbound.map(o => o.id));
                return;
            }

            const fresh = inbound.filter(
                o => !seenRef.current.has(o.id) && !dismissedRef.current.has(o.id)
            );
            if (fresh.length > 0) {
                fresh.forEach(o => seenRef.current.add(o.id));
            }
            // Anything still pending and not dismissed keeps the alert up.
            setPendingOrders(inbound.filter(o => !dismissedRef.current.has(o.id)));
            // The badge reflects ALL waiting orders, including dismissed ones -
            // dismissing silences the noise, it does not mean the order is dealt with.
            onCountChange?.(inbound.length);
        } catch {
            // Polling failure is non-fatal - offline handling lives elsewhere.
        }
    }, [restaurantId]);

    useEffect(() => {
        poll();
        const id = setInterval(poll, POLL_MS);
        return () => clearInterval(id);
    }, [poll]);

    // Repeating tone while at least one order is waiting.
    useEffect(() => {
        if (pendingOrders.length === 0) {
            if (toneTimerRef.current) { clearInterval(toneTimerRef.current); toneTimerRef.current = null; }
            return undefined;
        }
        const ring = () => {
            const { enabled, volume } = getSoundSettings();
            if (!enabled) return;
            const a = audioRef.current;
            if (a) {
                a.currentTime = 0;
                a.volume = Math.min(1, Math.max(0, volume));
                // Autoplay can be refused until the page has had a user gesture;
                // fall back to the oscillator, which is started from the same
                // (already-interacted) page context.
                a.play().catch(() => playAlert());
            } else {
                playAlert();
            }
        };
        ring();
        toneTimerRef.current = setInterval(ring, REPEAT_TONE_MS);
        return () => {
            if (toneTimerRef.current) { clearInterval(toneTimerRef.current); toneTimerRef.current = null; }
        };
    }, [pendingOrders.length]);

    if (pendingOrders.length === 0) return null;

    const count = pendingOrders.length;
    const newest = pendingOrders[0];

    const dismissAll = () => {
        pendingOrders.forEach(o => dismissedRef.current.add(o.id));
        setPendingOrders([]);
    };

    return (
        <div
            role="alert"
            className="fixed inset-x-0 top-0 z-[300] flex justify-center px-4 pt-3 pointer-events-none"
        >
            <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border-2 border-red-500 bg-red-600 shadow-2xl animate-pulse-alert">
                <div className="flex items-center gap-3 px-4 py-3">
                    <Bell className="h-6 w-6 text-white shrink-0" />
                    <div className="flex-1 min-w-0 text-white">
                        <p className="font-bold text-base leading-tight">
                            {count === 1 ? 'New online order' : `${count} new online orders`}
                        </p>
                        <p className="text-xs opacity-90 truncate">
                            {newest.order_number ? `#${newest.order_number} · ` : ''}
                            £{Number(newest.total || 0).toFixed(2)}
                            {newest.order_type ? ` · ${String(newest.order_type).replace(/_/g, ' ')}` : ''}
                            {count > 1 ? ` (+${count - 1} more)` : ''}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => { onGoToQueue?.(); }}
                        className="h-11 px-4 rounded-xl bg-white text-red-700 font-bold text-sm flex items-center gap-1.5 hover:bg-red-50 transition-colors shrink-0"
                    >
                        View in Queue <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={dismissAll}
                        aria-label="Dismiss alert"
                        title="Silence until the next order"
                        className="h-11 w-11 rounded-xl text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center shrink-0"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
