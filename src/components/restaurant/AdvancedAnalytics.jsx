import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area, ComposedChart
} from 'recharts';
import { 
    TrendingUp, Download, Calendar, Users, DollarSign, 
    ShoppingBag, Clock, Sparkles, Target, Activity
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay, differenceInDays } from 'date-fns';
import { toast } from 'sonner';

const COLORS = ['#f97316', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#f59e0b'];

export default function AdvancedAnalytics({ restaurantId }) {
    const [dateRange, setDateRange] = useState('30');
    const [forecastDays, setForecastDays] = useState('7');
    const [selectedWidgets, setSelectedWidgets] = useState([
        'revenue', 'orders', 'customers', 'forecast', 'trends', 'behavior'
    ]);

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['analytics-orders', restaurantId, dateRange],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId 
        }, '-created_date', 1000),
    });

    const analytics = useMemo(() => {
        const days = parseInt(dateRange);
        const startDate = subDays(new Date(), days);
        const filteredOrders = orders.filter(o => 
            new Date(o.created_date) >= startDate && o.status === 'delivered'
        );

        // Revenue & Orders Analysis
        const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const totalOrders = filteredOrders.length;
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        // Daily breakdown
        const dailyData = {};
        filteredOrders.forEach(order => {
            const date = format(new Date(order.created_date), 'yyyy-MM-dd');
            if (!dailyData[date]) {
                dailyData[date] = { date, revenue: 0, orders: 0, customers: new Set() };
            }
            dailyData[date].revenue += order.total || 0;
            dailyData[date].orders += 1;
            dailyData[date].customers.add(order.created_by);
        });

        const dailyStats = Object.values(dailyData).map(day => ({
            ...day,
            customers: day.customers.size,
            avgOrderValue: day.orders > 0 ? day.revenue / day.orders : 0,
            formattedDate: format(new Date(day.date), 'MMM dd')
        })).sort((a, b) => a.date.localeCompare(b.date));

        // Hourly patterns
        const hourlyData = Array(24).fill(0).map((_, i) => ({ hour: i, orders: 0, revenue: 0 }));
        filteredOrders.forEach(order => {
            const hour = new Date(order.created_date).getHours();
            hourlyData[hour].orders += 1;
            hourlyData[hour].revenue += order.total || 0;
        });

        // Day of week patterns
        const dayOfWeekData = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => ({
            day,
            orders: 0,
            revenue: 0
        }));
        filteredOrders.forEach(order => {
            const day = new Date(order.created_date).getDay();
            dayOfWeekData[day].orders += 1;
            dayOfWeekData[day].revenue += order.total || 0;
        });

        // Customer behavior
        const customerData = {};
        filteredOrders.forEach(order => {
            const customer = order.created_by;
            if (!customerData[customer]) {
                customerData[customer] = {
                    orders: 0,
                    revenue: 0,
                    avgOrderValue: 0,
                    firstOrder: order.created_date,
                    lastOrder: order.created_date
                };
            }
            customerData[customer].orders += 1;
            customerData[customer].revenue += order.total || 0;
            customerData[customer].lastOrder = order.created_date;
        });

        const customers = Object.values(customerData).map(c => ({
            ...c,
            avgOrderValue: c.orders > 0 ? c.revenue / c.orders : 0
        }));

        const uniqueCustomers = customers.length;
        const repeatCustomers = customers.filter(c => c.orders > 1).length;
        const repeatRate = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0;

        // Customer segments
        const segments = {
            new: customers.filter(c => c.orders === 1).length,
            occasional: customers.filter(c => c.orders >= 2 && c.orders <= 5).length,
            frequent: customers.filter(c => c.orders >= 6 && c.orders <= 10).length,
            vip: customers.filter(c => c.orders > 10).length
        };

        // Payment methods
        const paymentMethods = {};
        filteredOrders.forEach(order => {
            const method = order.payment_method || 'cash';
            paymentMethods[method] = (paymentMethods[method] || 0) + 1;
        });

        const paymentData = Object.entries(paymentMethods).map(([name, value]) => ({
            name: name.replace('_', ' ').toUpperCase(),
            value
        }));

        // Previous period comparison
        const prevStartDate = subDays(startDate, days);
        const prevOrders = orders.filter(o => 
            new Date(o.created_date) >= prevStartDate && 
            new Date(o.created_date) < startDate &&
            o.status === 'delivered'
        );
        const prevRevenue = prevOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
        const ordersGrowth = prevOrders.length > 0 ? ((totalOrders - prevOrders.length) / prevOrders.length) * 100 : 0;

        return {
            totalRevenue,
            totalOrders,
            avgOrderValue,
            uniqueCustomers,
            repeatRate,
            revenueGrowth,
            ordersGrowth,
            dailyStats,
            hourlyData,
            dayOfWeekData,
            segments,
            paymentData,
            customers
        };
    }, [orders, dateRange]);

    const generateForecast = async () => {
        const forecastPromise = base44.integrations.Core.InvokeLLM({
            prompt: `Based on this sales data, forecast the next ${forecastDays} days:

Historical Data (last ${dateRange} days):
- Total Revenue: $${analytics.totalRevenue.toFixed(2)}
- Total Orders: ${analytics.totalOrders}
- Average Order Value: $${analytics.avgOrderValue.toFixed(2)}
- Daily Stats: ${JSON.stringify(analytics.dailyStats.slice(-7))}

Consider:
- Day of week patterns: ${JSON.stringify(analytics.dayOfWeekData)}
- Recent trends
- Seasonal factors

Provide daily forecasts with revenue and order count predictions.`,
            response_json_schema: {
                type: "object",
                properties: {
                    forecast: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                day: { type: "string" },
                                predicted_revenue: { type: "number" },
                                predicted_orders: { type: "number" },
                                confidence: { type: "string" }
                            }
                        }
                    },
                    insights: { type: "string" }
                }
            }
        });

        toast.promise(forecastPromise, {
            loading: 'Generating forecast...',
            success: (data) => {
                setForecastData(data);
                return 'Forecast generated!';
            },
            error: 'Failed to generate forecast'
        });
    };

    const [forecastData, setForecastData] = useState(null);

    const exportReport = () => {
        const report = {
            restaurant_id: restaurantId,
            date_range: `${dateRange} days`,
            generated_at: new Date().toISOString(),
            summary: {
                total_revenue: analytics.totalRevenue,
                total_orders: analytics.totalOrders,
                avg_order_value: analytics.avgOrderValue,
                unique_customers: analytics.uniqueCustomers,
                repeat_rate: analytics.repeatRate,
                revenue_growth: analytics.revenueGrowth,
                orders_growth: analytics.ordersGrowth
            },
            daily_stats: analytics.dailyStats,
            customer_segments: analytics.segments,
            payment_methods: analytics.paymentData
        };

        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-report-${format(new Date(), 'yyyy-MM-dd')}.json`;
        a.click();
        toast.success('Report exported!');
    };

    const toggleWidget = (widget) => {
        setSelectedWidgets(prev => 
            prev.includes(widget) 
                ? prev.filter(w => w !== widget)
                : [...prev, widget]
        );
    };

    const widgets = [
        { id: 'revenue', label: 'Revenue Overview', icon: DollarSign },
        { id: 'orders', label: 'Order Trends', icon: ShoppingBag },
        { id: 'customers', label: 'Customer Insights', icon: Users },
        { id: 'forecast', label: 'Sales Forecast', icon: TrendingUp },
        { id: 'trends', label: 'Time Patterns', icon: Clock },
        { id: 'behavior', label: 'Customer Behavior', icon: Activity }
    ];

    if (isLoading) {
        return <div className="text-center py-8">Loading analytics...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Controls */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex gap-4 items-center">
                            <Select value={dateRange} onValueChange={setDateRange}>
                                <SelectTrigger className="w-40">
                                    <Calendar className="h-4 w-4 mr-2" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="7">Last 7 days</SelectItem>
                                    <SelectItem value="30">Last 30 days</SelectItem>
                                    <SelectItem value="60">Last 60 days</SelectItem>
                                    <SelectItem value="90">Last 90 days</SelectItem>
                                </SelectContent>
                            </Select>

                            <Button onClick={exportReport} variant="outline">
                                <Download className="h-4 w-4 mr-2" />
                                Export Report
                            </Button>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                            {widgets.map(widget => (
                                <Badge
                                    key={widget.id}
                                    variant={selectedWidgets.includes(widget.id) ? 'default' : 'outline'}
                                    className="cursor-pointer"
                                    onClick={() => toggleWidget(widget.id)}
                                >
                                    <widget.icon className="h-3 w-3 mr-1" />
                                    {widget.label}
                                </Badge>
                            ))}
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
                        <p className="text-3xl font-bold">${analytics.totalRevenue.toFixed(2)}</p>
                        <p className="text-xs text-gray-500 mt-1">
                            <span className={analytics.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {analytics.revenueGrowth >= 0 ? '+' : ''}{analytics.revenueGrowth.toFixed(1)}%
                            </span> vs previous period
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Total Orders</span>
                            <ShoppingBag className="h-5 w-5 text-blue-500" />
                        </div>
                        <p className="text-3xl font-bold">{analytics.totalOrders}</p>
                        <p className="text-xs text-gray-500 mt-1">
                            <span className={analytics.ordersGrowth >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {analytics.ordersGrowth >= 0 ? '+' : ''}{analytics.ordersGrowth.toFixed(1)}%
                            </span> vs previous period
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Avg Order Value</span>
                            <Target className="h-5 w-5 text-purple-500" />
                        </div>
                        <p className="text-3xl font-bold">${analytics.avgOrderValue.toFixed(2)}</p>
                        <p className="text-xs text-gray-500 mt-1">Per order</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Repeat Rate</span>
                            <Users className="h-5 w-5 text-orange-500" />
                        </div>
                        <p className="text-3xl font-bold">{analytics.repeatRate.toFixed(0)}%</p>
                        <p className="text-xs text-gray-500 mt-1">{analytics.uniqueCustomers} unique customers</p>
                    </CardContent>
                </Card>
            </div>

            {/* Revenue Chart */}
            {selectedWidgets.includes('revenue') && (
                <Card>
                    <CardHeader>
                        <CardTitle>Revenue & Orders Trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <ComposedChart data={analytics.dailyStats}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="formattedDate" />
                                <YAxis yAxisId="left" />
                                <YAxis yAxisId="right" orientation="right" />
                                <Tooltip />
                                <Legend />
                                <Area 
                                    yAxisId="left"
                                    type="monotone" 
                                    dataKey="revenue" 
                                    fill="#f97316" 
                                    stroke="#f97316" 
                                    fillOpacity={0.3}
                                    name="Revenue ($)"
                                />
                                <Bar 
                                    yAxisId="right"
                                    dataKey="orders" 
                                    fill="#3b82f6" 
                                    name="Orders"
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            {/* Forecast */}
            {selectedWidgets.includes('forecast') && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-purple-500" />
                                Sales Forecast
                            </CardTitle>
                            <div className="flex gap-2">
                                <Select value={forecastDays} onValueChange={setForecastDays}>
                                    <SelectTrigger className="w-32">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="7">7 days</SelectItem>
                                        <SelectItem value="14">14 days</SelectItem>
                                        <SelectItem value="30">30 days</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button onClick={generateForecast}>Generate</Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {forecastData ? (
                            <>
                                <p className="text-sm text-gray-600 mb-4">{forecastData.insights}</p>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={forecastData.forecast}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="day" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Line 
                                            type="monotone" 
                                            dataKey="predicted_revenue" 
                                            stroke="#8b5cf6" 
                                            strokeWidth={2}
                                            name="Predicted Revenue ($)"
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="predicted_orders" 
                                            stroke="#10b981" 
                                            strokeWidth={2}
                                            name="Predicted Orders"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </>
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                Click Generate to see AI-powered sales forecast
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <div className="grid md:grid-cols-2 gap-6">
                {/* Time Patterns */}
                {selectedWidgets.includes('trends') && (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>Peak Hours</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={analytics.hourlyData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="hour" />
                                        <YAxis />
                                        <Tooltip />
                                        <Bar dataKey="orders" fill="#f97316" name="Orders" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Day of Week Performance</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={analytics.dayOfWeekData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="day" />
                                        <YAxis />
                                        <Tooltip />
                                        <Bar dataKey="revenue" fill="#3b82f6" name="Revenue ($)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </>
                )}

                {/* Customer Insights */}
                {selectedWidgets.includes('behavior') && (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>Customer Segments</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={250}>
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'New (1 order)', value: analytics.segments.new },
                                                { name: 'Occasional (2-5)', value: analytics.segments.occasional },
                                                { name: 'Frequent (6-10)', value: analytics.segments.frequent },
                                                { name: 'VIP (10+)', value: analytics.segments.vip }
                                            ]}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={(entry) => `${entry.name}: ${entry.value}`}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {COLORS.map((color, index) => (
                                                <Cell key={`cell-${index}`} fill={color} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Payment Methods</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={250}>
                                    <PieChart>
                                        <Pie
                                            data={analytics.paymentData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={(entry) => `${entry.name}: ${entry.value}`}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {analytics.paymentData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </div>
    );
}