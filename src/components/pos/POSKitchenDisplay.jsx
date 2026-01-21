import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, AlertCircle, Flame } from 'lucide-react';
import { toast } from 'sonner';

export default function POSKitchenDisplay({ restaurantId }) {
     const [sortBy, setSortBy] = useState('time');

     const { data: orders = [], refetch } = useQuery({
         queryKey: ['pos-kitchen-orders', restaurantId],
         queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }),
         enabled: !!restaurantId,
         refetchInterval: 2000,
     });

     const pendingOrders = orders.filter(o => o.status === 'pending');
     const preparingOrders = orders.filter(o => o.status === 'preparing');
     const readyOrders = orders.filter(o => o.status === 'ready_for_collection');

     const getWaitTime = (createdDate) => {
         const elapsed = Date.now() - new Date(createdDate).getTime();
         const minutes = Math.floor(elapsed / 60000);
         return minutes;
     };

     const isUrgent = (order) => getWaitTime(order.created_date) > 15;

    const markAsPreparing = async (orderId) => {
        try {
            await base44.entities.Order.update(orderId, { status: 'preparing' });
            toast.success('Started preparing');
            refetch();
        } catch (error) {
            toast.error('Failed to update order');
        }
    };

    const markAsReady = async (orderId) => {
        try {
            await base44.entities.Order.update(orderId, { status: 'ready_for_collection' });
            toast.success('Order ready!');
            refetch();
        } catch (error) {
            toast.error('Failed to update order');
        }
    };

    const OrderCard = ({ order, canStartPreparing, canMarkReady, isUrgentOrder }) => {
        const waitMinutes = getWaitTime(order.created_date);

        return (
            <Card className={`${
                isUrgentOrder 
                    ? 'bg-red-900 border-2 border-red-500 shadow-lg shadow-red-500' 
                    : 'bg-gray-700 border-2 border-gray-600'
            }`}>
                <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                            <p className="text-white font-bold text-2xl">#{order.id.slice(0, 8)}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <Clock className="h-4 w-4 text-gray-300" />
                                <p className={`text-sm font-semibold ${isUrgentOrder ? 'text-red-200' : 'text-gray-300'}`}>
                                    {waitMinutes}m ago
                                </p>
                            </div>
                        </div>
                        {isUrgentOrder && <Flame className="h-6 w-6 text-red-400" />}
                    </div>

                    <div className={`p-3 rounded mb-3 ${isUrgentOrder ? 'bg-red-800' : 'bg-gray-600'}`}>
                        {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-white mb-2 pb-2 border-b border-gray-500 last:border-0">
                                <span className="font-bold text-lg">{item.quantity}x</span>
                                <span className="flex-1 ml-2 text-white">{item.name}</span>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-2">
                        {canStartPreparing && (
                            <Button
                                onClick={() => markAsPreparing(order.id)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 text-base"
                            >
                                Start Preparing
                            </Button>
                        )}
                        {canMarkReady && (
                            <Button
                                onClick={() => markAsReady(order.id)}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold h-10 text-base"
                            >
                                Mark Ready
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="h-[calc(100vh-200px)] flex flex-col gap-4 p-4 bg-gray-900">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-4xl font-bold text-white">Kitchen Display System</h1>
                <div className="flex gap-2">
                    <Badge className="bg-yellow-600 text-white text-base px-3 py-1">
                        New: {pendingOrders.length}
                    </Badge>
                    <Badge className="bg-blue-600 text-white text-base px-3 py-1">
                        Preparing: {preparingOrders.length}
                    </Badge>
                    <Badge className="bg-green-600 text-white text-base px-3 py-1">
                        Ready: {readyOrders.length}
                    </Badge>
                </div>
            </div>

            {/* Three Column Layout */}
            <div className="grid grid-cols-3 gap-4 flex-1 overflow-hidden">
                {/* New Orders */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col overflow-hidden">
                    <h2 className="text-white font-bold text-2xl mb-4 pb-3 border-b border-gray-600">
                        🟡 New Orders
                    </h2>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                        {pendingOrders.length === 0 ? (
                            <p className="text-gray-400 text-center py-12 text-lg">No new orders</p>
                        ) : (
                            pendingOrders.map(order => (
                                <OrderCard
                                    key={order.id}
                                    order={order}
                                    canStartPreparing={true}
                                    canMarkReady={false}
                                    isUrgentOrder={isUrgent(order)}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* Preparing Orders */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col overflow-hidden">
                    <h2 className="text-white font-bold text-2xl mb-4 pb-3 border-b border-gray-600">
                        🔵 Preparing
                    </h2>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                        {preparingOrders.length === 0 ? (
                            <p className="text-gray-400 text-center py-12 text-lg">No orders preparing</p>
                        ) : (
                            preparingOrders.map(order => (
                                <OrderCard
                                    key={order.id}
                                    order={order}
                                    canStartPreparing={false}
                                    canMarkReady={true}
                                    isUrgentOrder={isUrgent(order)}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* Ready Orders */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-col overflow-hidden">
                    <h2 className="text-white font-bold text-2xl mb-4 pb-3 border-b border-gray-600">
                        🟢 Ready
                    </h2>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                        {readyOrders.length === 0 ? (
                            <p className="text-gray-400 text-center py-12 text-lg">No ready orders</p>
                        ) : (
                            readyOrders.map(order => (
                                <Card key={order.id} className="bg-green-700 border-2 border-green-500">
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <CheckCircle2 className="h-6 w-6 text-green-300" />
                                            <p className="text-white font-bold text-2xl">#{order.id.slice(0, 8)}</p>
                                        </div>

                                        <div className="bg-green-600 bg-opacity-50 p-3 rounded mb-3">
                                            {order.items.map((item, idx) => (
                                                <p key={idx} className="text-white font-semibold text-lg mb-1">
                                                    {item.quantity}x {item.name}
                                                </p>
                                            ))}
                                        </div>

                                        <p className="text-green-200 text-base font-semibold">
                                            Ready since {new Date(order.updated_date).toLocaleTimeString()}
                                        </p>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
    }