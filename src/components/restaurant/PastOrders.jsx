import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function PastOrders({ restaurantId }) {
    const queryClient = useQueryClient();

    const { data: orders = [] } = useQuery({
        queryKey: ['past-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: { $in: ['delivered', 'cancelled'] }
        }, '-created_date', 100),
    });

    const refundMutation = useMutation({
        mutationFn: ({ orderId }) => 
            base44.entities.Order.update(orderId, { status: 'refunded' }),
        onSuccess: () => {
            queryClient.invalidateQueries(['past-orders']);
            toast.success('Refund processed');
        },
    });

    const handleRefund = (orderId) => {
        if (confirm('Issue refund for this order?')) {
            refundMutation.mutate({ orderId });
        }
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
                                    <p className="text-lg font-bold mt-1">${order.total.toFixed(2)}</p>
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
                                    onClick={() => handleRefund(order.id)}
                                    className="text-orange-600"
                                >
                                    <DollarSign className="h-4 w-4 mr-1" />
                                    Issue Refund
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}