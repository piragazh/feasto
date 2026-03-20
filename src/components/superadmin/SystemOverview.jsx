import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
    Users, 
    Store, 
    ShoppingBag, 
    DollarSign, 
    TrendingUp,
    AlertCircle,
    CheckCircle
} from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

export default function SystemOverview() {
    const { data: restaurants = [], isLoading: loadingRestaurants } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const { data: orders = [], isLoading: loadingOrders } = useQuery({
        queryKey: ['all-orders'],
        queryFn: () => base44.entities.Order.list('-created_date', 1000),
    });

    const { data: users = [], isLoading: loadingUsers } = useQuery({
        queryKey: ['all-users'],
        queryFn: () => base44.entities.User.list(),
    });

    const { data: drivers = [] } = useQuery({
        queryKey: ['all-drivers'],
        queryFn: () => base44.entities.Driver.list(),
    });

    // Calculate metrics
    const totalRevenue = orders
        .filter(o => o.status === 'delivered')
        .reduce((sum, o) => sum + (o.total || 0), 0);

    const todayOrders = orders.filter(o => {
        const orderDate = new Date(o.created_date);
        const today = new Date();
        return orderDate.toDateString() === today.toDateString();
    });

    const activeOrders = orders.filter(o => 
        ['pending', 'confirmed', 'preparing', 'out_for_delivery'].includes(o.status)
    );

    const activeDrivers = drivers.filter(d => d.is_available);

    const stats = [
        {
            title: 'Total Restaurants',
            value: restaurants.length,
            icon: Store,
            color: 'text-blue-600',
            bg: 'bg-blue-100',
        },
        {
            title: 'Total Users',
            value: users.length,
            icon: Users,
            color: 'text-green-600',
            bg: 'bg-green-100',
        },
        {
            title: 'Active Orders',
            value: activeOrders.length,
            icon: ShoppingBag,
            color: 'text-orange-600',
            bg: 'bg-orange-100',
        },
        {
            title: 'Total Revenue',
            value: `£${totalRevenue.toFixed(2)}`,
            icon: DollarSign,
            color: 'text-purple-600',
            bg: 'bg-purple-100',
        },
        {
            title: 'Orders Today',
            value: todayOrders.length,
            icon: TrendingUp,
            color: 'text-pink-600',
            bg: 'bg-pink-100',
        },
        {
            title: 'Active Drivers',
            value: activeDrivers.length,
            icon: CheckCircle,
            color: 'text-teal-600',
            bg: 'bg-teal-100',
        },
    ];

    if (loadingRestaurants || loadingOrders || loadingUsers) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton key={i} className="h-32" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {stats.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={index}>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600 mb-1">{stat.title}</p>
                                        <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                                    </div>
                                    <div className={`${stat.bg} ${stat.color} p-3 rounded-lg`}>
                                        <Icon className="h-6 w-6" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Recent Activity */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Orders</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {orders.slice(0, 10).map(order => (
                            <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                <div>
                                    <p className="font-medium text-gray-900">Order #{order.id.slice(-6)}</p>
                                    <p className="text-sm text-gray-500">{order.restaurant_name}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-semibold text-gray-900">£{order.total?.toFixed(2)}</p>
                                    <p className="text-xs text-gray-500">{order.status}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Issues/Alerts */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-orange-500" />
                        System Alerts
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {activeOrders.length > 50 && (
                            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                                <p className="text-sm text-orange-900 font-semibold">High Order Volume</p>
                                <p className="text-xs text-orange-700">Currently {activeOrders.length} active orders</p>
                            </div>
                        )}
                        {restaurants.filter(r => !r.is_open).length > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-sm text-blue-900 font-semibold">Closed Restaurants</p>
                                <p className="text-xs text-blue-700">
                                    {restaurants.filter(r => !r.is_open).length} restaurants currently closed
                                </p>
                            </div>
                        )}
                        {activeOrders.length === 0 && (
                            <div className="text-center text-gray-500 py-4">
                                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                                <p className="text-sm">All systems running smoothly</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}