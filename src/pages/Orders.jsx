import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Clock, CheckCircle, Package, Bike, MapPin, RefreshCw, Star, Navigation, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import LeaveReviewDialog from '@/components/reviews/LeaveReviewDialog';
import OrderStatusTimeline from '@/components/restaurant/OrderStatusTimeline';

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
    const [reviewingOrder, setReviewingOrder] = useState(null);
    
    const { data: orders = [], isLoading, refetch } = useQuery({
        queryKey: ['orders'],
        queryFn: () => base44.entities.Order.list('-created_date'),
        refetchInterval: 5000, // Auto-refresh every 5 seconds for real-time updates
    });

    const { data: reviews = [] } = useQuery({
        queryKey: ['user-reviews'],
        queryFn: async () => {
            const user = await base44.auth.me();
            return base44.entities.Review.filter({ created_by: user.email });
        },
    });

    const reorderOrder = (order) => {
        // Save order items to cart
        localStorage.setItem('cart', JSON.stringify(order.items));
        localStorage.setItem('cartRestaurantId', order.restaurant_id);
        
        toast.success('Items added to cart!');
        navigate(createPageUrl('Restaurant') + '?id=' + order.restaurant_id);
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
                        {orders.map((order, index) => {
                            const status = statusConfig[order.status] || statusConfig.pending;
                            const StatusIcon = status.icon;
                            
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
                                                           {order.restaurant_name || 'Restaurant'}
                                                       </h3>
                                                       {order.is_scheduled && (
                                                           <Badge variant="outline" className="text-xs">
                                                               <Clock className="h-3 w-3 mr-1" />
                                                               Scheduled
                                                           </Badge>
                                                       )}
                                                   </div>
                                                   <p className="text-sm text-gray-500">
                                                       {order.created_date && format(new Date(order.created_date), 'MMM d, yyyy • h:mm a')}
                                                   </p>
                                                   {order.is_scheduled && order.scheduled_for && (
                                                       <p className="text-xs text-orange-600 mt-1">
                                                           Scheduled for: {format(new Date(order.scheduled_for), 'MMM d, yyyy • h:mm a')}
                                                       </p>
                                                   )}
                                               </div>
                                               <Badge className={`${status.color} flex items-center gap-1.5 px-3 py-1.5`}>
                                                   <StatusIcon className="h-4 w-4" />
                                                   {status.label}
                                               </Badge>
                                            </div>

                                            <div className="space-y-2 mb-4">
                                                {order.items?.map((item, i) => (
                                                    <div key={i} className="flex justify-between text-sm">
                                                        <span className="text-gray-600">
                                                            {item.quantity}x {item.name}
                                                        </span>
                                                        <span className="text-gray-900">
                                                            £{(item.price * item.quantity).toFixed(2)}
                                                        </span>
                                                    </div>
                                                ))}
                                                </div>

                                                <div className="border-t pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                <div className="flex items-start gap-2 text-sm text-gray-500">
                                                    <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                                                    <span className="line-clamp-1">{order.delivery_address}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    {order.estimated_delivery && order.status !== 'delivered' && order.status !== 'cancelled' && (
                                                        <span className="text-sm text-gray-500">
                                                            ETA: {order.estimated_delivery}
                                                        </span>
                                                    )}
                                                    <span className="font-bold text-lg">£{order.total?.toFixed(2)}</span>
                                                    </div>
                                                    </div>

                                                    {order.status === 'cancelled' && order.rejection_reason && (
                                                    <div className="border-t pt-4">
                                                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                                        <p className="text-sm font-semibold text-red-900 mb-1">Order Cancelled</p>
                                                        <p className="text-sm text-red-700">{order.rejection_reason}</p>
                                                    </div>
                                                    </div>
                                                    )}

                                                    <OrderStatusTimeline statusHistory={order.status_history} />

                                                    {order.status !== 'delivered' && order.status !== 'cancelled' && (
                                                        <div className="border-t pt-4">
                                                            <Link to={createPageUrl('TrackOrder') + '?id=' + order.id}>
                                                                <Button variant="outline" className="w-full">
                                                                    <Navigation className="h-4 w-4 mr-2" />
                                                                    Track Order
                                                                </Button>
                                                            </Link>
                                                        </div>
                                                    )}

                                                    {(order.status === 'delivered' || order.status === 'cancelled') && (
                                                        <div className="border-t pt-4 flex gap-2">
                                                            <Button
                                                                onClick={() => reorderOrder(order)}
                                                                variant="outline"
                                                                className="flex-1"
                                                            >
                                                                <RotateCcw className="h-4 w-4 mr-2" />
                                                                Reorder
                                                            </Button>
                                                            {order.status === 'delivered' && !reviews.find(r => r.order_id === order.id) && (
                                                                <Button
                                                                    onClick={() => setReviewingOrder(order)}
                                                                    variant="outline"
                                                                    className="flex-1"
                                                                >
                                                                    <Star className="h-4 w-4 mr-2" />
                                                                    Review
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
        </div>
    );
}