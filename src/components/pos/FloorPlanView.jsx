import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Settings, Users } from 'lucide-react';
import TableActionsDialog from './TableActionsDialog';

export default function FloorPlanView({ tables, tableOrders, onRefresh, onTableClick }) {
    const [isDragging, setIsDragging] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [tableActionsOpen, setTableActionsOpen] = useState(false);
    const [selectedTable, setSelectedTable] = useState(null);

    const getTableOrders = (tableId) => tableOrders.filter(o => o.table_id === tableId);
    const getTableTotal = (tableId) => getTableOrders(tableId).reduce((sum, order) => sum + order.total, 0);

    const getStatusColor = (status) => {
        switch (status) {
            case 'available': return 'bg-green-500/20 border-green-500';
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

    const handleMouseDown = (e, table) => {
        if (e.target.closest('button')) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        setIsDragging(table.id);
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;

        const container = document.getElementById('floor-plan-container');
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left - dragOffset.x;
        const y = e.clientY - rect.top - dragOffset.y;

        const element = document.getElementById(`table-${isDragging}`);
        if (element) {
            element.style.left = `${Math.max(0, Math.min(x, rect.width - 120))}px`;
            element.style.top = `${Math.max(0, Math.min(y, rect.height - 120))}px`;
        }
    };

    const handleMouseUp = async (e) => {
        if (!isDragging) return;

        const container = document.getElementById('floor-plan-container');
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left - dragOffset.x;
        const y = e.clientY - rect.top - dragOffset.y;

        try {
            await base44.entities.RestaurantTable.update(isDragging, {
                position: {
                    x: Math.max(0, Math.min(x, rect.width - 120)),
                    y: Math.max(0, Math.min(y, rect.height - 120))
                }
            });
            onRefresh();
        } catch (error) {
            toast.error('Failed to update table position');
        }

        setIsDragging(null);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-white font-bold text-2xl">Floor Plan View</h2>
                    <p className="text-gray-400 text-sm">Drag tables to rearrange layout</p>
                </div>
            </div>

            <div 
                id="floor-plan-container"
                className="flex-1 bg-gray-800 rounded-lg border border-gray-700 relative overflow-hidden"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {tables.map(table => {
                    const orders = getTableOrders(table.id);
                    const total = getTableTotal(table.id);
                    const hasOrders = orders.length > 0;
                    const isMerged = (table.merged_with || []).length > 0;
                    const position = table.position || { x: 0, y: 0 };

                    return (
                        <div
                            key={table.id}
                            id={`table-${table.id}`}
                            style={{
                                position: 'absolute',
                                left: `${position.x}px`,
                                top: `${position.y}px`,
                                width: '120px',
                                height: '120px'
                            }}
                            onMouseDown={(e) => handleMouseDown(e, table)}
                            className={`rounded-xl p-3 flex flex-col relative cursor-move transition-all border-2 ${getStatusColor(table.status)} ${
                                isDragging === table.id ? 'shadow-2xl scale-105' : 'hover:shadow-lg'
                            }`}
                        >
                            {/* Status Indicator */}
                            <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${getStatusBadge(table.status)}`} />
                            
                            {/* Actions Button */}
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTable(table);
                                    setTableActionsOpen(true);
                                }}
                                className="absolute top-2 left-2 h-6 w-6 p-0 text-gray-400 hover:text-white"
                            >
                                <Settings className="h-3 w-3" />
                            </Button>

                            <div 
                                className="flex-1 flex flex-col items-center justify-center"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (hasOrders) onTableClick(table);
                                }}
                            >
                                <h3 className="text-white font-bold text-sm mb-1 text-center truncate w-full">{table.table_number}</h3>
                                
                                {table.assigned_server && (
                                    <div className="flex items-center gap-1 text-indigo-400 text-xs mb-1">
                                        <Users className="h-3 w-3" />
                                        <span className="truncate">{table.assigned_server}</span>
                                    </div>
                                )}

                                {isMerged && (
                                    <p className="text-purple-400 text-xs mb-1">Merged</p>
                                )}

                                {hasOrders ? (
                                    <>
                                        <p className="text-orange-400 text-xs">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
                                        <p className="text-white font-bold text-sm mt-1">£{total.toFixed(2)}</p>
                                    </>
                                ) : (
                                    <p className="text-gray-400 text-xs capitalize">{table.status.replace('_', ' ')}</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {tableActionsOpen && selectedTable && (
                <TableActionsDialog
                    open={tableActionsOpen}
                    onClose={() => {
                        setTableActionsOpen(false);
                        setSelectedTable(null);
                    }}
                    table={selectedTable}
                    tables={tables}
                    onRefresh={onRefresh}
                />
            )}
        </div>
    );
}