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
            refetch();
        } catch (error) {
            toast.error('Failed to update order');
        }
    };

    const markAsReady = async (orderId) => {
        try {
            await base44.entities.Order.update(orderId, { status: 'ready_for_collection' });
            refetch();
            toast.success('Order ready for collection!');
        } catch (error) {
            toast.error('Failed to update order');
        }
    };

    return (
        <div className="grid grid-cols-2 gap-6 h-[calc(100vh-200px)]">
            {/* Active Orders */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 overflow-hidden flex flex-col">
                <h2 className="text-white font-bold text-xl mb-4">🔴 Active Orders</h2>
                <div className="flex-1 overflow-y-auto space-y-3">
                    {activeOrders.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">No active orders</p>
                    ) : (
                        activeOrders.map(order => (
                            <Card key={order.id} className={`bg-gray-700 border-2 ${
                                order.status === 'preparing' ? 'border-blue-500' : 'border-yellow-500'
                            }`}>
                                <CardContent className="p-4">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <p className="text-white font-bold text-lg">#{order.id.slice(0, 8)}</p>
                                            <p className="text-gray-400 text-xs">{new Date(order.created_date).toLocaleTimeString()}</p>
                                        </div>
                                        <Badge className={order.status === 'preparing' ? 'bg-blue-600' : 'bg-yellow-600'}>
                                            {order.status}
                                        </Badge>
                                    </div>

                                    <div className="bg-gray-600 p-3 rounded mb-3">
                                        {order.items.map((item, idx) => (
                                            <div key={idx} className="flex justify-between text-white mb-1">
                                                <span className="font-semibold">{item.quantity}x {item.name}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="space-y-2">
                                        {order.status === 'pending' && (
                                            <Button
                                                onClick={() => markAsPreparing(order.id)}
                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                                            >
                                                Start Preparing
                                            </Button>
                                        )}
                                        {order.status === 'preparing' && (
                                            <Button
                                                onClick={() => markAsReady(order.id)}
                                                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold"
                                            >
                                                Mark Ready
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            </div>

            {/* Ready Orders */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 overflow-hidden flex flex-col">
                <h2 className="text-white font-bold text-xl mb-4">🟢 Ready for Collection</h2>
                <div className="flex-1 overflow-y-auto space-y-3">
                    {readyOrders.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">No ready orders</p>
                    ) : (
                        readyOrders.map(order => (
                            <Card key={order.id} className="bg-green-700 border-2 border-green-500">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <CheckCircle2 className="h-6 w-6 text-green-300" />
                                        <p className="text-white font-bold text-lg">#{order.id.slice(0, 8)}</p>
                                    </div>

                                    <div className="bg-green-600 bg-opacity-50 p-3 rounded mb-3">
                                        {order.items.map((item, idx) => (
                                            <p key={idx} className="text-white font-semibold mb-1">
                                                {item.quantity}x {item.name}
                                            </p>
                                        ))}
                                    </div>

                                    <p className="text-green-200 text-sm font-semibold">
                                        ⏱️ Ready since {new Date(order.updated_date).toLocaleTimeString()}
                                    </p>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}