import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
    TrendingUp, TrendingDown, PoundSterling, ShoppingBag, Users, Clock,
    Target, BarChart3, Zap, Download, Calendar, Star,
    CreditCard, Banknote, Percent, RefreshCw, Truck, PackageX, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { generateReportPDF } from '@/lib/generatePDF';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ComposedChart
} from 'recharts';
import { format, subDays, eachDayOfInterval, startOfDay } from 'date-fns';
import { toast } from 'sonner';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const KPICard = ({ title, value, subtitle, icon: Icon, iconBg, trend, trendLabel, gradient }) => (
    <Card className={`relative overflow-hidden border-0 shadow-md ${gradient}`}>
        <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white/70 uppercase tracking-wide mb-1">{title}</p>
                    <p className="text-2xl font-bold text-white truncate">{value}</p>
                    {subtitle && <p className="text-xs text-white/60 mt-0.5">{subtitle}</p>}
                    {trend !== undefined && (
                        <div className="flex items-center gap-1 mt-2">
                            {parseFloat(trend) >= 0
                                ? <ArrowUpRight className="h-3.5 w-3.5 text-white/80" />
                                : <ArrowDownRight className="h-3.5 w-3.5 text-white/60" />}
                            <span className={`text-xs font-semibold ${parseFloat(trend) >= 0 ? 'text-white/90' : 'text-white/60'}`}>
                                {trend}% {trendLabel || ''}
                            </span>
                        </div>
                    )}
                </div>
                <div className={`p-2.5 rounded-xl ${iconBg}`}>
                    <Icon className="h-5 w-5 text-white" />
                </div>
            </div>
        </CardContent>
    </Card>
);

const StatRow = ({ label, value, valueClass = 'text-gray-900' }) => (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
        <span className="text-sm text-gray-500">{label}</span>
        <span className={`text-sm font-semibold ${valueClass}`}>{value}</span>
    </div>
);

