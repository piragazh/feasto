import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { getAllPendingUnsynced, markOrderSynced, markOrderSyncFailed, getAllPendingStatusUpdates, markStatusUpdateSynced, getLastCachedAt, getAllPendingTableOrders, markTableOrderSynced, markTableOrderSyncFailed, getRetryablePendingOrders, getRetryableTableOrders, getStuckOrders, getStuckTableOrders, resetOrderSyncAttempts, resetTableOrderSyncAttempts, discardPendingOrder, discardPendingTableOrder, MAX_SYNC_ATTEMPTS } from './POSOfflineDB';
import { checkBackendReachable } from '@/lib/networkStatus';
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';

// Shared sync state so header indicator and banner stay in sync
const listeners = new Set();
let sharedState = { isOnline: navigator.onLine, pendingCount: 0, stuckCount: 0, isSyncing: false, lastSynced: null };

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

// ── Reachability heartbeat ─────────────────────────────────────────────
// navigator.onLine only reports whether a network interface is up — it stays
// true when the restaurant's router is fine but the ISP is down. A single
// shared heartbeat actually probes the backend so the indicator staff see
// reflects reality. Runs once globally, not per component instance.
let heartbeatTimer = null;
let heartbeatSubscribers = 0;

async function runHeartbeat() {
    const reachable = await checkBackendReachable();
    if (reachable !== sharedState.isOnline) {
        updateShared({ isOnline: reachable });
    }
}

function startHeartbeat() {
    heartbeatSubscribers++;
    if (heartbeatTimer) return;
    runHeartbeat();
    // 20s is frequent enough to catch an outage within a service beat without
    // adding meaningful load.
    heartbeatTimer = setInterval(runHeartbeat, 20000);
}

