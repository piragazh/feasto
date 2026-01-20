import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, X, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PartialRefundDialog from './PartialRefundDialog';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export default function PastOrders({ restaurantId }) {
    const [refundingOrder, setRefundingOrder] = useState(null);
    const [expandedOrder, setExpandedOrder] = useState(null);
    const [rejectingRefund, setRejectingRefund] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');
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

    const undoRefundMutation = useMutation({
        mutationFn: (orderId) => 
            base44.entities.Order.update(orderId, { 
                status: 'delivered',
                refunded_items: null,
                refund_amount: null,
                refund_reason: null,
                refund_date: null
            }),
        onSuccess: () => {
            queryClient.invalidateQueries(['past-orders']);
            toast.success('Refund undone successfully');
        },
    });

    const rejectRefundMutation = useMutation({
        mutationFn: ({ orderId, rejectionReason }) => 
            base44.entities.Order.update(orderId, { 
                status: 'delivered',
                refund_request_type: null,
                refund_requested_items: null,
                refund_requested_amount: null,
                refund_request_reason: null,
                refund_request_description: null,
                refund_request_date: null,
                refund_rejection_reason: rejectionReason,
                refund_rejected_date: new Date().toISOString()
            }),
        onSuccess: () => {
            queryClient.invalidateQueries(['past-orders']);
            toast.success('Refund request rejected');
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
                                <p><strong>Address:</strong> {order.delivery_address}</p>
                                <p><strong>Items:</strong> {order.items?.length || 0} items</p>
                                <p><strong>Payment:</strong> {order.payment_method || 'N/A'}</p>
                                <p><strong>Order Type:</strong> {order.order_type === 'collection' ? '🏪 Collection' : '🚚 Delivery'}</p>
                                {order.order_number && (
                                    <p><strong>Order Number:</strong> {order.order_number}</p>
                                )}
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                                    className="text-orange-600 mt-2 p-0 h-auto"
                                >
                                    {expandedOrder === order.id ? 'Hide Details' : 'View Details'}
                                </Button>
                            </div>
                            {expandedOrder === order.id && (
                                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                                    <p className="font-semibold text-sm mb-2">Order Items:</p>
                                    <div className="space-y-2">
                                        {order.items?.map((item, idx) => (
                                            <div key={idx} className="flex justify-between text-sm">
                                                <span>{item.quantity}x {item.name}</span>
                                                <span className="font-medium">£{(item.price * item.quantity).toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="border-t mt-2 pt-2 space-y-1 text-sm">
                                        <div className="flex justify-between">
                                            <span>Subtotal:</span>
                                            <span>£{order.subtotal?.toFixed(2) || '0.00'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Delivery Fee:</span>
                                            <span>£{order.delivery_fee?.toFixed(2) || '0.00'}</span>
                                        </div>
                                        {order.discount > 0 && (
                                            <div className="flex justify-between text-green-600">
                                                <span>Discount:</span>
                                                <span>-£{order.discount?.toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between font-bold text-base border-t pt-1">
                                            <span>Total:</span>
                                            <span>£{order.total?.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    {order.notes && (
                                        <div className="mt-2 pt-2 border-t">
                                            <p className="text-xs text-gray-500"><strong>Notes:</strong> {order.notes}</p>
                                        </div>
                                    )}
                                </div>
                            )}
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
                                <div className="bg-green-50 border border-green-200 rounded p-3 mt-2">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-green-900">Refunded: £{order.refund_amount.toFixed(2)}</p>
                                            {order.refund_reason && (
                                                <p className="text-xs text-gray-600 mt-1"><strong>Reason:</strong> {order.refund_reason}</p>
                                            )}
                                            {order.refunded_items && order.refunded_items.length > 0 && (
                                                <div className="text-xs text-gray-600 mt-2">
                                                    <p className="font-semibold">Refunded Items:</p>
                                                    <ul className="list-disc list-inside ml-2">
                                                        {order.refunded_items.map((item, idx) => (
                                                            <li key={idx}>{item.name} (£{item.price.toFixed(2)})</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {order.refund_date && (
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Refunded on: {format(new Date(order.refund_date), 'MMM d, yyyy h:mm a')}
                                                </p>
                                            )}
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => undoRefundMutation.mutate(order.id)}
                                            className="text-red-600 ml-2"
                                        >
                                            Undo Refund
                                        </Button>
                                    </div>
                                </div>
                            )}
                            {order.status === 'refund_requested' && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-2">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <AlertCircle className="h-5 w-5 text-yellow-600" />
                                            <p className="text-sm font-semibold text-yellow-900">Refund Requested</p>
                                        </div>
                                        <Badge className="bg-orange-100 text-orange-800">
                                            {order.refund_request_type === 'full' ? 'Full Refund' : 'Partial Refund'}
                                        </Badge>
                                    </div>
                                    <div className="space-y-2 text-xs text-yellow-800">
                                        {order.refund_request_reason && (
                                            <p><strong>Reason:</strong> {order.refund_request_reason}</p>
                                        )}
                                        {order.refund_request_description && (
                                            <p><strong>Details:</strong> {order.refund_request_description}</p>
                                        )}
                                        <p><strong>Amount:</strong> £{order.refund_requested_amount?.toFixed(2) || '0.00'}</p>
                                        {order.refund_requested_items && order.refund_requested_items.length > 0 && (
                                            <div>
                                                <p className="font-semibold">Items:</p>
                                                <ul className="list-disc list-inside ml-2">
                                                    {order.refund_requested_items.map((item, idx) => (
                                                        <li key={idx}>{item.name} (£{item.price.toFixed(2)})</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        <Button
                                            size="sm"
                                            onClick={() => setRefundingOrder(order)}
                                            className="bg-green-600 hover:bg-green-700"
                                        >
                                            Approve Refund
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setRejectingRefund(order)}
                                            className="text-red-600"
                                        >
                                            Reject
                                        </Button>
                                    </div>
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

            <Dialog open={!!rejectingRefund} onOpenChange={(open) => !open && setRejectingRefund(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reject Refund Request</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            Please provide a reason for rejecting this refund request. The customer will be notified.
                        </p>
                        <Textarea
                            placeholder="Reason for rejection..."
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            rows={4}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectingRefund(null)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                if (!rejectionReason.trim()) {
                                    toast.error('Please provide a rejection reason');
                                    return;
                                }
                                rejectRefundMutation.mutate({
                                    orderId: rejectingRefund.id,
                                    rejectionReason
                                });
                                setRejectionReason('');
                                setRejectingRefund(null);
                            }}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Reject Refund
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}