export default function EnhancedAnalyticsDashboard({ restaurantId }) {
    const [dateRange, setDateRange] = useState(30);
    const [forecastLoading, setForecastLoading] = useState(false);
    const [forecast, setForecast] = useState(null);

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['analytics-orders', restaurantId, dateRange],
        queryFn: () => base44.entities.Order.filter({
            restaurant_id: restaurantId,
            status: { $in: ['delivered', 'collected'] }
        }, '-created_date', 500),
    });

    const { data: restaurant } = useQuery({
        queryKey: ['analytics-restaurant', restaurantId],
        queryFn: () => base44.entities.Restaurant.filter({ id: restaurantId }).then(r => r[0]),
    });

    const filteredOrders = useMemo(() => {
        const cutoff = subDays(new Date(), dateRange);
        return orders.filter(o => new Date(o.created_date) >= cutoff);
    }, [orders, dateRange]);

    const kpis = useMemo(() => {
        if (!filteredOrders.length) return null;

        const commissionRate = (restaurant?.commission_rate ?? 15) / 100;

        const totalRevenue = filteredOrders.reduce((s, o) => s + (o.total || 0), 0);
        const totalOrders = filteredOrders.length;
        const avgOrderValue = totalRevenue / totalOrders;

        // Financials
        const totalCommission = filteredOrders.reduce((s, o) => {
            if (o.platform_commission_amount) return s + o.platform_commission_amount;
            return s + (o.total || 0) * commissionRate;
        }, 0);
        const netEarnings = totalRevenue - totalCommission;

        const totalDeliveryFees = filteredOrders.reduce((s, o) => s + (o.delivery_fee || 0), 0);
        const totalDiscounts = filteredOrders.reduce((s, o) => s + (o.discount || 0), 0);

        // Payment split
        const cashOrders = filteredOrders.filter(o => o.payment_method === 'cash');
        const cardOrders = filteredOrders.filter(o => o.payment_method !== 'cash');
        const cashRevenue = cashOrders.reduce((s, o) => s + (o.total || 0), 0);
        const cardRevenue = cardOrders.reduce((s, o) => s + (o.total || 0), 0);

        // Daily averages
        const dailyAvgRevenue = totalRevenue / dateRange;
        const dailyAvgOrders = totalOrders / dateRange;
        const dailyAvgProfit = netEarnings / dateRange;

        // Unique customers
        const uniqueCustomers = new Set(filteredOrders.map(o => o.created_by || o.guest_email || o.phone).filter(Boolean));

        // Repeat customers
        const customerOrderCounts = {};
        filteredOrders.forEach(o => {
            const id = o.created_by || o.guest_email || o.phone;
            if (id) customerOrderCounts[id] = (customerOrderCounts[id] || 0) + 1;
        });
        const repeatCustomers = Object.values(customerOrderCounts).filter(c => c > 1).length;

        // Peak hour
        const hourCounts = {};
        filteredOrders.forEach(o => {
            const h = new Date(o.created_date).getHours();
            hourCounts[h] = (hourCounts[h] || 0) + 1;
        });
        const peakHourEntry = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

        // Growth rate (compare halves)
        const mid = Math.floor(filteredOrders.length / 2);
        const firstHalf = filteredOrders.slice(0, mid).reduce((s, o) => s + (o.total || 0), 0);
        const secondHalf = filteredOrders.slice(mid).reduce((s, o) => s + (o.total || 0), 0);
        const growthRate = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;

        // Order types
        const deliveryOrders = filteredOrders.filter(o => o.order_type === 'delivery').length;
        const collectionOrders = filteredOrders.filter(o => o.order_type === 'collection').length;

        return {
            totalRevenue, totalOrders, avgOrderValue,
            totalCommission, netEarnings,
            totalDeliveryFees, totalDiscounts,
            cashRevenue, cardRevenue, cashOrders: cashOrders.length, cardOrders: cardOrders.length,
            dailyAvgRevenue, dailyAvgOrders, dailyAvgProfit,
            uniqueCustomers: uniqueCustomers.size, repeatCustomers,
            avgOrderFrequency: (totalOrders / uniqueCustomers.size).toFixed(1),
            peakHour: peakHourEntry ? `${peakHourEntry[0]}:00` : 'N/A',
            peakHourOrders: peakHourEntry ? peakHourEntry[1] : 0,
            growthRate: growthRate.toFixed(1),
            deliveryOrders, collectionOrders,
            commissionRate: (commissionRate * 100).toFixed(0),
        };
    }, [filteredOrders, restaurant]);

    const dailyData = useMemo(() => {
        const days = eachDayOfInterval({ start: subDays(new Date(), Math.min(dateRange, 60)), end: new Date() });
        const commissionRate = (restaurant?.commission_rate ?? 15) / 100;

        return days.map(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const dayOrders = filteredOrders.filter(o => format(new Date(o.created_date), 'yyyy-MM-dd') === dayStr);
            const revenue = dayOrders.reduce((s, o) => s + (o.total || 0), 0);
            const commission = dayOrders.reduce((s, o) => s + (o.platform_commission_amount || (o.total || 0) * commissionRate), 0);
            return {
                date: format(day, dateRange <= 7 ? 'EEE' : 'MMM dd'),
                revenue: parseFloat(revenue.toFixed(2)),
                profit: parseFloat((revenue - commission).toFixed(2)),
                orders: dayOrders.length,
            };
        });
    }, [filteredOrders, dateRange, restaurant]);

    const menuPerformance = useMemo(() => {
        const stats = {};
        filteredOrders.forEach(order => {
            order.items?.forEach(item => {
                if (!stats[item.name]) stats[item.name] = { name: item.name, quantity: 0, revenue: 0 };
                stats[item.name].quantity += item.quantity;
                stats[item.name].revenue += (item.price || 0) * item.quantity;
            });
        });
        return Object.values(stats).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    }, [filteredOrders]);

    const orderTypeData = useMemo(() => [
        { name: 'Delivery', value: kpis?.deliveryOrders || 0 },
        { name: 'Collection', value: kpis?.collectionOrders || 0 },
    ], [kpis]);

    const paymentData = useMemo(() => [
        { name: 'Card', value: parseFloat((kpis?.cardRevenue || 0).toFixed(2)) },
        { name: 'Cash', value: parseFloat((kpis?.cashRevenue || 0).toFixed(2)) },
    ], [kpis]);

    const peakHoursData = useMemo(() => {
        const counts = Array(24).fill(0);
        filteredOrders.forEach(o => counts[new Date(o.created_date).getHours()]++);
        return counts.map((count, h) => ({ hour: `${h}:00`, orders: count }));
    }, [filteredOrders]);

    const generateForecast = async () => {
        setForecastLoading(true);
        try {
            const recent = dailyData.slice(-14).map(d => d.revenue);
            const avg = recent.reduce((s, r) => s + r, 0) / recent.length;
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `Forecast restaurant daily sales for next 7 days.
Historical Revenue (last 14 days): ${recent.map(r => `£${r}`).join(', ')}
Avg Daily: £${avg.toFixed(2)}, Total Orders (${dateRange}d): ${filteredOrders.length}, Growth: ${kpis.growthRate}%
Return structured forecast.`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        daily_forecasts: {
                            type: "array",
                            items: { type: "object", properties: { day: { type: "string" }, predicted_revenue: { type: "number" }, predicted_orders: { type: "number" } } }
                        },
                        confidence: { type: "string" },
                        factors: { type: "string" },
                        recommendations: { type: "string" }
                    }
                }
            });
            setForecast(response);
            toast.success('Forecast generated!');
        } catch {
            toast.error('Failed to generate forecast');
        } finally {
            setForecastLoading(false);
        }
    };

    const downloadPDF = () => {
        if (!kpis) return;
        generateReportPDF({
            title: 'Analytics Report', subtitle: `Last ${dateRange} days`,
            metrics: [
                { label: 'Total Revenue', value: `£${kpis.totalRevenue.toFixed(2)}` },
                { label: 'Net Earnings (after commission)', value: `£${kpis.netEarnings.toFixed(2)}` },
                { label: 'Commission Paid', value: `£${kpis.totalCommission.toFixed(2)}` },
                { label: 'Total Orders', value: kpis.totalOrders },
                { label: 'Avg Order Value', value: `£${kpis.avgOrderValue.toFixed(2)}` },
                { label: 'Daily Avg Revenue', value: `£${kpis.dailyAvgRevenue.toFixed(2)}` },
                { label: 'Daily Avg Profit', value: `£${kpis.dailyAvgProfit.toFixed(2)}` },
                { label: 'Unique Customers', value: kpis.uniqueCustomers },
            ],
            tables: [
                { title: 'Top Menu Items', headers: ['Item', 'Qty Sold', 'Revenue'], rows: menuPerformance.map(i => [i.name, i.quantity, `£${i.revenue.toFixed(2)}`]) },
            ],
            filename: `analytics-${dateRange}days.pdf`,
        });
    };

    if (isLoading) return (
        <div className="flex items-center justify-center py-20">
            <div className="text-center">
                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">Loading analytics...</p>
            </div>
        </div>
    );

    if (!filteredOrders.length) return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <BarChart3 className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700">No Data Yet</h3>
            <p className="text-sm text-gray-400 mt-1">Complete some orders to see analytics</p>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Analytics Overview</h2>
                    <p className="text-sm text-gray-500">Performance for the last {dateRange} days</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                        {[7, 30, 90].map(d => (
                            <button
                                key={d}
                                onClick={() => setDateRange(d)}
                                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-all ${
                                    dateRange === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {d}d
                            </button>
                        ))}
                    </div>
                    <Button onClick={downloadPDF} size="sm" variant="outline" className="gap-1.5">
                        <Download className="h-4 w-4" /> PDF
                    </Button>
                </div>
            </div>

            {/* Primary KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard
                    title="Gross Revenue"
                    value={`£${kpis.totalRevenue.toFixed(2)}`}
                    subtitle={`${kpis.totalOrders} orders`}
                    icon={PoundSterling}
                    iconBg="bg-white/20"
                    gradient="bg-gradient-to-br from-orange-500 to-orange-600"
                    trend={kpis.growthRate}
                    trendLabel="growth"
                />
                <KPICard
                    title="Net Earnings"
                    value={`£${kpis.netEarnings.toFixed(2)}`}
                    subtitle={`After ${kpis.commissionRate}% commission`}
                    icon={TrendingUp}
                    iconBg="bg-white/20"
                    gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
                />
                <KPICard
                    title="Commission Paid"
                    value={`£${kpis.totalCommission.toFixed(2)}`}
                    subtitle={`${kpis.commissionRate}% platform fee`}
                    icon={Percent}
                    iconBg="bg-white/20"
                    gradient="bg-gradient-to-br from-rose-500 to-rose-600"
                />
                <KPICard
                    title="Avg Order Value"
                    value={`£${kpis.avgOrderValue.toFixed(2)}`}
                    subtitle={`${kpis.uniqueCustomers} customers`}
                    icon={ShoppingBag}
                    iconBg="bg-white/20"
                    gradient="bg-gradient-to-br from-violet-500 to-violet-600"
                />
            </div>

            {/* Secondary KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard
                    title="Daily Avg Revenue"
                    value={`£${kpis.dailyAvgRevenue.toFixed(2)}`}
                    subtitle={`${kpis.dailyAvgOrders.toFixed(1)} orders/day`}
                    icon={Calendar}
                    iconBg="bg-white/20"
                    gradient="bg-gradient-to-br from-sky-500 to-sky-600"
                />
                <KPICard
                    title="Daily Avg Profit"
                    value={`£${kpis.dailyAvgProfit.toFixed(2)}`}
                    subtitle="After commission"
                    icon={Target}
                    iconBg="bg-white/20"
                    gradient="bg-gradient-to-br from-teal-500 to-teal-600"
                />
                <KPICard
                    title="Delivery Fees"
                    value={`£${kpis.totalDeliveryFees.toFixed(2)}`}
                    subtitle={`${kpis.deliveryOrders} delivery orders`}
                    icon={Truck}
                    iconBg="bg-white/20"
                    gradient="bg-gradient-to-br from-amber-500 to-amber-600"
                />
                <KPICard
                    title="Peak Hour"
                    value={kpis.peakHour}
                    subtitle={`${kpis.peakHourOrders} orders at peak`}
                    icon={Clock}
                    iconBg="bg-white/20"
                    gradient="bg-gradient-to-br from-fuchsia-500 to-fuchsia-600"
                />
            </div>

            {/* Financial Summary Card */}
            <div className="grid lg:grid-cols-3 gap-4">
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Revenue Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0">
                        <StatRow label="Gross Revenue" value={`£${kpis.totalRevenue.toFixed(2)}`} valueClass="text-gray-900" />
                        <StatRow label="Delivery Fees Collected" value={`+£${kpis.totalDeliveryFees.toFixed(2)}`} valueClass="text-blue-600" />
                        <StatRow label="Discounts Given" value={`-£${kpis.totalDiscounts.toFixed(2)}`} valueClass="text-red-500" />
                        <StatRow label="Platform Commission" value={`-£${kpis.totalCommission.toFixed(2)}`} valueClass="text-red-500" />
                        <div className="flex items-center justify-between pt-3 mt-1 border-t-2 border-gray-200">
                            <span className="text-sm font-bold text-gray-700">Net Earnings</span>
                            <span className="text-base font-bold text-emerald-600">£{kpis.netEarnings.toFixed(2)}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Payment Methods</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0">
                        <StatRow label="Card Payments" value={`£${kpis.cardRevenue.toFixed(2)}`} valueClass="text-blue-600" />
                        <StatRow label="Card Orders" value={kpis.cardOrders} />
                        <StatRow label="Cash Payments" value={`£${kpis.cashRevenue.toFixed(2)}`} valueClass="text-green-600" />
                        <StatRow label="Cash Orders" value={kpis.cashOrders} />
                        <div className="mt-3">
                            <div className="flex rounded-full overflow-hidden h-2.5 bg-gray-100">
                                <div
                                    className="bg-blue-500 transition-all"
                                    style={{ width: `${kpis.totalRevenue > 0 ? (kpis.cardRevenue / kpis.totalRevenue) * 100 : 50}%` }}
                                />
                                <div className="bg-green-500 flex-1" />
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>Card {kpis.totalRevenue > 0 ? ((kpis.cardRevenue / kpis.totalRevenue) * 100).toFixed(0) : 0}%</span>
                                <span>Cash {kpis.totalRevenue > 0 ? ((kpis.cashRevenue / kpis.totalRevenue) * 100).toFixed(0) : 0}%</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Customer Insights</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0">
                        <StatRow label="Unique Customers" value={kpis.uniqueCustomers} />
                        <StatRow label="Repeat Customers" value={kpis.repeatCustomers} valueClass="text-emerald-600" />
                        <StatRow label="Avg Orders/Customer" value={kpis.avgOrderFrequency} />
                        <StatRow label="Delivery Orders" value={kpis.deliveryOrders} />
                        <StatRow label="Collection Orders" value={kpis.collectionOrders} />
                    </CardContent>
                </Card>
            </div>

            {/* Charts Tabs */}
            <Tabs defaultValue="revenue" className="w-full">
                <TabsList className="flex flex-wrap h-auto gap-1 bg-gray-100 p-1">
                    {[
                        { value: 'revenue', label: 'Revenue & Profit' },
                        { value: 'menu', label: 'Menu Items' },
                        { value: 'distribution', label: 'Distribution' },
                        { value: 'hours', label: 'Peak Hours' },
                        { value: 'forecast', label: '🤖 AI Forecast' },
                    ].map(tab => (
                        <TabsTrigger key={tab.value} value={tab.value} className="text-xs px-3 py-1.5 rounded-md">
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {/* Revenue & Profit */}
                <TabsContent value="revenue" className="space-y-4 mt-4">
                    <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Revenue vs Net Profit (after commission)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <ComposedChart data={dailyData}>
                                    <defs>
                                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `£${v}`} />
                                    <Tooltip formatter={(v, n) => [`£${v}`, n]} />
                                    <Legend />
                                    <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} fill="url(#revGrad)" name="Revenue" />
                                    <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} fill="url(#profitGrad)" name="Net Profit" />
                                    <Bar dataKey="orders" fill="#e2e8f0" name="Orders" yAxisId={0} opacity={0.5} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Menu Items */}
                <TabsContent value="menu" className="space-y-4 mt-4">
                    <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Top 10 Items by Revenue</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {menuPerformance.map((item, i) => {
                                    const maxRevenue = menuPerformance[0]?.revenue || 1;
                                    return (
                                        <div key={item.name} className="flex items-center gap-3">
                                            <span className="w-5 text-xs font-bold text-gray-400">{i + 1}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-sm font-medium text-gray-800 truncate">{item.name}</span>
                                                    <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                                                        <span className="text-xs text-gray-400">{item.quantity} sold</span>
                                                        <span className="text-sm font-bold text-emerald-600">£{item.revenue.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all"
                                                        style={{ width: `${(item.revenue / maxRevenue) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Distribution */}
                <TabsContent value="distribution" className="space-y-4 mt-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <Card className="shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Order Type Split</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie data={orderTypeData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            labelLine={false}>
                                            {orderTypeData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Revenue by Payment Method</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie data={paymentData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            labelLine={false}>
                                            {paymentData.map((_, i) => <Cell key={i} fill={['#3b82f6', '#10b981'][i]} />)}
                                        </Pie>
                                        <Tooltip formatter={v => `£${v}`} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Peak Hours */}
                <TabsContent value="hours" className="mt-4">
                    <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Order Volume by Hour</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={peakHoursData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip />
                                    <Bar dataKey="orders" name="Orders" radius={[3, 3, 0, 0]}>
                                        {peakHoursData.map((entry, i) => (
                                            <Cell key={i} fill={entry.orders === kpis.peakHourOrders ? '#f97316' : '#fed7aa'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* AI Forecast */}
                <TabsContent value="forecast" className="mt-4">
                    <Card className="border-0 shadow-sm bg-gradient-to-br from-violet-50 to-purple-50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-violet-800">
                                <Zap className="h-5 w-5 text-violet-600" />
                                AI Sales Forecast
                            </CardTitle>
                            <p className="text-sm text-violet-600">7-day prediction based on your historical trends</p>
                        </CardHeader>
                        <CardContent>
                            {!forecast ? (
                                <Button onClick={generateForecast} disabled={forecastLoading}
                                    className="bg-violet-600 hover:bg-violet-700">
                                    {forecastLoading ? (
                                        <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Analysing data...</>
                                    ) : (
                                        <><Zap className="h-4 w-4 mr-2" />Generate 7-Day Forecast</>
                                    )}
                                </Button>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Badge className={`${forecast.confidence === 'High' ? 'bg-emerald-600' : forecast.confidence === 'Medium' ? 'bg-amber-600' : 'bg-red-600'} text-white`}>
                                            {forecast.confidence} Confidence
                                        </Badge>
                                        <Button variant="outline" size="sm" onClick={generateForecast} disabled={forecastLoading}>
                                            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                                        </Button>
                                    </div>
                                    <div className="grid gap-2">
                                        {forecast.daily_forecasts?.map((day, i) => (
                                            <div key={i} className="flex items-center justify-between p-3 bg-white rounded-xl border border-violet-100 shadow-sm">
                                                <div>
                                                    <p className="font-semibold text-gray-800 text-sm">{day.day}</p>
                                                    <p className="text-xs text-gray-400">{day.predicted_orders} predicted orders</p>
                                                </div>
                                                <p className="text-lg font-bold text-emerald-600">£{parseFloat(day.predicted_revenue).toFixed(2)}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {forecast.factors && (
                                        <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                                            <p className="text-xs font-bold text-blue-800 mb-1">Key Factors</p>
                                            <p className="text-xs text-blue-700">{forecast.factors}</p>
                                        </div>
                                    )}
                                    {forecast.recommendations && (
                                        <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                                            <p className="text-xs font-bold text-emerald-800 mb-1">Recommendations</p>
                                            <p className="text-xs text-emerald-700">{forecast.recommendations}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}