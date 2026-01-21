import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function POSAdminOrders({ restaurantId }) {
    const [statusFilter, setStatusFilter] = useState('all');
    const [expandedOrder, setExpandedOrder] = useState(null);
    const queryClient = useQueryClient();

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }),
    });

    const updateStatusMutation = useMutation({
        mutationFn: ({ orderId, status }) => base44.entities.Order.update(orderId, { status }),
        onSuccess: () => {
            queryClient.invalidateQueries(['orders', restaurantId]);
            toast.success('Order status updated');
        },
        onError: () => {
            toast.error('Failed to update order');
        },
    });

    const filteredOrders = orders.filter(o => statusFilter === 'all' || o.status === statusFilter);

    const statuses = [
        'pending', 'confirmed', 'preparing', 'ready_for_collection', 'out_for_delivery', 'delivered', 'collected', 'cancelled'
    ];

    return (
        <div className="space-y-4">
            {/* Filter */}
            <div className="flex gap-3">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-48">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Orders</SelectItem>
                        {statuses.map(s => (
                            <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Orders List */}
            {isLoading ? (
                <div className="text-center py-8">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No orders found</div>
            ) : (
                <div className="space-y-3">
                    {filteredOrders.map(order => (
                        <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <div>
                                                <p className="font-mono text-sm font-semibold">{order.id.slice(0, 8)}</p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {new Date(order.created_date).toLocaleString()}
                                                </p>
                                            </div>
                                            <div className="ml-4">
                                                <p className="text-sm text-gray-600">
                                                    {order.items?.length || 0} items
                                                </p>
                                                <p className="text-lg font-bold">£{(order.total || 0).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <span className={`inline-block px-3 py-1 text-sm rounded font-medium ${
                                            order.status === 'delivered' || order.status === 'collected' ? 'bg-green-100 text-green-800' :
                                            order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                            order.status === 'preparing' ? 'bg-blue-100 text-blue-800' :
                                            order.status === 'ready_for_collection' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {order.status.replace(/_/g, ' ')}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                                        >
                                            {expandedOrder === order.id ? 'Hide' : 'View'}
                                        </Button>
                                    </div>
                                </div>

                                {/* Expanded View */}
                                {expandedOrder === order.id && (
                                    <div className="mt-4 pt-4 border-t space-y-3">
                                        <div>
                                            <p className="text-xs font-semibold text-gray-600 mb-2">ITEMS</p>
                                            <div className="space-y-1">
                                                {order.items?.map((item, idx) => (
                                                    <div key={idx} className="text-sm flex justify-between">
                                                        <span>{item.quantity}x {item.name}</span>
                                                        <span className="text-gray-600">£{(item.price * item.quantity).toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div>
                                                <p className="text-xs text-gray-600">Delivery Address</p>
                                                <p className="font-medium">{order.delivery_address || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-600">Payment Method</p>
                                                <p className="font-medium">{order.payment_method || 'N/A'}</p>
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-xs font-semibold text-gray-600 mb-2">CHANGE STATUS</p>
                                            <Select value={order.status} onValueChange={(newStatus) => {
                                                updateStatusMutation.mutate({ orderId: order.id, status: newStatus });
                                            }}>
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {statuses.map(s => (
                                                        <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}