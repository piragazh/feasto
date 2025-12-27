import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PartialRefundDialog from './PartialRefundDialog';

export default function PastOrders({ restaurantId }) {
    const [refundingOrder, setRefundingOrder] = useState(null);
    const queryClient = useQueryClient();

    const { data: orders = [] } = useQuery({
        queryKey: ['past-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: { $in: ['delivered', 'cancelled', 'refunded', 'refund_requested'] }
        }, '-created_date', 100),
    });

    const refundMutation = useMutation({
        mutationFn: ({ orderId, refundedItems, refundAmount, reason }) => 
            base44.entities.Order.update(orderId, { 
                status: 'refunded',
                refunded_items: refundedItems,
                refund_amount: refundAmount,
                refund_reason: reason,
                refund_date: new Date().toISOString()
            }),
        onSuccess: () => {
            queryClient.invalidateQueries(['past-orders']);
            toast.success('Refund processed successfully');
            setRefundingOrder(null);
        },
    });

    const handleRefund = (refundData) => {
        refundMutation.mutate(refundData);
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">Past Orders</h2>
            <div className="space-y-4">
                {orders.map((order) => (
                    <Card key={order.id}>
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <p className="font-semibold">Order #{order.id.slice(-6)}</p>
                                    <p className="text-sm text-gray-500">
                                        {format(new Date(order.created_date), 'MMM d, yyyy h:mm a')}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <Badge className={order.status === 'delivered' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                                        {order.status}
                                    </Badge>
                                    <p className="text-lg font-bold mt-1">£{order.total.toFixed(2)}</p>
                                </div>
                            </div>
                            <div className="text-sm text-gray-600 mb-3">
                                <p><strong>Customer:</strong> {order.phone}</p>
                                <p><strong>Items:</strong> {order.items?.length || 0} items</p>
                            </div>
                            {order.status === 'delivered' && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setRefundingOrder(order)}
                                    className="text-orange-600"
                                >
                                    <DollarSign className="h-4 w-4 mr-1" />
                                    Issue Refund
                                </Button>
                            )}
                            {order.status === 'refunded' && order.refund_amount && (
                                <div className="text-sm text-green-600 mt-2">
                                    Refunded: £{order.refund_amount.toFixed(2)}
                                    {order.refund_reason && (
                                        <p className="text-xs text-gray-500">Reason: {order.refund_reason}</p>
                                    )}
                                </div>
                            )}
                            {order.status === 'refund_requested' && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-2">
                                    <p className="text-sm font-semibold text-yellow-900">Refund Requested</p>
                                    {order.refund_request_reason && (
                                        <p className="text-xs text-yellow-700 mt-1">{order.refund_request_reason}</p>
                                    )}
                                    <Button
                                        size="sm"
                                        className="mt-2"
                                        onClick={() => setRefundingOrder(order)}
                                    >
                                        Process Refund
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
            
            <PartialRefundDialog
                open={!!refundingOrder}
                onClose={() => setRefundingOrder(null)}
                order={refundingOrder}
                onRefund={handleRefund}
            />
        </div>
    );
}