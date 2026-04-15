import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
    Users, TrendingUp, ShoppingBag, DollarSign,
    Crown, UserCheck, UserX, Repeat
} from 'lucide-react';
import { format, subMonths, startOfMonth, parseISO, isAfter, isBefore } from 'date-fns';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = 'orange' }) {
    const colorMap = {
        orange: 'bg-orange-50 text-orange-600',
        blue: 'bg-blue-50 text-blue-600',
        green: 'bg-green-50 text-green-600',
        purple: 'bg-purple-50 text-purple-600',
    };
    return (
        <Card>
            <CardContent className="p-5 flex items-center gap-4">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>
                    <Icon className="h-6 w-6" />
                </div>
                <div>
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                    <p className="text-sm font-medium text-gray-700">{label}</p>
                    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
                </div>
            </CardContent>
        </Card>
    );
}

// ── Segment badge ──────────────────────────────────────────────────────────
function segmentLabel(orders) {
    if (orders === 0) return { label: 'Inactive', color: 'bg-gray-100 text-gray-500' };
    if (orders === 1) return { label: 'New', color: 'bg-blue-100 text-blue-600' };
    if (orders <= 3) return { label: 'Casual', color: 'bg-yellow-100 text-yellow-700' };
    if (orders <= 8) return { label: 'Regular', color: 'bg-green-100 text-green-700' };
    return { label: 'VIP', color: 'bg-orange-100 text-orange-700' };
}

