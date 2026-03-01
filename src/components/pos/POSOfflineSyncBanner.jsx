import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { getAllPendingUnsynced, markOrderSynced, getAllPendingStatusUpdates, markStatusUpdateSynced, getLastCachedAt } from './POSOfflineDB';
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';

// Shared sync state so header indicator and banner stay in sync
const listeners = new Set();
let sharedState = { isOnline: navigator.onLine, pendingCount: 0, isSyncing: false, lastSynced: null };

function notifyListeners() {
    listeners.forEach(fn => fn({ ...sharedState }));
}

function updateShared(patch) {
    sharedState = { ...sharedState, ...patch };
    notifyListeners();
}

export function useOfflineSyncState() {
    const [state, setState] = useState({ ...sharedState });
    useEffect(() => {
        listeners.add(setState);
        setState({ ...sharedState });
        return () => listeners.delete(setState);
    }, []);
    return state;
}

let syncPromise = null;

export async function triggerSync(restaurantId) {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
        updateShared({ isSyncing: true });
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
                toast.success(`${synced} offline order${synced > 1 ? 's' : ''} synced`);
                updateShared({ lastSynced: new Date() });
            }
            if (failed > 0) {
                toast.error(`${failed} order${failed > 1 ? 's' : ''} failed to sync`);
            }
        } catch {
            toast.error('Sync failed — will retry automatically');
        } finally {
            // Refresh count
            const remaining = await getAllPendingUnsynced();
            const count = restaurantId
                ? remaining.filter(o => o.restaurant_id === restaurantId).length
                : remaining.length;
            updateShared({ isSyncing: false, pendingCount: count });
            syncPromise = null;
        }
    })();
    return syncPromise;
}

export default function POSOfflineSyncBanner({ restaurantId }) {
    const { isOnline, pendingCount, isSyncing, lastSynced } = useOfflineSyncState();
    const [dismissed, setDismissed] = useState(false);
    const autoSyncRef = useRef(false);

    const refreshCount = useCallback(async () => {
        const pending = await getAllPendingUnsynced();
        const count = restaurantId
            ? pending.filter(o => o.restaurant_id === restaurantId).length
            : pending.length;
        updateShared({ pendingCount: count });
    }, [restaurantId]);

    useEffect(() => {
        const onOnline = () => { updateShared({ isOnline: true }); setDismissed(false); };
        const onOffline = () => updateShared({ isOnline: false });
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        refreshCount();
        const interval = setInterval(refreshCount, 8000);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            clearInterval(interval);
        };
    }, [refreshCount]);

    // Auto-sync when back online
    useEffect(() => {
        if (isOnline && pendingCount > 0 && !isSyncing && !autoSyncRef.current) {
            autoSyncRef.current = true;
            setTimeout(() => {
                triggerSync(restaurantId).finally(() => { autoSyncRef.current = false; });
            }, 1500); // slight delay so network is stable
        }
    }, [isOnline, pendingCount, isSyncing, restaurantId]);

    // Nothing to show
    if (isOnline && pendingCount === 0 && !isSyncing) return null;
    if (dismissed && isOnline && pendingCount === 0) return null;

    return (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium mb-3 border transition-all ${
            !isOnline
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : isSyncing
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
        }`}>
            {!isOnline ? (
                <WifiOff className="h-4 w-4 shrink-0" />
            ) : isSyncing ? (
                <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
            )}

            <span className="flex-1 text-xs leading-tight">
                {!isOnline
                    ? `Offline mode — ${pendingCount > 0 ? `${pendingCount} order${pendingCount > 1 ? 's' : ''} queued locally` : 'orders will be saved locally'}`
                    : isSyncing
                        ? 'Syncing offline orders to server...'
                        : `${pendingCount} offline order${pendingCount > 1 ? 's' : ''} pending sync`
                }
            </span>

            {isOnline && !isSyncing && pendingCount > 0 && (
                <button
                    onClick={() => triggerSync(restaurantId)}
                    className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                >
                    <RefreshCw className="h-3 w-3" />
                    Sync Now
                </button>
            )}

            {isOnline && pendingCount === 0 && !isSyncing && (
                <button onClick={() => setDismissed(true)} className="opacity-60 hover:opacity-100 transition-opacity">
                    <X className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}