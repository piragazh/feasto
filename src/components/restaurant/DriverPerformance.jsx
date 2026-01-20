import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, TrendingUp, Clock, Package, Award } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';

export default function DriverPerformance({ restaurantId }) {
    const { data: drivers = [], isLoading: driversLoading } = useQuery({
        queryKey: ['drivers-performance', restaurantId],
        queryFn: () => base44.entities.Driver.list(),
    });

    const { data: completedOrders = [], isLoading: ordersLoading } = useQuery({
        queryKey: ['completed-deliveries', restaurantId],
        queryFn: () => base44.entities.Order.filter({
            restaurant_id: restaurantId,
            status: 'delivered'
        }, '-updated_date', 100),
    });

    const { data: ratings = [], isLoading: ratingsLoading } = useQuery({
        queryKey: ['driver-ratings', restaurantId],
        queryFn: () => base44.entities.DriverRating.list(),
    });

    const calculateDriverMetrics = (driverId) => {
        const driverOrders = completedOrders.filter(o => o.driver_id === driverId);
        const driverRatings = ratings.filter(r => r.driver_id === driverId);

        // Calculate average delivery time
        const deliveryTimes = driverOrders
            .filter(o => o.created_date && o.actual_delivery_time)
            .map(o => {
                const created = new Date(o.created_date);
                const delivered = new Date(o.actual_delivery_time);
                return differenceInMinutes(delivered, created);
            });

        const avgDeliveryTime = deliveryTimes.length > 0
            ? Math.round(deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length)
            : 0;

        // Calculate average rating
        const avgRating = driverRatings.length > 0
            ? (driverRatings.reduce((a, b) => a + b.rating, 0) / driverRatings.length).toFixed(1)
            : '5.0';

        // Today's deliveries
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayDeliveries = driverOrders.filter(o => {
            const orderDate = new Date(o.actual_delivery_time || o.updated_date);
            return orderDate >= today;
        }).length;

        return {
            totalDeliveries: driverOrders.length,
            avgDeliveryTime,
            avgRating,
            todayDeliveries,
            totalRatings: driverRatings.length,
        };
    };

    const getPerformanceBadge = (avgRating, totalDeliveries) => {
        const rating = parseFloat(avgRating);
        if (rating >= 4.8 && totalDeliveries >= 50) {
            return { label: 'Elite', color: 'bg-purple-500' };
        } else if (rating >= 4.5 && totalDeliveries >= 20) {
            return { label: 'Pro', color: 'bg-blue-500' };
        } else if (rating >= 4.0) {
            return { label: 'Good', color: 'bg-green-500' };
        }
        return { label: 'New', color: 'bg-gray-400' };
    };

    if (driversLoading || ordersLoading || ratingsLoading) {
        return <div className="text-center py-8">Loading performance data...</div>;
    }

    if (drivers.length === 0) {
        return (
            <Card>
                <CardContent className="text-center py-16">
                    <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-600 mb-2">No Driver Data</h3>
                    <p className="text-gray-500">Add drivers to track their performance</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div>
            <div className="mb-6">
                <h2 className="text-2xl font-bold">Driver Performance</h2>
                <p className="text-sm text-gray-500 mt-1">Track delivery times, ratings, and metrics</p>
            </div>

            <div className="grid gap-4">
                {drivers.map((driver) => {
                    const metrics = calculateDriverMetrics(driver.id);
                    const performanceBadge = getPerformanceBadge(metrics.avgRating, metrics.totalDeliveries);

                    return (
                        <Card key={driver.id}>
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="flex items-center gap-2">
                                            {driver.full_name}
                                            <Badge className={performanceBadge.color}>
                                                <Award className="h-3 w-3 mr-1" />
                                                {performanceBadge.label}
                                            </Badge>
                                        </CardTitle>
                                        <p className="text-sm text-gray-500 mt-1 capitalize">
                                            {driver.vehicle_type} • {driver.is_available ? 'Available' : 'Busy'}
                                        </p>
                                    </div>
                                    <Badge variant={driver.is_available ? 'default' : 'secondary'} className={driver.is_available ? 'bg-green-500' : 'bg-gray-400'}>
                                        {driver.is_available ? 'Online' : 'Offline'}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1 text-sm text-gray-500">
                                            <Star className="h-4 w-4 text-yellow-500" />
                                            Avg Rating
                                        </div>
                                        <div className="text-2xl font-bold">{metrics.avgRating}</div>
                                        <div className="text-xs text-gray-500">{metrics.totalRatings} reviews</div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1 text-sm text-gray-500">
                                            <Package className="h-4 w-4" />
                                            Total Deliveries
                                        </div>
                                        <div className="text-2xl font-bold">{metrics.totalDeliveries}</div>
                                        <div className="text-xs text-gray-500">All time</div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1 text-sm text-gray-500">
                                            <Clock className="h-4 w-4" />
                                            Avg Time
                                        </div>
                                        <div className="text-2xl font-bold">{metrics.avgDeliveryTime || '-'}</div>
                                        <div className="text-xs text-gray-500">minutes</div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1 text-sm text-gray-500">
                                            <TrendingUp className="h-4 w-4" />
                                            Today
                                        </div>
                                        <div className="text-2xl font-bold">{metrics.todayDeliveries}</div>
                                        <div className="text-xs text-gray-500">deliveries</div>
                                    </div>
                                </div>

                                {driver.current_order_id && (
                                    <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                        <div className="flex items-center gap-2 text-sm text-orange-700">
                                            <Clock className="h-4 w-4" />
                                            <span className="font-medium">Currently delivering order</span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}