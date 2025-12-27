import React from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, DollarSign, Clock, Package } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function DriverOrderList({ orders, driverId }) {
    const queryClient = useQueryClient();

    const acceptOrderMutation = useMutation({
        mutationFn: async (orderId) => {
            await base44.entities.Order.update(orderId, {
                driver_id: driverId,
                status: 'out_for_delivery'
            });
            await base44.entities.Driver.update(driverId, {
                current_order_id: orderId,
                is_available: false
            });
        },
        onSuccess: () => {
            toast.success('Order accepted! Start delivery');
            queryClient.invalidateQueries(['driver-active-order']);
            queryClient.invalidateQueries(['available-orders']);
        },
    });

    if (orders.length === 0) {
        return (
            <Card>
                <CardContent className="text-center py-12">
                    <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">
                        No Orders Available
                    </h3>
                    <p className="text-gray-500">
                        New delivery orders will appear here
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="text-sm text-gray-600 mb-2">
                {orders.length} order{orders.length > 1 ? 's' : ''} available
            </div>
            
            {orders.map((order, index) => (
                <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                >
                    <Card className="hover:shadow-lg transition-shadow">
                        <CardContent className="pt-6">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h3 className="font-semibold text-lg mb-1">
                                        {order.restaurant_name}
                                    </h3>
                                    <p className="text-sm text-gray-500">
                                        Order #{order.id.slice(-6)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-bold text-green-600">
                                        ${order.total.toFixed(2)}
                                    </p>
                                    <Badge variant="outline" className="mt-1">
                                        {order.payment_method?.replace('_', ' ')}
                                    </Badge>
                                </div>
                            </div>

                            <div className="space-y-2 mb-4">
                                <div className="flex items-start gap-2 text-sm">
                                    <MapPin className="h-4 w-4 text-orange-500 mt-0.5" />
                                    <span className="text-gray-700">{order.delivery_address}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Clock className="h-4 w-4" />
                                    <span>
                                        Placed {format(new Date(order.created_date), 'h:mm a')}
                                    </span>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded p-3 mb-4">
                                <p className="text-xs text-gray-600 mb-1">Order Items</p>
                                {order.items?.slice(0, 3).map((item, idx) => (
                                    <div key={idx} className="text-sm">
                                        {item.quantity}x {item.name}
                                    </div>
                                ))}
                                {order.items?.length > 3 && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        +{order.items.length - 3} more items
                                    </p>
                                )}
                            </div>

                            <Button
                                onClick={() => acceptOrderMutation.mutate(order.id)}
                                disabled={acceptOrderMutation.isPending}
                                className="w-full bg-orange-500 hover:bg-orange-600"
                            >
                                Accept Delivery
                            </Button>
                        </CardContent>
                    </Card>
                </motion.div>
            ))}
        </div>
    );
}