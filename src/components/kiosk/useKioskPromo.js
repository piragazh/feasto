import { useMemo, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { filterActiveContent } from '@/components/mediascreen/scheduleUtils';
import { useMediaPrecache } from '@/hooks/useMediaPrecache';

/**
 * Idle-promo playlist for a kiosk, fetched from the screenDevice backend
 * (read-only, no direct database access, no heartbeat, no commands).
 *
 * Prefetched while customers order, cached on the device (so it also works
 * offline) and its media pre-downloaded — the promo appears instantly.
 */

const cacheKey = (rid) => `screen_cache_v1_kiosk_promo_${rid}`;
const readCache = (rid) => {
    try { return JSON.parse(localStorage.getItem(cacheKey(rid)) || 'null'); } catch { return null; }
};
const writeCache = (rid, data) => {
    try { localStorage.setItem(cacheKey(rid), JSON.stringify({ data, ts: Date.now() })); } catch {}
};

export function useKioskPromo(restaurantId, enabled = true) {
    const { data } = useQuery({
        queryKey: ['kiosk-promo', restaurantId],
        queryFn: async () => {
            const res = await base44.functions.invoke('screenDevice', { action: 'kiosk_promo', restaurant_id: restaurantId });
            const payload = res?.data ?? res;
            writeCache(restaurantId, payload);
            return payload;
        },
        enabled: !!restaurantId && enabled,
        staleTime: 4 * 60 * 1000,
        refetchInterval: 5 * 60 * 1000,
        retry: 1,
        initialData: () => readCache(restaurantId)?.data,
        initialDataUpdatedAt: () => readCache(restaurantId)?.ts || 0,
    });

    // Re-check schedules every minute so "is there anything to show?" stays correct
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTick(n => n + 1), 60000);
        return () => clearInterval(t);
    }, []);

    const manifest = enabled && data?.enabled !== false ? data?.manifest || null : null;

    const playable = useMemo(
        () => (manifest ? filterActiveContent(manifest.content || []) : []),
        [manifest, tick]
    );

    // Download promo images/videos in the background (added only — never prunes)
    useMediaPrecache(playable, [], typeof navigator === 'undefined' ? true : navigator.onLine);

    const hasLayout = !!manifest?.screen?.layout_template?.zones?.length;

    return {
        manifest,
        hasPlayableContent: playable.length > 0 || hasLayout,
    };
}