// ── Main component ─────────────────────────────────────────────────────────
export default function CustomerAnalyticsDashboard() {
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

    const isLoading = loadingCustomers || loadingOrders;

    // ── Derived metrics ────────────────────────────────────────────────────
    const metrics = useMemo(() => {
        if (!customers.length) return null;

        const totalOrders = customers.reduce((s, c) => s + (c.total_orders || 0), 0);
        const avgOrderFreq = customers.length ? (totalOrders / customers.length).toFixed(1) : 0;

        // LTV = total order value from orders data per customer email/phone
        const spendByPhone = {};
        const spendByEmail = {};
        for (const o of orders) {
            if (o.customer_phone) spendByPhone[o.customer_phone] = (spendByPhone[o.customer_phone] || 0) + (o.total || 0);
            if (o.customer_email) spendByEmail[o.customer_email] = (spendByEmail[o.customer_email] || 0) + (o.total || 0);
        }
        const ltvValues = customers.map(c => {
            const v = (spendByPhone[c.phone_number] || 0) + (spendByEmail[c.email] || 0);
            return Math.max(spendByPhone[c.phone_number] || 0, spendByEmail[c.email] || 0, v / 2);
        });
        const totalLTV = ltvValues.reduce((s, v) => s + v, 0);
        const avgLTV = customers.length ? totalLTV / customers.length : 0;

        // Segments
        const segments = { Inactive: 0, New: 0, Casual: 0, Regular: 0, VIP: 0 };
        for (const c of customers) {
            const { label } = segmentLabel(c.total_orders || 0);
            segments[label]++;
        }
        const segmentData = Object.entries(segments).map(([name, value]) => ({ name, value }));

        // Acquisition by month (last 6 months)
        const now = new Date();
        const acquisitionData = Array.from({ length: 6 }, (_, i) => {
            const month = subMonths(now, 5 - i);
            const label = format(month, 'MMM yy');
            const start = startOfMonth(month);
            const end = startOfMonth(subMonths(month, -1));
            const count = customers.filter(c => {
                if (!c.created_date) return false;
                const d = new Date(c.created_date);
                return !isBefore(d, start) && isBefore(d, end);
            }).length;
            return { month: label, customers: count };
        });

        // Order frequency distribution
        const freqBuckets = { '0': 0, '1': 0, '2-3': 0, '4-8': 0, '9+': 0 };
        for (const c of customers) {
            const n = c.total_orders || 0;
            if (n === 0) freqBuckets['0']++;
            else if (n === 1) freqBuckets['1']++;
            else if (n <= 3) freqBuckets['2-3']++;
            else if (n <= 8) freqBuckets['4-8']++;
            else freqBuckets['9+']++;
        }
        const freqData = Object.entries(freqBuckets).map(([label, count]) => ({ label, count }));

        // Popular items across orders (from order items)
        const itemCount = {};
        for (const o of orders) {
            for (const item of (o.items || [])) {
                if (item.name) {
                    itemCount[item.name] = (itemCount[item.name] || 0) + (item.quantity || 1);
                }
            }
        }
        const popularItems = Object.entries(itemCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, count]) => ({ name: name.length > 18 ? name.slice(0, 18) + '…' : name, count }));

        // Per-restaurant breakdown
        const restaurantMap = {};
        for (const r of restaurants) restaurantMap[r.id] = r.name;
        const perRestaurant = {};
        for (const c of customers) {
            const rName = restaurantMap[c.restaurant_id] || 'Unknown';
            if (!perRestaurant[rName]) perRestaurant[rName] = { customers: 0, orders: 0 };
            perRestaurant[rName].customers++;
            perRestaurant[rName].orders += (c.total_orders || 0);
        }
        const restaurantData = Object.entries(perRestaurant)
            .sort((a, b) => b[1].customers - a[1].customers)
            .slice(0, 8)
            .map(([name, d]) => ({ name: name.length > 14 ? name.slice(0, 14) + '…' : name, ...d }));

        // LTV segments (top 10)
        const topLTV = customers
            .map((c, i) => ({ name: c.full_name, ltv: ltvValues[i] }))
            .sort((a, b) => b.ltv - a.ltv)
            .slice(0, 10);

        return {
            totalCustomers: customers.length,
            avgOrderFreq,
            avgLTV: avgLTV.toFixed(2),
            totalLTV: totalLTV.toFixed(0),
            segmentData,
            acquisitionData,
            freqData,
            popularItems,
            restaurantData,
            topLTV,
        };
    }, [customers, orders, restaurants]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-24 text-gray-400">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm">Loading analytics...</p>
                </div>
            </div>
        );
    }

    if (!metrics) {
        return (
            <div className="text-center py-24 text-gray-400">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No customer data available yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Customer Analytics</h2>
                <p className="text-sm text-gray-500 mt-1">Insights across all restaurants · Last 500 customers & orders</p>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Customers" value={metrics.totalCustomers.toLocaleString()} icon={Users} color="blue" sub="across all restaurants" />
                <StatCard label="Avg Order Frequency" value={metrics.avgOrderFreq} icon={Repeat} color="orange" sub="orders per customer" />
                <StatCard label="Avg Lifetime Value" value={`£${metrics.avgLTV}`} icon={DollarSign} color="green" sub="per customer" />
                <StatCard label="Total Platform LTV" value={`£${Number(metrics.totalLTV).toLocaleString()}`} icon={TrendingUp} color="purple" sub="estimated" />
            </div>

            {/* Row 1: Acquisition + Frequency */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-blue-500" />
                            Customer Acquisition (Last 6 Months)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={metrics.acquisitionData} barSize={28}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                <Tooltip formatter={(v) => [v, 'New Customers']} />
                                <Bar dataKey="customers" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <ShoppingBag className="h-4 w-4 text-orange-500" />
                            Order Frequency Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={metrics.freqData} barSize={32}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} label={{ value: 'Orders', position: 'insideBottom', offset: -2, fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                <Tooltip formatter={(v) => [v, 'Customers']} />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                    {metrics.freqData.map((_, i) => (
                                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Row 2: Segments + Popular Items */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Users className="h-4 w-4 text-purple-500" />
                            Customer Segments
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center gap-6">
                        <ResponsiveContainer width="50%" height={200}>
                            <PieChart>
                                <Pie
                                    data={metrics.segmentData}
                                    cx="50%" cy="50%"
                                    innerRadius={50} outerRadius={80}
                                    dataKey="value"
                                    paddingAngle={3}
                                >
                                    {metrics.segmentData.map((_, i) => (
                                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v, name) => [v, name]} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex-1 space-y-2">
                            {metrics.segmentData.map((seg, i) => (
                                <div key={seg.name} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                                        <span className="text-gray-600">{seg.name}</span>
                                    </div>
                                    <span className="font-semibold text-gray-800">{seg.value}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Crown className="h-4 w-4 text-yellow-500" />
                            Most Ordered Items (Platform-wide)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {metrics.popularItems.length === 0 ? (
                            <p className="text-sm text-gray-400 py-8 text-center">No item data from recent orders.</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={metrics.popularItems} layout="vertical" barSize={14}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 10 }} />
                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                                    <Tooltip formatter={(v) => [v, 'Qty Ordered']} />
                                    <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Row 3: Per-restaurant + Top LTV */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Customers by Restaurant</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={metrics.restaurantData} barSize={20}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                                <Tooltip />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="customers" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Customers" />
                                <Bar dataKey="orders" fill="#10b981" radius={[3, 3, 0, 0]} name="Orders" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Crown className="h-4 w-4 text-orange-500" />
                            Top 10 Customers by Lifetime Value
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {metrics.topLTV.map((c, i) => {
                                const pct = metrics.topLTV[0]?.ltv ? (c.ltv / metrics.topLTV[0].ltv) * 100 : 0;
                                return (
                                    <div key={i} className="flex items-center gap-3">
                                        <span className="text-xs text-gray-400 w-4 text-right flex-shrink-0">{i + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className="text-xs font-medium text-gray-700 truncate">{c.name}</span>
                                                <span className="text-xs font-bold text-gray-900 ml-2 flex-shrink-0">£{c.ltv.toFixed(0)}</span>
                                            </div>
                                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-orange-400 rounded-full"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {metrics.topLTV.length === 0 && (
                                <p className="text-sm text-gray-400 text-center py-4">No spend data available.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}