function stopHeartbeat() {
    heartbeatSubscribers = Math.max(0, heartbeatSubscribers - 1);
    if (heartbeatSubscribers === 0 && heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

// Exponential backoff between automatic sync attempts while a failure persists,
// so an outage doesn't mean hammering the backend every few seconds.
let consecutiveSyncFailures = 0;
let nextSyncAllowedAt = 0;

function backoffDelayMs(failures) {
    // 3s, 6s, 12s, 24s, 48s, capped at 60s
    return Math.min(3000 * Math.pow(2, Math.max(0, failures - 1)), 60000);
}

let syncPromise = null;

export async function triggerSync(restaurantId, { manual = false } = {}) {
    if (syncPromise) return syncPromise;
    // Respect backoff for automatic syncs; a manual "Sync Now" always runs.
    if (!manual && Date.now() < nextSyncAllowedAt) return null;
    syncPromise = (async () => {
        updateShared({ isSyncing: true });
        let synced = 0;
        let failed = 0;
        try {
            // 1. Sync pending orders (only those still within their retry budget)
            const pending = await getRetryablePendingOrders();
            const forRestaurant = restaurantId
                ? pending.filter(o => o.restaurant_id === restaurantId)
                : pending;

            for (const order of forRestaurant) {
                try {
                    // NOTE: offline_id MUST be forwarded to the server — it is the
                    // idempotency key that stops a retried sync from creating a
                    // duplicate order (syncOfflineOrder looks up existing orders
                    // by offline_id before creating). Only strip local-only
                    // bookkeeping fields.
                    const { synced: _s, syncStatus: _ss, syncError: _se, syncAttempts: _sa, ...orderData } = order;
                    const offline_id = order.offline_id;
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

            // 3. Sync pending table orders via posCreateOrder
            const tableOrders = await getRetryableTableOrders();
            const tableOrdersForRestaurant = restaurantId
                ? tableOrders.filter(o => o.restaurant_id === restaurantId)
                : tableOrders;
            for (const tOrder of tableOrdersForRestaurant) {
                try {
                    // offline_id is forwarded as the idempotency key (see posCreateOrder)
                    // so a retry after a mid-flight network drop returns the existing
                    // order instead of creating a duplicate.
                    const { synced: _s, syncStatus: _ss, syncError: _se, syncAttempts: _sa, created_at: _ca, table_number: _tn, ...orderData } = tOrder;
                    const { offline_id, table_id } = tOrder;
                    const result = await base44.functions.invoke('posCreateOrder', orderData);
                    if (result?.data?.order) {
                        // Link the real order to the table
                        await base44.entities.RestaurantTable.update(table_id, {
                            status: 'occupied',
                            current_order_id: result.data.order.id,
                        });
                        await markTableOrderSynced(offline_id);
                        synced++;
                    } else {
                        await markTableOrderSyncFailed(offline_id, result?.data?.error || 'Unknown error');
                        failed++;
                    }
                } catch (error) {
                    await markTableOrderSyncFailed(tOrder.offline_id, error.message);
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
            // Track consecutive failure rounds for backoff. A round that synced
            // something is treated as progress and resets the delay.
            if (synced > 0 || failed === 0) {
                consecutiveSyncFailures = 0;
                nextSyncAllowedAt = 0;
            } else {
                consecutiveSyncFailures++;
                nextSyncAllowedAt = Date.now() + backoffDelayMs(consecutiveSyncFailures);
            }
        } catch {
            consecutiveSyncFailures++;
            nextSyncAllowedAt = Date.now() + backoffDelayMs(consecutiveSyncFailures);
            toast.error('Sync failed — will retry automatically');
        } finally {
            const remaining = await getAllPendingUnsynced();
            const statusRemaining = await getAllPendingStatusUpdates();
            const tableRemaining = await getAllPendingTableOrders();
            const orderCount = restaurantId
                ? remaining.filter(o => o.restaurant_id === restaurantId).length
                : remaining.length;
            const tableOrderCount = restaurantId
                ? tableRemaining.filter(o => o.restaurant_id === restaurantId).length
                : tableRemaining.length;
            const stuck = [...(await getStuckOrders(restaurantId)), ...(await getStuckTableOrders(restaurantId))];
            updateShared({
                isSyncing: false,
                pendingCount: orderCount + statusRemaining.length + tableOrderCount,
                stuckCount: stuck.length,
            });
            syncPromise = null;
        }
    })();
    return syncPromise;
}

export default function POSOfflineSyncBanner({ restaurantId, onForceRefresh }) {
    const { isOnline, pendingCount, stuckCount, isSyncing, lastSynced } = useOfflineSyncState();
    const [dismissed, setDismissed] = useState(false);
    const [showStuck, setShowStuck] = useState(false);
    const [stuckOrders, setStuckOrders] = useState([]);
    const autoSyncRef = useRef(false);
    const lastCached = getLastCachedAt(restaurantId, 'menu_items');

    const refreshCount = useCallback(async () => {
        const pending = await getAllPendingUnsynced();
        const statusUpdates = await getAllPendingStatusUpdates();
        const tableOrders = await getAllPendingTableOrders();
        const orderCount = restaurantId
            ? pending.filter(o => o.restaurant_id === restaurantId).length
            : pending.length;
        const tableOrderCount = restaurantId
            ? tableOrders.filter(o => o.restaurant_id === restaurantId).length
            : tableOrders.length;
        const stuck = [...(await getStuckOrders(restaurantId)), ...(await getStuckTableOrders(restaurantId))];
        updateShared({
            pendingCount: orderCount + statusUpdates.length + tableOrderCount,
            stuckCount: stuck.length,
        });
    }, [restaurantId]);

    const openStuckReview = useCallback(async () => {
        const orders = await getStuckOrders(restaurantId);
        const tables = await getStuckTableOrders(restaurantId);
        setStuckOrders([
            ...orders.map(o => ({ ...o, _kind: 'order' })),
            ...tables.map(o => ({ ...o, _kind: 'table' })),
        ]);
        setShowStuck(true);
    }, [restaurantId]);

    useEffect(() => {
        // Browser events give us an instant signal; the heartbeat catches the
        // "router up, internet down" case that those events never fire for.
        const onOnline = () => { runHeartbeat(); setDismissed(false); };
        const onOffline = () => updateShared({ isOnline: false });
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        startHeartbeat();
        refreshCount();
        const interval = setInterval(refreshCount, 8000);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            clearInterval(interval);
            stopHeartbeat();
        };
    }, [refreshCount]);

    // Auto-sync when back online
    useEffect(() => {
        if (isOnline && pendingCount > 0 && !isSyncing && !autoSyncRef.current) {
            autoSyncRef.current = true;
            setTimeout(() => {
                Promise.resolve(triggerSync(restaurantId)).finally(() => { autoSyncRef.current = false; });
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