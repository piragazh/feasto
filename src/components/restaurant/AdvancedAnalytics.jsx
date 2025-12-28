import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area, ComposedChart, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { 
    TrendingUp, Download, Calendar, Users, DollarSign, 
    ShoppingBag, Clock, Sparkles, Target, Activity, UtensilsCrossed,
    Tag, Truck, Star, TrendingDown
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay, differenceInDays, parseISO } from 'date-fns';
import { toast } from 'sonner';

const COLORS = ['#f97316', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#f59e0b', '#ec4899', '#14b8a6'];

export default function AdvancedAnalytics({ restaurantId }) {
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [useCustomRange, setUseCustomRange] = useState(false);
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

    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
    });

    const { data: promotions = [] } = useQuery({
        queryKey: ['promotions', restaurantId],
        queryFn: () => base44.entities.Promotion.filter({ restaurant_id: restaurantId }),
    });

    const { data: drivers = [] } = useQuery({
        queryKey: ['drivers-analytics'],
        queryFn: () => base44.entities.Driver.list(),
    });

    const { data: driverRatings = [] } = useQuery({
        queryKey: ['driver-ratings'],
        queryFn: () => base44.entities.DriverRating.list(),
    });

    const analytics = useMemo(() => {
        let startDate, endDate;
        
        if (useCustomRange && customStartDate && customEndDate) {
            startDate = parseISO(customStartDate);
            endDate = parseISO(customEndDate);
        } else {
            const days = parseInt(dateRange);
            startDate = subDays(new Date(), days);
            endDate = new Date();
        }

        const filteredOrders = orders.filter(o => {
            const orderDate = new Date(o.created_date);
            return orderDate >= startDate && orderDate <= endDate && o.status === 'delivered';
        });

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
        const daysDiff = useCustomRange ? differenceInDays(endDate, startDate) : parseInt(dateRange);
        const prevStartDate = subDays(startDate, daysDiff);
        const prevOrders = orders.filter(o => 
            new Date(o.created_date) >= prevStartDate && 
            new Date(o.created_date) < startDate &&
            o.status === 'delivered'
        );
        const prevRevenue = prevOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
        const ordersGrowth = prevOrders.length > 0 ? ((totalOrders - prevOrders.length) / prevOrders.length) * 100 : 0;

        // Menu Item Analysis
        const itemSales = {};
        filteredOrders.forEach(order => {
            order.items?.forEach(item => {
                const itemId = item.menu_item_id || item.name;
                if (!itemSales[itemId]) {
                    itemSales[itemId] = {
                        name: item.name,
                        quantity: 0,
                        revenue: 0,
                        orders: new Set()
                    };
                }
                itemSales[itemId].quantity += item.quantity || 0;
                itemSales[itemId].revenue += (item.price * item.quantity) || 0;
                itemSales[itemId].orders.add(order.id);
            });
        });

        const topItems = Object.values(itemSales)
            .map(item => ({ ...item, orders: item.orders.size }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        // Category Analysis
        const categoryMap = {};
        menuItems.forEach(item => {
            const category = item.category || 'Uncategorized';
            if (!categoryMap[category]) {
                categoryMap[category] = { category, revenue: 0, quantity: 0 };
            }
        });

        filteredOrders.forEach(order => {
            order.items?.forEach(orderItem => {
                const menuItem = menuItems.find(m => m.id === orderItem.menu_item_id || m.name === orderItem.name);
                const category = menuItem?.category || 'Uncategorized';
                if (categoryMap[category]) {
                    categoryMap[category].revenue += (orderItem.price * orderItem.quantity) || 0;
                    categoryMap[category].quantity += orderItem.quantity || 0;
                }
            });
        });

        const categoryStats = Object.values(categoryMap);

        // Promotion Performance
        const promotionPerformance = promotions.map(promo => {
            const promoOrders = filteredOrders.filter(o => 
                o.coupon_code === promo.code || 
                (o.created_date >= promo.start_date && o.created_date <= promo.end_date)
            );
            return {
                name: promo.name,
                type: promo.promotion_type,
                revenue: promo.total_revenue_generated || 0,
                discounts: promo.total_discount_given || 0,
                usage: promo.usage_count || 0,
                roi: promo.total_discount_given > 0 
                    ? ((promo.total_revenue_generated - promo.total_discount_given) / promo.total_discount_given * 100).toFixed(1)
                    : 0
            };
        });

        // Driver Performance
        const driverPerformance = drivers.map(driver => {
            const driverOrders = filteredOrders.filter(o => o.driver_id === driver.id);
            const driverRatingsList = driverRatings.filter(r => r.driver_id === driver.id);
            const avgRating = driverRatingsList.length > 0 
                ? driverRatingsList.reduce((sum, r) => sum + (r.rating || 0), 0) / driverRatingsList.length
                : driver.rating || 0;

            const deliveryTimes = driverOrders
                .filter(o => o.actual_delivery_time && o.created_date)
                .map(o => {
                    const start = new Date(o.created_date);
                    const end = new Date(o.actual_delivery_time);
                    return (end - start) / 60000; // minutes
                });

            const avgDeliveryTime = deliveryTimes.length > 0
                ? deliveryTimes.reduce((sum, t) => sum + t, 0) / deliveryTimes.length
                : 0;

            return {
                name: driver.full_name,
                totalDeliveries: driverOrders.length,
                rating: avgRating,
                avgDeliveryTime: avgDeliveryTime.toFixed(1),
                totalEarnings: driverOrders.reduce((sum, o) => sum + (o.delivery_fee || 0), 0)
            };
        }).filter(d => d.totalDeliveries > 0);

        // Peak times detailed
        const peakHour = hourlyData.reduce((max, curr) => 
            curr.orders > max.orders ? curr : max, hourlyData[0]
        );
        const peakDay = dayOfWeekData.reduce((max, curr) => 
            curr.revenue > max.revenue ? curr : max, dayOfWeekData[0]
        );

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
            customers,
            topItems,
            categoryStats,
            promotionPerformance,
            driverPerformance,
            peakHour,
            peakDay
        };
    }, [orders, dateRange, useCustomRange, customStartDate, customEndDate, menuItems, promotions, drivers, driverRatings]);

    const generateForecast = async () => {
        const forecastPromise = base44.integrations.Core.InvokeLLM({
            prompt: `Based on this sales data, forecast the next ${forecastDays} days:

Historical Data (last ${dateRange} days):
- Total Revenue: £${analytics.totalRevenue.toFixed(2)}
- Total Orders: ${analytics.totalOrders}
- Average Order Value: £${analytics.avgOrderValue.toFixed(2)}
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
        { id: 'menu', label: 'Menu Performance', icon: UtensilsCrossed },
        { id: 'promotions', label: 'Promotions', icon: Tag },
        { id: 'drivers', label: 'Driver Metrics', icon: Truck },
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
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-4 items-center justify-between">
                            <div className="flex gap-4 items-center flex-wrap">
                                <div className="flex items-center gap-2">
                                    <Checkbox 
                                        checked={useCustomRange} 
                                        onCheckedChange={setUseCustomRange}
                                    />
                                    <Label className="text-sm">Custom Range</Label>
                                </div>

                                {useCustomRange ? (
                                    <div className="flex gap-2">
                                        <Input
                                            type="date"
                                            value={customStartDate}
                                            onChange={(e) => setCustomStartDate(e.target.value)}
                                            className="w-40"
                                        />
                                        <span className="self-center">to</span>
                                        <Input
                                            type="date"
                                            value={customEndDate}
                                            onChange={(e) => setCustomEndDate(e.target.value)}
                                            className="w-40"
                                        />
                                    </div>
                                ) : (
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
                                            <SelectItem value="180">Last 6 months</SelectItem>
                                            <SelectItem value="365">Last year</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}

                                <Button onClick={exportReport} variant="outline">
                                    <Download className="h-4 w-4 mr-2" />
                                    Export
                                </Button>
                            </div>
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
                        <p className="text-3xl font-bold">£{analytics.totalRevenue.toFixed(2)}</p>
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
                        <p className="text-3xl font-bold">£{analytics.avgOrderValue.toFixed(2)}</p>
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
                                    name="Revenue (£)"
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
                                            name="Predicted Revenue (£)"
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
                                        <Bar dataKey="revenue" fill="#3b82f6" name="Revenue (£)" />
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

                {/* Menu Performance */}
                {selectedWidgets.includes('menu') && (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <UtensilsCrossed className="h-5 w-5 text-orange-500" />
                                    Top Selling Items
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={analytics.topItems.slice(0, 8)} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis type="number" />
                                        <YAxis dataKey="name" type="category" width={120} />
                                        <Tooltip />
                                        <Bar dataKey="revenue" fill="#f97316" name="Revenue (£)" />
                                    </BarChart>
                                </ResponsiveContainer>
                                <div className="mt-4 space-y-2">
                                    {analytics.topItems.slice(0, 5).map((item, i) => (
                                        <div key={i} className="flex justify-between text-sm border-b pb-2">
                                            <span className="font-medium">{item.name}</span>
                                            <div className="text-right">
                                                <span className="text-green-600 font-semibold">£{item.revenue.toFixed(2)}</span>
                                                <span className="text-gray-500 ml-2">({item.quantity} sold)</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Category Performance</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={analytics.categoryStats}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={(entry) => `${entry.category}: £${entry.revenue.toFixed(0)}`}
                                            outerRadius={90}
                                            fill="#8884d8"
                                            dataKey="revenue"
                                        >
                                            {analytics.categoryStats.map((entry, index) => (
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

                {/* Promotions Performance */}
                {selectedWidgets.includes('promotions') && analytics.promotionPerformance.length > 0 && (
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Tag className="h-5 w-5 text-purple-500" />
                                Promotion Performance
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {analytics.promotionPerformance.map((promo, i) => (
                                    <div key={i} className="border rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h4 className="font-semibold">{promo.name}</h4>
                                                <Badge variant="outline" className="mt-1 capitalize">
                                                    {promo.type.replace(/_/g, ' ')}
                                                </Badge>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm text-gray-600">ROI</p>
                                                <p className="text-xl font-bold text-purple-600">{promo.roi}%</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <p className="text-gray-600">Revenue</p>
                                                <p className="font-semibold text-green-600">£{promo.revenue.toFixed(2)}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-600">Discounts Given</p>
                                                <p className="font-semibold text-orange-600">£{promo.discounts.toFixed(2)}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-600">Usage Count</p>
                                                <p className="font-semibold">{promo.usage}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Driver Performance */}
                {selectedWidgets.includes('drivers') && analytics.driverPerformance.length > 0 && (
                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Truck className="h-5 w-5 text-blue-500" />
                                Driver Performance Metrics
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left py-2">Driver</th>
                                            <th className="text-center py-2">Deliveries</th>
                                            <th className="text-center py-2">Rating</th>
                                            <th className="text-center py-2">Avg Time</th>
                                            <th className="text-right py-2">Earnings</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analytics.driverPerformance
                                            .sort((a, b) => b.totalDeliveries - a.totalDeliveries)
                                            .map((driver, i) => (
                                                <tr key={i} className="border-b hover:bg-gray-50">
                                                    <td className="py-3 font-medium">{driver.name}</td>
                                                    <td className="text-center">{driver.totalDeliveries}</td>
                                                    <td className="text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                                            {driver.rating.toFixed(1)}
                                                        </div>
                                                    </td>
                                                    <td className="text-center">{driver.avgDeliveryTime} min</td>
                                                    <td className="text-right font-semibold text-green-600">
                                                        £{driver.totalEarnings.toFixed(2)}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Peak Times Insights */}
            {selectedWidgets.includes('trends') && (
                <Card>
                    <CardHeader>
                        <CardTitle>Peak Times Insights</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="bg-orange-50 rounded-lg p-4">
                                <p className="text-sm text-orange-700 mb-2">Busiest Hour</p>
                                <p className="text-3xl font-bold text-orange-600">
                                    {analytics.peakHour?.hour}:00
                                </p>
                                <p className="text-sm text-gray-600 mt-1">
                                    {analytics.peakHour?.orders} orders • £{analytics.peakHour?.revenue.toFixed(2)}
                                </p>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-4">
                                <p className="text-sm text-blue-700 mb-2">Best Day</p>
                                <p className="text-3xl font-bold text-blue-600">
                                    {analytics.peakDay?.day}
                                </p>
                                <p className="text-sm text-gray-600 mt-1">
                                    {analytics.peakDay?.orders} orders • £{analytics.peakDay?.revenue.toFixed(2)}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}