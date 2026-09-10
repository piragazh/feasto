import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Users, Settings, Grid3x3, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import TableActionsDialog from './TableActionsDialog';
import OrderEditDialog from './OrderEditDialog';
import VoidOrderDialog from './VoidOrderDialog';
import POSPayment from './POSPayment';

const TABLE_W = 90;
const TABLE_H = 90;

export default function POSTablesView({ restaurantId, posTheme = 'dark', restaurant = null }) {
    // This view was hardcoded dark (text-white / bg-gray-800), so the whole
    // Tables tab stayed dark when the operator switched the POS to light mode.
    const isDark = posTheme === 'dark';
    const t = {
        text:     isDark ? 'text-white'        : 'text-gray-900',
        textSub:  isDark ? 'text-gray-400'     : 'text-gray-500',
        textMuted:isDark ? 'text-gray-500'     : 'text-gray-400',
        panel:    isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
        toggle:   isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
        tableIdle:isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-100 border-gray-300',
        iconBtn:  isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900',
        grid:     isDark ? '#374151' : '#d1d5db',
        backBtn:  isDark ? 'text-white border-gray-600' : 'text-gray-700 border-gray-300',
        tileAction: isDark
            ? 'bg-gray-900/90 border border-white/20 text-gray-300 hover:text-white hover:bg-gray-800 shadow-lg'
            : 'bg-white border border-gray-300 text-gray-500 hover:text-gray-900 shadow-lg',
    };

    const [showPayment, setShowPayment] = useState(false);
    const [viewingTable, setViewingTable] = useState(null);
    const [tableActionsOpen, setTableActionsOpen] = useState(false);
    const [selectedTableForActions, setSelectedTableForActions] = useState(null);
    const [viewMode, setViewMode] = useState('floorplan'); // 'floorplan' | 'grid'

    const { data: tables = [], refetch: refetchTables } = useQuery({
        queryKey: ['pos-tables', restaurantId],
        queryFn: () => base44.entities.RestaurantTable.filter({ restaurant_id: restaurantId, is_active: true }),
        enabled: !!restaurantId,
    });

    const { data: tableOrders = [], refetch: refetchTableOrders } = useQuery({
        queryKey: ['pos-table-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({
            restaurant_id: restaurantId,
            order_type: 'dine_in',
            status: { $in: ['preparing', 'confirmed', 'pending'] }
        }),
        enabled: !!restaurantId,
        refetchInterval: 3000,
        staleTime: 0,
    });

    const [movingOrder, setMovingOrder] = useState(null);   // order being moved to another table
    const [editingOrder, setEditingOrder] = useState(null);  // order being edited on the table
    const [voidingOrder, setVoidingOrder] = useState(null);  // order being voided from the table
    const [moving, setMoving] = useState(false);

    /**
     * Move an order to a different table.
     *
     * Sending a cart to the wrong table was previously unrecoverable from this
     * screen: tapping the table went straight to payment, so there was no way to
     * see what was on it, correct the table, or take anything off. Staff had to
     * either serve the wrong table or void and re-key the whole order.
     *
     * Frees the source table only if no other orders remain on it, and claims
     * the destination only if it is not already holding a different order.
     */
    const moveOrderToTable = async (order, destTable) => {
        setMoving(true);
        try {
            await base44.entities.Order.update(order.id, {
                table_id: destTable.id,
                table_number: destTable.table_number,
            });

            const remainingOnSource = getTableOrders(order.table_id).filter(o => o.id !== order.id);
            if (remainingOnSource.length === 0) {
                await base44.entities.RestaurantTable.update(order.table_id, {
                    status: 'available',
                    current_order_id: null,
                });
            } else if (movingOrder?.table_id && order.table_id) {
                // Source still has orders - keep it occupied but drop a stale pointer.
                const src = tables.find(t => t.id === order.table_id);
                if (src?.current_order_id === order.id) {
                    await base44.entities.RestaurantTable.update(order.table_id, {
                        current_order_id: remainingOnSource[0].id,
                    });
                }
            }

            const destPatch = { status: 'occupied' };
            if (!destTable.current_order_id) destPatch.current_order_id = order.id;
            await base44.entities.RestaurantTable.update(destTable.id, destPatch);

            toast.success(`Moved to ${destTable.table_number}`);
            setMovingOrder(null);
            setViewingTable(null);
            await refetchTableOrders();
            await refetchTables();
        } catch (e) {
            toast.error('Could not move the order: ' + (e?.message || 'unknown error'));
        } finally {
            setMoving(false);
        }
    };

    const getTableOrders = (tableId) => tableOrders.filter(o => o.table_id === tableId);
    const getTableTotal = (tableId) => getTableOrders(tableId).reduce((sum, o) => sum + o.total, 0);

    const statusColor = (status) => ({
        available: t.tableIdle,
        occupied: 'bg-orange-500/20 border-orange-500',
        reserved: 'bg-blue-500/20 border-blue-500',
        needs_cleaning: 'bg-yellow-500/20 border-yellow-500',
    }[status] || t.tableIdle);

    const statusBadgeColor = (status) => ({
        available: 'bg-green-500',
        occupied: 'bg-orange-500',
        reserved: 'bg-blue-500',
        needs_cleaning: 'bg-yellow-500',
    }[status] || 'bg-gray-500');

    const floorPlanStatusColor = (status, hasOrders) => {
        if (hasOrders) return 'border-orange-500 bg-orange-500/25';
        return {
            available: 'border-green-500 bg-green-500/15',
            occupied: 'border-orange-500 bg-orange-500/25',
            reserved: 'border-blue-500 bg-blue-500/25',
            needs_cleaning: 'border-yellow-400 bg-yellow-400/20',
        }[status] || (isDark ? 'border-gray-500 bg-gray-700' : 'border-gray-400 bg-gray-100');
    };

    const shapeClass = (shape) => shape === 'round' ? 'rounded-full' : shape === 'rect' ? 'rounded-lg' : 'rounded-xl';

    const handlePaymentComplete = async () => {
        const ordersForTable = tableOrders.filter(o => o.table_id === viewingTable.id);
        for (const order of ordersForTable) {
            // Record the payment, not just the fulfilment. Setting only `status`
            // left the order at payment_status 'pending_payment' forever, so a
            // settled table was indistinguishable from an open tab and nothing
            // could detect an order completed without being paid for.
            await base44.entities.Order.update(order.id, {
                status: 'delivered',
                payment_status: 'payment_confirmed',
            });
        }
        // Free the table — mark as needs_cleaning so staff can reset it
        try {
            await base44.entities.RestaurantTable.update(viewingTable.id, {
                status: 'needs_cleaning',
                current_order_id: null,
            });
        } catch { /* non-blocking — table cleanup can be done manually */ }
        toast.success('Payment completed!');
        setShowPayment(false);
        setViewingTable(null);
        refetchTableOrders();
        refetchTables();
    };

    // ── Payment View ─────────────────────────────────────────────────────────
    if (showPayment && viewingTable) {
        const ordersForTable = tableOrders.filter(o => o.table_id === viewingTable.id);
        const total = ordersForTable.reduce((sum, o) => sum + o.total, 0);
        const allItems = ordersForTable.flatMap(o => o.items);
        return (
            <div className="flex flex-col h-full min-h-0">
                <div className="flex items-center justify-between mb-4">
                    <h2 className={`${t.text} font-bold text-2xl`}>{viewingTable.table_number} – Payment</h2>
                    <Button onClick={() => { setShowPayment(false); setViewingTable(null); }} variant="outline" className={t.backBtn}>Back</Button>
                </div>
                {/* skipOrderCreation is ESSENTIAL here.
                    The orders already exist - they were created when the cart was
                    sent to the table. Without this flag POSPayment created a
                    SECOND order for the same items, while handlePaymentComplete
                    separately marked the originals delivered: every table payment
                    produced a duplicate and double-counted the revenue.
                    existingOrderIds lets the receipt and cash-drawer path
                    reference the real orders. */}
                <POSPayment
                    cart={allItems}
                    cartTotal={total}
                    skipOrderCreation
                    existingOrderIds={ordersForTable.map(o => o.id)}
                    onPaymentComplete={handlePaymentComplete}
                    onBackToCart={() => { setShowPayment(false); setViewingTable(null); }}
                    restaurantId={restaurantId}
                    restaurant={restaurant}
                    orderType="dine_in"
                    posTheme={posTheme}
                />
            </div>
        );
    }

    // ── Table Detail ─────────────────────────────────────────────────────────
    // Shows exactly what is on the table before any money is taken, so a wrong
    // table can be spotted and corrected rather than served or voided.
    if (viewingTable && !showPayment) {
        const ordersForTable = getTableOrders(viewingTable.id);
        const total = getTableTotal(viewingTable.id);
        const otherTables = tables.filter(tb => tb.id !== viewingTable.id && tb.is_active !== false);

        return (
            <div className="flex flex-col h-full min-h-0 gap-3">
                <div className="flex items-center justify-between flex-shrink-0">
                    <div>
                        <h2 className={`${t.text} font-bold text-2xl`}>{viewingTable.table_number}</h2>
                        <p className={`${t.textSub} text-xs`}>
                            {ordersForTable.length} order{ordersForTable.length !== 1 ? 's' : ''} · {viewingTable.capacity} seats
                        </p>
                    </div>
                    <Button onClick={() => setViewingTable(null)} variant="outline" className={`${t.backBtn} h-11 px-4`}>Back</Button>
                </div>

                <div className={`flex-1 min-h-0 overflow-y-auto ${t.panel} border rounded-2xl p-3 space-y-3`}>
                    {ordersForTable.map(order => (
                        <div key={order.id} className={`border ${isDark ? 'border-white/10' : 'border-gray-200'} rounded-xl p-3`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className={`${t.text} font-semibold text-sm`}>
                                    {order.order_number ? `#${order.order_number}` : `#${order.id.slice(-6)}`}
                                </span>
                                <span className={`${t.text} font-bold tabular-nums`}>£{Number(order.total || 0).toFixed(2)}</span>
                            </div>
                            <div className="space-y-1 mb-3">
                                {(order.items || []).map((it, i) => (
                                    <div key={i} className={`flex justify-between ${t.textSub} text-xs`}>
                                        <span className="truncate pr-2">{it.quantity}x {it.name}</span>
                                        <span className="tabular-nums flex-shrink-0">£{(Number(it.price || 0) * (it.quantity || 1)).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                            {/* Correct a table order in place: change what was rung
                                in, move it to the right table, or void it entirely.
                                Both dialogs route through the hardened backend -
                                posUpdateOrder re-prices from the live menu, and
                                posVoidOrder requires a reason code and refuses a
                                double void. */}
                            <div className="grid grid-cols-3 gap-2">
                                <Button
                                    onClick={() => setEditingOrder(order)}
                                    variant="outline"
                                    className={`h-11 text-xs ${t.backBtn}`}
                                >
                                    Edit items
                                </Button>
                                <Button
                                    onClick={() => setMovingOrder(order)}
                                    variant="outline"
                                    className={`h-11 text-xs ${t.backBtn}`}
                                >
                                    Move table
                                </Button>
                                <Button
                                    onClick={() => setVoidingOrder(order)}
                                    variant="outline"
                                    className="h-11 text-xs text-red-400 border-red-500/40 hover:bg-red-500/10"
                                >
                                    Void
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className={`flex items-center justify-between gap-3 flex-shrink-0 ${t.panel} border rounded-2xl p-3`}>
                    <div>
                        <p className={`${t.textSub} text-xs font-semibold uppercase tracking-wide`}>Table total</p>
                        <p className={`${t.text} text-3xl font-bold tabular-nums leading-none`}>£{total.toFixed(2)}</p>
                    </div>
                    <Button
                        onClick={() => setShowPayment(true)}
                        disabled={ordersForTable.length === 0}
                        className="h-14 px-8 text-base font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-xl"
                    >
                        Take Payment
                    </Button>
                </div>

                {editingOrder && (
                    <OrderEditDialog
                        order={editingOrder}
                        open={!!editingOrder}
                        onClose={() => setEditingOrder(null)}
                        onUpdate={async () => { await refetchTableOrders(); await refetchTables(); }}
                        restaurantId={restaurantId}
                    />
                )}

                {voidingOrder && (
                    <VoidOrderDialog
                        order={voidingOrder}
                        open={!!voidingOrder}
                        onClose={() => setVoidingOrder(null)}
                        onUpdate={async () => {
                            setVoidingOrder(null);
                            await refetchTableOrders();
                            await refetchTables();
                            // If that was the last order, the table is free again.
                            const left = getTableOrders(viewingTable.id).filter(o => o.id !== voidingOrder.id);
                            if (left.length === 0) {
                                try {
                                    await base44.entities.RestaurantTable.update(viewingTable.id, {
                                        status: 'available',
                                        current_order_id: null,
                                    });
                                } catch { /* non-blocking - can be reset from the floor plan */ }
                                setViewingTable(null);
                            }
                        }}
                        isDark={isDark}
                    />
                )}

                {/* Destination picker for a mis-keyed table */}
                {movingOrder && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={() => setMovingOrder(null)}>
                        <div className={`${t.panel} border rounded-2xl w-full max-w-md p-5 max-h-[80vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
                            <h3 className={`${t.text} font-bold text-lg mb-1`}>Move to which table?</h3>
                            <p className={`${t.textSub} text-xs mb-4`}>
                                Moving {movingOrder.items?.length || 0} item{(movingOrder.items?.length || 0) !== 1 ? 's' : ''} from {viewingTable.table_number}
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                                {otherTables.map(tb => (
                                    <button
                                        key={tb.id}
                                        disabled={moving}
                                        onClick={() => moveOrderToTable(movingOrder, tb)}
                                        className={`h-16 rounded-xl border-2 font-bold text-sm ${statusColor(tb.status)} disabled:opacity-50`}
                                    >
                                        {tb.table_number}
                                        <span className="block text-[11px] font-normal opacity-70 capitalize">
                                            {tb.status?.replace('_', ' ')}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <Button onClick={() => setMovingOrder(null)} variant="outline" className={`w-full mt-4 h-11 ${t.backBtn}`}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const hasPositions = tables.some(t => t.position);

    // ── Tables View ──────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full w-full gap-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className={`${t.text} font-bold text-xl`}>Tables</h2>
                    <p className={`${t.textSub} text-xs`}>{tables.length} tables · {tableOrders.length} active orders</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        onClick={() => setViewMode('floorplan')}
                        className={`h-9 px-3 ${viewMode === 'floorplan' ? 'bg-orange-500 hover:bg-orange-600 text-white' : t.toggle}`}
                    >
                        <LayoutGrid className="h-4 w-4 mr-1.5" /> Floor Plan
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => setViewMode('grid')}
                        className={`h-9 px-3 ${viewMode === 'grid' ? 'bg-orange-500 hover:bg-orange-600 text-white' : t.toggle}`}
                    >
                        <Grid3x3 className="h-4 w-4 mr-1.5" /> Grid
                    </Button>
                </div>
            </div>

            {/* Legend */}
            <div className={`flex gap-4 text-xs ${t.textSub} flex-wrap`}>
                {[
                    { label: 'Available', color: 'bg-green-500' },
                    { label: 'Occupied', color: 'bg-orange-500' },
                    { label: 'Reserved', color: 'bg-blue-500' },
                    { label: 'Needs Cleaning', color: 'bg-yellow-400' },
                ].map(s => (
                    <span key={s.label} className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                        {s.label}
                    </span>
                ))}
            </div>

            {/* ── Floor Plan View ── */}
            {viewMode === 'floorplan' && (
                <div
                    className={`flex-1 ${t.panel} rounded-xl border relative overflow-auto`}
                    style={{
                        minHeight: '500px',
                        backgroundImage: `radial-gradient(circle, ${t.grid} 1px, transparent 1px)`,
                        backgroundSize: '20px 20px',
                    }}
                >
                    {tables.length === 0 && (
                        <div className={`absolute inset-0 flex flex-col items-center justify-center ${t.textMuted} pointer-events-none text-center px-6`}>
                            <LayoutGrid className="h-16 w-16 mb-3 opacity-20" />
                            <p>No tables configured. Set them up in Restaurant Settings → POS Configuration → Table Layout.</p>
                        </div>
                    )}
                    {tables.map((table, idx) => {
                        const pos = table.position || { x: (idx % 6) * 110 + 20, y: Math.floor(idx / 6) * 110 + 20 };
                        const orders = getTableOrders(table.id);
                        const total = getTableTotal(table.id);
                        const hasOrders = orders.length > 0;
                        const w = (table.shape === 'rect') ? 130 : TABLE_W;

                        return (
                            <div
                                key={table.id}
                                className={`absolute flex flex-col items-center justify-center border-2 select-none transition-all ${shapeClass(table.shape || 'square')} ${floorPlanStatusColor(table.status, hasOrders)} ${hasOrders ? 'cursor-pointer hover:scale-105' : 'cursor-default'}`}
                                style={{ left: `${pos.x}px`, top: `${pos.y}px`, width: `${w}px`, height: `${TABLE_H}px` }}
                                onClick={() => { if (hasOrders) { setViewingTable(table); setShowPayment(false); } }}
                            >
                                {/* Status dot */}
                                <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${statusBadgeColor(table.status)}`} />

                                {/* Actions button */}
                                {/* 24px was far below the touch floor and sat inside the
                                    tile's own tap zone, so on a touchscreen this and
                                    "open table" competed for the same finger. Now a
                                    proper 44px target pinned to the corner. */}
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    aria-label={`Actions for ${table.table_number}`}
                                    onClick={(e) => { e.stopPropagation(); setSelectedTableForActions(table); setTableActionsOpen(true); }}
                                    className={`absolute -top-2 -left-2 h-11 w-11 p-0 rounded-full z-10 ${t.tileAction}`}
                                >
                                    <Settings className="h-4 w-4" />
                                </Button>

                                <p className={`${t.text} font-bold text-sm text-center leading-tight px-1`}>{table.table_number}</p>
                                {table.assigned_server && (
                                    <div className="flex items-center gap-0.5 text-indigo-300 text-[11px] mt-0.5">
                                        <Users className="h-3 w-3" /><span className="truncate max-w-[70px]">{table.assigned_server}</span>
                                    </div>
                                )}
                                {hasOrders ? (
                                    <>
                                        <p className="text-orange-300 text-[11px] mt-0.5">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
                                        <p className={`${t.text} font-bold text-sm`}>£{total.toFixed(2)}</p>
                                    </>
                                ) : (
                                    <p className={`${t.textSub} text-[11px] capitalize mt-0.5`}>{table.status?.replace('_', ' ')}</p>
                                )}
                                <p className={`${t.textMuted} text-[11px]`}>{table.capacity} seats</p>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Grid View ── */}
            {viewMode === 'grid' && (
                <div className={`flex-1 ${t.panel} rounded-xl border p-4 overflow-y-auto`}>
                    {tables.length === 0 && (
                        <div className={`h-full flex flex-col items-center justify-center ${t.textMuted} text-center px-6 py-16`}>
                            <Grid3x3 className="h-16 w-16 mb-3 opacity-20" />
                            <p className="text-sm">No tables configured.</p>
                            <p className="text-xs mt-1 opacity-70">Set them up in Restaurant Settings &rarr; POS Configuration &rarr; Table Layout.</p>
                        </div>
                    )}
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {tables.map(table => {
                            const orders = getTableOrders(table.id);
                            const total = getTableTotal(table.id);
                            const hasOrders = orders.length > 0;

                            return (
                                <div
                                    key={table.id}
                                    className={`aspect-square rounded-xl p-2 flex flex-col relative border-2 transition-all ${statusColor(table.status)} ${hasOrders ? 'cursor-pointer hover:opacity-90' : ''}`}
                                    onClick={() => { if (hasOrders) { setViewingTable(table); setShowPayment(false); } }}
                                >
                                    <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${statusBadgeColor(table.status)}`} />
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={(e) => { e.stopPropagation(); setSelectedTableForActions(table); setTableActionsOpen(true); }}
                                        aria-label={`Actions for ${table.table_number}`}
                                        className={`absolute -top-2 -left-2 h-11 w-11 p-0 rounded-full z-10 ${t.tileAction}`}
                                    >
                                        <Settings className="h-3 w-3" />
                                    </Button>
                                    <div className="flex-1 flex flex-col items-center justify-center">
                                        <p className={`${t.text} font-bold text-sm text-center leading-tight`}>{table.table_number}</p>
                                        {table.assigned_server && (
                                            <div className="flex items-center gap-0.5 text-indigo-400 text-[11px]">
                                                <Users className="h-3 w-3" /><span className="truncate max-w-[60px]">{table.assigned_server}</span>
                                            </div>
                                        )}
                                        {hasOrders ? (
                                            <>
                                                <p className="text-orange-400 text-[11px]">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
                                                <p className={`${t.text} font-bold text-sm`}>£{total.toFixed(2)}</p>
                                            </>
                                        ) : (
                                            <p className={`${t.textSub} text-[11px] capitalize`}>{table.status?.replace('_', ' ')}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {tableActionsOpen && selectedTableForActions && (
                <TableActionsDialog
                    open={tableActionsOpen}
                    onClose={() => { setTableActionsOpen(false); setSelectedTableForActions(null); }}
                    table={selectedTableForActions}
                    tables={tables}
                    onRefresh={() => { refetchTables(); refetchTableOrders(); }}
                />
            )}
        </div>
    );
}