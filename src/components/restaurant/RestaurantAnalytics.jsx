import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { DollarSign, ShoppingBag, TrendingUp, Users, Download, Calendar } from 'lucide-react';
import { format, subDays, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';

const COLORS = ['#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b'];

export default function RestaurantAnalytics({ restaurantId }) {
    const [dateRange, setDateRange] = useState({
        start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
        end: format(new Date(), 'yyyy-MM-dd')
    });

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['analytics-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 1000),
    });

    const { data: reviews = [] } = useQuery({
        queryKey: ['analytics-reviews', restaurantId],
        queryFn: () => base44.entities.Review.filter({ restaurant_id: restaurantId }),
    });

    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            if (!order.created_date) return false;
            const orderDate = parseISO(order.created_date);
            return isWithinInterval(orderDate, {
                start: startOfDay(parseISO(dateRange.start)),
                end: endOfDay(parseISO(dateRange.end))
            });
        });
    }, [orders, dateRange]);

    const analytics = useMemo(() => {
        const totalOrders = filteredOrders.length;
        const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        
        // Customer retention
        const uniqueCustomers = new Set(filteredOrders.map(o => o.created_by)).size;
        const repeatCustomers = new Set();
        const customerOrderCounts = {};
        
        filteredOrders.forEach(order => {
            const customer = order.created_by;
            customerOrderCounts[customer] = (customerOrderCounts[customer] || 0) + 1;
            if (customerOrderCounts[customer] > 1) {
                repeatCustomers.add(customer);
            }
        });
        
        const retentionRate = uniqueCustomers > 0 ? (repeatCustomers.size / uniqueCustomers) * 100 : 0;

        // Revenue over time
        const revenueByDate = {};
        filteredOrders.forEach(order => {
            if (order.created_date) {
                const date = format(parseISO(order.created_date), 'MMM dd');
                revenueByDate[date] = (revenueByDate[date] || 0) + (order.total || 0);
            }
        });
        const revenueData = Object.entries(revenueByDate).map(([date, revenue]) => ({
            date,
            revenue: parseFloat(revenue.toFixed(2))
        })).slice(-14);

        // Popular items
        const itemCounts = {};
        filteredOrders.forEach(order => {
            order.items?.forEach(item => {
                itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
            });
        });
        const popularItems = Object.entries(itemCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Peak hours
        const ordersByHour = {};
        filteredOrders.forEach(order => {
            if (order.created_date) {
                const hour = format(parseISO(order.created_date), 'ha');
                ordersByHour[hour] = (ordersByHour[hour] || 0) + 1;
            }
        });
        const peakHoursData = Object.entries(ordersByHour)
            .map(([hour, count]) => ({ hour, orders: count }))
            .sort((a, b) => {
                const hourA = parseInt(a.hour);
                const hourB = parseInt(b.hour);
                return hourA - hourB;
            });

        // Order status distribution
        const statusCounts = {};
        filteredOrders.forEach(order => {
            statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
        });
        const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

        // Average rating
        const avgRating = reviews.length > 0 
            ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
            : 0;

        return {
            totalOrders,
            totalRevenue,
            avgOrderValue,
            uniqueCustomers,
            retentionRate,
            revenueData,
            popularItems,
            peakHoursData,
            statusData,
            avgRating
        };
    }, [filteredOrders, reviews]);

    const downloadReport = () => {
        const reportData = {
            generated: format(new Date(), 'PPpp'),
            dateRange: `${dateRange.start} to ${dateRange.end}`,
            summary: {
                totalOrders: analytics.totalOrders,
                totalRevenue: `£${analytics.totalRevenue.toFixed(2)}`,
                avgOrderValue: `£${analytics.avgOrderValue.toFixed(2)}`,
                uniqueCustomers: analytics.uniqueCustomers,
                retentionRate: `${analytics.retentionRate.toFixed(1)}%`,
                avgRating: analytics.avgRating
            },
            popularItems: analytics.popularItems,
            revenueOverTime: analytics.revenueData
        };

        const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `restaurant-analytics-${format(new Date(), 'yyyy-MM-dd')}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Date Range Filter */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            Analytics Dashboard
                        </CardTitle>
                        <Button onClick={downloadReport} variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-2" />
                            Export Report
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4 items-end">
                        <div className="flex-1">
                            <Label>Start Date</Label>
                            <Input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            />
                        </div>
                        <div className="flex-1">
                            <Label>End Date</Label>
                            <Input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            />
                        </div>
                        <Button 
                            variant="outline"
                            onClick={() => setDateRange({
                                start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
                                end: format(new Date(), 'yyyy-MM-dd')
                            })}
                        >
                            Last 30 Days
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Revenue</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    £{analytics.totalRevenue.toFixed(2)}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                <DollarSign className="h-6 w-6 text-green-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Orders</p>
                                <p className="text-2xl font-bold text-gray-900">{analytics.totalOrders}</p>
                            </div>
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                <ShoppingBag className="h-6 w-6 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Avg Order Value</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    £{analytics.avgOrderValue.toFixed(2)}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                                <TrendingUp className="h-6 w-6 text-purple-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Customer Retention</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {analytics.retentionRate.toFixed(1)}%
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                                <Users className="h-6 w-6 text-orange-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Revenue Over Time */}
            <Card>
                <CardHeader>
                    <CardTitle>Revenue Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={analytics.revenueData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip formatter={(value) => `£${value}`} />
                            <Legend />
                            <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Popular Items */}
                <Card>
                    <CardHeader>
                        <CardTitle>Top 5 Popular Items</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={analytics.popularItems}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="count" fill="#8b5cf6" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Order Status Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle>Order Status Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={analytics.statusData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {analytics.statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Peak Ordering Hours */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Peak Ordering Hours</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={analytics.peakHoursData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="hour" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="orders" fill="#ec4899" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Summary Stats */}
            <Card>
                <CardHeader>
                    <CardTitle>Summary Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600 mb-1">Unique Customers</p>
                            <p className="text-xl font-bold text-gray-900">{analytics.uniqueCustomers}</p>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600 mb-1">Avg Rating</p>
                            <p className="text-xl font-bold text-gray-900">⭐ {analytics.avgRating}</p>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600 mb-1">Total Reviews</p>
                            <p className="text-xl font-bold text-gray-900">{reviews.length}</p>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600 mb-1">Repeat Customers</p>
                            <p className="text-xl font-bold text-gray-900">
                                {((analytics.retentionRate / 100) * analytics.uniqueCustomers).toFixed(0)}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}