import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Package, TrendingUp, Star } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';

export default function DriverStats({ driverId }) {
    const { data: completedOrders = [], isLoading } = useQuery({
        queryKey: ['driver-completed-orders', driverId],
        queryFn: () => base44.entities.Order.filter({
            driver_id: driverId,
            status: 'delivered'
        }, '-created_date'),
        enabled: !!driverId,
    });

    const { data: ratings = [] } = useQuery({
        queryKey: ['driver-ratings', driverId],
        queryFn: () => base44.entities.DriverRating.filter({ driver_id: driverId }),
        enabled: !!driverId,
    });

    // Today's stats
    const today = new Date();
    const todayOrders = completedOrders.filter(o => {
        const orderDate = new Date(o.created_date);
        return orderDate >= startOfDay(today) && orderDate <= endOfDay(today);
    });

    const todayEarnings = todayOrders.reduce((sum, o) => sum + (o.delivery_fee || 5), 0);
    const totalEarnings = completedOrders.reduce((sum, o) => sum + (o.delivery_fee || 5), 0);
    const avgRating = ratings.length > 0 
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length 
        : 5.0;

    if (isLoading) {
        return <div className="text-center py-8">Loading stats...</div>;
    }

    return (
        <div className="space-y-4">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Today</p>
                                <p className="text-2xl font-bold text-green-600">
                                    ${todayEarnings.toFixed(2)}
                                </p>
                            </div>
                            <DollarSign className="h-8 w-8 text-green-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Deliveries</p>
                                <p className="text-2xl font-bold">{todayOrders.length}</p>
                            </div>
                            <Package className="h-8 w-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Earned</p>
                                <p className="text-2xl font-bold">${totalEarnings.toFixed(2)}</p>
                            </div>
                            <TrendingUp className="h-8 w-8 text-purple-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Rating</p>
                                <p className="text-2xl font-bold flex items-center gap-1">
                                    {avgRating.toFixed(1)}
                                    <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                                </p>
                            </div>
                            <Star className="h-8 w-8 text-yellow-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Deliveries */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Deliveries</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {completedOrders.slice(0, 5).map((order) => (
                            <div key={order.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                                <div>
                                    <p className="font-semibold">{order.restaurant_name}</p>
                                    <p className="text-sm text-gray-500">
                                        {format(new Date(order.created_date), 'MMM d, h:mm a')}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="font-semibold text-green-600">
                                        +${(order.delivery_fee || 5).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}