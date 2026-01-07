import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
    TrendingUp, TrendingDown, DollarSign, ShoppingBag, Users, Clock, 
    Target, BarChart3, LineChart, PieChart, Loader2, Calendar, Star, Zap
} from 'lucide-react';
import { LineChart as RechartsLine, Line, BarChart as RechartsBar, Bar, PieChart as RechartsPie, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval } from 'date-fns';
import { toast } from 'sonner';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function EnhancedAnalyticsDashboard({ restaurantId }) {
    const [dateRange, setDateRange] = useState(30); // Last 30 days
    const [forecastLoading, setForecastLoading] = useState(false);
    const [forecast, setForecast] = useState(null);

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['analytics-orders', restaurantId, dateRange],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: { $in: ['delivered', 'collected'] }
        }, '-created_date', 500),
    });

    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
    });

    // Filter orders by date range
    const filteredOrders = useMemo(() => {
        const cutoffDate = subDays(new Date(), dateRange);
        return orders.filter(order => new Date(order.created_date) >= cutoffDate);
    }, [orders, dateRange]);

    // KPI Calculations
    const kpis = useMemo(() => {
        if (filteredOrders.length === 0) return null;

        const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0);
        const totalOrders = filteredOrders.length;
        const avgOrderValue = totalRevenue / totalOrders;

        // Unique customers
        const uniqueCustomers = new Set(
            filteredOrders.map(o => o.created_by || o.guest_email).filter(Boolean)
        );

        // Customer order frequency
        const customerOrders = {};
        filteredOrders.forEach(o => {
            const customer = o.created_by || o.guest_email;
            if (customer) {
                customerOrders[customer] = (customerOrders[customer] || 0) + 1;
            }
        });
        const avgOrderFrequency = Object.values(customerOrders).reduce((sum, count) => sum + count, 0) / uniqueCustomers.size;

        // Peak hours
        const hourCounts = {};
        filteredOrders.forEach(o => {
            const hour = new Date(o.created_date).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });
        const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

        // Growth rate (compare first half vs second half)
        const midpoint = Math.floor(filteredOrders.length / 2);
        const firstHalfRevenue = filteredOrders.slice(0, midpoint).reduce((sum, o) => sum + o.total, 0);
        const secondHalfRevenue = filteredOrders.slice(midpoint).reduce((sum, o) => sum + o.total, 0);
        const growthRate = ((secondHalfRevenue - firstHalfRevenue) / firstHalfRevenue) * 100;

        return {
            totalRevenue,
            totalOrders,
            avgOrderValue,
            uniqueCustomers: uniqueCustomers.size,
            avgOrderFrequency: avgOrderFrequency.toFixed(1),
            peakHour: peakHour ? `${peakHour[0]}:00 (${peakHour[1]} orders)` : 'N/A',
            growthRate: growthRate.toFixed(1)
        };
    }, [filteredOrders]);

    // Daily revenue trend
    const dailyRevenue = useMemo(() => {
        const days = eachDayOfInterval({
            start: subDays(new Date(), dateRange),
            end: new Date()
        });

        return days.map(day => {
            const dayOrders = filteredOrders.filter(o => 
                format(new Date(o.created_date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
            );
            return {
                date: format(day, 'MMM dd'),
                revenue: dayOrders.reduce((sum, o) => sum + o.total, 0),
                orders: dayOrders.length
            };
        });
    }, [filteredOrders, dateRange]);

    // Menu item performance
    const menuPerformance = useMemo(() => {
        const itemStats = {};

        filteredOrders.forEach(order => {
            order.items?.forEach(item => {
                if (!itemStats[item.menu_item_id]) {
                    itemStats[item.menu_item_id] = {
                        id: item.menu_item_id,
                        name: item.name,
                        quantity: 0,
                        revenue: 0
                    };
                }
                itemStats[item.menu_item_id].quantity += item.quantity;
                itemStats[item.menu_item_id].revenue += item.price * item.quantity;
            });
        });

        return Object.values(itemStats)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);
    }, [filteredOrders]);

    // Customer Lifetime Value
    const clvAnalysis = useMemo(() => {
        const customerData = {};

        filteredOrders.forEach(order => {
            const customer = order.created_by || order.guest_email;
            if (!customer) return;

            if (!customerData[customer]) {
                customerData[customer] = {
                    totalSpent: 0,
                    orderCount: 0,
                    firstOrder: new Date(order.created_date),
                    lastOrder: new Date(order.created_date)
                };
            }

            customerData[customer].totalSpent += order.total;
            customerData[customer].orderCount += 1;
            
            const orderDate = new Date(order.created_date);
            if (orderDate < customerData[customer].firstOrder) {
                customerData[customer].firstOrder = orderDate;
            }
            if (orderDate > customerData[customer].lastOrder) {
                customerData[customer].lastOrder = orderDate;
            }
        });

        const customerValues = Object.values(customerData).map(data => ({
            ...data,
            avgOrderValue: data.totalSpent / data.orderCount,
            lifespanDays: Math.ceil((data.lastOrder - data.firstOrder) / (1000 * 60 * 60 * 24))
        }));

        const avgCLV = customerValues.reduce((sum, c) => sum + c.totalSpent, 0) / customerValues.length;
        const avgLifespan = customerValues.reduce((sum, c) => sum + c.lifespanDays, 0) / customerValues.length;

        // Segment customers
        const segments = {
            high: customerValues.filter(c => c.totalSpent > avgCLV * 1.5).length,
            medium: customerValues.filter(c => c.totalSpent >= avgCLV * 0.5 && c.totalSpent <= avgCLV * 1.5).length,
            low: customerValues.filter(c => c.totalSpent < avgCLV * 0.5).length
        };

        return {
            avgCLV: avgCLV.toFixed(2),
            avgLifespan: avgLifespan.toFixed(0),
            totalCustomers: customerValues.length,
            segments
        };
    }, [filteredOrders]);

    // Order type distribution
    const orderTypeData = useMemo(() => {
        const delivery = filteredOrders.filter(o => o.order_type === 'delivery').length;
        const collection = filteredOrders.filter(o => o.order_type === 'collection').length;
        
        return [
            { name: 'Delivery', value: delivery },
            { name: 'Collection', value: collection }
        ];
    }, [filteredOrders]);

    // Peak hours chart data
    const peakHoursData = useMemo(() => {
        const hourCounts = Array(24).fill(0);
        filteredOrders.forEach(o => {
            const hour = new Date(o.created_date).getHours();
            hourCounts[hour]++;
        });

        return hourCounts.map((count, hour) => ({
            hour: `${hour}:00`,
            orders: count
        }));
    }, [filteredOrders]);

    // Sales Forecasting with AI
    const generateSalesForecast = async () => {
        setForecastLoading(true);
        try {
            const recentRevenue = dailyRevenue.slice(-14).map(d => d.revenue);
            const avgRevenue = recentRevenue.reduce((sum, r) => sum + r, 0) / recentRevenue.length;

            const prompt = `As a data analyst, forecast restaurant sales for the next 7 days based on this data:

Historical Revenue (last 14 days): ${recentRevenue.map(r => `£${r.toFixed(2)}`).join(', ')}
Average Daily Revenue: £${avgRevenue.toFixed(2)}
Total Orders (${dateRange} days): ${filteredOrders.length}
Growth Trend: ${kpis.growthRate}%
Peak Hour: ${kpis.peakHour}

Provide:
1. Daily revenue forecast for next 7 days
2. Confidence level (High/Medium/Low)
3. Key factors influencing the forecast
4. Recommendations to optimize sales

Return as structured data.`;

            const response = await base44.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        daily_forecasts: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    day: { type: "string" },
                                    predicted_revenue: { type: "number" },
                                    predicted_orders: { type: "number" }
                                }
                            }
                        },
                        confidence: { type: "string" },
                        factors: { type: "string" },
                        recommendations: { type: "string" }
                    }
                }
            });

            setForecast(response);
            toast.success('Sales forecast generated!');
        } catch (error) {
            toast.error('Failed to generate forecast');
        } finally {
            setForecastLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            </div>
        );
    }

    if (filteredOrders.length === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <BarChart3 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-600 mb-2">No Data Available</h3>
                    <p className="text-gray-500">Complete some orders to see analytics</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Date Range Selector */}
            <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-gray-600" />
                <div className="flex gap-2">
                    {[7, 30, 90].map(days => (
                        <Button
                            key={days}
                            variant={dateRange === days ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setDateRange(days)}
                        >
                            Last {days} days
                        </Button>
                    ))}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Revenue</p>
                                <p className="text-2xl font-bold text-gray-900">£{kpis.totalRevenue.toFixed(2)}</p>
                                <div className="flex items-center gap-1 mt-1">
                                    {parseFloat(kpis.growthRate) >= 0 ? (
                                        <TrendingUp className="h-4 w-4 text-green-600" />
                                    ) : (
                                        <TrendingDown className="h-4 w-4 text-red-600" />
                                    )}
                                    <span className={`text-sm ${parseFloat(kpis.growthRate) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {kpis.growthRate}%
                                    </span>
                                </div>
                            </div>
                            <DollarSign className="h-12 w-12 text-green-100" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Avg Order Value</p>
                                <p className="text-2xl font-bold text-gray-900">£{kpis.avgOrderValue.toFixed(2)}</p>
                                <p className="text-xs text-gray-500 mt-1">{kpis.totalOrders} orders</p>
                            </div>
                            <ShoppingBag className="h-12 w-12 text-blue-100" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Customers</p>
                                <p className="text-2xl font-bold text-gray-900">{kpis.uniqueCustomers}</p>
                                <p className="text-xs text-gray-500 mt-1">{kpis.avgOrderFrequency} avg orders</p>
                            </div>
                            <Users className="h-12 w-12 text-purple-100" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Peak Hour</p>
                                <p className="text-xl font-bold text-gray-900">{kpis.peakHour.split(' ')[0]}</p>
                                <p className="text-xs text-gray-500 mt-1">Most orders</p>
                            </div>
                            <Clock className="h-12 w-12 text-orange-100" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="trends" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="trends">
                        <LineChart className="h-4 w-4 mr-2" />
                        Trends
                    </TabsTrigger>
                    <TabsTrigger value="menu">
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Menu
                    </TabsTrigger>
                    <TabsTrigger value="customers">
                        <Users className="h-4 w-4 mr-2" />
                        Customers
                    </TabsTrigger>
                    <TabsTrigger value="forecast">
                        <Zap className="h-4 w-4 mr-2" />
                        Forecast
                    </TabsTrigger>
                    <TabsTrigger value="hours">
                        <Clock className="h-4 w-4 mr-2" />
                        Hours
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="trends" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Revenue Trend</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <RechartsLine data={dailyRevenue}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} name="Revenue (£)" />
                                    <Line type="monotone" dataKey="orders" stroke="#3b82f6" strokeWidth={2} name="Orders" />
                                </RechartsLine>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Order Type Distribution</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <RechartsPie>
                                    <Pie
                                        data={orderTypeData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                        outerRadius={100}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {orderTypeData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </RechartsPie>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="menu" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Top Performing Menu Items</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={400}>
                                <RechartsBar data={menuPerformance}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="revenue" fill="#f97316" name="Revenue (£)" />
                                    <Bar dataKey="quantity" fill="#3b82f6" name="Quantity Sold" />
                                </RechartsBar>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Item Performance Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {menuPerformance.map((item, index) => (
                                    <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <Badge className="bg-orange-500">{index + 1}</Badge>
                                            <div>
                                                <p className="font-semibold text-gray-900">{item.name}</p>
                                                <p className="text-sm text-gray-500">{item.quantity} sold</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-bold text-green-600">£{item.revenue.toFixed(2)}</p>
                                            <p className="text-xs text-gray-500">Revenue</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="customers" className="space-y-6">
                    <div className="grid md:grid-cols-3 gap-4">
                        <Card>
                            <CardContent className="pt-6">
                                <Target className="h-10 w-10 text-green-500 mb-3" />
                                <p className="text-sm text-gray-600">Avg Customer Lifetime Value</p>
                                <p className="text-3xl font-bold text-gray-900">£{clvAnalysis.avgCLV}</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-6">
                                <Clock className="h-10 w-10 text-blue-500 mb-3" />
                                <p className="text-sm text-gray-600">Avg Customer Lifespan</p>
                                <p className="text-3xl font-bold text-gray-900">{clvAnalysis.avgLifespan}</p>
                                <p className="text-xs text-gray-500">days</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-6">
                                <Users className="h-10 w-10 text-purple-500 mb-3" />
                                <p className="text-sm text-gray-600">Total Customers</p>
                                <p className="text-3xl font-bold text-gray-900">{clvAnalysis.totalCustomers}</p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Customer Segmentation</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border-2 border-green-200">
                                    <div className="flex items-center gap-3">
                                        <Star className="h-6 w-6 text-green-600" />
                                        <div>
                                            <p className="font-semibold text-gray-900">High Value</p>
                                            <p className="text-sm text-gray-600">Spent &gt; £{(parseFloat(clvAnalysis.avgCLV) * 1.5).toFixed(2)}</p>
                                        </div>
                                    </div>
                                    <Badge className="bg-green-600 text-white text-lg px-4 py-2">
                                        {clvAnalysis.segments.high} customers
                                    </Badge>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                                    <div className="flex items-center gap-3">
                                        <Users className="h-6 w-6 text-blue-600" />
                                        <div>
                                            <p className="font-semibold text-gray-900">Medium Value</p>
                                            <p className="text-sm text-gray-600">Regular customers</p>
                                        </div>
                                    </div>
                                    <Badge className="bg-blue-600 text-white text-lg px-4 py-2">
                                        {clvAnalysis.segments.medium} customers
                                    </Badge>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                                    <div className="flex items-center gap-3">
                                        <Target className="h-6 w-6 text-gray-600" />
                                        <div>
                                            <p className="font-semibold text-gray-900">Low Value</p>
                                            <p className="text-sm text-gray-600">Potential for growth</p>
                                        </div>
                                    </div>
                                    <Badge className="bg-gray-600 text-white text-lg px-4 py-2">
                                        {clvAnalysis.segments.low} customers
                                    </Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="forecast" className="space-y-6">
                    <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Zap className="h-6 w-6 text-purple-600" />
                                AI Sales Forecasting
                            </CardTitle>
                            <p className="text-sm text-gray-600">Predict future sales based on historical data and trends</p>
                        </CardHeader>
                        <CardContent>
                            {!forecast ? (
                                <Button
                                    onClick={generateSalesForecast}
                                    disabled={forecastLoading}
                                    className="bg-purple-600 hover:bg-purple-700"
                                >
                                    {forecastLoading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Generating Forecast...
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="h-4 w-4 mr-2" />
                                            Generate 7-Day Forecast
                                        </>
                                    )}
                                </Button>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <Badge className={`text-lg px-4 py-2 ${
                                            forecast.confidence === 'High' ? 'bg-green-600' :
                                            forecast.confidence === 'Medium' ? 'bg-yellow-600' : 'bg-red-600'
                                        }`}>
                                            {forecast.confidence} Confidence
                                        </Badge>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={generateSalesForecast}
                                            disabled={forecastLoading}
                                        >
                                            Regenerate
                                        </Button>
                                    </div>

                                    <div className="grid gap-2">
                                        {forecast.daily_forecasts.map((day, index) => (
                                            <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                                                <div>
                                                    <p className="font-semibold text-gray-900">{day.day}</p>
                                                    <p className="text-sm text-gray-500">{day.predicted_orders} predicted orders</p>
                                                </div>
                                                <p className="text-xl font-bold text-green-600">£{day.predicted_revenue.toFixed(2)}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                        <p className="text-sm font-semibold text-blue-900 mb-2">Key Factors</p>
                                        <p className="text-sm text-blue-800">{forecast.factors}</p>
                                    </div>

                                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                                        <p className="text-sm font-semibold text-green-900 mb-2">Recommendations</p>
                                        <p className="text-sm text-green-800">{forecast.recommendations}</p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="hours" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Order Volume by Hour</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={400}>
                                <RechartsBar data={peakHoursData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="hour" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="orders" fill="#f97316" name="Orders" />
                                </RechartsBar>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}