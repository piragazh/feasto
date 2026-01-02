import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
    DollarSign, TrendingUp, Percent, ShoppingBag, 
    Calendar, Download, Filter 
} from 'lucide-react';

export default function EnhancedAnalytics() {
    const [dateRange, setDateRange] = useState({
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [selectedRestaurant, setSelectedRestaurant] = useState('all');

    const { data: restaurants = [] } = useQuery({
        queryKey: ['restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const { data: orders = [] } = useQuery({
        queryKey: ['orders'],
        queryFn: () => base44.entities.Order.list('-created_date', 1000),
    });

    // Filter orders by date range
    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            const orderDate = new Date(order.created_date);
            const start = new Date(dateRange.start);
            const end = new Date(dateRange.end);
            end.setHours(23, 59, 59, 999);
            
            const dateMatch = orderDate >= start && orderDate <= end;
            const restaurantMatch = selectedRestaurant === 'all' || order.restaurant_id === selectedRestaurant;
            const isDelivered = order.status === 'delivered';
            
            return dateMatch && restaurantMatch && isDelivered;
        });
    }, [orders, dateRange, selectedRestaurant]);

    // Calculate metrics
    const metrics = useMemo(() => {
        const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const totalOrders = filteredOrders.length;
        
        let totalCommission = 0;
        let totalRestaurantEarnings = 0;
        
        const restaurantBreakdown = restaurants.map(restaurant => {
            const restaurantOrders = filteredOrders.filter(o => o.restaurant_id === restaurant.id);
            const revenue = restaurantOrders.reduce((sum, o) => sum + (o.total || 0), 0);
            
            const commissionRate = restaurant.commission_rate || 15;
            const commissionType = restaurant.commission_type || 'percentage';
            
            let commission = 0;
            if (commissionType === 'percentage') {
                commission = revenue * (commissionRate / 100);
            } else {
                commission = restaurantOrders.length * (restaurant.fixed_commission_amount || 0);
            }
            
            const earnings = revenue - commission;
            
            totalCommission += commission;
            totalRestaurantEarnings += earnings;
            
            return {
                id: restaurant.id,
                name: restaurant.name,
                orders: restaurantOrders.length,
                revenue,
                commission,
                earnings,
                commissionRate: commissionType === 'percentage' ? `${commissionRate}%` : `£${restaurant.fixed_commission_amount || 0}`
            };
        }).filter(r => r.orders > 0).sort((a, b) => b.revenue - a.revenue);

        // Time series data
        const dailyData = {};
        filteredOrders.forEach(order => {
            const date = new Date(order.created_date).toISOString().split('T')[0];
            if (!dailyData[date]) {
                dailyData[date] = { date, revenue: 0, orders: 0, commission: 0 };
            }
            dailyData[date].revenue += order.total || 0;
            dailyData[date].orders += 1;
            
            const restaurant = restaurants.find(r => r.id === order.restaurant_id);
            if (restaurant) {
                const commissionRate = restaurant.commission_rate || 15;
                const commissionType = restaurant.commission_type || 'percentage';
                if (commissionType === 'percentage') {
                    dailyData[date].commission += (order.total || 0) * (commissionRate / 100);
                } else {
                    dailyData[date].commission += restaurant.fixed_commission_amount || 0;
                }
            }
        });

        const timeSeriesData = Object.values(dailyData).sort((a, b) => 
            new Date(a.date) - new Date(b.date)
        );

        return {
            totalRevenue,
            totalOrders,
            avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
            totalCommission,
            totalRestaurantEarnings,
            commissionPercentage: totalRevenue > 0 ? (totalCommission / totalRevenue) * 100 : 0,
            restaurantBreakdown,
            timeSeriesData
        };
    }, [filteredOrders, restaurants]);

    const topRestaurants = metrics.restaurantBreakdown.slice(0, 5);
    const pieData = topRestaurants.map(r => ({
        name: r.name,
        value: r.revenue
    }));

    const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'];

    return (
        <div className="space-y-6">
            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Filters
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <Label>Start Date</Label>
                            <Input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>End Date</Label>
                            <Input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Restaurant</Label>
                            <select
                                value={selectedRestaurant}
                                onChange={(e) => setSelectedRestaurant(e.target.value)}
                                className="w-full h-10 px-3 border rounded-md"
                            >
                                <option value="all">All Restaurants</option>
                                {restaurants.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Total Revenue</span>
                            <DollarSign className="h-5 w-5 text-green-500" />
                        </div>
                        <p className="text-3xl font-bold">£{metrics.totalRevenue.toFixed(2)}</p>
                        <p className="text-xs text-gray-500 mt-1">{metrics.totalOrders} orders</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Platform Commission</span>
                            <Percent className="h-5 w-5 text-blue-500" />
                        </div>
                        <p className="text-3xl font-bold">£{metrics.totalCommission.toFixed(2)}</p>
                        <p className="text-xs text-gray-500 mt-1">
                            {metrics.commissionPercentage.toFixed(1)}% of revenue
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Restaurant Earnings</span>
                            <TrendingUp className="h-5 w-5 text-purple-500" />
                        </div>
                        <p className="text-3xl font-bold">£{metrics.totalRestaurantEarnings.toFixed(2)}</p>
                        <p className="text-xs text-gray-500 mt-1">
                            {((metrics.totalRestaurantEarnings / metrics.totalRevenue) * 100).toFixed(1)}% of revenue
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Avg Order Value</span>
                            <ShoppingBag className="h-5 w-5 text-orange-500" />
                        </div>
                        <p className="text-3xl font-bold">£{metrics.avgOrderValue.toFixed(2)}</p>
                        <p className="text-xs text-gray-500 mt-1">Per completed order</p>
                    </CardContent>
                </Card>
            </div>

            {/* Time Series Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Revenue & Commission Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={metrics.timeSeriesData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="revenue" stroke="#f97316" name="Revenue (£)" />
                            <Line type="monotone" dataKey="commission" stroke="#3b82f6" name="Commission (£)" />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Charts Row */}
            <div className="grid md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Top 5 Restaurants by Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name.substring(0, 15)}: ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Commission by Restaurant</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={topRestaurants}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="commission" fill="#3b82f6" name="Commission (£)" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Restaurant Performance Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Restaurant Financial Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-3 px-4 font-semibold">Restaurant</th>
                                    <th className="text-right py-3 px-4 font-semibold">Orders</th>
                                    <th className="text-right py-3 px-4 font-semibold">Total Revenue</th>
                                    <th className="text-right py-3 px-4 font-semibold">Commission Rate</th>
                                    <th className="text-right py-3 px-4 font-semibold">Platform Commission</th>
                                    <th className="text-right py-3 px-4 font-semibold">Restaurant Earnings</th>
                                    <th className="text-right py-3 px-4 font-semibold">Avg Order</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metrics.restaurantBreakdown.map((restaurant) => (
                                    <tr key={restaurant.id} className="border-b hover:bg-gray-50">
                                        <td className="py-3 px-4 font-medium">{restaurant.name}</td>
                                        <td className="text-right py-3 px-4">{restaurant.orders}</td>
                                        <td className="text-right py-3 px-4 font-semibold">
                                            £{restaurant.revenue.toFixed(2)}
                                        </td>
                                        <td className="text-right py-3 px-4">
                                            <Badge variant="outline">{restaurant.commissionRate}</Badge>
                                        </td>
                                        <td className="text-right py-3 px-4 text-blue-600 font-semibold">
                                            £{restaurant.commission.toFixed(2)}
                                        </td>
                                        <td className="text-right py-3 px-4 text-green-600 font-semibold">
                                            £{restaurant.earnings.toFixed(2)}
                                        </td>
                                        <td className="text-right py-3 px-4">
                                            £{(restaurant.revenue / restaurant.orders).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 font-bold bg-gray-50">
                                    <td className="py-3 px-4">TOTAL</td>
                                    <td className="text-right py-3 px-4">{metrics.totalOrders}</td>
                                    <td className="text-right py-3 px-4">£{metrics.totalRevenue.toFixed(2)}</td>
                                    <td className="text-right py-3 px-4">-</td>
                                    <td className="text-right py-3 px-4 text-blue-600">
                                        £{metrics.totalCommission.toFixed(2)}
                                    </td>
                                    <td className="text-right py-3 px-4 text-green-600">
                                        £{metrics.totalRestaurantEarnings.toFixed(2)}
                                    </td>
                                    <td className="text-right py-3 px-4">
                                        £{metrics.avgOrderValue.toFixed(2)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}