import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import FloorPlanView from './FloorPlanView';
import { Loader } from 'lucide-react';

export default function POSTableFloorPlan({ restaurantId }) {
    const [selectedTable, setSelectedTable] = useState(null);

    const { data: tables = [], isLoading: tablesLoading, refetch: refetchTables } = useQuery({
        queryKey: ['restaurant-tables', restaurantId],
        queryFn: () => base44.entities.RestaurantTable.filter({ 
            restaurant_id: restaurantId,
            is_active: true 
        }),
    });

    const { data: tableOrders = [], isLoading: ordersLoading } = useQuery({
        queryKey: ['table-orders', restaurantId],
        queryFn: async () => {
            const orders = await base44.entities.Order.filter({
                restaurant_id: restaurantId,
                order_type: 'dine_in',
                status: { $nin: ['delivered', 'cancelled'] }
            });
            return orders || [];
        },
    });

    const handleTableClick = (table) => {
        setSelectedTable(table);
    };

    if (tablesLoading || ordersLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <Loader className="h-8 w-8 animate-spin text-orange-500 mx-auto mb-2" />
                    <p className="text-gray-400">Loading floor plan...</p>
                </div>
            </div>
        );
    }

    if (!tables || tables.length === 0) {
        return (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
                <p className="text-gray-400">No tables configured for this restaurant</p>
            </div>
        );
    }

    return (
        <FloorPlanView 
            tables={tables}
            tableOrders={tableOrders}
            onRefresh={() => {
                refetchTables();
            }}
            onTableClick={handleTableClick}
        />
    );
}