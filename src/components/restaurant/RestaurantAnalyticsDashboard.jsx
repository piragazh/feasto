import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DollarSign, ShoppingBag, TrendingUp, Users, Star, Calendar as CalendarIcon, Award, CreditCard } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns';

const COLORS = ['#FF6B35', '#004E89', '#F77F00', '#06A77D', '#9B5DE5', '#F15BB5'];

export default function RestaurantAnalyticsDashboard({ restaurantId }) {
    const [dateRange, setDateRange] = useState('30days');
    const [customDateFrom, setCustomDateFrom] = useState(null);
    const [customDateTo, setCustomDateTo] = useState(null);

    // Fetch orders
    const { data: allOrders = [], isLoading: ordersLoading } = useQuery({
        queryKey: ['restaurant-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: ['delivered', 'collected', 'refunded']
        }),
    });

    // Fetch payouts
    const { data: payouts = [], isLoading: payoutsLoading } = useQuery({
        queryKey: ['restaurant-payouts', restaurantId],
        queryFn: () => base44.entities.Payout.filter({ restaurant_id: restaurantId }, '-created_date'),
    });

    // Filter orders by date range
    const filteredOrders = useMemo(() => {
        let startDate, endDate;
        
        if (dateRange === 'custom' && customDateFrom && customDateTo) {
            startDate = startOfDay(customDateFrom);
            endDate = endOfDay(customDateTo);
        } else {
            const days = parseInt(dateRange.replace('days', ''));
            startDate = startOfDay(subDays(new Date(), days));
            endDate = endOfDay(new Date());
        }

        return allOrders.filter(order => {
            const orderDate = new Date(order.created_date);
            return isWithinInterval(orderDate, { start: startDate, end: endDate });
        });
    }, [allOrders, dateRange, customDateFrom, customDateTo]);

    // Calculate metrics
    const metrics = useMemo(() => {
        const completedOrders = filteredOrders.filter(o => ['delivered', 'collected'].includes(o.status));
        const refundedOrders = filteredOrders.filter(o => o.status === 'refunded');
        
        const totalRevenue = completedOrders.reduce((sum, order) => sum + (order.total || 0), 0);
        const totalRefunds = refundedOrders.reduce((sum, order) => sum + (order.refund_amount || 0), 0);
        const netRevenue = totalRevenue - totalRefunds;
        
        const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;
        
        const totalCommission = completedOrders.reduce((sum, order) => sum + (order.platform_commission_amount || 0), 0);
        const earnings = netRevenue - totalCommission;

        return {
            totalOrders: completedOrders.length,
            totalRevenue,
            netRevenue,
            avgOrderValue,
            totalRefunds,
            refundCount: refundedOrders.length,
            totalCommission,
            earnings,
        };
    }, [filteredOrders]);

    // Popular items analysis
    const popularItems = useMemo(() => {
        const itemCounts = {};
        filteredOrders.forEach(order => {
            order.items?.forEach(item => {
                if (!itemCounts[item.name]) {
                    itemCounts[item.name] = { name: item.name, count: 0, revenue: 0 };
                }
                itemCounts[item.name].count += item.quantity;
                itemCounts[item.name].revenue += item.price * item.quantity;
            });
        });
        
        return Object.values(itemCounts)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }, [filteredOrders]);

    // Revenue by day
    const revenueByDay = useMemo(() => {
        const dailyData = {};
        filteredOrders.forEach(order => {
            if (['delivered', 'collected'].includes(order.status)) {
                const date = format(new Date(order.created_date), 'MMM dd');
                if (!dailyData[date]) {
                    dailyData[date] = { date, revenue: 0, orders: 0 };
                }
                dailyData[date].revenue += order.total || 0;
                dailyData[date].orders += 1;
            }
        });
        
        return Object.values(dailyData).sort((a, b) => 
            new Date(a.date) - new Date(b.date)
        );
    }, [filteredOrders]);

    // Order type distribution
    const orderTypeData = useMemo(() => {
        const delivery = filteredOrders.filter(o => o.order_type === 'delivery').length;
        const collection = filteredOrders.filter(o => o.order_type === 'collection').length;
        
        return [
            { name: 'Delivery', value: delivery },
            { name: 'Collection', value: collection },
        ];
    }, [filteredOrders]);

    // Customer demographics (by order frequency)
    const customerStats = useMemo(() => {
        const customerOrders = {};
        filteredOrders.forEach(order => {
            const customer = order.created_by || order.guest_email;
            if (customer) {
                if (!customerOrders[customer]) {
                    customerOrders[customer] = { email: customer, orderCount: 0, totalSpent: 0 };
                }
                customerOrders[customer].orderCount += 1;
                customerOrders[customer].totalSpent += order.total || 0;
            }
        });
        
        const topCustomers = Object.values(customerOrders)
            .sort((a, b) => b.totalSpent - a.totalSpent)
            .slice(0, 5);

        const oneTime = Object.values(customerOrders).filter(c => c.orderCount === 1).length;
        const returning = Object.values(customerOrders).filter(c => c.orderCount > 1).length;

        return { topCustomers, oneTime, returning };
    }, [filteredOrders]);

    const isLoading = ordersLoading || payoutsLoading;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading analytics...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Date Range Filter */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="text-sm font-medium">Time Period:</label>
                        <Select value={dateRange} onValueChange={setDateRange}>
                            <SelectTrigger className="w-40">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="7days">Last 7 Days</SelectItem>
                                <SelectItem value="30days">Last 30 Days</SelectItem>
                                <SelectItem value="90days">Last 90 Days</SelectItem>
                                <SelectItem value="365days">Last Year</SelectItem>
                                <SelectItem value="custom">Custom Range</SelectItem>
                            </SelectContent>
                        </Select>

                        {dateRange === 'custom' && (
                            <div className="flex items-center gap-2">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm">
                                            <CalendarIcon className="h-4 w-4 mr-2" />
                                            {customDateFrom ? format(customDateFrom, 'MMM dd') : 'From'}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={customDateFrom}
                                            onSelect={setCustomDateFrom}
                                        />
                                    </PopoverContent>
                                </Popover>
                                <span>to</span>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm">
                                            <CalendarIcon className="h-4 w-4 mr-2" />
                                            {customDateTo ? format(customDateTo, 'MMM dd') : 'To'}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={customDateTo}
                                            onSelect={setCustomDateTo}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Key Metrics */}
            <div className="grid md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                                <ShoppingBag className="h-5 w-5 text-orange-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Total Orders</p>
                                <p className="text-2xl font-bold">{metrics.totalOrders}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <DollarSign className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Total Revenue</p>
                                <p className="text-2xl font-bold">£{metrics.totalRevenue.toFixed(2)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                <TrendingUp className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Avg Order Value</p>
                                <p className="text-2xl font-bold">£{metrics.avgOrderValue.toFixed(2)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                                <CreditCard className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Net Earnings</p>
                                <p className="text-2xl font-bold text-green-600">£{metrics.earnings.toFixed(2)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Revenue Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Revenue Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={revenueByDay}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="revenue" stroke="#FF6B35" name="Revenue (£)" strokeWidth={2} />
                            <Line type="monotone" dataKey="orders" stroke="#004E89" name="Orders" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Popular Items */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Award className="h-5 w-5 text-orange-500" />
                            Top Selling Items
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={popularItems}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="count" fill="#FF6B35" name="Quantity Sold" />
                            </BarChart>
                        </ResponsiveContainer>
                        <div className="mt-4 space-y-2">
                            {popularItems.slice(0, 5).map((item, idx) => (
                                <div key={idx} className="flex justify-between text-sm">
                                    <span>{idx + 1}. {item.name}</span>
                                    <span className="font-semibold">{item.count} sold • £{item.revenue.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Order Type Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle>Order Type Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={orderTypeData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={100}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {orderTypeData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Customer Insights */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-blue-500" />
                        Customer Insights
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="font-semibold mb-3">Top Customers</h4>
                            <div className="space-y-2">
                                {customerStats.topCustomers.map((customer, idx) => (
                                    <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                                        <div>
                                            <p className="text-sm font-medium">{customer.email}</p>
                                            <p className="text-xs text-gray-500">{customer.orderCount} orders</p>
                                        </div>
                                        <p className="font-semibold text-green-600">£{customer.totalSpent.toFixed(2)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-3">Customer Retention</h4>
                            <div className="space-y-4">
                                <div className="p-4 bg-blue-50 rounded-lg">
                                    <p className="text-2xl font-bold text-blue-600">{customerStats.returning}</p>
                                    <p className="text-sm text-gray-600">Returning Customers</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <p className="text-2xl font-bold text-gray-600">{customerStats.oneTime}</p>
                                    <p className="text-sm text-gray-600">One-Time Customers</p>
                                </div>
                                <div className="p-4 bg-green-50 rounded-lg">
                                    <p className="text-2xl font-bold text-green-600">
                                        {customerStats.returning + customerStats.oneTime > 0
                                            ? ((customerStats.returning / (customerStats.returning + customerStats.oneTime)) * 100).toFixed(1)
                                            : 0}%
                                    </p>
                                    <p className="text-sm text-gray-600">Retention Rate</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Payout History */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-purple-500" />
                        Payout History
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {payouts.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">No payouts yet</p>
                    ) : (
                        <div className="space-y-3">
                            {payouts.map((payout) => (
                                <div key={payout.id} className="border rounded-lg p-4 flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold">
                                            {format(new Date(payout.period_start), 'MMM d')} - {format(new Date(payout.period_end), 'MMM d, yyyy')}
                                        </p>
                                        <div className="flex gap-4 text-sm text-gray-600 mt-1">
                                            <span>{payout.total_orders} orders</span>
                                            <span>Gross: £{payout.gross_earnings?.toFixed(2)}</span>
                                            <span>Commission: £{payout.platform_commission?.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-bold text-green-600">£{payout.net_payout?.toFixed(2)}</p>
                                        <Badge className={
                                            payout.status === 'paid' ? 'bg-green-100 text-green-800' :
                                            payout.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                                            'bg-yellow-100 text-yellow-800'
                                        }>
                                            {payout.status}
                                        </Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Financial Summary */}
            <Card>
                <CardHeader>
                    <CardTitle>Financial Summary</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                            <p className="text-2xl font-bold">£{metrics.totalRevenue.toFixed(2)}</p>
                        </div>
                        <div className="p-4 bg-orange-50 rounded-lg">
                            <p className="text-sm text-gray-600 mb-1">Platform Commission</p>
                            <p className="text-2xl font-bold text-orange-600">-£{metrics.totalCommission.toFixed(2)}</p>
                        </div>
                        <div className="p-4 bg-red-50 rounded-lg">
                            <p className="text-sm text-gray-600 mb-1">Refunds</p>
                            <p className="text-2xl font-bold text-red-600">-£{metrics.totalRefunds.toFixed(2)}</p>
                            <p className="text-xs text-gray-500">{metrics.refundCount} refunded orders</p>
                        </div>
                    </div>
                    <div className="mt-4 p-4 bg-green-50 rounded-lg border-2 border-green-200">
                        <p className="text-sm text-green-700 mb-1">Net Earnings</p>
                        <p className="text-3xl font-bold text-green-700">£{metrics.earnings.toFixed(2)}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}