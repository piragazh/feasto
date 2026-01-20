import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter
} from 'recharts';
import { format, startOfDay, subDays, startOfWeek, startOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { TrendingUp, Calendar, Clock, ShoppingBag, Users, Percent } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ['#f97316', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function OrderAnalyticsDashboard({ restaurantId }) {
    const [timeRange, setTimeRange] = useState('week'); // week, month, year
    const [selectedCategory, setSelectedCategory] = useState('all');

    const { data: orders = [], isLoading: ordersLoading } = useQuery({
        queryKey: ['analytics-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const { data: menuItems = [] } = useQuery({
        queryKey: ['analytics-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const { data: promotions = [] } = useQuery({
        queryKey: ['analytics-promotions', restaurantId],
        queryFn: () => base44.entities.Promotion.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    // Helper: Get date range based on selection
    const getDateRange = () => {
        const endDate = new Date();
        let startDate;
        if (timeRange === 'week') startDate = subDays(endDate, 7);
        else if (timeRange === 'month') startDate = subDays(endDate, 30);
        else startDate = subDays(endDate, 365);
        return { startDate, endDate };
    };

    // Sales Trend Data
    const salesTrendData = useMemo(() => {
        const { startDate, endDate } = getDateRange();
        const data = {};

        orders.forEach(order => {
            if (!order.created_date || order.status === 'cancelled') return;
            const orderDate = parseISO(order.created_date);
            if (!isWithinInterval(orderDate, { start: startDate, end: endDate })) return;

            const key = format(orderDate, timeRange === 'week' ? 'EEE' : timeRange === 'month' ? 'MMM d' : 'MMM');
            if (!data[key]) data[key] = { date: key, revenue: 0, orders: 0 };
            data[key].revenue += order.total || 0;
            data[key].orders += 1;
        });

        return Object.values(data).sort((a, b) => new Date(a.date) - new Date(b.date));
    }, [orders, timeRange]);

    // Popular Items Data
    const popularItemsData = useMemo(() => {
        const itemMap = {};

        orders.forEach(order => {
            if (order.status === 'cancelled' || !order.items) return;
            order.items.forEach(item => {
                if (!itemMap[item.menu_item_id]) {
                    const menuItem = menuItems.find(m => m.id === item.menu_item_id);
                    itemMap[item.menu_item_id] = {
                        name: item.name || menuItem?.name || 'Unknown',
                        quantity: 0,
                        revenue: 0,
                        category: menuItem?.category || 'Other'
                    };
                }
                itemMap[item.menu_item_id].quantity += item.quantity || 1;
                itemMap[item.menu_item_id].revenue += (item.price || 0) * (item.quantity || 1);
            });
        });

        let items = Object.values(itemMap);
        if (selectedCategory !== 'all') {
            items = items.filter(item => item.category === selectedCategory);
        }
        return items.sort((a, b) => b.quantity - a.quantity).slice(0, 8);
    }, [orders, menuItems, selectedCategory]);

    // Peak Order Times
    const peakOrderTimes = useMemo(() => {
        const hourMap = {};
        for (let i = 0; i < 24; i++) hourMap[i] = 0;

        orders.forEach(order => {
            if (order.status === 'cancelled' || !order.created_date) return;
            const hour = new Date(order.created_date).getHours();
            hourMap[hour]++;
        });

        return Object.entries(hourMap).map(([hour, count]) => ({
            time: `${parseInt(hour)}:00`,
            orders: count
        }));
    }, [orders]);

    // Order Type Breakdown
    const orderTypeBreakdown = useMemo(() => {
        let delivery = 0, collection = 0;
        let deliveryRevenue = 0, collectionRevenue = 0;

        orders.forEach(order => {
            if (order.status === 'cancelled') return;
            if (order.order_type === 'collection') {
                collection++;
                collectionRevenue += order.total || 0;
            } else {
                delivery++;
                deliveryRevenue += order.total || 0;
            }
        });

        return [
            { name: 'Delivery', orders: delivery, revenue: deliveryRevenue },
            { name: 'Collection', orders: collection, revenue: collectionRevenue }
        ];
    }, [orders]);

    // Promotion Usage
    const promotionUsage = useMemo(() => {
        return promotions
            .filter(p => (p.usage_count || 0) > 0)
            .map(p => ({
                name: p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
                uses: p.usage_count || 0,
                revenue: p.total_revenue_generated || 0,
                discount: p.total_discount_given || 0
            }))
            .sort((a, b) => b.uses - a.uses)
            .slice(0, 6);
    }, [promotions]);

    // Customer Frequency
    const customerFrequency = useMemo(() => {
        const customerOrders = {};

        orders.forEach(order => {
            if (order.status === 'cancelled') return;
            const email = order.created_by;
            if (!email) return;
            customerOrders[email] = (customerOrders[email] || 0) + 1;
        });

        const frequencies = {};
        Object.values(customerOrders).forEach(count => {
            frequencies[count] = (frequencies[count] || 0) + 1;
        });

        return Object.entries(frequencies)
            .map(([orders, customers]) => ({
                orders: `${orders} order${parseInt(orders) > 1 ? 's' : ''}`,
                customers: customers
            }))
            .sort((a, b) => parseInt(a.orders) - parseInt(b.orders));
    }, [orders]);

    // Categories for filter
    const categories = useMemo(() => {
        const cats = new Set(menuItems.map(item => item.category).filter(Boolean));
        return Array.from(cats).sort();
    }, [menuItems]);

    // Summary Stats
    const stats = useMemo(() => {
        const { startDate, endDate } = getDateRange();
        const rangeOrders = orders.filter(o => o.created_date && o.status !== 'cancelled' && 
            isWithinInterval(parseISO(o.created_date), { start: startDate, end: endDate }));

        const revenue = rangeOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const avgOrderValue = rangeOrders.length > 0 ? revenue / rangeOrders.length : 0;
        const uniqueCustomers = new Set(rangeOrders.map(o => o.created_by).filter(Boolean)).size;

        return {
            totalOrders: rangeOrders.length,
            totalRevenue: revenue,
            avgOrderValue: avgOrderValue,
            uniqueCustomers: uniqueCustomers
        };
    }, [orders, timeRange]);

    if (ordersLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Orders</p>
                                <p className="text-2xl font-bold">{stats.totalOrders}</p>
                            </div>
                            <ShoppingBag className="h-8 w-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Revenue</p>
                                <p className="text-2xl font-bold">£{stats.totalRevenue.toFixed(2)}</p>
                            </div>
                            <TrendingUp className="h-8 w-8 text-green-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Avg Order Value</p>
                                <p className="text-2xl font-bold">£{stats.avgOrderValue.toFixed(2)}</p>
                            </div>
                            <Calendar className="h-8 w-8 text-orange-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Unique Customers</p>
                                <p className="text-2xl font-bold">{stats.uniqueCustomers}</p>
                            </div>
                            <Users className="h-8 w-8 text-purple-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Time Range Selector */}
            <div className="flex gap-2">
                <Button
                    variant={timeRange === 'week' ? 'default' : 'outline'}
                    onClick={() => setTimeRange('week')}
                    size="sm"
                >
                    Last 7 Days
                </Button>
                <Button
                    variant={timeRange === 'month' ? 'default' : 'outline'}
                    onClick={() => setTimeRange('month')}
                    size="sm"
                >
                    Last 30 Days
                </Button>
                <Button
                    variant={timeRange === 'year' ? 'default' : 'outline'}
                    onClick={() => setTimeRange('year')}
                    size="sm"
                >
                    Last Year
                </Button>
            </div>

            <Tabs defaultValue="trends" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="trends">Sales Trends</TabsTrigger>
                    <TabsTrigger value="items">Popular Items</TabsTrigger>
                    <TabsTrigger value="peak">Peak Times</TabsTrigger>
                    <TabsTrigger value="breakdown">Order Types</TabsTrigger>
                    <TabsTrigger value="promotions">Promotions</TabsTrigger>
                    <TabsTrigger value="frequency">Customer Frequency</TabsTrigger>
                </TabsList>

                {/* Sales Trends */}
                <TabsContent value="trends">
                    <Card>
                        <CardHeader>
                            <CardTitle>Sales Trends</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {salesTrendData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={salesTrendData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" />
                                        <YAxis yAxisId="left" />
                                        <YAxis yAxisId="right" orientation="right" />
                                        <Tooltip formatter={(value) => `£${value.toFixed(2)}`} />
                                        <Legend />
                                        <Line
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="revenue"
                                            stroke="#f97316"
                                            name="Revenue (£)"
                                            strokeWidth={2}
                                        />
                                        <Line
                                            yAxisId="right"
                                            type="monotone"
                                            dataKey="orders"
                                            stroke="#0ea5e9"
                                            name="Orders"
                                            strokeWidth={2}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-center text-gray-500 py-12">No order data available</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Popular Items */}
                <TabsContent value="items">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>Popular Menu Items</CardTitle>
                                <div className="flex gap-2">
                                    <Button
                                        variant={selectedCategory === 'all' ? 'default' : 'outline'}
                                        onClick={() => setSelectedCategory('all')}
                                        size="sm"
                                    >
                                        All
                                    </Button>
                                    {categories.map(cat => (
                                        <Button
                                            key={cat}
                                            variant={selectedCategory === cat ? 'default' : 'outline'}
                                            onClick={() => setSelectedCategory(cat)}
                                            size="sm"
                                        >
                                            {cat}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {popularItemsData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={popularItemsData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="quantity" fill="#f97316" name="Orders" />
                                        <Bar dataKey="revenue" fill="#0ea5e9" name="Revenue (£)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-center text-gray-500 py-12">No items in this category</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Peak Order Times */}
                <TabsContent value="peak">
                    <Card>
                        <CardHeader>
                            <CardTitle>Peak Order Times</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={peakOrderTimes}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="time" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="orders" fill="#f97316" name="Orders" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Order Type Breakdown */}
                <TabsContent value="breakdown">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Orders by Type</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={orderTypeBreakdown}
                                            dataKey="orders"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={100}
                                            label
                                        >
                                            {orderTypeBreakdown.map((entry, index) => (
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
                                <CardTitle>Revenue by Type</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {orderTypeBreakdown.map((type, idx) => (
                                        <div key={idx} className="border rounded-lg p-4">
                                            <p className="font-semibold text-gray-900">{type.name}</p>
                                            <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                                                <div>
                                                    <p className="text-gray-600">Orders</p>
                                                    <p className="text-xl font-bold">{type.orders}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-600">Revenue</p>
                                                    <p className="text-xl font-bold">£{type.revenue.toFixed(2)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Promotions */}
                <TabsContent value="promotions">
                    <Card>
                        <CardHeader>
                            <CardTitle>Promotion Performance</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {promotionUsage.length > 0 ? (
                                <div className="space-y-3">
                                    {promotionUsage.map((promo, idx) => (
                                        <div key={idx} className="border rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="font-semibold text-gray-900">{promo.name}</p>
                                                <span className="text-sm font-bold text-orange-600">{promo.uses} uses</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <p className="text-gray-600">Revenue Generated</p>
                                                    <p className="font-semibold text-green-600">£{promo.revenue.toFixed(2)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-600">Discounts Given</p>
                                                    <p className="font-semibold text-red-600">£{promo.discount.toFixed(2)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-gray-500 py-12">No promotions have been used yet</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Customer Frequency */}
                <TabsContent value="frequency">
                    <Card>
                        <CardHeader>
                            <CardTitle>Customer Order Frequency</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {customerFrequency.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={customerFrequency}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="orders" />
                                        <YAxis />
                                        <Tooltip />
                                        <Bar dataKey="customers" fill="#10b981" name="Customers" />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-center text-gray-500 py-12">No customer data available</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}