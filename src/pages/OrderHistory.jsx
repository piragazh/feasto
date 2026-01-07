import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Search, Filter, ArrowLeft, Package, DollarSign, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

export default function OrderHistory() {
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState('all'); // all, today, week, month, year

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['orderHistory'],
        queryFn: async () => {
            const allOrders = await base44.entities.Order.list('-created_date');
            return allOrders.filter(order => order && order.id);
        },
        refetchInterval: 30000,
    });

    const statusConfig = {
        pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
        confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-800', icon: '✓' },
        preparing: { label: 'Preparing', color: 'bg-purple-100 text-purple-800', icon: '👨‍🍳' },
        out_for_delivery: { label: 'Out for Delivery', color: 'bg-indigo-100 text-indigo-800', icon: '🚚' },
        ready_for_collection: { label: 'Ready', color: 'bg-green-100 text-green-800', icon: '📦' },
        delivered: { label: 'Delivered', color: 'bg-green-100 text-green-800', icon: '✓' },
        collected: { label: 'Collected', color: 'bg-green-100 text-green-800', icon: '✓' },
        cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800', icon: '✗' },
    };

    const filterByDate = (order) => {
        if (dateFilter === 'all') return true;
        
        const orderDate = new Date(order.created_date);
        const now = new Date();
        const dayStart = new Date(now.setHours(0, 0, 0, 0));
        const weekStart = new Date(now.setDate(now.getDate() - 7));
        const monthStart = new Date(now.setMonth(now.getMonth() - 1));
        const yearStart = new Date(now.setFullYear(now.getFullYear() - 1));

        switch (dateFilter) {
            case 'today':
                return orderDate >= dayStart;
            case 'week':
                return orderDate >= weekStart;
            case 'month':
                return orderDate >= monthStart;
            case 'year':
                return orderDate >= yearStart;
            default:
                return true;
        }
    };

    const filteredOrders = orders.filter(order => {
        const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
        const matchesSearch = !searchQuery || 
            order.restaurant_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.id?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesDate = filterByDate(order);

        return matchesStatus && matchesSearch && matchesDate;
    });

    const totalSpent = filteredOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const totalOrders = filteredOrders.length;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-4">
                        <Link to={createPageUrl('Orders')}>
                            <Button size="icon" variant="ghost" className="rounded-full">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Order History</h1>
                            <p className="text-sm text-gray-500">View and manage all your past orders</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 py-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                                    <Package className="h-5 w-5 text-orange-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Total Orders</p>
                                    <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                    <DollarSign className="h-5 w-5 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Total Spent</p>
                                    <p className="text-2xl font-bold text-gray-900">£{totalSpent.toFixed(2)}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                    <Clock className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Avg. Order Value</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        £{totalOrders > 0 ? (totalSpent / totalOrders).toFixed(2) : '0.00'}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters */}
                <Card className="mb-6">
                    <CardContent className="p-4">
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search by restaurant or order ID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10"
                                />
                            </div>

                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-full md:w-48">
                                    <SelectValue placeholder="Filter by status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="confirmed">Confirmed</SelectItem>
                                    <SelectItem value="preparing">Preparing</SelectItem>
                                    <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                                    <SelectItem value="ready_for_collection">Ready for Collection</SelectItem>
                                    <SelectItem value="delivered">Delivered</SelectItem>
                                    <SelectItem value="collected">Collected</SelectItem>
                                    <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={dateFilter} onValueChange={setDateFilter}>
                                <SelectTrigger className="w-full md:w-48">
                                    <SelectValue placeholder="Filter by date" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Time</SelectItem>
                                    <SelectItem value="today">Today</SelectItem>
                                    <SelectItem value="week">Last 7 Days</SelectItem>
                                    <SelectItem value="month">Last Month</SelectItem>
                                    <SelectItem value="year">Last Year</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Orders List */}
                {isLoading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(n => (
                            <Skeleton key={n} className="h-48 w-full" />
                        ))}
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Orders Found</h3>
                            <p className="text-gray-500 mb-4">
                                {searchQuery || statusFilter !== 'all' || dateFilter !== 'all'
                                    ? 'Try adjusting your filters'
                                    : "You haven't placed any orders yet"}
                            </p>
                            <Link to={createPageUrl('Home')}>
                                <Button>Browse Restaurants</Button>
                            </Link>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {filteredOrders.map((order, idx) => (
                            <motion.div
                                key={order.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                            >
                                <Card className="hover:shadow-lg transition-shadow">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <CardTitle className="text-lg">{order.restaurant_name}</CardTitle>
                                                    {order.order_type === 'collection' && (
                                                        <Badge variant="outline" className="text-xs">
                                                            🏪 Collection
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="h-4 w-4" />
                                                        {format(new Date(order.created_date), 'PPP')}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="h-4 w-4" />
                                                        {format(new Date(order.created_date), 'p')}
                                                    </div>
                                                    <div className="text-xs text-gray-400">
                                                        ID: {order.id?.slice(-8)}
                                                    </div>
                                                </div>
                                            </div>
                                            <Badge className={statusConfig[order.status]?.color || 'bg-gray-100'}>
                                                {statusConfig[order.status]?.icon} {statusConfig[order.status]?.label || order.status}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {/* Items */}
                                            <div className="space-y-1">
                                                {order.items?.map((item, itemIdx) => (
                                                    <div key={itemIdx} className="flex justify-between text-sm">
                                                        <span className="text-gray-700">
                                                            {item.quantity}x {item.name}
                                                        </span>
                                                        <span className="text-gray-900">
                                                            £{(item.price * item.quantity).toFixed(2)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Total */}
                                            <div className="flex justify-between items-center pt-3 border-t">
                                                <span className="font-semibold text-gray-900">Total</span>
                                                <span className="text-xl font-bold text-orange-600">
                                                    £{order.total?.toFixed(2)}
                                                </span>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2 pt-2">
                                                <Link to={createPageUrl('TrackOrder') + `?orderId=${order.id}`} className="flex-1">
                                                    <Button variant="outline" className="w-full">
                                                        View Details
                                                    </Button>
                                                </Link>
                                                {(order.status === 'delivered' || order.status === 'collected') && (
                                                    <Link to={createPageUrl('Restaurant') + `?id=${order.restaurant_id}`} className="flex-1">
                                                        <Button className="w-full bg-orange-500 hover:bg-orange-600">
                                                            Reorder
                                                        </Button>
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}