import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Clock, CheckCircle, Package, Bike, MapPin, RefreshCw, Star, Navigation, RotateCcw, AlertCircle, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import LeaveReviewDialog from '@/components/reviews/LeaveReviewDialog';
import OrderStatusTimeline from '@/components/restaurant/OrderStatusTimeline';
import RequestRefundDialog from '@/components/customer/RequestRefundDialog';
import CustomerMessaging from '@/components/customer/CustomerMessaging';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusConfig = {
    pending: { label: 'Order Placed', icon: Clock, color: 'bg-yellow-100 text-yellow-700' },
    confirmed: { label: 'Confirmed', icon: CheckCircle, color: 'bg-blue-100 text-blue-700' },
    preparing: { label: 'Preparing', icon: Package, color: 'bg-purple-100 text-purple-700' },
    out_for_delivery: { label: 'On the Way', icon: Bike, color: 'bg-orange-100 text-orange-700' },
    delivered: { label: 'Delivered', icon: CheckCircle, color: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Cancelled', icon: Clock, color: 'bg-red-100 text-red-700' },
};

export default function Orders() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [reviewingOrder, setReviewingOrder] = useState(null);
    const [refundingOrder, setRefundingOrder] = useState(null);
    const [messagingOrder, setMessagingOrder] = useState(null);
    
    const { data: orders = [], isLoading, refetch, error } = useQuery({
        queryKey: ['orders'],
        queryFn: async () => {
            try {
                const user = await base44.auth.me();
                const result = await base44.entities.Order.filter({ created_by: user.email }, '-created_date');
                return (result || []).filter(order => order && order.id && order.restaurant_name);
            } catch (e) {
                console.error('Error fetching orders:', e);
                return [];
            }
        },
        refetchInterval: 5000,
    });

    const { data: reviews = [] } = useQuery({
        queryKey: ['user-reviews'],
        queryFn: async () => {
            const user = await base44.auth.me();
            return base44.entities.Review.filter({ created_by: user.email });
        },
    });

    const refundRequestMutation = useMutation({
        mutationFn: ({ orderId, refundType, refundedItems, refundAmount, reason, issueDescription }) =>
            base44.entities.Order.update(orderId, {
                status: 'refund_requested',
                refund_request_type: refundType,
                refund_requested_items: refundedItems,
                refund_requested_amount: refundAmount,
                refund_request_reason: reason,
                refund_request_description: issueDescription,
                refund_request_date: new Date().toISOString()
            }),
        onSuccess: () => {
            queryClient.invalidateQueries(['orders']);
            toast.success('Refund request submitted! The restaurant will review it shortly.');
            setRefundingOrder(null);
        },
    });

    const reorderOrder = (order) => {
        if (!order || !order.items || !order.restaurant_id) {
            toast.error('Unable to reorder this order');
            return;
        }
        // Save order items to cart
        localStorage.setItem('cart', JSON.stringify(order.items));
        localStorage.setItem('cartRestaurantId', order.restaurant_id);
        
        toast.success('Items added to cart!');
        navigate(createPageUrl('Restaurant') + '?id=' + order.restaurant_id);
    };

    const handleRefundRequest = (refundData) => {
        refundRequestMutation.mutate(refundData);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link to={createPageUrl('Home')}>
                            <Button size="icon" variant="ghost" className="rounded-full">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <h1 className="text-xl font-bold text-gray-900">Your Orders</h1>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="rounded-full">
                        <RefreshCw className="h-5 w-5" />
                    </Button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-8">
                {isLoading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
                        ))}
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Package className="h-12 w-12 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">No orders yet</h3>
                        <p className="text-gray-500 mb-6">Start ordering from your favorite restaurants!</p>
                        <Link to={createPageUrl('Home')}>
                            <Button className="bg-orange-500 hover:bg-orange-600">Browse Restaurants</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {orders.filter(order => order && order.id && order.restaurant_name).map((order, index) => {
                            const status = statusConfig[order?.status] || statusConfig.pending;
                            const StatusIcon = status?.icon || Clock;
                            
                            return (
                                <motion.div
                                    key={order.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <Card className="overflow-hidden">
                                        <CardContent className="p-6">
                                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                                               <div>
                                                   <div className="flex items-center gap-2 mb-1">
                                                       <h3 className="font-semibold text-lg text-gray-900">
                                                           {order?.restaurant_name || 'Restaurant'}
                                                       </h3>
                                                       {order?.is_scheduled && (
                                                           <Badge variant="outline" className="text-xs">
                                                               <Clock className="h-3 w-3 mr-1" />
                                                               Scheduled
                                                           </Badge>
                                                       )}
                                                   </div>
                                                   <p className="text-sm text-gray-500">
                                                       {order?.created_date ? format(new Date(order.created_date), 'MMM d, yyyy • h:mm a') : 'N/A'}
                                                   </p>
                                                   {order?.is_scheduled && order?.scheduled_for && (
                                                       <p className="text-xs text-orange-600 mt-1">
                                                           Scheduled for: {format(new Date(order.scheduled_for), 'MMM d, yyyy • h:mm a')}
                                                       </p>
                                                   )}
                                               </div>
                                               <Badge className={`${status?.color || 'bg-gray-100 text-gray-700'} flex items-center gap-1.5 px-3 py-1.5`}>
                                                   <StatusIcon className="h-4 w-4" />
                                                   {status?.label || 'Unknown'}
                                               </Badge>
                                            </div>

                                            <div className="space-y-2 mb-4">
                                               {(order.items || []).map((item, i) => (
                                                   <div key={i} className="flex justify-between text-sm">
                                                       <span className="text-gray-600">
                                                           {item?.quantity || 0}x {item?.name || 'Item'}
                                                       </span>
                                                       <span className="text-gray-900">
                                                           £{((item?.price || 0) * (item?.quantity || 0)).toFixed(2)}
                                                       </span>
                                                   </div>
                                               ))}
                                               </div>

                                                <div className="border-t pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                <div className="flex items-start gap-2 text-sm text-gray-500">
                                                    <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                                                    <span className="line-clamp-1">{order.delivery_address || 'N/A'}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    {order?.estimated_delivery && order?.status !== 'delivered' && order?.status !== 'cancelled' && (
                                                       <span className="text-sm text-gray-500">
                                                           ETA: {order.estimated_delivery}
                                                       </span>
                                                    )}
                                                    <span className="font-bold text-lg">£{(order?.total || 0).toFixed(2)}</span>
                                                    </div>
                                                    </div>

                                                    {order?.status === 'cancelled' && order?.rejection_reason && (
                                                    <div className="border-t pt-4">
                                                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                                        <p className="text-sm font-semibold text-red-900 mb-1">Order Cancelled</p>
                                                        <p className="text-sm text-red-700">{order.rejection_reason}</p>
                                                    </div>
                                                    </div>
                                                    )}

                                                    {order?.status_history && <OrderStatusTimeline statusHistory={order.status_history} />}

                                                    {order?.status !== 'delivered' && order?.status !== 'cancelled' && (
                                                        <div className="border-t pt-4 space-y-2">
                                                            <Link to={createPageUrl('TrackOrder') + '?id=' + (order?.id || '')}>
                                                                <Button variant="outline" className="w-full">
                                                                    <Navigation className="h-4 w-4 mr-2" />
                                                                    Track Order
                                                                </Button>
                                                            </Link>
                                                            <Button 
                                                                variant="outline" 
                                                                className="w-full"
                                                                onClick={() => setMessagingOrder(order)}
                                                            >
                                                                <MessageSquare className="h-4 w-4 mr-2" />
                                                                Message Restaurant
                                                            </Button>
                                                        </div>
                                                    )}

                                                    {order?.status === 'refund_requested' && (
                                                        <div className="border-t pt-4">
                                                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                                                <div className="flex gap-2">
                                                                    <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0" />
                                                                    <div>
                                                                        <p className="text-sm font-semibold text-yellow-900">Refund Requested</p>
                                                                        <p className="text-xs text-yellow-700 mt-1">
                                                                            Your refund request is being reviewed by the restaurant.
                                                                            Amount: £{order.refund_requested_amount?.toFixed(2) || '0.00'}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {order?.status === 'refunded' && (
                                                        <div className="border-t pt-4">
                                                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                                                <p className="text-sm font-semibold text-green-900">Refund Processed</p>
                                                                <p className="text-xs text-green-700 mt-1">
                                                                    Amount refunded: £{order?.refund_amount?.toFixed(2) || '0.00'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {(order?.status === 'delivered' || order?.status === 'cancelled') && (
                                                        <div className="border-t pt-4 flex gap-2 flex-wrap">
                                                            <Button
                                                                onClick={() => reorderOrder(order)}
                                                                variant="outline"
                                                                className="flex-1"
                                                            >
                                                                <RotateCcw className="h-4 w-4 mr-2" />
                                                                Reorder
                                                            </Button>
                                                            {order?.status === 'delivered' && !reviews.find(r => r.order_id === order?.id) && (
                                                                <Button
                                                                    onClick={() => setReviewingOrder(order)}
                                                                    variant="outline"
                                                                    className="flex-1"
                                                                >
                                                                    <Star className="h-4 w-4 mr-2" />
                                                                    Review
                                                                </Button>
                                                            )}
                                                            {order?.status === 'delivered' && order?.status !== 'refund_requested' && order?.status !== 'refunded' && (
                                                                <Button
                                                                    onClick={() => setRefundingOrder(order)}
                                                                    variant="outline"
                                                                    className="flex-1 text-orange-600"
                                                                >
                                                                    <AlertCircle className="h-4 w-4 mr-2" />
                                                                    Request Refund
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>

            <LeaveReviewDialog
                open={!!reviewingOrder}
                onClose={() => setReviewingOrder(null)}
                order={reviewingOrder}
            />

            <RequestRefundDialog
                open={!!refundingOrder}
                onClose={() => setRefundingOrder(null)}
                order={refundingOrder}
                onSubmit={handleRefundRequest}
            />

            <Dialog open={!!messagingOrder} onOpenChange={() => setMessagingOrder(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Chat with {messagingOrder?.restaurant_name || 'Restaurant'}</DialogTitle>
                    </DialogHeader>
                    {messagingOrder && (
                        <CustomerMessaging 
                            orderId={messagingOrder.id} 
                            restaurantId={messagingOrder.restaurant_id} 
                        />
                    )}
                </DialogContent>
            </Dialog>
            </div>
            );
            }