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

/** Shared 'x mins ago' formatter for the cached-menu timestamp. */
export function formatCachedAt(iso) {
    if (!iso) return '';
    const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const h = Math.floor(diffMin / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
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

    const formatTime = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null);

    // Stuck orders always take priority — they need a human decision and will not
    // resolve on their own.
    const stuckBanner = stuckCount > 0 ? (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium mb-2 border bg-red-500/15 border-red-500/40 text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-xs leading-tight">
                <strong>{stuckCount} order{stuckCount > 1 ? 's' : ''} could not be synced</strong> after {MAX_SYNC_ATTEMPTS} attempts — needs review
            </span>
            <button
                onClick={openStuckReview}
                className="bg-red-500/25 hover:bg-red-500/40 border border-red-500/40 px-3 py-1 rounded-lg text-xs font-bold transition-colors"
            >
                Review
            </button>
        </div>
    ) : null;

    const stuckDialog = showStuck ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowStuck(false)}>
            <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-auto p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-400" />Orders needing review
                    </h3>
                    <button onClick={() => setShowStuck(false)} className="text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
                </div>
                <p className="text-xs text-gray-400 mb-4">
                    These orders failed to sync {MAX_SYNC_ATTEMPTS} times and are no longer retried automatically.
                    They are still stored safely on this device. Retry once the problem is fixed, or discard if
                    the order has already been re-entered.
                </p>
                <div className="space-y-2">
                    {stuckOrders.length === 0 && <p className="text-sm text-gray-400">Nothing to review.</p>}
                    {stuckOrders.map(o => (
                        <div key={o.offline_id} className="border border-gray-700 rounded-xl p-3 bg-gray-800/60">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-white">
                                        £{Number(o.total || 0).toFixed(2)}
                                        <span className="text-gray-400 font-normal"> · {o.items?.length || 0} item{(o.items?.length || 0) === 1 ? '' : 's'}</span>
                                        {o._kind === 'table' && o.table_number && (
                                            <span className="text-gray-400 font-normal"> · Table {o.table_number}</span>
                                        )}
                                    </p>
                                    <p className="text-[11px] text-gray-500 mt-0.5">
                                        Taken {formatTime(o.created_at)} · {o.syncAttempts || 0} attempts
                                    </p>
                                    {o.syncError && (
                                        <p className="text-[11px] text-red-300 mt-1 font-mono break-all">{o.syncError}</p>
                                    )}
                                </div>
                                <div className="flex flex-col gap-1.5 shrink-0">
                                    <button
                                        onClick={async () => {
                                            if (o._kind === 'table') await resetTableOrderSyncAttempts(o.offline_id);
                                            else await resetOrderSyncAttempts(o.offline_id);
                                            await refreshCount();
                                            await openStuckReview();
                                            triggerSync(restaurantId, { manual: true });
                                            toast.success('Retrying order…');
                                        }}
                                        className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-200 px-3 py-1 rounded-lg text-xs font-bold"
                                    >
                                        Retry
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!window.confirm(`Discard this £${Number(o.total || 0).toFixed(2)} order permanently? This cannot be undone.`)) return;
                                            if (o._kind === 'table') await discardPendingTableOrder(o.offline_id);
                                            else await discardPendingOrder(o.offline_id);
                                            await refreshCount();
                                            await openStuckReview();
                                            toast.success('Order discarded');
                                        }}
                                        className="bg-gray-700 hover:bg-red-600/40 border border-gray-600 text-gray-300 px-3 py-1 rounded-lg text-xs font-bold"
                                    >
                                        Discard
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    ) : null;

    // Only show banner if offline, syncing, or there are pending items
    if (isOnline && pendingCount === 0 && !isSyncing) {
        // The "menu cached / last synced" indicator deliberately does NOT render
        // here any more - it is a passive status readout, and a full-width strip
        // above the menu grid cost real POS screen space on every order. It now
        // sits in the top bar next to the clock (see POSDashboard). Only
        // actionable states (offline, pending sync, stuck orders) get a banner.
        return <>{stuckBanner}{stuckDialog}</>;
    }
    if (dismissed && isOnline && pendingCount === 0) return <>{stuckBanner}{stuckDialog}</>;

    // Escalate visual urgency once the offline backlog gets large — during a rush
    // staff need to notice they're accumulating a big unsynced queue.
    const backlogHeavy = pendingCount >= 20;

    return (
        <>
        {stuckBanner}
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium mb-3 border transition-all ${
            !isOnline
                ? backlogHeavy
                    ? 'bg-red-500/20 border-red-500/50 text-red-200 animate-pulse'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                : isSyncing
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                    : backlogHeavy
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
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
                {backlogHeavy && !isSyncing && (
                    <strong className="block mt-0.5">Large backlog — check the connection when you get a moment.</strong>
                )}
                {lastSynced && !isSyncing && (
                    <span className="block opacity-70 mt-0.5">Last synced {formatTime(lastSynced)}</span>
                )}
            </span>

            {isOnline && !isSyncing && pendingCount > 0 && (
                <button
                    onClick={() => triggerSync(restaurantId, { manual: true })}
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
        {stuckDialog}
        </>
    );
}