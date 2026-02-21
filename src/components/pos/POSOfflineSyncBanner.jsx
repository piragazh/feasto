import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { getAllPendingUnsynced, markOrderSynced } from './POSOfflineDB';
import { Wifi, WifiOff, RefreshCw, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function POSOfflineSyncBanner({ restaurantId }) {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSynced, setLastSynced] = useState(null);

    const refreshPendingCount = useCallback(async () => {
        try {
            const pending = await getAllPendingUnsynced();
            const forRestaurant = restaurantId
                ? pending.filter(o => o.restaurant_id === restaurantId)
                : pending;
            setPendingCount(forRestaurant.length);
        } catch {}
    }, [restaurantId]);

    useEffect(() => {
        const onOnline = () => setIsOnline(true);
        const onOffline = () => setIsOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        refreshPendingCount();
        const interval = setInterval(refreshPendingCount, 5000);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            clearInterval(interval);
        };
    }, [refreshPendingCount]);

    // Auto-sync when back online
    useEffect(() => {
        if (isOnline && pendingCount > 0 && !isSyncing) {
            syncOrders();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, pendingCount]);

    const syncOrders = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        let synced = 0;
        let failed = 0;
        try {
            const pending = await getAllPendingUnsynced();
            const forRestaurant = restaurantId
                ? pending.filter(o => o.restaurant_id === restaurantId)
                : pending;

            for (const order of forRestaurant) {
                try {
                    const { offline_id, synced: _s, created_at, ...orderData } = order;
                    await base44.entities.Order.create(orderData);
                    await markOrderSynced(offline_id);
                    synced++;
                } catch {
                    failed++;
                }
            }

            if (synced > 0) {
                toast.success(`${synced} offline order${synced > 1 ? 's' : ''} synced successfully`);
                setLastSynced(new Date());
            }
            if (failed > 0) {
                toast.error(`${failed} order${failed > 1 ? 's' : ''} failed to sync`);
            }
        } catch (e) {
            toast.error('Sync failed');
        } finally {
            setIsSyncing(false);
            refreshPendingCount();
        }
    };

    if (isOnline && pendingCount === 0) {
        return null; // All good, no banner needed
    }

    return (
        <div className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-semibold mb-3 ${
            !isOnline
                ? 'bg-red-900/80 border border-red-700 text-red-200'
                : 'bg-yellow-900/80 border border-yellow-700 text-yellow-200'
        }`}>
            {!isOnline ? (
                <WifiOff className="h-4 w-4 shrink-0" />
            ) : (
                <Wifi className="h-4 w-4 shrink-0" />
            )}

            <span className="flex-1">
                {!isOnline
                    ? `Offline mode — orders will be queued and synced when connection is restored`
                    : `Back online — ${pendingCount} order${pendingCount > 1 ? 's' : ''} pending sync`
                }
            </span>

            {isOnline && pendingCount > 0 && (
                <button
                    onClick={syncOrders}
                    disabled={isSyncing}
                    className="flex items-center gap-1.5 bg-yellow-700 hover:bg-yellow-600 px-3 py-1 rounded-md text-xs font-bold transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
            )}
        </div>
    );
}