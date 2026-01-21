import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search, DollarSign, TrendingUp, CreditCard, Package } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import moment from 'moment';
import { toast } from 'sonner';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function AccountingDashboard() {
    const [startDate, setStartDate] = useState(moment().startOf('month').format('YYYY-MM-DD'));
    const [endDate, setEndDate] = useState(moment().format('YYYY-MM-DD'));
    const [searchTerm, setSearchTerm] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('all');
    const [orderTypeFilter, setOrderTypeFilter] = useState('all');

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
            return inDateRange && matchesPayment && matchesOrderType && matchesSearch;
        });
    }, [orders, startDate, endDate, paymentFilter, orderTypeFilter, searchTerm]);

    // Restaurant-wise breakdown
    const restaurantBreakdown = useMemo(() => {
        const breakdown = {};
        
        filteredOrders.forEach(order => {
            const restaurantId = order.restaurant_id;
            if (!breakdown[restaurantId]) {
                breakdown[restaurantId] = {
                    restaurant_id: restaurantId,
                    restaurant_name: order.restaurant_name,
                    total_sales: 0,
                    total_commission: 0,
                    net_pay: 0,
                    order_count: 0,
                    payment_breakdown: { cash: 0, card: 0, apple_pay: 0, google_pay: 0 },
                    order_type_breakdown: { delivery: 0, collection: 0 },
                };
            }

            breakdown[restaurantId].total_sales += order.total || 0;
            breakdown[restaurantId].total_commission += order.platform_commission_amount || 0;
            breakdown[restaurantId].net_pay += order.restaurant_earnings || 0;
            breakdown[restaurantId].order_count += 1;

            const paymentMethod = order.payment_method || 'cash';
            breakdown[restaurantId].payment_breakdown[paymentMethod] = 
                (breakdown[restaurantId].payment_breakdown[paymentMethod] || 0) + (order.total || 0);

            const orderType = order.order_type || 'delivery';
            breakdown[restaurantId].order_type_breakdown[orderType] = 
                (breakdown[restaurantId].order_type_breakdown[orderType] || 0) + (order.total || 0);
        });

        return Object.values(breakdown).sort((a, b) => b.total_sales - a.total_sales);
    }, [filteredOrders]);

    // Daily sales data
    const dailySales = useMemo(() => {
        const salesByDay = {};
        filteredOrders.forEach(order => {
            const day = moment(order.created_date).format('YYYY-MM-DD');
            if (!salesByDay[day]) {
                salesByDay[day] = { date: day, sales: 0, commission: 0, net: 0 };
            }
            salesByDay[day].sales += order.total || 0;
            salesByDay[day].commission += order.platform_commission_amount || 0;
            salesByDay[day].net += order.restaurant_earnings || 0;
        });
        return Object.values(salesByDay).sort((a, b) => moment(a.date).diff(moment(b.date)));
    }, [filteredOrders]);

    // Summary metrics
    const summary = useMemo(() => {
        return {
            total_sales: filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0),
            total_commission: filteredOrders.reduce((sum, o) => sum + (o.platform_commission_amount || 0), 0),
            total_net_pay: filteredOrders.reduce((sum, o) => sum + (o.restaurant_earnings || 0), 0),
            total_orders: filteredOrders.length,
        };
    }, [filteredOrders]);

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
            ['Accounting Report', `${startDate} to ${endDate}`],
            [],
            ['Summary'],
            ['Total Sales', `£${summary.total_sales.toFixed(2)}`],
            ['Total Commission', `£${summary.total_commission.toFixed(2)}`],
            ['Total Net Pay (to Restaurants)', `£${summary.total_net_pay.toFixed(2)}`],
            ['Total Orders', summary.total_orders],
            [],
            ['Restaurant Breakdown'],
            ['Restaurant Name', 'Orders', 'Total Sales', 'Commission', 'Net Pay', 'Cash', 'Card', 'Apple Pay', 'Google Pay', 'Delivery', 'Collection'],
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
            ]),
            [],
            ['Daily Sales'],
            ['Date', 'Sales', 'Commission', 'Net Pay'],
            ...dailySales.map(d => [d.date, `£${d.sales.toFixed(2)}`, `£${d.commission.toFixed(2)}`, `£${d.net.toFixed(2)}`]),
        ];

        const csv = csvData.map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `accounting-report-${startDate}-to-${endDate}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast.success('Accounting report exported');
    };

    return (
        <div className="space-y-6">
            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Filters & Search</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div>
                            <label className="text-sm text-gray-600 block mb-1">Start Date</label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm text-gray-600 block mb-1">End Date</label>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
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
                            <label className="text-sm text-gray-600 block mb-1">Search Restaurant</label>
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                                <Input
                                    placeholder="Search..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="mt-4">
                        <Button onClick={exportToCSV} className="bg-green-600 hover:bg-green-700">
                            <Download className="h-4 w-4 mr-2" />
                            Export to CSV
                        </Button>
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
                            <p className="text-3xl font-bold">£{summary.total_sales.toFixed(2)}</p>
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
                            <p className="text-3xl font-bold">£{summary.total_commission.toFixed(2)}</p>
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
                            <p className="text-3xl font-bold">£{summary.total_net_pay.toFixed(2)}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-600">Total Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <Package className="h-8 w-8 text-purple-600" />
                            <p className="text-3xl font-bold">{summary.total_orders}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Daily Sales Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Daily Sales & Commission</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={dailySales}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip formatter={(value) => `£${value.toFixed(2)}`} />
                            <Legend />
                            <Line type="monotone" dataKey="sales" stroke="#10b981" name="Total Sales" strokeWidth={2} />
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
                    <CardTitle>Restaurant-wise Breakdown</CardTitle>
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
                                </tr>
                            </thead>
                            <tbody>
                                {restaurantBreakdown.map((restaurant, idx) => (
                                    <tr key={idx} className="border-b hover:bg-gray-50">
                                        <td className="py-3 px-4 font-semibold">{restaurant.restaurant_name}</td>
                                        <td className="text-right py-3 px-4">{restaurant.order_count}</td>
                                        <td className="text-right py-3 px-4 font-bold text-green-600">£{restaurant.total_sales.toFixed(2)}</td>
                                        <td className="text-right py-3 px-4 text-orange-600">£{restaurant.total_commission.toFixed(2)}</td>
                                        <td className="text-right py-3 px-4 font-bold text-blue-600">£{restaurant.net_pay.toFixed(2)}</td>
                                        <td className="text-right py-3 px-4 text-sm">£{restaurant.payment_breakdown.cash.toFixed(2)}</td>
                                        <td className="text-right py-3 px-4 text-sm">£{(restaurant.payment_breakdown.card + restaurant.payment_breakdown.apple_pay + restaurant.payment_breakdown.google_pay).toFixed(2)}</td>
                                        <td className="text-right py-3 px-4 text-sm">£{restaurant.order_type_breakdown.delivery.toFixed(2)}</td>
                                        <td className="text-right py-3 px-4 text-sm">£{restaurant.order_type_breakdown.collection.toFixed(2)}</td>
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
                                    <td className="text-right py-3 px-4" colSpan="4"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}