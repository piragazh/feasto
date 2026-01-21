import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search, DollarSign, TrendingUp, CreditCard, Package, Filter } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import moment from 'moment';
import { toast } from 'sonner';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function EnhancedAnalytics() {
    const [startDate, setStartDate] = useState(moment().startOf('month').format('YYYY-MM-DD'));
    const [endDate, setEndDate] = useState(moment().format('YYYY-MM-DD'));
    const [searchTerm, setSearchTerm] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('all');
    const [orderTypeFilter, setOrderTypeFilter] = useState('all');
    const [selectedRestaurant, setSelectedRestaurant] = useState('all');
    const [quickFilter, setQuickFilter] = useState('month');

    const applyQuickFilter = (filter) => {
        setQuickFilter(filter);
        const end = moment();
        let start = moment();

        switch (filter) {
            case 'week':
                start = moment().subtract(7, 'days');
                break;
            case 'month':
                start = moment().startOf('month');
                break;
            case 'year':
                start = moment().startOf('year');
                break;
            default:
                return;
        }

        setStartDate(start.format('YYYY-MM-DD'));
        setEndDate(end.format('YYYY-MM-DD'));
    };

    const { data: orders = [] } = useQuery({
        queryKey: ['accounting-orders'],
        queryFn: () => base44.entities.Order.list(),
    });

    const { data: restaurants = [] } = useQuery({
        queryKey: ['accounting-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            const orderDate = moment(order.created_date);
            const inDateRange = orderDate.isBetween(moment(startDate), moment(endDate).endOf('day'), null, '[]');
            const matchesPayment = paymentFilter === 'all' || order.payment_method === paymentFilter;
            const matchesOrderType = orderTypeFilter === 'all' || order.order_type === orderTypeFilter;
            const matchesSearch = !searchTerm || order.restaurant_name?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesRestaurant = selectedRestaurant === 'all' || order.restaurant_id === selectedRestaurant;
            return inDateRange && matchesPayment && matchesOrderType && matchesSearch && matchesRestaurant;
        });
    }, [orders, startDate, endDate, paymentFilter, orderTypeFilter, searchTerm, selectedRestaurant]);

    // Restaurant-wise breakdown
    const restaurantBreakdown = useMemo(() => {
        const breakdown = {};
        
        filteredOrders.forEach(order => {
            const restaurantId = order.restaurant_id;
            const restaurant = restaurants.find(r => r.id === restaurantId);
            
            if (!breakdown[restaurantId]) {
                breakdown[restaurantId] = {
                    restaurant_id: restaurantId,
                    restaurant_name: order.restaurant_name || restaurant?.name || 'Unknown Restaurant',
                    total_sales: 0,
                    total_commission: 0,
                    net_pay: 0,
                    order_count: 0,
                    payment_breakdown: { cash: 0, card: 0, apple_pay: 0, google_pay: 0 },
                    order_type_breakdown: { delivery: 0, collection: 0 },
                    commission_rate: restaurant?.commission_rate || 15,
                    commission_type: restaurant?.commission_type || 'percentage',
                };
            }

            const orderTotal = order.total || 0;
            let commission = 0;
            
            // Calculate commission based on restaurant settings
            if (restaurant) {
                if (restaurant.commission_type === 'fixed') {
                    commission = restaurant.fixed_commission_amount || 0;
                } else {
                    const rate = restaurant.commission_rate || 15;
                    commission = orderTotal * (rate / 100);
                }
            }
            
            breakdown[restaurantId].total_sales += orderTotal;
            breakdown[restaurantId].total_commission += commission;
            breakdown[restaurantId].net_pay += (orderTotal - commission);
            breakdown[restaurantId].order_count += 1;

            const paymentMethod = order.payment_method || 'cash';
            breakdown[restaurantId].payment_breakdown[paymentMethod] = 
                (breakdown[restaurantId].payment_breakdown[paymentMethod] || 0) + (order.total || 0);

            const orderType = order.order_type || 'delivery';
            breakdown[restaurantId].order_type_breakdown[orderType] = 
                (breakdown[restaurantId].order_type_breakdown[orderType] || 0) + (order.total || 0);
        });

        return Object.values(breakdown).sort((a, b) => b.total_sales - a.total_sales);
    }, [filteredOrders, restaurants]);

    // Daily sales data
    const dailySales = useMemo(() => {
        const salesByDay = {};
        filteredOrders.forEach(order => {
            const day = moment(order.created_date).format('YYYY-MM-DD');
            const restaurant = restaurants.find(r => r.id === order.restaurant_id);
            const orderTotal = order.total || 0;
            
            let commission = 0;
            if (restaurant) {
                if (restaurant.commission_type === 'fixed') {
                    commission = restaurant.fixed_commission_amount || 0;
                } else {
                    const rate = restaurant.commission_rate || 15;
                    commission = orderTotal * (rate / 100);
                }
            }
            
            if (!salesByDay[day]) {
                salesByDay[day] = { date: day, sales: 0, commission: 0, net: 0, orders: 0 };
            }
            salesByDay[day].sales += orderTotal;
            salesByDay[day].commission += commission;
            salesByDay[day].net += (orderTotal - commission);
            salesByDay[day].orders += 1;
        });
        return Object.values(salesByDay).sort((a, b) => moment(a.date).diff(moment(b.date)));
    }, [filteredOrders, restaurants]);

    // Summary metrics
    const summary = useMemo(() => {
        let totalSales = 0;
        let totalCommission = 0;
        
        filteredOrders.forEach(order => {
            const restaurant = restaurants.find(r => r.id === order.restaurant_id);
            const orderTotal = order.total || 0;
            totalSales += orderTotal;
            
            if (restaurant) {
                if (restaurant.commission_type === 'fixed') {
                    totalCommission += restaurant.fixed_commission_amount || 0;
                } else {
                    const rate = restaurant.commission_rate || 15;
                    totalCommission += orderTotal * (rate / 100);
                }
            }
        });
        
        return {
            total_sales: totalSales,
            total_commission: totalCommission,
            total_net_pay: totalSales - totalCommission,
            total_orders: filteredOrders.length,
        };
    }, [filteredOrders, restaurants]);

    // Payment method breakdown
    const paymentMethodData = useMemo(() => {
        const breakdown = { cash: 0, card: 0, apple_pay: 0, google_pay: 0 };
        filteredOrders.forEach(order => {
            const method = order.payment_method || 'cash';
            breakdown[method] = (breakdown[method] || 0) + (order.total || 0);
        });
        return Object.entries(breakdown)
            .filter(([_, value]) => value > 0)
            .map(([name, value]) => ({ name, value }));
    }, [filteredOrders]);

    // Order type breakdown
    const orderTypeData = useMemo(() => {
        const breakdown = { delivery: 0, collection: 0 };
        filteredOrders.forEach(order => {
            const type = order.order_type || 'delivery';
            breakdown[type] = (breakdown[type] || 0) + (order.total || 0);
        });
        return Object.entries(breakdown)
            .filter(([_, value]) => value > 0)
            .map(([name, value]) => ({ name, value }));
    }, [filteredOrders]);

    const exportToCSV = () => {
        const csvData = [
            ['Accounting & Analytics Report', `${startDate} to ${endDate}`],
            ['Generated', new Date().toLocaleString()],
            [],
            ['SUMMARY'],
            ['Total Sales', `£${summary.total_sales.toFixed(2)}`],
            ['Platform Commission', `£${summary.total_commission.toFixed(2)}`],
            ['Net Pay to Restaurants', `£${summary.total_net_pay.toFixed(2)}`],
            ['Total Orders', summary.total_orders],
            ['Average Order Value', `£${(summary.total_sales / summary.total_orders || 0).toFixed(2)}`],
            [],
            ['RESTAURANT BREAKDOWN'],
            ['Restaurant Name', 'Orders', 'Total Sales', 'Commission', 'Net Pay', 'Cash', 'Card', 'Apple Pay', 'Google Pay', 'Delivery', 'Collection', 'Avg Order'],
            ...restaurantBreakdown.map(r => [
                r.restaurant_name,
                r.order_count,
                `£${r.total_sales.toFixed(2)}`,
                `£${r.total_commission.toFixed(2)}`,
                `£${r.net_pay.toFixed(2)}`,
                `£${r.payment_breakdown.cash.toFixed(2)}`,
                `£${r.payment_breakdown.card.toFixed(2)}`,
                `£${r.payment_breakdown.apple_pay.toFixed(2)}`,
                `£${r.payment_breakdown.google_pay.toFixed(2)}`,
                `£${r.order_type_breakdown.delivery.toFixed(2)}`,
                `£${r.order_type_breakdown.collection.toFixed(2)}`,
                `£${(r.total_sales / r.order_count).toFixed(2)}`,
            ]),
            [],
            ['DAILY BREAKDOWN'],
            ['Date', 'Orders', 'Sales', 'Commission', 'Net Pay'],
            ...dailySales.map(d => [d.date, d.orders, `£${d.sales.toFixed(2)}`, `£${d.commission.toFixed(2)}`, `£${d.net.toFixed(2)}`]),
        ];

        const csv = csvData.map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `accounting-analytics-${startDate}-to-${endDate}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast.success('Report exported successfully');
    };

    return (
        <div className="space-y-6">
            {/* Filters */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Filter className="h-5 w-5" />
                            Accounting & Analytics Dashboard
                        </CardTitle>
                        <Button onClick={exportToCSV} className="bg-green-600 hover:bg-green-700">
                            <Download className="h-4 w-4 mr-2" />
                            Export to CSV
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Quick Filters */}
                        <div className="flex gap-2">
                            <Button
                                variant={quickFilter === 'week' ? 'default' : 'outline'}
                                onClick={() => applyQuickFilter('week')}
                                size="sm"
                            >
                                Last 7 Days
                            </Button>
                            <Button
                                variant={quickFilter === 'month' ? 'default' : 'outline'}
                                onClick={() => applyQuickFilter('month')}
                                size="sm"
                            >
                                This Month
                            </Button>
                            <Button
                                variant={quickFilter === 'year' ? 'default' : 'outline'}
                                onClick={() => applyQuickFilter('year')}
                                size="sm"
                            >
                                This Year
                            </Button>
                        </div>

                        {/* Advanced Filters */}
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                            <div>
                                <label className="text-sm text-gray-600 block mb-1">Start Date</label>
                                <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setQuickFilter('custom'); }} />
                            </div>
                            <div>
                                <label className="text-sm text-gray-600 block mb-1">End Date</label>
                                <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setQuickFilter('custom'); }} />
                            </div>
                            <div>
                                <label className="text-sm text-gray-600 block mb-1">Restaurant</label>
                                <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Restaurants</SelectItem>
                                        {restaurants.map(r => (
                                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-sm text-gray-600 block mb-1">Payment Method</label>
                                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Methods</SelectItem>
                                        <SelectItem value="cash">Cash</SelectItem>
                                        <SelectItem value="card">Card</SelectItem>
                                        <SelectItem value="apple_pay">Apple Pay</SelectItem>
                                        <SelectItem value="google_pay">Google Pay</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-sm text-gray-600 block mb-1">Order Type</label>
                                <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Types</SelectItem>
                                        <SelectItem value="delivery">Delivery</SelectItem>
                                        <SelectItem value="collection">Collection</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-sm text-gray-600 block mb-1">Search</label>
                                <div className="relative">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                                    <Input placeholder="Restaurant..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" />
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Summary KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-600">Total Sales</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <DollarSign className="h-8 w-8 text-green-600" />
                            <div>
                                <p className="text-3xl font-bold">£{summary.total_sales.toFixed(2)}</p>
                                <p className="text-xs text-gray-500">{summary.total_orders} orders</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-600">Platform Commission</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-8 w-8 text-orange-600" />
                            <div>
                                <p className="text-3xl font-bold">£{summary.total_commission.toFixed(2)}</p>
                                <p className="text-xs text-gray-500">{((summary.total_commission / summary.total_sales) * 100 || 0).toFixed(1)}% of sales</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-600">Net Pay (Restaurants)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <CreditCard className="h-8 w-8 text-blue-600" />
                            <div>
                                <p className="text-3xl font-bold">£{summary.total_net_pay.toFixed(2)}</p>
                                <p className="text-xs text-gray-500">{((summary.total_net_pay / summary.total_sales) * 100 || 0).toFixed(1)}% of sales</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-600">Avg Order Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <Package className="h-8 w-8 text-purple-600" />
                            <div>
                                <p className="text-3xl font-bold">£{(summary.total_sales / summary.total_orders || 0).toFixed(2)}</p>
                                <p className="text-xs text-gray-500">per order</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Daily Sales Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Daily Sales, Commission & Net Pay</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={dailySales}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip formatter={(value) => `£${value.toFixed(2)}`} />
                            <Legend />
                            <Line type="monotone" dataKey="sales" stroke="#10b981" name="Sales" strokeWidth={2} />
                            <Line type="monotone" dataKey="commission" stroke="#f97316" name="Commission" strokeWidth={2} />
                            <Line type="monotone" dataKey="net" stroke="#3b82f6" name="Net Pay" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Payment & Order Type Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Payment Method Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={paymentMethodData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {paymentMethodData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => `£${value.toFixed(2)}`} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Order Type Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={orderTypeData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {orderTypeData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => `£${value.toFixed(2)}`} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Restaurant Breakdown Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Restaurant-wise Financial Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-3 px-4">Restaurant</th>
                                    <th className="text-right py-3 px-4">Orders</th>
                                    <th className="text-right py-3 px-4">Total Sales</th>
                                    <th className="text-right py-3 px-4">Commission</th>
                                    <th className="text-right py-3 px-4">Net Pay</th>
                                    <th className="text-right py-3 px-4">Cash</th>
                                    <th className="text-right py-3 px-4">Card</th>
                                    <th className="text-right py-3 px-4">Delivery</th>
                                    <th className="text-right py-3 px-4">Collection</th>
                                    <th className="text-right py-3 px-4">Avg Order</th>
                                </tr>
                            </thead>
                            <tbody>
                                {restaurantBreakdown.map((restaurant, idx) => (
                                    <tr key={idx} className="border-b hover:bg-gray-50">
                                        <td className="py-3 px-4 font-semibold">{restaurant.restaurant_name}</td>
                                        <td className="text-right py-3 px-4">{restaurant.order_count}</td>
                                        <td className="text-right py-3 px-4 font-bold text-green-600">
                                            £{restaurant.total_sales.toFixed(2)}
                                        </td>
                                        <td className="text-right py-3 px-4 text-orange-600">
                                            £{restaurant.total_commission.toFixed(2)}
                                            <span className="text-xs text-gray-500 block">
                                                {restaurant.commission_type === 'percentage' ? `${restaurant.commission_rate}%` : `£${restaurant.commission_rate} fixed`}
                                            </span>
                                        </td>
                                        <td className="text-right py-3 px-4 font-bold text-blue-600">£{restaurant.net_pay.toFixed(2)}</td>
                                        <td className="text-right py-3 px-4 text-sm">£{restaurant.payment_breakdown.cash.toFixed(2)}</td>
                                        <td className="text-right py-3 px-4 text-sm">£{(restaurant.payment_breakdown.card + restaurant.payment_breakdown.apple_pay + restaurant.payment_breakdown.google_pay).toFixed(2)}</td>
                                        <td className="text-right py-3 px-4 text-sm">£{restaurant.order_type_breakdown.delivery.toFixed(2)}</td>
                                        <td className="text-right py-3 px-4 text-sm">£{restaurant.order_type_breakdown.collection.toFixed(2)}</td>
                                        <td className="text-right py-3 px-4 text-sm">£{(restaurant.total_sales / restaurant.order_count).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="font-bold bg-gray-100">
                                    <td className="py-3 px-4">TOTAL</td>
                                    <td className="text-right py-3 px-4">{summary.total_orders}</td>
                                    <td className="text-right py-3 px-4 text-green-600">£{summary.total_sales.toFixed(2)}</td>
                                    <td className="text-right py-3 px-4 text-orange-600">£{summary.total_commission.toFixed(2)}</td>
                                    <td className="text-right py-3 px-4 text-blue-600">£{summary.total_net_pay.toFixed(2)}</td>
                                    <td className="text-right py-3 px-4" colSpan="5"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}