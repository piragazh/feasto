import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Users, Settings } from 'lucide-react';
import { toast } from 'sonner';
import TableActionsDialog from './TableActionsDialog';
import POSPayment from './POSPayment';

export default function POSTablesView({ restaurantId }) {
    const [showPayment, setShowPayment] = useState(false);
    const [viewingTable, setViewingTable] = useState(null);
    const [tableActionsOpen, setTableActionsOpen] = useState(false);
    const [selectedTableForActions, setSelectedTableForActions] = useState(null);

    const { data: tables = [], refetch: refetchTables } = useQuery({
        queryKey: ['pos-tables', restaurantId],
        queryFn: async () => {
            const result = await base44.entities.RestaurantTable.filter({ restaurant_id: restaurantId, is_active: true });
            return result;
        },
        enabled: !!restaurantId,
    });

    const { data: tableOrders = [], refetch: refetchTableOrders } = useQuery({
        queryKey: ['pos-table-orders', restaurantId],
        queryFn: async () => {
            const orders = await base44.entities.Order.filter({ 
                restaurant_id: restaurantId, 
                order_type: 'dine_in',
                status: { $in: ['preparing', 'confirmed', 'pending'] }
            });
            return orders;
        },
        enabled: !!restaurantId,
        refetchInterval: 3000,
        staleTime: 0,
        cacheTime: 0,
    });

    const getTableOrders = (tableId) => tableOrders.filter(o => o.table_id === tableId);
    const getTableTotal = (tableId) => getTableOrders(tableId).reduce((sum, order) => sum + order.total, 0);

    const getStatusColor = (status) => {
        switch (status) {
            case 'available': return 'bg-gray-700 border-gray-600';
            case 'occupied': return 'bg-orange-500/20 border-orange-500';
            case 'reserved': return 'bg-blue-500/20 border-blue-500';
            case 'needs_cleaning': return 'bg-yellow-500/20 border-yellow-500';
            default: return 'bg-gray-700 border-gray-600';
        }
    };

    const getStatusBadge = (status) => {
        const colors = {
            available: 'bg-green-500',
            occupied: 'bg-orange-500',
            reserved: 'bg-blue-500',
            needs_cleaning: 'bg-yellow-500'
        };
        return colors[status] || 'bg-gray-500';
    };

    const handlePaymentComplete = async () => {
        if (!viewingTable) {
            toast.error('No table selected');
            return;
        }

        const ordersForTable = tableOrders.filter(o => o.table_id === viewingTable.id);

        try {
            for (const order of ordersForTable) {
                await base44.entities.Order.update(order.id, { status: 'delivered' });
            }

            toast.success('Payment completed!');
            setShowPayment(false);
            setViewingTable(null);
            refetchTableOrders();
        } catch (error) {
            toast.error('Failed to complete payment');
        }
    };

    // Payment view
    if (showPayment && viewingTable) {
        const ordersForTable = tableOrders.filter(o => o.table_id === viewingTable.id);
        const total = ordersForTable.reduce((sum, order) => sum + order.total, 0);
        const allItems = ordersForTable.flatMap(order => order.items);

        return (
            <div className="flex flex-col h-[calc(100vh-200px)]">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white font-bold text-2xl">{viewingTable.table_number} - Payment</h2>
                    <Button 
                        onClick={() => {
                            setShowPayment(false);
                            setViewingTable(null);
                        }}
                        variant="outline"
                        className="text-white border-gray-600"
                    >
                        Back
                    </Button>
                </div>
                
                <POSPayment 
                    cart={allItems} 
                    cartTotal={total} 
                    onPaymentComplete={handlePaymentComplete}
                    onBackToCart={() => {
                        setShowPayment(false);
                        setViewingTable(null);
                    }}
                />
            </div>
        );
    }

    // Tables grid view
    return (
        <div className="flex flex-col h-full w-full">
            <h2 className="text-white font-bold text-2xl mb-4">Tables - Grid View</h2>

            <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 p-6 overflow-y-auto">
                <div className="grid grid-cols-4 gap-4">
                    {tables.map(table => {
                        const orders = getTableOrders(table.id);
                        const total = getTableTotal(table.id);
                        const hasOrders = orders.length > 0;
                        const isMerged = (table.merged_with || []).length > 0;

                        return (
                            <div
                                key={table.id}
                                className={`aspect-square rounded-xl p-3 flex flex-col relative cursor-pointer transition-all border-2 ${getStatusColor(table.status)} hover:opacity-90`}
                            >
                                {/* Status Indicator */}
                                <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${getStatusBadge(table.status)}`} />
                                
                                {/* Actions Button */}
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTableForActions(table);
                                        setTableActionsOpen(true);
                                    }}
                                    className="absolute top-2 left-2 h-6 w-6 p-0 text-gray-400 hover:text-white"
                                >
                                    <Settings className="h-4 w-4" />
                                </Button>

                                <div 
                                    className="flex-1 flex flex-col items-center justify-center"
                                    onClick={() => {
                                        if (hasOrders) {
                                            setViewingTable(table);
                                            setShowPayment(true);
                                        }
                                    }}
                                >
                                    <h3 className="text-white font-bold text-lg mb-1 text-center">{table.table_number}</h3>
                                    
                                    {table.assigned_server && (
                                        <div className="flex items-center gap-1 text-indigo-400 text-xs mb-1">
                                            <Users className="h-3 w-3" />
                                            <span>{table.assigned_server}</span>
                                        </div>
                                    )}

                                    {isMerged && (
                                        <p className="text-purple-400 text-xs mb-1">Merged</p>
                                    )}

                                    {table.notes && (
                                        <p className="text-gray-400 text-xs italic text-center line-clamp-2 mb-1">"{table.notes}"</p>
                                    )}

                                    {hasOrders ? (
                                        <>
                                            <p className="text-orange-400 text-xs">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
                                            <p className="text-white font-bold text-base mt-1">£{total.toFixed(2)}</p>
                                        </>
                                    ) : (
                                        <p className="text-gray-400 text-xs capitalize">{table.status.replace('_', ' ')}</p>
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
                    onClose={() => {
                        setTableActionsOpen(false);
                        setSelectedTableForActions(null);
                    }}
                    table={selectedTableForActions}
                    tables={tables}
                    onRefresh={() => {
                        refetchTables();
                        refetchTableOrders();
                    }}
                />
            )}
        </div>
    );
}