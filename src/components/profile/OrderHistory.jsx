import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Clock, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import moment from 'moment';

export default function OrderHistory({ userEmail }) {
    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['user-orders', userEmail],
        queryFn: () => base44.entities.Order.filter({ created_by: userEmail }, '-created_date', 50),
    });

    const statusConfig = {
        pending: { icon: Clock, color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
        confirmed: { icon: CheckCircle, color: 'bg-blue-100 text-blue-800', label: 'Confirmed' },
        preparing: { icon: Package, color: 'bg-purple-100 text-purple-800', label: 'Preparing' },
        out_for_delivery: { icon: Package, color: 'bg-orange-100 text-orange-800', label: 'Out for Delivery' },
        delivered: { icon: CheckCircle, color: 'bg-green-100 text-green-800', label: 'Delivered' },
        cancelled: { icon: XCircle, color: 'bg-red-100 text-red-800', label: 'Cancelled' },
    };

    if (isLoading) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                </CardContent>
            </Card>
        );
    }

    if (orders.length === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">No Orders Yet</h3>
                    <p className="text-gray-500 mb-6">Start ordering from your favorite restaurants!</p>
                    <Link to={createPageUrl('Home')}>
                        <Button className="bg-orange-500 hover:bg-orange-600">Browse Restaurants</Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {orders.map((order) => {
                const config = statusConfig[order.status] || statusConfig.pending;
                const StatusIcon = config.icon;

                return (
                    <Card key={order.id} className="hover:shadow-lg transition-shadow">
                        <CardContent className="p-6">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-3">
                                        <h3 className="text-lg font-semibold">{order.restaurant_name}</h3>
                                        <Badge className={config.color}>
                                            <StatusIcon className="h-3 w-3 mr-1" />
                                            {config.label}
                                        </Badge>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                                        <div>
                                            <p className="text-gray-500">Order Date</p>
                                            <p className="font-medium">{moment(order.created_date).format('MMM D, YYYY h:mm A')}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Total</p>
                                            <p className="font-medium text-lg text-orange-600">£{order.total.toFixed(2)}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        {order.items.slice(0, 3).map((item, idx) => (
                                            <p key={idx} className="text-sm text-gray-600">
                                                {item.quantity}x {item.name}
                                            </p>
                                        ))}
                                        {order.items.length > 3 && (
                                            <p className="text-sm text-gray-500">+{order.items.length - 3} more items</p>
                                        )}
                                    </div>
                                </div>

                                <Link to={createPageUrl('TrackOrder') + `?orderId=${order.id}`}>
                                    <Button variant="outline" size="sm">
                                        View Details
                                        <ChevronRight className="h-4 w-4 ml-1" />
                                    </Button>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}