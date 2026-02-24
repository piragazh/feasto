import React from 'react';
import { Settings, Users } from 'lucide-react';
import TableActionsDialog from './TableActionsDialog';

export default function POSTablesGrid({
    t, isDark, tables, tableOrders,
    onBack, onTablePay,
    refetchTables, refetchTableOrders,
    tableActionsOpen, setTableActionsOpen,
    selectedTableForActions, setSelectedTableForActions,
}) {
    const getTableOrders = (tableId) => tableOrders.filter(o => o.table_id === tableId);
    const getTableTotal = (tableId) => getTableOrders(tableId).reduce((sum, order) => sum + order.total, 0);

    const statusStyles = isDark ? {
        available:      { card: 'border-white/[0.06] hover:border-green-500/40', dot: 'bg-green-400', label: 'text-green-400' },
        occupied:       { card: 'border-orange-500/40 bg-orange-500/5', dot: 'bg-orange-400', label: 'text-orange-400' },
        reserved:       { card: 'border-blue-500/30 bg-blue-500/5', dot: 'bg-blue-400', label: 'text-blue-400' },
        needs_cleaning: { card: 'border-yellow-500/30 bg-yellow-500/5', dot: 'bg-yellow-400', label: 'text-yellow-400' },
    } : {
        available:      { card: 'border-gray-200 hover:border-green-400', dot: 'bg-green-400', label: 'text-green-600' },
        occupied:       { card: 'border-orange-400 bg-orange-50', dot: 'bg-orange-400', label: 'text-orange-600' },
        reserved:       { card: 'border-blue-300 bg-blue-50', dot: 'bg-blue-400', label: 'text-blue-600' },
        needs_cleaning: { card: 'border-yellow-400 bg-yellow-50', dot: 'bg-yellow-400', label: 'text-yellow-600' },
    };

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex items-center justify-between mb-4">
                <h2 className={`${t.text} font-bold text-xl`}>Tables</h2>
                <button
                    onClick={onBack}
                    className={`${t.textMuted} text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${isDark ? 'hover:text-white hover:bg-white/5' : 'hover:text-gray-900 hover:bg-gray-100'}`}
                >
                    ← Back to Order
                </button>
            </div>

            <div className={`flex-1 ${t.tableContainer} rounded-2xl border p-4 overflow-y-auto`}>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {tables.map(table => {
                        const orders = getTableOrders(table.id);
                        const total = getTableTotal(table.id);
                        const hasOrders = orders.length > 0;
                        const s = statusStyles[table.status] || statusStyles.available;

                        return (
                            <div
                                key={table.id}
                                className={`aspect-square rounded-2xl border-2 p-3 flex flex-col relative cursor-pointer transition-all ${isDark ? 'bg-[#1a1d27]' : 'bg-white'} ${s.card}`}
                            >
                                <div className={`absolute top-2.5 right-2.5 w-2 h-2 rounded-full ${s.dot}`} />
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedTableForActions(table); setTableActionsOpen(true); }}
                                    className="absolute top-2 left-2 w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-white transition-colors"
                                >
                                    <Settings className="h-3 w-3" />
                                </button>

                                <div
                                    className="flex-1 flex flex-col items-center justify-center"
                                    onClick={() => { if (hasOrders) onTablePay(table); }}
                                >
                                    <h3 className={`${t.text} font-bold text-sm text-center leading-tight mb-1`}>{table.table_number}</h3>
                                    {table.assigned_server && (
                                        <div className="flex items-center gap-0.5 text-indigo-400 text-[9px] mb-1">
                                            <Users className="h-2.5 w-2.5" />
                                            <span className="truncate max-w-[60px]">{table.assigned_server}</span>
                                        </div>
                                    )}
                                    {hasOrders ? (
                                        <>
                                            <p className="text-orange-400 text-[9px]">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
                                            <p className={`${isDark ? 'text-white' : 'text-gray-900'} font-bold text-sm`}>£{total.toFixed(2)}</p>
                                        </>
                                    ) : (
                                        <p className={`text-[9px] font-medium capitalize ${s.label}`}>{table.status.replace('_', ' ')}</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

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