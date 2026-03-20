import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Search, Calendar as CalendarIcon, Filter, Eye, FileDown, Trash2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function OrderHistoryManagement() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRestaurant, setSelectedRestaurant] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [dateFrom, setDateFrom] = useState(null);
    const [dateTo, setDateTo] = useState(null);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showOrderDetails, setShowOrderDetails] = useState(false);
    const [selectedOrders, setSelectedOrders] = useState([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [orderToDelete, setOrderToDelete] = useState(null);
    
    const queryClient = useQueryClient();

    const { data: orders = [], isLoading: ordersLoading } = useQuery({
        queryKey: ['allOrders'],
        queryFn: () => base44.entities.Order.list('-created_date', 1000),
    });

    const { data: restaurants = [] } = useQuery({
        queryKey: ['restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const statusConfig = {
        pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
        confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-800' },
        preparing: { label: 'Preparing', color: 'bg-purple-100 text-purple-800' },
        out_for_delivery: { label: 'Out for Delivery', color: 'bg-indigo-100 text-indigo-800' },
        ready_for_collection: { label: 'Ready for Collection', color: 'bg-green-100 text-green-800' },
        delivered: { label: 'Delivered', color: 'bg-green-100 text-green-800' },
        collected: { label: 'Collected', color: 'bg-green-100 text-green-800' },
        cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
        refunded: { label: 'Refunded', color: 'bg-gray-100 text-gray-800' },
    };

    const filteredOrders = orders.filter(order => {
        const matchesSearch = !searchQuery || 
            order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.restaurant_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.created_by?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.guest_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.guest_email?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesRestaurant = selectedRestaurant === 'all' || order.restaurant_id === selectedRestaurant;
        const matchesStatus = selectedStatus === 'all' || order.status === selectedStatus;

        const orderDate = new Date(order.created_date);
        const matchesDateFrom = !dateFrom || orderDate >= dateFrom;
        const matchesDateTo = !dateTo || orderDate <= dateTo;

        return matchesSearch && matchesRestaurant && matchesStatus && matchesDateFrom && matchesDateTo;
    });

    const totalRevenue = filteredOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const totalOrders = filteredOrders.length;

    const exportToCSV = () => {
        const headers = ['Order ID', 'Date', 'Restaurant', 'Customer', 'Items', 'Total', 'Status', 'Payment Method', 'Type'];
        const rows = filteredOrders.map(order => [
            order.id,
            format(new Date(order.created_date), 'yyyy-MM-dd HH:mm'),
            order.restaurant_name || 'N/A',
            order.created_by || order.guest_email || 'Guest',
            order.items?.length || 0,
            order.total?.toFixed(2) || '0.00',
            order.status,
            order.payment_method || 'N/A',
            order.order_type || 'delivery'
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        toast.success('Orders exported successfully');
    };

    const exportToJSON = () => {
        const data = filteredOrders.map(order => ({
            id: order.id,
            date: order.created_date,
            restaurant: order.restaurant_name,
            customer: order.created_by || order.guest_email,
            items: order.items,
            total: order.total,
            status: order.status,
            payment_method: order.payment_method,
            delivery_address: order.delivery_address,
            phone: order.phone,
            order_type: order.order_type
        }));

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
        a.click();
        toast.success('Orders backup created successfully');
    };

    const viewOrderDetails = (order) => {
        setSelectedOrder(order);
        setShowOrderDetails(true);
    };

    const deleteMutation = useMutation({
        mutationFn: async (orderIds) => {
            const deletePromises = orderIds.map(id => base44.entities.Order.delete(id));
            await Promise.all(deletePromises);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['allOrders'] });
            setSelectedOrders([]);
            setShowDeleteConfirm(false);
            setOrderToDelete(null);
            toast.success('Order(s) deleted successfully');
        },
        onError: (error) => {
            toast.error('Failed to delete order(s)');
            console.error(error);
        }
    });

    const handleDeleteSingle = (order) => {
        setOrderToDelete(order);
        setShowDeleteConfirm(true);
    };

    const handleDeleteMultiple = () => {
        if (selectedOrders.length === 0) {
            toast.error('Please select orders to delete');
            return;
        }
        setShowDeleteConfirm(true);
    };

    const confirmDelete = () => {
        const idsToDelete = orderToDelete ? [orderToDelete.id] : selectedOrders;
        deleteMutation.mutate(idsToDelete);
    };

    const toggleOrderSelection = (orderId) => {
        setSelectedOrders(prev => 
            prev.includes(orderId) 
                ? prev.filter(id => id !== orderId)
                : [...prev, orderId]
        );
    };

    const toggleSelectAll = () => {
        if (selectedOrders.length === filteredOrders.length) {
            setSelectedOrders([]);
        } else {
            setSelectedOrders(filteredOrders.map(o => o.id));
        }
    };

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-gray-600">Total Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{totalOrders}</div>
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
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-gray-600">Average Order Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">£{totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : '0.00'}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Filters & Export
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search orders..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>

                        <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Restaurants" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Restaurants</SelectItem>
                                {restaurants.map(r => (
                                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Statuses" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                {Object.keys(statusConfig).map(status => (
                                    <SelectItem key={status} value={status}>{statusConfig[status].label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="justify-start">
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateFrom ? format(dateFrom, 'MMM dd') : 'From Date'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} />
                            </PopoverContent>
                        </Popover>

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="justify-start">
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateTo ? format(dateTo, 'MMM dd') : 'To Date'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        <Button onClick={exportToCSV} variant="outline" className="gap-2">
                            <Download className="h-4 w-4" />
                            Export CSV
                        </Button>
                        <Button onClick={exportToJSON} variant="outline" className="gap-2">
                            <FileDown className="h-4 w-4" />
                            Backup JSON
                        </Button>
                        {selectedOrders.length > 0 && (
                            <Button 
                                onClick={handleDeleteMultiple} 
                                variant="destructive" 
                                className="gap-2"
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete Selected ({selectedOrders.length})
                            </Button>
                        )}
                        <Button 
                            onClick={() => {
                                setSearchQuery('');
                                setSelectedRestaurant('all');
                                setSelectedStatus('all');
                                setDateFrom(null);
                                setDateTo(null);
                                setSelectedOrders([]);
                            }}
                            variant="ghost"
                        >
                            Clear Filters
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Orders Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Order History ({filteredOrders.length} orders)</CardTitle>
                </CardHeader>
                <CardContent>
                    {ordersLoading ? (
                        <div className="text-center py-8 text-gray-500">Loading orders...</div>
                    ) : filteredOrders.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">No orders found</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="border-b">
                                    <tr className="text-left text-sm text-gray-600">
                                        <th className="pb-3 font-medium w-12">
                                            <Checkbox
                                                checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                                                onCheckedChange={toggleSelectAll}
                                            />
                                        </th>
                                        <th className="pb-3 font-medium">Order ID</th>
                                        <th className="pb-3 font-medium">Date</th>
                                        <th className="pb-3 font-medium">Restaurant</th>
                                        <th className="pb-3 font-medium">Customer</th>
                                        <th className="pb-3 font-medium">Items</th>
                                        <th className="pb-3 font-medium">Total</th>
                                        <th className="pb-3 font-medium">Type</th>
                                        <th className="pb-3 font-medium">Payment</th>
                                        <th className="pb-3 font-medium">Status</th>
                                        <th className="pb-3 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredOrders.map(order => (
                                        <tr key={order.id} className="border-b hover:bg-gray-50">
                                            <td className="py-3">
                                                <Checkbox
                                                    checked={selectedOrders.includes(order.id)}
                                                    onCheckedChange={() => toggleOrderSelection(order.id)}
                                                />
                                            </td>
                                            <td className="py-3 text-sm font-mono">#{order.id.slice(-8)}</td>
                                            <td className="py-3 text-sm">{format(new Date(order.created_date), 'MMM dd, yyyy HH:mm')}</td>
                                            <td className="py-3 text-sm font-medium">{order.restaurant_name || 'N/A'}</td>
                                            <td className="py-3 text-sm">{order.created_by || order.guest_email || 'Guest'}</td>
                                            <td className="py-3 text-sm">{order.items?.length || 0} items</td>
                                            <td className="py-3 text-sm font-semibold">£{order.total?.toFixed(2) || '0.00'}</td>
                                            <td className="py-3">
                                                <Badge variant="outline" className="capitalize">
                                                    {order.order_type === 'collection' ? '🏪 Collection' : '🚚 Delivery'}
                                                </Badge>
                                            </td>
                                            <td className="py-3 text-sm capitalize">{order.payment_method || 'N/A'}</td>
                                            <td className="py-3">
                                                <Badge className={statusConfig[order.status]?.color || 'bg-gray-100'}>
                                                    {statusConfig[order.status]?.label || order.status}
                                                </Badge>
                                            </td>
                                            <td className="py-3">
                                                <div className="flex gap-1">
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        onClick={() => viewOrderDetails(order)}
                                                        className="gap-1"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                        View
                                                    </Button>
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        onClick={() => handleDeleteSingle(order)}
                                                        className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-5 w-5" />
                            Confirm Delete
                        </DialogTitle>
                        <DialogDescription>
                            {orderToDelete ? (
                                <>
                                    Are you sure you want to permanently delete order <strong>#{orderToDelete.id.slice(-8)}</strong>? 
                                    This action cannot be undone.
                                </>
                            ) : (
                                <>
                                    Are you sure you want to permanently delete <strong>{selectedOrders.length}</strong> selected order(s)? 
                                    This action cannot be undone.
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowDeleteConfirm(false);
                                setOrderToDelete(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDelete}
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Order Details Dialog */}
            <Dialog open={showOrderDetails} onOpenChange={setShowOrderDetails}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Order Details - #{selectedOrder?.id.slice(-8)}</DialogTitle>
                    </DialogHeader>
                    {selectedOrder && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-gray-600">Date</p>
                                    <p className="font-medium">{format(new Date(selectedOrder.created_date), 'PPpp')}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Status</p>
                                    <Badge className={statusConfig[selectedOrder.status]?.color}>
                                        {statusConfig[selectedOrder.status]?.label}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Restaurant</p>
                                    <p className="font-medium">{selectedOrder.restaurant_name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Customer</p>
                                    <p className="font-medium">{selectedOrder.created_by || selectedOrder.guest_email || 'Guest'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Phone</p>
                                    <p className="font-medium">{selectedOrder.phone}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Order Type</p>
                                    <p className="font-medium capitalize">{selectedOrder.order_type || 'delivery'}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-sm text-gray-600">Delivery Address</p>
                                    <p className="font-medium">{selectedOrder.delivery_address}</p>
                                </div>
                            </div>

                            <div>
                                <p className="text-sm text-gray-600 mb-2">Items</p>
                                <div className="space-y-3">
                                    {selectedOrder.items?.map((item, idx) => (
                                        <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-medium">{item.quantity}x {item.name}</span>
                                                <span className="font-semibold">£{(item.price * item.quantity).toFixed(2)}</span>
                                            </div>
                                            {item.customizations && Object.keys(item.customizations).length > 0 && (
                                                <div className="ml-4 space-y-1">
                                                    {Object.entries(item.customizations).map(([key, value]) => (
                                                        <div key={key} className="text-sm text-gray-600 flex items-start gap-2">
                                                            <span className="text-gray-400">•</span>
                                                            <span>
                                                                <strong className="text-gray-700">{key}:</strong> {value}
                                                                {item.itemQuantities?.[key] && ` (${item.itemQuantities[key]}x)`}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="border-t pt-4 space-y-2">
                                <div className="flex justify-between">
                                    <span>Subtotal</span>
                                    <span>£{selectedOrder.subtotal?.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Delivery Fee</span>
                                    <span>£{selectedOrder.delivery_fee?.toFixed(2)}</span>
                                </div>
                                {selectedOrder.discount > 0 && (
                                    <div className="flex justify-between text-green-600">
                                        <span>Discount</span>
                                        <span>-£{selectedOrder.discount?.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                                    <span>Total</span>
                                    <span>£{selectedOrder.total?.toFixed(2)}</span>
                                </div>
                            </div>

                            <div>
                                <p className="text-sm text-gray-600 mb-1">Payment Method</p>
                                <p className="font-medium capitalize">{selectedOrder.payment_method || 'N/A'}</p>
                            </div>

                            {selectedOrder.notes && (
                                <div>
                                    <p className="text-sm text-gray-600 mb-1">Notes</p>
                                    <p className="text-sm bg-gray-50 p-2 rounded">{selectedOrder.notes}</p>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}