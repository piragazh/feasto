import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShieldCheck, CheckCircle, DollarSign, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function PlatformRefundOversight() {
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [overrideReason, setOverrideReason] = useState('');
    const queryClient = useQueryClient();

    const { data: rejectedRefunds = [], isLoading } = useQuery({
        queryKey: ['rejected-refunds'],
        queryFn: async () => {
            const orders = await base44.asServiceRole.entities.Order.list();
            return orders.filter(order => order.status === 'refund_rejected_by_restaurant');
        },
        refetchInterval: 10000,
    });

    const overrideMutation = useMutation({
        mutationFn: async ({ orderId, reason }) => {
            const user = await base44.auth.me();
            return base44.asServiceRole.entities.Order.update(orderId, {
                status: 'refunded',
                refund_paid_by: 'platform',
                platform_override_reason: reason,
                platform_override_date: new Date().toISOString(),
                platform_override_by: user.email
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['rejected-refunds']);
            toast.success('Refund approved - Platform will cover the cost');
            setSelectedOrder(null);
            setOverrideReason('');
        },
    });

    const handleOverride = () => {
        if (!overrideReason.trim()) {
            toast.error('Please provide a reason for overriding');
            return;
        }
        overrideMutation.mutate({ 
            orderId: selectedOrder.id, 
            reason: overrideReason 
        });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-blue-500" />
                    Platform Refund Oversight ({rejectedRefunds.length})
                </CardTitle>
                <p className="text-sm text-gray-600">
                    Review restaurant-rejected refunds and override if necessary
                </p>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <p className="text-center text-gray-500 py-8">Loading...</p>
                ) : rejectedRefunds.length === 0 ? (
                    <div className="text-center py-8">
                        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                        <p className="text-gray-500">No rejected refunds pending review</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {rejectedRefunds.map((order) => (
                            <div key={order.id} className="border rounded-lg p-4 space-y-3 bg-red-50 border-red-200">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <h3 className="font-semibold text-lg">Order #{order.id?.slice(-6)}</h3>
                                            <Badge className="bg-red-500 text-white">
                                                Restaurant Rejected
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-gray-700">
                                            <span className="font-medium">Restaurant:</span> {order.restaurant_name}
                                        </p>
                                        <p className="text-sm text-gray-700">
                                            <span className="font-medium">Customer:</span> {order.created_by}
                                        </p>
                                        <p className="text-xs text-gray-600 mt-1">
                                            Rejected: {order.refund_rejected_date && format(new Date(order.refund_rejected_date), 'MMM d, yyyy h:mm a')}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-bold text-red-600">
                                            £{order.refund_requested_amount?.toFixed(2)}
                                        </div>
                                        <Badge variant="outline" className="mt-1">
                                            {order.refund_request_type}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-3">
                                    <div className="bg-white rounded p-3 border">
                                        <p className="text-xs font-semibold text-gray-700 mb-1">Customer's Reason:</p>
                                        <p className="text-sm text-gray-600">
                                            {order.refund_request_reason || 'Not provided'}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-2">
                                            {order.refund_request_description}
                                        </p>
                                    </div>
                                    <div className="bg-white rounded p-3 border border-red-300">
                                        <p className="text-xs font-semibold text-red-700 mb-1">Restaurant's Rejection:</p>
                                        <p className="text-sm text-red-900">
                                            {order.refund_rejection_reason || 'No reason provided'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        onClick={() => setSelectedOrder(order)}
                                        className="bg-blue-600 hover:bg-blue-700"
                                    >
                                        <ShieldCheck className="h-4 w-4 mr-2" />
                                        Override & Approve
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Override Dialog */}
                <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Platform Override - Approve Refund</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-yellow-900 mb-1">
                                            Platform Will Cover Refund Cost
                                        </p>
                                        <p className="text-sm text-yellow-800">
                                            By overriding, you're approving this refund and the platform will cover 
                                            the £{selectedOrder?.refund_requested_amount?.toFixed(2)} cost. 
                                            The restaurant's earnings will not be affected.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-gray-600">Order ID:</span>
                                        <p className="font-medium">#{selectedOrder?.id?.slice(-6)}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Restaurant:</span>
                                        <p className="font-medium">{selectedOrder?.restaurant_name}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Customer:</span>
                                        <p className="font-medium">{selectedOrder?.created_by}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Refund Amount:</span>
                                        <p className="font-medium text-red-600">
                                            £{selectedOrder?.refund_requested_amount?.toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium mb-2 block">
                                    Reason for Platform Override *
                                </label>
                                <Textarea
                                    placeholder="Explain why the platform is overriding the restaurant's decision..."
                                    value={overrideReason}
                                    onChange={(e) => setOverrideReason(e.target.value)}
                                    rows={4}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    This reason will be logged for audit purposes
                                </p>
                            </div>
                        </div>
                        <DialogFooter className="flex gap-2">
                            <Button variant="outline" onClick={() => setSelectedOrder(null)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleOverride}
                                disabled={!overrideReason.trim() || overrideMutation.isPending}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                <DollarSign className="h-4 w-4 mr-2" />
                                {overrideMutation.isPending ? 'Processing...' : 'Approve & Platform Pays'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}