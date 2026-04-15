import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
    Users, TrendingUp, ShoppingBag, DollarSign,
    Crown, UserCheck, Repeat, Star, ArrowUp, ArrowDown, Package
} from 'lucide-react';
import { format, subMonths, startOfMonth, isBefore } from 'date-fns';

const PALETTE = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

const SEGMENT_CONFIG = {
    Inactive: { color: '#94a3b8', bg: 'bg-slate-100', text: 'text-slate-600' },
    New:      { color: '#3b82f6', bg: 'bg-blue-100',  text: 'text-blue-700'  },
    Casual:   { color: '#f59e0b', bg: 'bg-amber-100', text: 'text-amber-700' },
    Regular:  { color: '#10b981', bg: 'bg-emerald-100', text: 'text-emerald-700' },
    VIP:      { color: '#f97316', bg: 'bg-orange-100', text: 'text-orange-700' },
};

function segmentFor(orders) {
    if (orders === 0) return 'Inactive';
    if (orders === 1) return 'New';
    if (orders <= 3)  return 'Casual';
    if (orders <= 8)  return 'Regular';
    return 'VIP';
}

// ── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, accent = '#f97316', trend }) {
    return (
        <Card className="relative overflow-hidden border-0 shadow-sm">
            <div className="absolute inset-0 opacity-5 rounded-xl" style={{ background: accent }} />
            <CardContent className="p-5 relative">
                <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</p>
                        <p className="text-3xl font-bold text-slate-900 leading-none">{value}</p>
                        {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
                        {trend !== undefined && (
                            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {trend >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                                {Math.abs(trend)}% vs last month
                            </div>
                        )}
                    </div>
                    <div className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ml-3" style={{ background: accent + '18' }}>
                        <Icon className="h-5 w-5" style={{ color: accent }} />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ── Custom tooltip ─────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, prefix = '', suffix = '' }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
            <p className="font-semibold text-slate-700 mb-1">{label}</p>
            {payload.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
                    <span className="text-slate-500">{p.name}:</span>
                    <span className="font-bold text-slate-800">{prefix}{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}{suffix}</span>
                </div>
            ))}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function CustomerAnalyticsDashboard() {
    const [activeSegment, setActiveSegment] = useState(null);

    const { data: customers = [], isLoading: loadingCustomers } = useQuery({
        queryKey: ['analytics-customers'],
        queryFn: () => base44.entities.Customer.list('-created_date', 500),
        staleTime: 60_000,
    });

    const { data: orders = [], isLoading: loadingOrders } = useQuery({
        queryKey: ['analytics-orders-sample'],
        queryFn: () => base44.entities.Order.list('-created_date', 500),
        staleTime: 60_000,
    });

    const { data: restaurants = [] } = useQuery({
        queryKey: ['analytics-restaurants'],
        queryFn: () => base44.entities.Restaurant.list('name', 200),
        staleTime: 60_000,
    });

    const isLoading = loadingOrders;

    const metrics = useMemo(() => {
        if (!orders.length) return null;

        const restaurantMap = {};
        for (const r of restaurants) restaurantMap[r.id] = r.name;

        // ── Derive unique customers from orders ────────────────────────────
        // If CRM customers exist, use them; otherwise build from order data
        const customerMap = {}; // keyed by phone, fallback email

        for (const o of orders) {
            const key = o.customer_phone || o.customer_email || o.guest_email;
            if (!key) continue;
            if (!customerMap[key]) {
                customerMap[key] = {
                    key,
                    name: o.guest_name || o.customer_email || o.customer_phone || 'Unknown',
                    phone: o.customer_phone || '',
                    email: o.customer_email || o.guest_email || '',
                    restaurant_id: o.restaurant_id,
                    total_orders: 0,
                    total_spent: 0,
                    first_order_date: o.created_date,
                    last_order_date: o.created_date,
                };
            }
            const c = customerMap[key];
            c.total_orders++;
            c.total_spent += (o.total || 0);
            if (o.created_date && (!c.last_order_date || o.created_date > c.last_order_date)) {
                c.last_order_date = o.created_date;
            }
            if (o.created_date && (!c.first_order_date || o.created_date < c.first_order_date)) {
                c.first_order_date = o.created_date;
            }
        }

        // Merge with CRM customers if available (CRM records take precedence for name)
        for (const c of customers) {
            const key = c.phone_number || c.email;
            if (!key) continue;
            if (customerMap[key]) {
                customerMap[key].name = c.full_name || customerMap[key].name;
            } else {
                customerMap[key] = {
                    key,
                    name: c.full_name || c.email || c.phone_number || 'Unknown',
                    phone: c.phone_number || '',
                    email: c.email || '',
                    restaurant_id: c.restaurant_id,
                    total_orders: c.total_orders || 0,
                    total_spent: 0,
                    first_order_date: c.created_date,
                    last_order_date: c.last_order_date,
                };
            }
        }

        const derivedCustomers = Object.values(customerMap);

        // ── Revenue + monthly stats ────────────────────────────────────────
        const revenueByMonth = {};
        const newCustomersByMonth = {};
        for (const c of derivedCustomers) {
            if (c.first_order_date) {
                const mk = format(new Date(c.first_order_date), 'MMM yy');
                newCustomersByMonth[mk] = (newCustomersByMonth[mk] || 0) + 1;
            }
        }
        for (const o of orders) {
            if (o.created_date) {
                const mk = format(new Date(o.created_date), 'MMM yy');
                revenueByMonth[mk] = (revenueByMonth[mk] || 0) + (o.total || 0);
            }
        }

        // ── Aggregates ─────────────────────────────────────────────────────
        const totalLTV = derivedCustomers.reduce((s, c) => s + c.total_spent, 0);
        const avgLTV = derivedCustomers.length ? totalLTV / derivedCustomers.length : 0;
        const totalOrderCount = derivedCustomers.reduce((s, c) => s + c.total_orders, 0);
        const avgOrderFreq = derivedCustomers.length ? (totalOrderCount / derivedCustomers.length).toFixed(1) : 0;
        const retained = derivedCustomers.filter(c => c.total_orders > 1).length;
        const retentionRate = derivedCustomers.length ? ((retained / derivedCustomers.length) * 100).toFixed(1) : 0;

        // ── Segments ───────────────────────────────────────────────────────
        const segments = { Inactive: 0, New: 0, Casual: 0, Regular: 0, VIP: 0 };
        for (const c of derivedCustomers) segments[segmentFor(c.total_orders)]++;
        const segmentData = Object.entries(segments).map(([name, value]) => ({ name, value }));

        // ── Trend (last 6 months) ──────────────────────────────────────────
        const now = new Date();
        const trendData = Array.from({ length: 6 }, (_, i) => {
            const month = subMonths(now, 5 - i);
            const mk = format(month, 'MMM yy');
            return { month: mk, customers: newCustomersByMonth[mk] || 0, revenue: Math.round(revenueByMonth[mk] || 0) };
        });

        // ── Frequency distribution ─────────────────────────────────────────
        const freqBuckets = { '0': 0, '1': 0, '2–3': 0, '4–8': 0, '9+': 0 };
        for (const c of derivedCustomers) {
            const n = c.total_orders;
            if (n === 0) freqBuckets['0']++;
            else if (n === 1) freqBuckets['1']++;
            else if (n <= 3) freqBuckets['2–3']++;
            else if (n <= 8) freqBuckets['4–8']++;
            else freqBuckets['9+']++;
        }
        const freqData = Object.entries(freqBuckets).map(([label, count]) => ({ label, count }));

        // ── Popular items ──────────────────────────────────────────────────
        const itemCount = {};
        for (const o of orders) {
            for (const item of (o.items || [])) {
                if (item.name) itemCount[item.name] = (itemCount[item.name] || 0) + (item.quantity || 1);
            }
        }
        const popularItems = Object.entries(itemCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name: name.length > 22 ? name.slice(0, 22) + '…' : name, count }));

        // ── Per-restaurant ─────────────────────────────────────────────────
        const perRestaurant = {};
        for (const c of derivedCustomers) {
            const rName = restaurantMap[c.restaurant_id] || 'Unknown';
            if (!perRestaurant[rName]) perRestaurant[rName] = { customers: 0, orders: 0 };
            perRestaurant[rName].customers++;
            perRestaurant[rName].orders += c.total_orders;
        }
        const restaurantData = Object.entries(perRestaurant)
            .sort((a, b) => b[1].customers - a[1].customers)
            .slice(0, 8)
            .map(([name, d]) => ({ name: name.length > 14 ? name.slice(0, 14) + '…' : name, ...d }));

        // ── Top LTV ────────────────────────────────────────────────────────
        const topLTV = derivedCustomers
            .filter(c => c.total_spent > 0)
            .sort((a, b) => b.total_spent - a.total_spent)
            .slice(0, 10)
            .map(c => ({ name: c.name, ltv: c.total_spent, orders: c.total_orders, segment: segmentFor(c.total_orders) }));

        return {
            totalCustomers: derivedCustomers.length,
            avgOrderFreq,
            avgLTV: avgLTV.toFixed(2),
            totalLTV: totalLTV.toFixed(0),
            retentionRate,
            segmentData,
            trendData,
            freqData,
            popularItems,
            restaurantData,
            topLTV,
            isDerived: customers.length === 0,
        };
    }, [customers, orders, restaurants]);

    if (isLoading && !orders.length) {
        return (
            <div className="flex items-center justify-center py-32">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm text-slate-400 font-medium">Building analytics…</p>
                </div>
            </div>
        );
    }

    if (!metrics) {
        return (
            <div className="text-center py-32">
                <div className="h-16 w-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Users className="h-8 w-8 text-slate-300" />
                </div>
                <p className="text-slate-500 font-medium">No customer data available yet.</p>
                <p className="text-sm text-slate-400 mt-1">Data will appear once customers start placing orders.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-6">
            {/* Header */}
            <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Customer Analytics</h2>
                    <p className="text-sm text-slate-500 mt-1">Platform-wide insights · customers derived from order history</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {metrics.isDerived && (
                        <Badge className="text-xs font-medium px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200">
                            Derived from orders
                        </Badge>
                    )}
                    <Badge variant="outline" className="text-xs font-medium px-3 py-1 border-slate-200 text-slate-500">
                        {metrics.totalCustomers.toLocaleString()} customers tracked
                    </Badge>
                </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
                <KpiCard label="Total Customers" value={metrics.totalCustomers.toLocaleString()} icon={Users} accent="#3b82f6" sub="across all restaurants" />
                <KpiCard label="Retention Rate" value={`${metrics.retentionRate}%`} icon={Repeat} accent="#10b981" sub="customers with 2+ orders" />
                <KpiCard label="Avg Order Frequency" value={metrics.avgOrderFreq} icon={ShoppingBag} accent="#f97316" sub="orders per customer" />
                <KpiCard label="Avg Lifetime Value" value={`£${metrics.avgLTV}`} icon={DollarSign} accent="#8b5cf6" sub="per customer" />
                <KpiCard label="Platform LTV" value={`£${Number(metrics.totalLTV).toLocaleString()}`} icon={TrendingUp} accent="#f59e0b" sub="total estimated" />
            </div>

            {/* Trend row: Acquisition + Revenue */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-blue-500" />
                            New Customer Acquisition
                        </CardTitle>
                        <CardDescription className="text-xs">Last 6 months</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={metrics.trendData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                                <defs>
                                    <linearGradient id="acqGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip content={<ChartTooltip />} />
                                <Area dataKey="customers" name="New Customers" stroke="#3b82f6" strokeWidth={2} fill="url(#acqGrad)" dot={{ r: 3, fill: '#3b82f6' }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-emerald-500" />
                            Revenue Trend
                        </CardTitle>
                        <CardDescription className="text-xs">Last 6 months (from sampled orders)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={metrics.trendData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                                <defs>
                                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
                                <Tooltip content={<ChartTooltip prefix="£" />} />
                                <Area dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={2} fill="url(#revGrad)" dot={{ r: 3, fill: '#10b981' }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Segments + Frequency */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Segments */}
                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <Users className="h-4 w-4 text-purple-500" />
                            Customer Segments
                        </CardTitle>
                        <CardDescription className="text-xs">Classified by order count</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-4">
                            <div className="w-40 h-40 flex-shrink-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={metrics.segmentData}
                                            cx="50%" cy="50%"
                                            innerRadius={44} outerRadius={68}
                                            dataKey="value"
                                            paddingAngle={3}
                                            onClick={(d) => setActiveSegment(activeSegment === d.name ? null : d.name)}
                                        >
                                            {metrics.segmentData.map((seg) => (
                                                <Cell
                                                    key={seg.name}
                                                    fill={SEGMENT_CONFIG[seg.name]?.color || '#94a3b8'}
                                                    opacity={activeSegment && activeSegment !== seg.name ? 0.35 : 1}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(v, name) => [v, name]} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex-1 space-y-2">
                                {metrics.segmentData.map((seg) => {
                                    const cfg = SEGMENT_CONFIG[seg.name] || {};
                                    const pct = metrics.totalCustomers ? ((seg.value / metrics.totalCustomers) * 100).toFixed(0) : 0;
                                    return (
                                        <button
                                            key={seg.name}
                                            onClick={() => setActiveSegment(activeSegment === seg.name ? null : seg.name)}
                                            className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all ${
                                                activeSegment === seg.name ? `${cfg.bg} ring-1 ring-inset` : 'hover:bg-slate-50'
                                            }`}
                                            style={activeSegment === seg.name ? { ringColor: cfg.color } : {}}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                                                <span className={`font-medium ${cfg.text || 'text-slate-600'}`}>{seg.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-400">{pct}%</span>
                                                <span className="font-bold text-slate-800 text-sm">{seg.value.toLocaleString()}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Frequency */}
                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <ShoppingBag className="h-4 w-4 text-orange-500" />
                            Order Frequency Distribution
                        </CardTitle>
                        <CardDescription className="text-xs">How often customers order</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={metrics.freqData} margin={{ top: 4, right: 4, bottom: 12, left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                                    axisLine={false} tickLine={false}
                                    label={{ value: 'Orders placed', position: 'insideBottom', offset: -8, fontSize: 10, fill: '#94a3b8' }}
                                />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip content={<ChartTooltip />} />
                                <Bar dataKey="count" name="Customers" radius={[5, 5, 0, 0]}>
                                    {metrics.freqData.map((_, i) => (
                                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Popular items + Restaurant breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <Package className="h-4 w-4 text-orange-500" />
                            Most Ordered Items
                        </CardTitle>
                        <CardDescription className="text-xs">Platform-wide from sampled orders</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {metrics.popularItems.length === 0 ? (
                            <p className="text-sm text-slate-400 py-10 text-center">No item data from recent orders.</p>
                        ) : (
                            <div className="space-y-2">
                                {metrics.popularItems.map((item, i) => {
                                    const maxCount = metrics.popularItems[0]?.count || 1;
                                    const pct = (item.count / maxCount) * 100;
                                    return (
                                        <div key={i} className="flex items-center gap-3">
                                            <span className="text-xs text-slate-400 w-4 text-right flex-shrink-0 font-mono">{i + 1}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-medium text-slate-700 truncate">{item.name}</span>
                                                    <span className="text-xs font-bold text-slate-900 ml-2 flex-shrink-0">{item.count.toLocaleString()}</span>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all"
                                                        style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-700">Customers by Restaurant</CardTitle>
                        <CardDescription className="text-xs">Top 8 restaurants</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={metrics.restaurantData} margin={{ top: 4, right: 4, bottom: 20, left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" />
                                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip content={<ChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                <Bar dataKey="customers" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Customers" maxBarSize={24} />
                                <Bar dataKey="orders" fill="#10b981" radius={[4, 4, 0, 0]} name="Orders" maxBarSize={24} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Top LTV customers */}
            <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <Crown className="h-4 w-4 text-amber-500" />
                        Top 10 Customers by Lifetime Value
                    </CardTitle>
                    <CardDescription className="text-xs">Highest spenders across the platform</CardDescription>
                </CardHeader>
                <CardContent>
                    {metrics.topLTV.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">No spend data available yet.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {metrics.topLTV.map((c, i) => {
                                const pct = metrics.topLTV[0]?.ltv ? (c.ltv / metrics.topLTV[0].ltv) * 100 : 0;
                                const cfg = SEGMENT_CONFIG[c.segment] || {};
                                return (
                                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                        <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-500">
                                            {i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-semibold text-slate-800 truncate">{c.name}</span>
                                                <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.text}`}>{c.segment}</span>
                                                    <span className="text-xs font-bold text-slate-900">£{c.ltv.toFixed(0)}</span>
                                                </div>
                                            </div>
                                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{ width: `${pct}%`, background: i === 0 ? '#f59e0b' : '#f97316' }}
                                                />
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-0.5">{c.orders} order{c.orders !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}