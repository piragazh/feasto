import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { getAllPendingUnsynced, markOrderSynced, markOrderSyncFailed, getAllPendingStatusUpdates, markStatusUpdateSynced, getLastCachedAt } from './POSOfflineDB';
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
            // 1. Sync pending orders
            const pending = await getAllPendingUnsynced();
            const forRestaurant = restaurantId
                ? pending.filter(o => o.restaurant_id === restaurantId)
                : pending;

            for (const order of forRestaurant) {
                try {
                    const { offline_id, synced: _s, syncStatus: _ss, syncError: _se, syncAttempts: _sa, ...orderData } = order;
                    // Route through syncOfflineOrder for re-validation
                    const syncResult = await base44.functions.invoke('syncOfflineOrder', orderData);
                    
                    // ✨ NEW: Handle explicit sync outcomes
                    if (syncResult.data?.order) {
                        // SYNC_ACCEPTED or SYNC_ACCEPTED_NEEDS_REVIEW
                        await markOrderSynced(offline_id);
                        synced++;
                        const outcome = syncResult.data.needs_review ? 'FLAGGED' : 'ACCEPTED';
                        console.log(`[OFFLINE-SYNC-BANNER] Order ${syncResult.data.order.id} synced (${outcome}). Reason: ${syncResult.data.validation_notes || 'none'}`);
                    } else {
                        // SYNC_REJECTED
                        const rejectReason = syncResult.data?.error || 'Unknown error';
                        await markOrderSyncFailed(offline_id, rejectReason);
                        failed++;
                        console.warn(`[OFFLINE-SYNC-BANNER] Order ${offline_id} sync rejected: ${rejectReason}`);
                    }
                } catch (error) {
                    // Network error or function failure
                    await markOrderSyncFailed(order.offline_id, error.message);
                    console.error(`[OFFLINE-SYNC-BANNER] Sync error for order ${order.offline_id}:`, error.message);
                    failed++;
                }
            }

            // 2. Sync pending status updates
            const statusUpdates = await getAllPendingStatusUpdates();
            for (const update of statusUpdates) {
                try {
                    await base44.entities.Order.update(update.order_id, { status: update.status });
                    await markStatusUpdateSynced(update.offline_id);
                    synced++;
                } catch {
                    failed++;
                }
            }

            if (synced > 0) {
                toast.success(`${synced} offline change${synced > 1 ? 's' : ''} synced`);
                updateShared({ lastSynced: new Date() });
            }
            if (failed > 0) {
                toast.error(`${failed} update${failed > 1 ? 's' : ''} failed to sync`);
            }
        } catch {
            toast.error('Sync failed — will retry automatically');
        } finally {
            const remaining = await getAllPendingUnsynced();
            const statusRemaining = await getAllPendingStatusUpdates();
            const orderCount = restaurantId
                ? remaining.filter(o => o.restaurant_id === restaurantId).length
                : remaining.length;
            updateShared({ isSyncing: false, pendingCount: orderCount + statusRemaining.length });
            syncPromise = null;
        }
    })();
    return syncPromise;
}

export default function POSOfflineSyncBanner({ restaurantId, onForceRefresh }) {
    const { isOnline, pendingCount, isSyncing, lastSynced } = useOfflineSyncState();
    const [dismissed, setDismissed] = useState(false);
    const autoSyncRef = useRef(false);
    const lastCached = getLastCachedAt(restaurantId, 'menu_items');

    const refreshCount = useCallback(async () => {
        const pending = await getAllPendingUnsynced();
        const statusUpdates = await getAllPendingStatusUpdates();
        const orderCount = restaurantId
            ? pending.filter(o => o.restaurant_id === restaurantId).length
            : pending.length;
        updateShared({ pendingCount: orderCount + statusUpdates.length });
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

    // Format last cached time
    const formatCachedAt = (iso) => {
        if (!iso) return null;
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Only show banner if offline, syncing, or there are pending items
    if (isOnline && pendingCount === 0 && !isSyncing) {
        // Show a subtle "cached" indicator if we have cached data
        if (lastCached && !dismissed) {
            return (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium mb-2 bg-green-500/10 border border-green-500/20 text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1">Menu cached locally · {formatCachedAt(lastCached)}</span>
                    {onForceRefresh && (
                        <button onClick={onForceRefresh} className="flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
                            <RefreshCw className="h-3 w-3" /> Refresh
                        </button>
                    )}
                    <button onClick={() => setDismissed(true)} className="opacity-50 hover:opacity-100 transition-opacity ml-1">
                        <X className="h-3 w-3" />
                    </button>
                </div>
            );
        }
        return null;
    }
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
                    ? `Offline mode — ${pendingCount > 0 ? `${pendingCount} change${pendingCount > 1 ? 's' : ''} queued` : 'orders will be saved locally'}`
                    : isSyncing
                        ? 'Syncing offline changes to server...'
                        : `${pendingCount} offline change${pendingCount > 1 ? 's' : ''} pending sync`
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