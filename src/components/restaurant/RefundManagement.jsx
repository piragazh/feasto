import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function RefundManagement({ restaurantId }) {
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [messageText, setMessageText] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [viewDialog, setViewDialog] = useState(null);
    const queryClient = useQueryClient();

    const { data: refundRequests = [], isLoading } = useQuery({
        queryKey: ['refund-requests', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId, 
            status: 'refund_requested' 
        }, '-created_date'),
        refetchInterval: 5000,
    });

    const approveMutation = useMutation({
        mutationFn: (orderId) => base44.entities.Order.update(orderId, {
            status: 'refunded',
            refund_amount: refundRequests.find(o => o.id === orderId)?.refund_requested_amount || 0,
            refund_approved_date: new Date().toISOString()
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['refund-requests']);
            toast.success('Refund approved');
            setViewDialog(null);
        },
    });

    const rejectMutation = useMutation({
        mutationFn: ({ orderId, reason }) => base44.entities.Order.update(orderId, {
            status: 'delivered',
            refund_rejection_reason: reason,
            refund_rejected_date: new Date().toISOString()
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['refund-requests']);
            toast.success('Refund request rejected');
            setViewDialog(null);
            setRejectReason('');
        },
    });

    const sendMessageMutation = useMutation({
        mutationFn: ({ orderId, restaurantId, message }) => 
            base44.entities.Message.create({
                order_id: orderId,
                restaurant_id: restaurantId,
                sender_type: 'restaurant',
                message: message
            }),
        onSuccess: () => {
            toast.success('Message sent to customer');
            setSelectedOrder(null);
            setMessageText('');
        },
    });

    const handleSendMessage = (order) => {
        if (!messageText.trim()) return;
        sendMessageMutation.mutate({
            orderId: order.id,
            restaurantId: order.restaurant_id,
            message: messageText
        });
    };

    const handleReject = (orderId) => {
        if (!rejectReason.trim()) {
            toast.error('Please provide a reason for rejection');
            return;
        }
        rejectMutation.mutate({ orderId, reason: rejectReason });
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-orange-500" />
                        Refund Requests ({refundRequests.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <p className="text-center text-gray-500 py-8">Loading...</p>
                    ) : refundRequests.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">No pending refund requests</p>
                    ) : (
                        <div className="space-y-4">
                            {refundRequests.map((order) => (
                                <div key={order.id} className="border rounded-lg p-4 space-y-3">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h3 className="font-semibold text-lg">Order #{order.id.slice(-6)}</h3>
                                            <p className="text-sm text-gray-600">{order.created_by}</p>
                                            {order.refund_request_date && (
                                                <p className="text-xs text-gray-500">
                                                    Requested: {format(new Date(order.refund_request_date), 'MMM d, yyyy h:mm a')}
                                                </p>
                                            )}
                                        </div>
                                        <Badge className="bg-yellow-500 text-white">
                                            £{order.refund_requested_amount?.toFixed(2) || '0.00'}
                                        </Badge>
                                    </div>

                                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                                        <p className="text-sm font-semibold text-yellow-900 mb-1">
                                            {order.refund_request_type === 'full' ? 'Full Refund' : 'Partial Refund'}
                                        </p>
                                        <p className="text-sm text-yellow-800 mb-1">
                                            <span className="font-medium">Reason:</span> {order.refund_request_reason || 'Not provided'}
                                        </p>
                                        <p className="text-sm text-yellow-800">
                                            <span className="font-medium">Details:</span> {order.refund_request_description || 'Not provided'}
                                        </p>
                                        {order.refund_request_type === 'partial' && order.refund_requested_items && (
                                            <div className="mt-2">
                                                <p className="text-xs font-medium text-yellow-900 mb-1">Refunded Items:</p>
                                                <ul className="text-xs text-yellow-800 list-disc list-inside">
                                                    {order.refund_requested_items.map((item, idx) => (
                                                        <li key={idx}>{item.quantity}x {item.name}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-2 flex-wrap">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setSelectedOrder(order)}
                                        >
                                            <MessageSquare className="h-4 w-4 mr-2" />
                                            Ask Details
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => setViewDialog(order)}
                                            className="bg-green-600 hover:bg-green-700"
                                        >
                                            <CheckCircle className="h-4 w-4 mr-2" />
                                            View & Decide
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Message Dialog */}
            <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ask Customer for More Details</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            Send a message to the customer about their refund request for Order #{selectedOrder?.id?.slice(-6)}
                        </p>
                        <Textarea
                            placeholder="Type your message to the customer..."
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            rows={4}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedOrder(null)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => handleSendMessage(selectedOrder)}
                            disabled={!messageText.trim() || sendMessageMutation.isPending}
                            className="bg-orange-500 hover:bg-orange-600"
                        >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Send Message
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Approve/Reject Dialog */}
            <Dialog open={!!viewDialog} onOpenChange={() => setViewDialog(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Review Refund Request - Order #{viewDialog?.id?.slice(-6)}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="bg-gray-50 rounded-lg p-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-gray-600">Customer:</span>
                                    <p className="font-medium">{viewDialog?.created_by}</p>
                                </div>
                                <div>
                                    <span className="text-gray-600">Order Total:</span>
                                    <p className="font-medium">£{viewDialog?.total?.toFixed(2)}</p>
                                </div>
                                <div>
                                    <span className="text-gray-600">Refund Type:</span>
                                    <p className="font-medium capitalize">{viewDialog?.refund_request_type}</p>
                                </div>
                                <div>
                                    <span className="text-gray-600">Refund Amount:</span>
                                    <p className="font-medium text-orange-600">
                                        £{viewDialog?.refund_requested_amount?.toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4">
                            <p className="font-semibold text-yellow-900 mb-2">Customer's Reason:</p>
                            <p className="text-sm text-yellow-800 mb-2">
                                <span className="font-medium">Issue:</span> {viewDialog?.refund_request_reason || 'Not provided'}
                            </p>
                            <p className="text-sm text-yellow-800">
                                <span className="font-medium">Description:</span> {viewDialog?.refund_request_description || 'Not provided'}
                            </p>
                        </div>

                        {viewDialog?.refund_request_type === 'partial' && viewDialog?.refund_requested_items && (
                            <div>
                                <p className="font-semibold mb-2">Items to Refund:</p>
                                <div className="space-y-1">
                                    {viewDialog.refund_requested_items.map((item, idx) => (
                                        <div key={idx} className="text-sm flex justify-between bg-gray-50 p-2 rounded">
                                            <span>{item.quantity}x {item.name}</span>
                                            <span>£{(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-3 pt-4 border-t">
                            <div>
                                <label className="text-sm font-medium mb-2 block">
                                    Rejection Reason (only if rejecting):
                                </label>
                                <Textarea
                                    placeholder="Explain why you're rejecting this refund request..."
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    rows={3}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="flex gap-2">
                        <Button variant="outline" onClick={() => setViewDialog(null)}>
                            Close
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => handleReject(viewDialog.id)}
                            disabled={!rejectReason.trim() || rejectMutation.isPending}
                        >
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject Request
                        </Button>
                        <Button
                            onClick={() => approveMutation.mutate(viewDialog.id)}
                            disabled={approveMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Approve Refund
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}