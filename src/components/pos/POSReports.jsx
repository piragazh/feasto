import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, Calendar, TrendingUp, Clock, Users, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function POSReports({ restaurantId }) {
    const [startDate, setStartDate] = useState(moment().subtract(7, 'days').format('YYYY-MM-DD'));
    const [endDate, setEndDate] = useState(moment().format('YYYY-MM-DD'));

    const { data: orders = [] } = useQuery({
        queryKey: ['pos-reports-orders', restaurantId, startDate, endDate],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            const orderDate = moment(order.created_date);
            return orderDate.isBetween(moment(startDate), moment(endDate).endOf('day'), null, '[]');
        });
    }, [orders, startDate, endDate]);

    // Sales Performance
    const salesData = useMemo(() => {
        const salesByDay = {};
        filteredOrders.forEach(order => {
            const day = moment(order.created_date).format('MMM DD');
            salesByDay[day] = (salesByDay[day] || 0) + (order.total || 0);
        });
        return Object.entries(salesByDay).map(([date, total]) => ({ date, total }));
    }, [filteredOrders]);

    const totalRevenue = filteredOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const averageOrder = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;

    // Popular Menu Items
    const menuItemsData = useMemo(() => {
        const itemCounts = {};
        filteredOrders.forEach(order => {
            order.items?.forEach(item => {
                if (itemCounts[item.name]) {
                    itemCounts[item.name].count += item.quantity;
                    itemCounts[item.name].revenue += item.price * item.quantity;
                } else {
                    itemCounts[item.name] = {
                        name: item.name,
                        count: item.quantity,
                        revenue: item.price * item.quantity
                    };
                }
            });
        });
        return Object.values(itemCounts)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }, [filteredOrders]);

    // Peak Hours
    const peakHoursData = useMemo(() => {
        const hourCounts = Array(24).fill(0).map((_, i) => ({ hour: `${i}:00`, orders: 0, revenue: 0 }));
        filteredOrders.forEach(order => {
            const hour = moment(order.created_date).hour();
            hourCounts[hour].orders += 1;
            hourCounts[hour].revenue += order.total || 0;
        });
        return hourCounts.filter(h => h.orders > 0);
    }, [filteredOrders]);

    // Server Performance (from table assignments)
    const serverData = useMemo(() => {
        const serverStats = {};
        // This would need to be populated from actual table/server data
        // For now, showing placeholder structure
        return [];
    }, [filteredOrders]);

    // Order Status Distribution
    const statusData = useMemo(() => {
        const statusCounts = {};
        filteredOrders.forEach(order => {
            const status = order.status || 'unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
    }, [filteredOrders]);

    const exportToCSV = () => {
        const csvData = [
            ['Sales Report', `${startDate} to ${endDate}`],
            [],
            ['Summary'],
            ['Total Orders', filteredOrders.length],
            ['Total Revenue', `£${totalRevenue.toFixed(2)}`],
            ['Average Order', `£${averageOrder.toFixed(2)}`],
            [],
            ['Top Menu Items', 'Quantity', 'Revenue'],
            ...menuItemsData.map(item => [item.name, item.count, `£${item.revenue.toFixed(2)}`]),
            [],
            ['Daily Sales'],
            ['Date', 'Revenue'],
            ...salesData.map(day => [day.date, `£${day.total.toFixed(2)}`]),
        ];

        const csv = csvData.map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pos-report-${startDate}-to-${endDate}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast.success('Report exported successfully');
    };

    return (
        <div className="space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto p-4">
            {/* Date Range & Export */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-gray-400 text-sm block mb-1">Start Date</label>
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white"
                        />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-gray-400 text-sm block mb-1">End Date</label>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white"
                        />
                    </div>
                    <Button onClick={exportToCSV} className="bg-green-600 hover:bg-green-700">
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                    </Button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gray-800 border-gray-700">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-400">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <DollarSign className="h-8 w-8 text-green-500" />
                            <p className="text-3xl font-bold text-white">£{totalRevenue.toFixed(2)}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gray-800 border-gray-700">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-400">Total Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-8 w-8 text-blue-500" />
                            <p className="text-3xl font-bold text-white">{filteredOrders.length}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gray-800 border-gray-700">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-400">Average Order</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <DollarSign className="h-8 w-8 text-orange-500" />
                            <p className="text-3xl font-bold text-white">£{averageOrder.toFixed(2)}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gray-800 border-gray-700">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-400">Peak Hour</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <Clock className="h-8 w-8 text-purple-500" />
                            <p className="text-2xl font-bold text-white">
                                {peakHoursData.length > 0 
                                    ? peakHoursData.reduce((max, h) => h.orders > max.orders ? h : max).hour 
                                    : 'N/A'}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Sales Over Time */}
            <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                    <CardTitle className="text-white">Sales Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={salesData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="date" stroke="#9ca3af" />
                            <YAxis stroke="#9ca3af" />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                                labelStyle={{ color: '#fff' }}
                                formatter={(value) => [`£${value.toFixed(2)}`, 'Revenue']}
                            />
                            <Line type="monotone" dataKey="total" stroke="#f97316" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Popular Menu Items */}
                <Card className="bg-gray-800 border-gray-700">
                    <CardHeader>
                        <CardTitle className="text-white">Top Menu Items</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={menuItemsData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="name" stroke="#9ca3af" angle={-45} textAnchor="end" height={100} />
                                <YAxis stroke="#9ca3af" />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                                    labelStyle={{ color: '#fff' }}
                                />
                                <Bar dataKey="count" fill="#f97316" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Peak Hours */}
                <Card className="bg-gray-800 border-gray-700">
                    <CardHeader>
                        <CardTitle className="text-white">Orders by Hour</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={peakHoursData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="hour" stroke="#9ca3af" />
                                <YAxis stroke="#9ca3af" />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                                    labelStyle={{ color: '#fff' }}
                                />
                                <Bar dataKey="orders" fill="#3b82f6" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Order Status Distribution */}
            <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                    <CardTitle className="text-white">Order Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={statusData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {statusData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                                labelStyle={{ color: '#fff' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Detailed Menu Items Table */}
            <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                    <CardTitle className="text-white">Menu Item Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="text-left text-gray-400 py-2 px-3">Item</th>
                                    <th className="text-right text-gray-400 py-2 px-3">Quantity</th>
                                    <th className="text-right text-gray-400 py-2 px-3">Revenue</th>
                                    <th className="text-right text-gray-400 py-2 px-3">Avg Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                {menuItemsData.map((item, idx) => (
                                    <tr key={idx} className="border-b border-gray-700">
                                        <td className="text-white py-2 px-3">{item.name}</td>
                                        <td className="text-white text-right py-2 px-3">{item.count}</td>
                                        <td className="text-green-400 text-right py-2 px-3">£{item.revenue.toFixed(2)}</td>
                                        <td className="text-gray-300 text-right py-2 px-3">£{(item.revenue / item.count).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}