import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useSEO } from '@/lib/useSEO.js';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils/index.ts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, PoundSterling, TrendingUp, Star, Users, LayoutDashboard, ArrowUpRight, ArrowDownRight, Clock, CheckCircle2, XCircle, RefreshCw, Settings, Tag } from 'lucide-react';

import { format, subDays, startOfDay } from 'date-fns';



function StatCard({ title, value, subtitle, icon: Icon, iconColor, trend }) {
    return (
        <Card className="relative overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                    <div className={`p-2.5 rounded-xl ${iconColor}`}>
                        <Icon className="h-5 w-5 text-white" />
                    </div>
                    {trend !== undefined && (
                        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${trend >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                            {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {Math.abs(trend)}%
                        </div>
                    )}
                </div>
                <p className="text-2xl font-bold text-gray-900 mb-0.5">{value}</p>
                <p className="text-sm font-medium text-gray-700">{title}</p>
                {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
            </CardContent>
        </Card>
    );
}



export default function AdminDashboard() {
    useSEO({ title: 'Admin Dashboard', noindex: true });
    const navigate = useNavigate();
    const { user, isLoadingAuth } = useAuth();
    const [activeTab, setActiveTab] = useState('overview');

    const { data: restaurants = [], isLoading: restaurantsLoading } = useQuery({
        queryKey: ['all-restaurants'],
        enabled: !isLoadingAuth && user?.role === 'admin',
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const { data: orders = [], isLoading: ordersLoading } = useQuery({
        queryKey: ['all-orders-admin'],
        enabled: !isLoadingAuth && user?.role === 'admin',
        queryFn: () => base44.entities.Order.list('-created_date', 500),
    });

    const { data: reviews = [], isLoading: reviewsLoading } = useQuery({
        queryKey: ['all-reviews-admin'],
        enabled: !isLoadingAuth && user?.role === 'admin',
        queryFn: () => base44.entities.Review.list(),
    });

    const metrics = useMemo(() => {
        const delivered = orders.filter(o => o.status === 'delivered');
        const pending = orders.filter(o => ['pending', 'confirmed', 'preparing'].includes(o.status));
        const cancelled = orders.filter(o => o.status === 'cancelled');
        const refunded = orders.filter(o => o.status === 'refunded');
        const totalRevenue = delivered.reduce((s, o) => s + (o.total || 0), 0);
        const totalOrders = delivered.length;
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        const openRestaurants = restaurants.filter(r => r.is_open).length;
        return { delivered, pending, cancelled, refunded, totalRevenue, totalOrders, avgOrderValue, openRestaurants };
    }, [orders, restaurants]);



    const restaurantStats = useMemo(() =>
        restaurants.map(r => {
            const rOrders = orders.filter(o => o.restaurant_id === r.id && o.status === 'delivered');
            const rReviews = reviews.filter(rv => rv.restaurant_id === r.id);
            const revenue = rOrders.reduce((s, o) => s + (o.total || 0), 0);
            const avgRating = rReviews.length > 0 ? rReviews.reduce((s, rv) => s + rv.rating, 0) / rReviews.length : 0;
            return { ...r, orderCount: rOrders.length, revenue, avgRating };
        }).sort((a, b) => b.revenue - a.revenue),
        [restaurants, orders, reviews]
    );

    const topRestaurants = restaurantStats.slice(0, 8);
    const maxRevenue = topRestaurants[0]?.revenue || 1;
    const isLoading = restaurantsLoading || ordersLoading || reviewsLoading;

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'restaurants', label: 'Restaurants' },
        { id: 'orders', label: 'Recent Orders' },
    ];

    const quickLinks = [
        { label: 'Manage Restaurants', to: createPageUrl('AdminRestaurants'), Icon: Building2 },
        { label: 'Restaurant Managers', to: createPageUrl('ManageRestaurantManagers'), Icon: Users },
        { label: 'Manage Coupons', to: createPageUrl('ManageCoupons'), Icon: Tag },
        { label: 'Super Admin Panel', to: createPageUrl('SuperAdmin'), Icon: Settings },
    ];

    const kpiCards = [
        { label: 'Pending', value: metrics.pending.length, color: 'text-amber-600', bg: 'bg-amber-50', Icon: Clock },
        { label: 'Cancelled', value: metrics.cancelled.length, color: 'text-red-600', bg: 'bg-red-50', Icon: XCircle },
        { label: 'Refunded', value: metrics.refunded.length, color: 'text-gray-600', bg: 'bg-gray-50', Icon: RefreshCw },
        { label: 'Total Reviews', value: reviews.length, color: 'text-yellow-600', bg: 'bg-yellow-50', Icon: Star },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 sm:px-6 py-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Live Dashboard</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white">Admin Dashboard</h1>
                            <p className="text-slate-400 text-sm mt-1">Platform-wide analytics & management</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {quickLinks.map(link => {
                                const LinkIcon = link.Icon;
                                return (
                                <Link key={link.label} to={link.to}>
                                    <Button size="sm" variant="ghost" className="bg-white/10 hover:bg-white/20 text-white border border-white/10 text-xs h-9">
                                        <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                                        {link.label}
                                    </Button>
                                </Link>
                            );
                            })}
                        </div>
                    </div>
                    <div className="flex gap-1 mt-6 border-b border-white/10">
                        {tabs.map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all ${activeTab === tab.id ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'}`}>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                {activeTab === 'overview' && (
                    <>
                        {isLoading ? (
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                {[1,2,3,4].map(i => (
                                    <Card key={i} className="border-0 shadow-sm">
                                        <CardContent className="p-5">
                                            <div className="animate-pulse space-y-3">
                                                <div className="h-10 w-10 bg-gray-200 rounded-xl" />
                                                <div className="h-7 bg-gray-200 rounded w-2/3" />
                                                <div className="h-4 bg-gray-100 rounded w-1/2" />
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                <StatCard title="Total Revenue" value={`£${metrics.totalRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} subtitle="All delivered orders" icon={PoundSterling} iconColor="bg-green-500" />
                                <StatCard title="Completed Orders" value={metrics.totalOrders.toLocaleString()} subtitle={`${metrics.pending.length} pending`} icon={CheckCircle2} iconColor="bg-blue-500" />
                                <StatCard title="Avg Order Value" value={`£${metrics.avgOrderValue.toFixed(2)}`} subtitle="Per completed order" icon={TrendingUp} iconColor="bg-purple-500" />
                                <StatCard title="Restaurants" value={restaurants.length} subtitle={`${metrics.openRestaurants} open now`} icon={Building2} iconColor="bg-orange-500" />
                            </div>
                        )}

                        {!isLoading && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                                {kpiCards.map(item => {
                                    const ItemIcon = item.Icon;
                                    return (
                                    <Card key={item.label} className={`border-0 shadow-sm ${item.bg}`}>
                                        <CardContent className="p-4 flex items-center gap-3">
                                            <ItemIcon className={`h-5 w-5 ${item.color} flex-shrink-0`} />
                                            <div>
                                                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                                                <p className="text-xs text-gray-500">{item.label}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                                })}
                            </div>
                        )}


                    </>
                )}

                {activeTab === 'restaurants' && (
                    <>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm text-gray-500">{restaurantStats.length} restaurants • sorted by revenue</p>
                            <Link to={createPageUrl('AdminRestaurants')}>
                                <Button size="sm" className="bg-orange-500 hover:bg-orange-600 h-9 text-xs">
                                    <Building2 className="h-3.5 w-3.5 mr-1.5" /> Manage All
                                </Button>
                            </Link>
                        </div>

                        <Card className="border-0 shadow-sm">
                            <CardContent className="p-0">
                                {isLoading ? (
                                    <div className="p-6 space-y-4">
                                        {[1,2,3,4,5].map(i => (
                                            <div key={i} className="animate-pulse flex items-center gap-4">
                                                <div className="h-10 w-10 bg-gray-200 rounded-full" />
                                                <div className="flex-1 space-y-2">
                                                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                                                    <div className="h-3 bg-gray-100 rounded w-1/4" />
                                                </div>
                                                <div className="h-4 bg-gray-200 rounded w-16" />
                                                <div className="h-4 bg-gray-200 rounded w-20" />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[640px]">
                                            <thead>
                                                <tr className="border-b bg-gray-50">
                                                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Restaurant</th>
                                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Orders</th>
                                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
                                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Avg Order</th>
                                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rating</th>
                                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {restaurantStats.map((r, idx) => (
                                                    <tr key={r.id} className="border-b hover:bg-orange-50/30 transition-colors">
                                                        <td className="px-5 py-3.5">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-9 w-9 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                                                    {r.logo_url ? <img src={r.logo_url} alt={r.name} className="h-full w-full object-cover" /> : <span className="text-orange-600 font-bold text-sm">{r.name[0]}</span>}
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="font-semibold text-sm text-gray-900">{r.name}</p>
                                                                        {idx < 3 && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium">Top {idx + 1}</span>}
                                                                    </div>
                                                                    <p className="text-xs text-gray-400">{r.cuisine_type || 'N/A'}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="text-right px-4 py-3.5 text-sm font-medium text-gray-700">{r.orderCount}</td>
                                                        <td className="text-right px-4 py-3.5">
                                                            <span className="text-sm font-bold text-gray-900">£{r.revenue.toFixed(2)}</span>
                                                            <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                                                                <div className="bg-orange-400 h-1 rounded-full" style={{ width: `${(r.revenue / maxRevenue) * 100}%` }} />
                                                            </div>
                                                        </td>
                                                        <td className="text-right px-4 py-3.5 text-sm text-gray-600 hidden sm:table-cell">£{r.orderCount > 0 ? (r.revenue / r.orderCount).toFixed(2) : '0.00'}</td>
                                                        <td className="text-center px-4 py-3.5">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                                                                <span className="text-sm font-medium">{r.avgRating > 0 ? r.avgRating.toFixed(1) : '—'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="text-center px-4 py-3.5">
                                                            <Badge className={`text-xs font-medium ${r.is_open ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-100'}`}>
                                                                {r.is_open ? '● Open' : '○ Closed'}
                                                            </Badge>
                                                        </td>
                                                        <td className="text-center px-4 py-3.5">
                                                            <Button size="sm" variant="outline" onClick={() => navigate(createPageUrl('RestaurantDashboard') + `?restaurantId=${r.id}`)} className="h-8 text-xs border-orange-200 text-orange-600 hover:bg-orange-50">
                                                                <LayoutDashboard className="h-3 w-3 mr-1" /> View
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {restaurantStats.length === 0 && <div className="py-12 text-center text-gray-400 text-sm">No restaurants found</div>}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}

                {activeTab === 'orders' && (
                    <Card className="border-0 shadow-sm">
                        <CardHeader className="border-b">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-semibold text-gray-700">Recent Orders (Latest 500)</CardTitle>
                                <span className="text-xs text-gray-400">{orders.length} total loaded</span>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {isLoading ? (
                                <div className="p-6 space-y-3">
                                    {[1,2,3,4,5,6,7,8].map(i => (
                                        <div key={i} className="animate-pulse flex items-center gap-4">
                                            <div className="h-4 bg-gray-200 rounded w-24" />
                                            <div className="h-4 bg-gray-100 rounded flex-1" />
                                            <div className="h-4 bg-gray-200 rounded w-16" />
                                            <div className="h-6 bg-gray-100 rounded-full w-20" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[560px]">
                                        <thead>
                                            <tr className="border-b bg-gray-50">
                                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Order</th>
                                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Restaurant</th>
                                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Type</th>
                                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                                                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orders.slice(0, 50).map(order => {
                                                const restaurant = restaurants.find(r => r.id === order.restaurant_id);
                                                const statusColors = {
                                                    pending: 'bg-amber-100 text-amber-700',
                                                    confirmed: 'bg-blue-100 text-blue-700',
                                                    preparing: 'bg-purple-100 text-purple-700',
                                                    out_for_delivery: 'bg-cyan-100 text-cyan-700',
                                                    delivered: 'bg-green-100 text-green-700',
                                                    cancelled: 'bg-red-100 text-red-700',
                                                    refunded: 'bg-gray-100 text-gray-600',
                                                    ready_for_collection: 'bg-teal-100 text-teal-700',
                                                };
                                                const statusColor = statusColors[order.status] || 'bg-gray-100 text-gray-600';
                                                return (
                                                    <tr key={order.id} className="border-b hover:bg-gray-50 transition-colors">
                                                        <td className="px-5 py-3">
                                                            <p className="text-xs font-mono text-gray-400">#{order.id?.slice(-6).toUpperCase()}</p>
                                                            {order.order_number && <p className="text-xs font-semibold text-gray-700">{order.order_number}</p>}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <p className="text-sm font-medium text-gray-800">{restaurant?.name || order.restaurant_name || '—'}</p>
                                                            <p className="text-xs text-gray-400">{order.items?.length || 0} items</p>
                                                        </td>
                                                        <td className="px-4 py-3 hidden sm:table-cell">
                                                            <span className="text-xs capitalize text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{order.order_type || 'delivery'}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className="text-sm font-bold text-gray-900">£{(order.total || 0).toFixed(2)}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <Badge className={`text-xs capitalize ${statusColor}`}>
                                                                {order.status?.replace(/_/g, ' ')}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-5 py-3 text-right text-xs text-gray-400">
                                                            {order.created_date ? format(new Date(order.created_date), 'dd MMM, HH:mm') : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {orders.length === 0 && <div className="py-12 text-center text-gray-400 text-sm">No orders found</div>}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}