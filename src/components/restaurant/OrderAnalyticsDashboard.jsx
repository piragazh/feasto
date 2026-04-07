import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { format, subDays, isWithinInterval, parseISO } from 'date-fns';
import { TrendingUp, Calendar, Clock, ShoppingBag, Users, XCircle, AlertTriangle } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ['#f97316', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function OrderAnalyticsDashboard({ restaurantId }) {
    const [timeRange, setTimeRange] = useState('week');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
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

    const getDateRange = () => {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        if (timeRange === 'custom' && customStart && customEnd) {
            const start = new Date(customStart);
            start.setHours(0, 0, 0, 0);
            const end = new Date(customEnd);
            end.setHours(23, 59, 59, 999);
            return { startDate: start, endDate: end };
        }
        let startDate;
        if (timeRange === 'week') startDate = subDays(endDate, 7);
        else if (timeRange === 'month') startDate = subDays(endDate, 30);
        else startDate = subDays(endDate, 365);
        startDate.setHours(0, 0, 0, 0);
        return { startDate, endDate };
    };

    // All orders in range (including cancelled)
    const rangeOrders = useMemo(() => {
        const { startDate, endDate } = getDateRange();
        return orders.filter(o => o.created_date &&
            isWithinInterval(parseISO(o.created_date), { start: startDate, end: endDate }));
    }, [orders, timeRange, customStart, customEnd]);

    // Active (non-cancelled) orders in range
    const activeOrders = useMemo(() => rangeOrders.filter(o => o.status !== 'cancelled'), [rangeOrders]);

    // Cancelled orders in range
    const cancelledOrders = useMemo(() => rangeOrders.filter(o => o.status === 'cancelled'), [rangeOrders]);

    // Summary Stats (active orders only)
    const stats = useMemo(() => {
        const revenue = activeOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const avgOrderValue = activeOrders.length > 0 ? revenue / activeOrders.length : 0;
        const uniqueCustomers = new Set(activeOrders.map(o => o.created_by).filter(Boolean)).size;
        const cancelledValue = cancelledOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const cancelRate = rangeOrders.length > 0 ? (cancelledOrders.length / rangeOrders.length) * 100 : 0;

        return { totalOrders: activeOrders.length, totalRevenue: revenue, avgOrderValue, uniqueCustomers, cancelledCount: cancelledOrders.length, cancelledValue, cancelRate };
    }, [activeOrders, cancelledOrders, rangeOrders]);

    // Sales Trend (active only, date-range aware)
    const salesTrendData = useMemo(() => {
        const data = {};
        activeOrders.forEach(order => {
            if (!order.created_date) return;
            const orderDate = parseISO(order.created_date);
            const key = format(orderDate, timeRange === 'week' ? 'EEE dd' : timeRange === 'month' ? 'MMM d' : 'MMM yyyy');
            if (!data[key]) data[key] = { date: key, revenue: 0, orders: 0 };
            data[key].revenue += order.total || 0;
            data[key].orders += 1;
        });
        return Object.values(data);
    }, [activeOrders, timeRange]);

    // Popular Items (date-range aware, active only)
    const popularItemsData = useMemo(() => {
        const itemMap = {};
        activeOrders.forEach(order => {
            if (!order.items) return;
            order.items.forEach(item => {
                if (!itemMap[item.menu_item_id]) {
                    const menuItem = menuItems.find(m => m.id === item.menu_item_id);
                    itemMap[item.menu_item_id] = {
                        name: item.name || menuItem?.name || 'Unknown',
                        quantity: 0, revenue: 0,
                        category: menuItem?.category || 'Other'
                    };
                }
                itemMap[item.menu_item_id].quantity += item.quantity || 1;
                itemMap[item.menu_item_id].revenue += (item.price || 0) * (item.quantity || 1);
            });
        });
        let items = Object.values(itemMap);
        if (selectedCategory !== 'all') items = items.filter(i => i.category === selectedCategory);
        return items.sort((a, b) => b.quantity - a.quantity).slice(0, 8);
    }, [activeOrders, menuItems, selectedCategory]);

    // Peak Order Times (date-range aware, active only)
    const peakOrderTimes = useMemo(() => {
        const hourMap = {};
        for (let i = 0; i < 24; i++) hourMap[i] = 0;
        activeOrders.forEach(order => {
            if (!order.created_date) return;
            hourMap[new Date(order.created_date).getHours()]++;
        });
        return Object.entries(hourMap).map(([hour, count]) => ({ time: `${hour}:00`, orders: count }));
    }, [activeOrders]);

    // Order Type Breakdown (date-range aware, active only)
    const orderTypeBreakdown = useMemo(() => {
        let delivery = 0, collection = 0, deliveryRevenue = 0, collectionRevenue = 0;
        activeOrders.forEach(order => {
            if (order.order_type === 'collection' || order.order_type === 'takeaway') {
                collection++; collectionRevenue += order.total || 0;
            } else {
                delivery++; deliveryRevenue += order.total || 0;
            }
        });
        return [
            { name: 'Delivery', orders: delivery, revenue: deliveryRevenue },
            { name: 'Collection', orders: collection, revenue: collectionRevenue }
        ];
    }, [activeOrders]);

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
            .sort((a, b) => b.uses - a.uses).slice(0, 6);
    }, [promotions]);

    // Customer Frequency (date-range aware, active only)
    const customerFrequency = useMemo(() => {
        const customerOrders = {};
        activeOrders.forEach(order => {
            const email = order.created_by;
            if (!email) return;
            customerOrders[email] = (customerOrders[email] || 0) + 1;
        });
        const frequencies = {};
        Object.values(customerOrders).forEach(count => {
            frequencies[count] = (frequencies[count] || 0) + 1;
        });
        return Object.entries(frequencies)
            .map(([orders, customers]) => ({ orders: `${orders} order${parseInt(orders) > 1 ? 's' : ''}`, customers }))
            .sort((a, b) => parseInt(a.orders) - parseInt(b.orders));
    }, [activeOrders]);

    const categories = useMemo(() => {
        const cats = new Set(menuItems.map(item => item.category).filter(Boolean));
        return Array.from(cats).sort();
    }, [menuItems]);

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
            {/* Date Range Controls */}
            <div className="flex flex-wrap items-center gap-2">
                {['week', 'month', 'year', 'custom'].map(range => (
                    <Button
                        key={range}
                        variant={timeRange === range ? 'default' : 'outline'}
                        onClick={() => setTimeRange(range)}
                        size="sm"
                    >
                        {range === 'week' ? 'Last 7 Days' : range === 'month' ? 'Last 30 Days' : range === 'year' ? 'Last Year' : 'Custom Range'}
                    </Button>
                ))}
                {timeRange === 'custom' && (
                    <div className="flex items-center gap-2 ml-2">
                        <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-9 w-36 text-sm" />
                        <span className="text-gray-500 text-sm">to</span>
                        <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-9 w-36 text-sm" />
                    </div>
                )}
            </div>

            {/* Summary Stats — Active Orders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Completed Orders</p>
                                <p className="text-2xl font-bold">{stats.totalOrders}</p>
                                <p className="text-xs text-gray-400 mt-1">Excludes cancelled</p>
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
                                <p className="text-xs text-gray-400 mt-1">Completed orders only</p>
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

            {/* Cancelled Orders Card */}
            <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-5 pb-5">
                    <div className="flex flex-wrap items-center gap-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                                <XCircle className="h-5 w-5 text-red-600" />
                            </div>
                            <div>
                                <p className="text-sm text-red-700 font-medium">Cancelled Orders</p>
                                <p className="text-2xl font-bold text-red-800">{stats.cancelledCount}</p>
                            </div>
                        </div>
                        <div className="h-10 w-px bg-red-200 hidden sm:block" />
                        <div>
                            <p className="text-sm text-red-700 font-medium">Lost Revenue</p>
                            <p className="text-2xl font-bold text-red-800">£{stats.cancelledValue.toFixed(2)}</p>
                        </div>
                        <div className="h-10 w-px bg-red-200 hidden sm:block" />
                        <div>
                            <p className="text-sm text-red-700 font-medium">Cancellation Rate</p>
                            <p className="text-2xl font-bold text-red-800">{stats.cancelRate.toFixed(1)}%</p>
                        </div>
                        <Badge variant="outline" className="border-red-300 text-red-700 ml-auto">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Excluded from all charts & revenue
                        </Badge>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="trends" className="space-y-4">
                <TabsList className="flex-wrap">
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
                                        <Tooltip formatter={(value, name) => name === 'Revenue (£)' ? `£${value.toFixed(2)}` : value} />
                                        <Legend />
                                        <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#f97316" name="Revenue (£)" strokeWidth={2} />
                                        <Line yAxisId="right" type="monotone" dataKey="orders" stroke="#0ea5e9" name="Orders" strokeWidth={2} />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-center text-gray-500 py-12">No order data for this period</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Popular Items */}
                <TabsContent value="items">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <CardTitle>Popular Menu Items</CardTitle>
                                <div className="flex gap-2 flex-wrap">
                                    <Button variant={selectedCategory === 'all' ? 'default' : 'outline'} onClick={() => setSelectedCategory('all')} size="sm">All</Button>
                                    {categories.map(cat => (
                                        <Button key={cat} variant={selectedCategory === cat ? 'default' : 'outline'} onClick={() => setSelectedCategory(cat)} size="sm">{cat}</Button>
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
                        <CardHeader><CardTitle>Peak Order Times</CardTitle></CardHeader>
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
                            <CardHeader><CardTitle>Orders by Type</CardTitle></CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie data={orderTypeBreakdown} dataKey="orders" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                                            {orderTypeBreakdown.map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>Revenue by Type</CardTitle></CardHeader>
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
                        <CardHeader><CardTitle>Promotion Performance</CardTitle></CardHeader>
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
                        <CardHeader><CardTitle>Customer Order Frequency</CardTitle></CardHeader>
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