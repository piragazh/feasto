import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Users, Settings, Grid3x3, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import TableActionsDialog from './TableActionsDialog';
import POSPayment from './POSPayment';

const TABLE_W = 90;
const TABLE_H = 90;

export default function POSTablesView({ restaurantId, posTheme = 'dark' }) {
    // This view was hardcoded dark (text-white / bg-gray-800), so the whole
    // Tables tab stayed dark when the operator switched the POS to light mode.
    const isDark = posTheme === 'dark';
    const t = {
        text:     isDark ? 'text-white'        : 'text-gray-900',
        textSub:  isDark ? 'text-gray-400'     : 'text-gray-500',
        textMuted:isDark ? 'text-gray-500'     : 'text-gray-400',
        panel:    isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
        toggle:   isDark ? t.toggle : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
        tableIdle:isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-100 border-gray-300',
        iconBtn:  isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900',
        grid:     isDark ? '#374151' : '#d1d5db',
        backBtn:  isDark ? 'text-white border-gray-600' : 'text-gray-700 border-gray-300',
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
            await base44.entities.Order.update(order.id, { status: 'delivered' });
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
                <POSPayment
                    cart={allItems}
                    cartTotal={total}
                    onPaymentComplete={handlePaymentComplete}
                    onBackToCart={() => { setShowPayment(false); setViewingTable(null); }}
                    restaurantId={restaurantId}
                    posTheme={posTheme}
                />
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
                                onClick={() => { if (hasOrders) { setViewingTable(table); setShowPayment(true); } }}
                            >
                                {/* Status dot */}
                                <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${statusBadgeColor(table.status)}`} />

                                {/* Actions button */}
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => { e.stopPropagation(); setSelectedTableForActions(table); setTableActionsOpen(true); }}
                                    className={`absolute top-1 left-1 h-6 w-6 p-0 ${t.iconBtn}`}
                                >
                                    <Settings className="h-3.5 w-3.5" />
                                </Button>

                                <p className={`${t.text} font-bold text-sm text-center leading-tight px-1`}>{table.table_number}</p>
                                {table.assigned_server && (
                                    <div className="flex items-center gap-0.5 text-indigo-300 text-[10px] mt-0.5">
                                        <Users className="h-2.5 w-2.5" /><span className="truncate max-w-[70px]">{table.assigned_server}</span>
                                    </div>
                                )}
                                {hasOrders ? (
                                    <>
                                        <p className="text-orange-300 text-[10px] mt-0.5">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
                                        <p className={`${t.text} font-bold text-sm`}>£{total.toFixed(2)}</p>
                                    </>
                                ) : (
                                    <p className={`${t.textSub} text-[10px] capitalize mt-0.5`}>{table.status?.replace('_', ' ')}</p>
                                )}
                                <p className={`${t.textMuted} text-[9px]`}>{table.capacity} seats</p>
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
                                    onClick={() => { if (hasOrders) { setViewingTable(table); setShowPayment(true); } }}
                                >
                                    <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${statusBadgeColor(table.status)}`} />
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={(e) => { e.stopPropagation(); setSelectedTableForActions(table); setTableActionsOpen(true); }}
                                        className={`absolute top-1 left-1 h-5 w-5 p-0 ${t.iconBtn}`}
                                    >
                                        <Settings className="h-3 w-3" />
                                    </Button>
                                    <div className="flex-1 flex flex-col items-center justify-center">
                                        <p className={`${t.text} font-bold text-sm text-center leading-tight`}>{table.table_number}</p>
                                        {table.assigned_server && (
                                            <div className="flex items-center gap-0.5 text-indigo-400 text-[10px]">
                                                <Users className="h-2.5 w-2.5" /><span className="truncate max-w-[60px]">{table.assigned_server}</span>
                                            </div>
                                        )}
                                        {hasOrders ? (
                                            <>
                                                <p className="text-orange-400 text-[10px]">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
                                                <p className={`${t.text} font-bold text-sm`}>£{total.toFixed(2)}</p>
                                            </>
                                        ) : (
                                            <p className={`${t.textSub} text-[10px] capitalize`}>{table.status?.replace('_', ' ')}</p>
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