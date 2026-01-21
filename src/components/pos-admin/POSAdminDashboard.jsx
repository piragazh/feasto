import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ShoppingCart, Clock, CheckCircle } from 'lucide-react';

export default function POSAdminDashboard({ restaurantId }) {
    const today = new Date().toISOString().split('T')[0];

    const { data: todayOrders = [] } = useQuery({
        queryKey: ['today-orders', restaurantId],
        queryFn: async () => {
            const orders = await base44.entities.Order.filter({ restaurant_id: restaurantId });
            return orders.filter(o => o.created_date?.split('T')[0] === today);
        },
    });

    const totalSales = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const openOrders = todayOrders.filter(o => !['delivered', 'collected', 'cancelled', 'refunded'].includes(o.status)).length;
    const createdCount = todayOrders.filter(o => o.status === 'pending').length;
    const inKitchenCount = todayOrders.filter(o => ['confirmed', 'preparing'].includes(o.status)).length;
    const readyCount = todayOrders.filter(o => ['ready_for_collection', 'out_for_delivery'].includes(o.status)).length;
    const paidCount = todayOrders.filter(o => ['delivered', 'collected'].includes(o.status)).length;

    const stats = [
        { label: 'Total Sales', value: `£${totalSales.toFixed(2)}`, icon: DollarSign, color: 'text-green-600' },
        { label: 'Orders Today', value: todayOrders.length.toString(), icon: ShoppingCart, color: 'text-blue-600' },
        { label: 'Open Orders', value: openOrders.toString(), icon: Clock, color: 'text-orange-600' },
        { label: 'Completed', value: paidCount.toString(), icon: CheckCircle, color: 'text-emerald-600' },
    ];

    return (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {stats.map((stat, idx) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={idx}>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600">{stat.label}</p>
                                        <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                                    </div>
                                    <Icon className={`h-8 w-8 ${stat.color} opacity-20`} />
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Status Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle>Order Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-gray-900">{createdCount}</p>
                            <p className="text-xs text-gray-600 mt-1">Created</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-gray-900">{inKitchenCount}</p>
                            <p className="text-xs text-gray-600 mt-1">In Kitchen</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-gray-900">{readyCount}</p>
                            <p className="text-xs text-gray-600 mt-1">Ready</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-gray-900">{paidCount}</p>
                            <p className="text-xs text-gray-600 mt-1">Paid</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-gray-900">{todayOrders.filter(o => o.status === 'cancelled').length}</p>
                            <p className="text-xs text-gray-600 mt-1">Cancelled</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Recent Orders */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Orders (Today)</CardTitle>
                </CardHeader>
                <CardContent>
                    {todayOrders.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">No orders today</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b">
                                    <tr>
                                        <th className="text-left py-2 px-3 font-semibold">Order ID</th>
                                        <th className="text-left py-2 px-3 font-semibold">Items</th>
                                        <th className="text-left py-2 px-3 font-semibold">Amount</th>
                                        <th className="text-left py-2 px-3 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {todayOrders.slice(0, 10).map(order => (
                                        <tr key={order.id} className="border-b hover:bg-gray-50">
                                            <td className="py-2 px-3 font-mono text-xs">{order.id.slice(0, 8)}</td>
                                            <td className="py-2 px-3">{order.items?.length || 0} items</td>
                                            <td className="py-2 px-3 font-medium">£{(order.total || 0).toFixed(2)}</td>
                                            <td className="py-2 px-3">
                                                <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${
                                                    order.status === 'delivered' || order.status === 'collected' ? 'bg-green-100 text-green-800' :
                                                    order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                                    order.status === 'preparing' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {order.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}