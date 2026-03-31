import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search, Filter, TrendingUp, Clock, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

const ORDER_STATUS_COLORS = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
    preparing: 'bg-orange-50 text-orange-700 border-orange-200',
    out_for_delivery: 'bg-purple-50 text-purple-700 border-purple-200',
    ready_for_collection: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    delivered: 'bg-green-50 text-green-700 border-green-200',
    collected: 'bg-green-50 text-green-700 border-green-200',
    cancelled: 'bg-red-50 text-red-700 border-red-200',
    refunded: 'bg-gray-50 text-gray-700 border-gray-200',
};

export default function OrderHistoryManagement() {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('date-desc');
    const [pageSize, setPageSize] = useState(50);

    const { data: orders = [], isLoading, error } = useQuery({
        queryKey: ['orderHistory', pageSize],
        queryFn: () => base44.entities.Order.list('-created_date', pageSize),
        staleTime: 30000,
    });

    const { data: restaurants = [] } = useQuery({
        queryKey: ['restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
        staleTime: 60000,
    });

    const restaurantMap = useMemo(() => {
        return restaurants.reduce((acc, r) => ({ ...acc, [r.id]: r }), {});
    }, [restaurants]);

    const filteredAndSortedOrders = useMemo(() => {
        let result = orders.filter(order => {
            const matchesSearch = !searchQuery || 
                order.id.includes(searchQuery) || 
                order.restaurant_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                order.customer_email?.toLowerCase().includes(searchQuery.toLowerCase());
            
            const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
            
            return matchesSearch && matchesStatus;
        });

        result.sort((a, b) => {
            switch(sortBy) {
                case 'date-desc':
                    return new Date(b.created_date) - new Date(a.created_date);
                case 'date-asc':
                    return new Date(a.created_date) - new Date(b.created_date);
                case 'total-high':
                    return (b.total || 0) - (a.total || 0);
                case 'total-low':
                    return (a.total || 0) - (b.total || 0);
                default:
                    return 0;
            }
        });

        return result;
    }, [orders, searchQuery, statusFilter, sortBy]);

    const stats = useMemo(() => {
        return {
            totalOrders: orders.length,
            totalRevenue: orders.reduce((sum, o) => sum + (o.total || 0), 0),
            avgOrderValue: orders.length > 0 ? orders.reduce((sum, o) => sum + (o.total || 0), 0) / orders.length : 0,
            completedOrders: orders.filter(o => o.status === 'delivered' || o.status === 'collected').length,
        };
    }, [orders]);

    const exportToCSV = () => {
        const headers = ['Order ID', 'Date', 'Restaurant', 'Customer', 'Total', 'Status'];
        const rows = filteredAndSortedOrders.map(order => [
            order.id,
            new Date(order.created_date).toLocaleDateString(),
            order.restaurant_name || 'N/A',
            order.customer_email || 'Guest',
            '£' + (order.total?.toFixed(2) || '0.00'),
            order.status
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success('Orders exported successfully');
    };

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm text-gray-600 mb-1">Total Orders</p>
                                <p className="text-3xl font-bold">{stats.totalOrders}</p>
                            </div>
                            <TrendingUp className="h-5 w-5 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                                <p className="text-3xl font-bold">£{stats.totalRevenue.toFixed(2)}</p>
                            </div>
                            <DollarSign className="h-5 w-5 text-green-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm text-gray-600 mb-1">Avg Order Value</p>
                                <p className="text-3xl font-bold">£{stats.avgOrderValue.toFixed(2)}</p>
                            </div>
                            <DollarSign className="h-5 w-5 text-orange-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm text-gray-600 mb-1">Completed</p>
                                <p className="text-3xl font-bold">{stats.completedOrders}</p>
                            </div>
                            <Clock className="h-5 w-5 text-purple-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters & Controls */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Order History
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search orders..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>

                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter by status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="confirmed">Confirmed</SelectItem>
                                <SelectItem value="preparing">Preparing</SelectItem>
                                <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                                <SelectItem value="delivered">Delivered</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger>
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="date-desc">Newest First</SelectItem>
                                <SelectItem value="date-asc">Oldest First</SelectItem>
                                <SelectItem value="total-high">Highest Value</SelectItem>
                                <SelectItem value="total-low">Lowest Value</SelectItem>
                            </SelectContent>
                        </Select>

                        <Button onClick={exportToCSV} variant="outline" className="gap-2">
                            <Download className="h-4 w-4" />
                            Export CSV
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Orders Table */}
            <Card>
                <CardContent className="pt-6">
                    {isLoading ? (
                        <div className="text-center py-12 text-gray-500">Loading orders...</div>
                    ) : error ? (
                        <div className="text-center py-12 text-red-500">Error loading orders</div>
                    ) : filteredAndSortedOrders.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">No orders found</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold text-left">Order ID</th>
                                        <th className="px-4 py-3 font-semibold text-left">Date</th>
                                        <th className="px-4 py-3 font-semibold text-left">Restaurant</th>
                                        <th className="px-4 py-3 font-semibold text-left">Customer</th>
                                        <th className="px-4 py-3 font-semibold text-right">Total</th>
                                        <th className="px-4 py-3 font-semibold text-left">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAndSortedOrders.map(order => (
                                        <tr key={order.id} className="border-b hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 font-mono text-xs text-gray-600">#{order.id.slice(-8)}</td>
                                            <td className="px-4 py-3 text-sm">
                                                {new Date(order.created_date).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3">{order.restaurant_name || 'N/A'}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600">
                                                {order.customer_email || 'Guest'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold">
                                                £{(order.total || 0).toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge 
                                                    variant="outline" 
                                                    className={`${ORDER_STATUS_COLORS[order.status] || 'bg-gray-50'}`}
                                                >
                                                    {order.status.replace(/_/g, ' ')}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}