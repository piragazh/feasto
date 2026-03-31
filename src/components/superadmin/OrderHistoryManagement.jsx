import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';

export default function OrderHistoryManagement() {
    const [searchQuery, setSearchQuery] = useState('');
    const queryClient = useQueryClient();

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['allOrders'],
        queryFn: () => base44.entities.Order.list('-created_date', 50),
    });

    const filteredOrders = orders.filter(order =>
        !searchQuery || order.id.includes(searchQuery) || order.restaurant_name?.includes(searchQuery)
    );

    const totalRevenue = filteredOrders.reduce((sum, order) => sum + (order.total || 0), 0);

    const exportToCSV = () => {
        const headers = ['Order ID', 'Date', 'Restaurant', 'Total', 'Status'];
        const rows = filteredOrders.map(order => [
            order.id,
            order.created_date,
            order.restaurant_name || 'N/A',
            order.total?.toFixed(2) || '0.00',
            order.status
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        toast.success('Orders exported successfully');
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-gray-600">Total Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{filteredOrders.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-green-600">£{totalRevenue.toFixed(2)}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Order History
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search orders..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    <Button onClick={exportToCSV} variant="outline" className="gap-2">
                        <Download className="h-4 w-4" />
                        Export CSV
                    </Button>

                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">Loading orders...</div>
                    ) : filteredOrders.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">No orders found</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b">
                                    <tr>
                                        <th className="pb-3 font-medium text-left">Order ID</th>
                                        <th className="pb-3 font-medium text-left">Restaurant</th>
                                        <th className="pb-3 font-medium text-left">Total</th>
                                        <th className="pb-3 font-medium text-left">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredOrders.map(order => (
                                        <tr key={order.id} className="border-b hover:bg-gray-50">
                                            <td className="py-3">#{order.id.slice(-8)}</td>
                                            <td className="py-3">{order.restaurant_name || 'N/A'}</td>
                                            <td className="py-3 font-semibold">£{order.total?.toFixed(2) || '0.00'}</td>
                                            <td className="py-3">
                                                <Badge variant="outline">{order.status}</Badge>
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