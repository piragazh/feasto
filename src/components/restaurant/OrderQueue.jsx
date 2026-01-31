import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CheckCircle, XCircle, Clock, Phone, MapPin, Printer, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import RejectOrderDialog from './RejectOrderDialog';
import { printerService } from './PrinterService';

export default function OrderQueue({ restaurantId, onOrderUpdate }) {
    const [selectedOrders, setSelectedOrders] = useState(new Set());
    const [rejectingOrder, setRejectingOrder] = useState(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('newest');
    const queryClient = useQueryClient();

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant-config', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
    });

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['order-queue', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: { $in: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'ready_for_collection'] }
        }, '-created_date'),
        refetchInterval: 2000,
    });

    // Auto-print new orders when Bluetooth printer is connected
    React.useEffect(() => {
        if (!restaurant?.printer_config?.auto_print) return;
        if (!restaurant?.printer_config?.bluetooth_printer) return;

        const checkForNewOrders = async () => {
            const pendingOrders = orders.filter(o => o.status === 'pending');
            
            for (const order of pendingOrders) {
                const printed = localStorage.getItem(`printed_${order.id}`);
                if (!printed) {
                    try {
                        await printerService.printReceipt(order, restaurant, restaurant.printer_config);
                        localStorage.setItem(`printed_${order.id}`, 'true');
                        toast.success(`Receipt printed for order ${order.order_number || order.id.slice(-6)}`);
                    } catch (error) {
                        console.error('Auto-print failed:', error);
                        toast.error('Failed to print. Check printer connection.');
                    }
                }
            }
        };

        checkForNewOrders();
    }, [orders, restaurant]);

    const updateOrderMutation = useMutation({
        mutationFn: async ({ orderId, status, rejection_reason }) => {
            const updateData = { status };
            if (rejection_reason) {
                updateData.rejection_reason = rejection_reason;
            }
            
            const order = orders.find(o => o.id === orderId);
            const statusHistory = order?.status_history || [];
            statusHistory.push({
                status,
                timestamp: new Date().toISOString(),
                note: rejection_reason || ''
            });
            updateData.status_history = statusHistory;
            
            return base44.entities.Order.update(orderId, updateData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['order-queue']);
            onOrderUpdate();
        },
    });

    const bulkUpdateMutation = useMutation({
        mutationFn: async ({ orderIds, status }) => {
            const promises = orderIds.map(orderId => {
                const order = orders.find(o => o.id === orderId);
                const statusHistory = order?.status_history || [];
                statusHistory.push({
                    status,
                    timestamp: new Date().toISOString(),
                    note: 'Bulk action'
                });
                return base44.entities.Order.update(orderId, { status, status_history: statusHistory });
            });
            await Promise.all(promises);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['order-queue']);
            setSelectedOrders(new Set());
            toast.success('Orders updated successfully');
            onOrderUpdate();
        },
    });

    const handleAccept = (orderId) => {
        updateOrderMutation.mutate({ orderId, status: 'confirmed' });
        toast.success('Order accepted!');
        printOrderDetails(orderId);
    };

    const handleReject = (orderId, reason) => {
        updateOrderMutation.mutate({ 
            orderId, 
            status: 'cancelled',
            rejection_reason: reason
        });
        toast.success('Order rejected');
    };

    const handleStatusChange = (orderId, newStatus) => {
        updateOrderMutation.mutate({ orderId, status: newStatus });
    };

    const handleBulkAction = (action) => {
        if (selectedOrders.size === 0) {
            toast.error('No orders selected');
            return;
        }
        bulkUpdateMutation.mutate({ 
            orderIds: Array.from(selectedOrders), 
            status: action 
        });
    };

    const toggleOrderSelection = (orderId) => {
        const newSelected = new Set(selectedOrders);
        if (newSelected.has(orderId)) {
            newSelected.delete(orderId);
        } else {
            newSelected.add(orderId);
        }
        setSelectedOrders(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedOrders.size === filteredOrders.length) {
            setSelectedOrders(new Set());
        } else {
            setSelectedOrders(new Set(filteredOrders.map(o => o.id)));
        }
    };

    const printOrderDetails = (orderId) => {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;

        const config = restaurant?.printer_config || {};
        const width = config.printer_width === '58mm' ? '220px' : '300px';
        const fontSize = config.font_size === 'small' ? '10px' : config.font_size === 'large' ? '14px' : '12px';
        const orderNum = order.order_number || `#${order.id.slice(-6)}`;

        const printWindow = window.open('', '', `width=${width},height=600`);
        printWindow.document.write(`
            <html>
                <head>
                    <title>Order ${orderNum}</title>
                    <style>
                        body { font-family: monospace; width: ${width}; margin: 10px; font-size: ${fontSize}; }
                        h2 { text-align: center; margin: 10px 0; }
                        .separator { border-top: 2px dashed #000; margin: 10px 0; }
                        .item { margin: 5px 0; }
                        .customization { font-size: 10px; color: #666; margin-left: 20px; }
                        .total { font-weight: bold; font-size: 16px; margin-top: 10px; }
                        .logo { text-align: center; margin-bottom: 10px; }
                        .logo img { max-height: 60px; }
                    </style>
                </head>
                <body>
                    ${config.show_logo && restaurant?.logo_url ? `
                        <div class="logo">
                            <img src="${restaurant.logo_url}" alt="Logo" />
                        </div>
                    ` : ''}
                    <h2>${restaurant?.name || 'KITCHEN ORDER'}</h2>
                    ${restaurant?.address ? `<p style="text-align: center; font-size: 10px;">${restaurant.address}</p>` : ''}
                    <div class="separator"></div>
                    ${config.header_text ? `<p style="text-align: center; font-size: 10px;">${config.header_text}</p><div class="separator"></div>` : ''}
                    ${config.show_order_number ? `<h2 style="text-align: center;">ORDER ${orderNum}</h2>` : `<p><strong>Order:</strong> ${orderNum}</p>`}
                    <p><strong>Time:</strong> ${format(new Date(order.created_date), 'HH:mm')}</p>
                    <p><strong>Type:</strong> ${order.order_type || 'Delivery'}</p>
                    <div class="separator"></div>
                    ${config.show_customer_details ? `
                        <p><strong>Customer:</strong> ${order.guest_name || order.created_by || 'Guest'}</p>
                        ${order.delivery_address ? `<p><strong>Address:</strong> ${order.delivery_address}</p>` : ''}
                        <p><strong>Phone:</strong> ${order.phone}</p>
                        <div class="separator"></div>
                    ` : ''}
                    <h3>ITEMS:</h3>
                    ${order.items.map(item => `
                        <div class="item">
                            <strong>${item.quantity}x ${item.name}</strong> - £${(item.price * item.quantity).toFixed(2)}
                            ${config.template === 'detailed' && item.customizations ? `
                                ${Object.entries(item.customizations).map(([key, value]) => `
                                    <div class="customization">${key}: ${value}</div>
                                `).join('')}
                            ` : ''}
                        </div>
                    `).join('')}
                    <div class="separator"></div>
                    ${config.template !== 'minimal' ? `
                        <p>Subtotal: £${order.subtotal.toFixed(2)}</p>
                        ${order.delivery_fee > 0 ? `<p>Delivery: £${order.delivery_fee.toFixed(2)}</p>` : ''}
                        ${order.discount > 0 ? `<p>Discount: -£${order.discount.toFixed(2)}</p>` : ''}
                    ` : ''}
                    <p class="total">TOTAL: £${order.total.toFixed(2)}</p>
                    ${config.template !== 'minimal' ? `<p>Payment: ${order.payment_method}</p>` : ''}
                    ${order.notes ? `
                        <div class="separator"></div>
                        <p><strong>Special Instructions:</strong></p>
                        <p>${order.notes}</p>
                    ` : ''}
                    ${config.footer_text ? `<div class="separator"></div><p style="text-align: center; font-size: 10px;">${config.footer_text}</p>` : ''}
                    <div class="separator"></div>
                    <p style="text-align: center;">Thank you!</p>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    const filteredOrders = orders.filter(order => {
        const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
        const matchesSearch = !searchQuery || 
            order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.phone?.includes(searchQuery) ||
            order.delivery_address?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    }).sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.created_date) - new Date(a.created_date);
        if (sortBy === 'oldest') return new Date(a.created_date) - new Date(b.created_date);
        if (sortBy === 'highest') return b.total - a.total;
        if (sortBy === 'lowest') return a.total - b.total;
        return 0;
    });

    const getStatusColor = (status) => {
        const colors = {
            pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
            confirmed: 'bg-blue-100 text-blue-800 border-blue-300',
            preparing: 'bg-purple-100 text-purple-800 border-purple-300',
            out_for_delivery: 'bg-orange-100 text-orange-800 border-orange-300',
            ready_for_collection: 'bg-green-100 text-green-800 border-green-300',
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    const pendingCount = orders.filter(o => o.status === 'pending').length;
    const preparingCount = orders.filter(o => o.status === 'preparing').length;

    if (isLoading) {
        return <div className="text-center py-8">Loading orders...</div>;
    }

    return (
        <div className="space-y-4">
            {/* Queue Stats */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-center">
                            <p className="text-sm text-gray-600">Pending</p>
                            <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-center">
                            <p className="text-sm text-gray-600">Preparing</p>
                            <p className="text-3xl font-bold text-purple-600">{preparingCount}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-center">
                            <p className="text-sm text-gray-600">Active Orders</p>
                            <p className="text-3xl font-bold text-gray-900">{orders.length}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters & Bulk Actions */}
            <Card>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search by order ID, phone, or address..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-40">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="confirmed">Confirmed</SelectItem>
                                    <SelectItem value="preparing">Preparing</SelectItem>
                                    <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                                    <SelectItem value="ready_for_collection">Ready for Collection</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={sortBy} onValueChange={setSortBy}>
                                <SelectTrigger className="w-40">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="newest">Newest First</SelectItem>
                                    <SelectItem value="oldest">Oldest First</SelectItem>
                                    <SelectItem value="highest">Highest Value</SelectItem>
                                    <SelectItem value="lowest">Lowest Value</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {selectedOrders.size > 0 && (
                            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                                <p className="text-sm font-medium flex-1">
                                    {selectedOrders.size} order{selectedOrders.size > 1 ? 's' : ''} selected
                                </p>
                                <Button size="sm" onClick={() => handleBulkAction('confirmed')}>
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Accept All
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleBulkAction('preparing')}>
                                    Start Preparing
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setSelectedOrders(new Set())}>
                                    Clear
                                </Button>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Orders List */}
            {filteredOrders.length === 0 ? (
                <Card>
                    <CardContent className="text-center py-16">
                        <Clock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-600 mb-2">No Active Orders</h3>
                        <p className="text-gray-500">New orders will appear here</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    <div className="flex items-center gap-2 px-4">
                        <Checkbox
                            checked={selectedOrders.size === filteredOrders.length}
                            onCheckedChange={toggleSelectAll}
                        />
                        <span className="text-sm text-gray-600">Select All</span>
                    </div>

                    {filteredOrders.map((order, index) => (
                        <motion.div
                            key={order.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                        >
                            <Card className={`${order.status === 'pending' ? 'border-2 border-red-500 shadow-lg' : ''} ${
                                selectedOrders.has(order.id) ? 'ring-2 ring-blue-500' : ''
                            }`}>
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3">
                                            <Checkbox
                                                checked={selectedOrders.has(order.id)}
                                                onCheckedChange={() => toggleOrderSelection(order.id)}
                                            />
                                            <div>
                                               <CardTitle className="flex items-center gap-2 flex-wrap">
                                                   {order.order_type === 'collection' && order.order_number ? (
                                                       <span className="text-lg font-bold text-blue-600">{order.order_number}</span>
                                                   ) : (
                                                       <>Order #{order.id.slice(-6)}</>
                                                   )}
                                                   <Badge className={order.order_type === 'collection' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}>
                                                       {order.order_type === 'collection' ? '🏪 Collection' : '🚚 Delivery'}
                                                   </Badge>
                                                   <Badge className={getStatusColor(order.status)}>
                                                       {order.status.replace('_', ' ')}
                                                   </Badge>
                                                   {order.status === 'pending' && (
                                                       <Badge className="bg-red-100 text-red-800 animate-pulse">
                                                           NEW
                                                       </Badge>
                                                   )}
                                               </CardTitle>
                                               <p className="text-sm text-gray-500 mt-1">
                                                   {format(new Date(order.created_date), 'MMM d, h:mm a')}
                                               </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-bold text-gray-900">£{order.total.toFixed(2)}</p>
                                            <p className="text-xs text-gray-500">{order.payment_method}</p>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Order Items */}
                                    <div className="space-y-2">
                                        {order.items.map((item, idx) => (
                                            <div key={idx} className="flex justify-between text-sm bg-gray-50 p-2 rounded">
                                                <span className="font-medium">{item.quantity}x {item.name}</span>
                                                <span>£{(item.price * item.quantity).toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Customer Info */}
                                    <div className="space-y-2 text-sm bg-blue-50 p-3 rounded">
                                        {order.order_type === 'delivery' && (
                                            <div className="flex items-start gap-2">
                                                <MapPin className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                                                <span className="text-gray-700">{order.delivery_address}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <Phone className="h-4 w-4 text-blue-600" />
                                            <a href={`tel:${order.phone}`} className="text-blue-600 font-medium">
                                                {order.phone}
                                            </a>
                                        </div>
                                    </div>

                                    {order.notes && (
                                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                                            <p className="text-xs font-semibold text-yellow-900 mb-1">Special Instructions:</p>
                                            <p className="text-sm text-yellow-800">{order.notes}</p>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex gap-2 flex-wrap">
                                        {order.status === 'pending' && (
                                            <>
                                                <Button
                                                    onClick={() => handleAccept(order.id)}
                                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                                >
                                                    <CheckCircle className="h-4 w-4 mr-2" />
                                                    Accept Order
                                                </Button>
                                                <Button
                                                    onClick={() => setRejectingOrder(order)}
                                                    variant="destructive"
                                                    className="flex-1"
                                                >
                                                    <XCircle className="h-4 w-4 mr-2" />
                                                    Reject
                                                </Button>
                                            </>
                                        )}
                                        
                                        {order.status === 'confirmed' && (
                                            <Button
                                                onClick={() => handleStatusChange(order.id, 'preparing')}
                                                className="flex-1 bg-purple-600 hover:bg-purple-700"
                                            >
                                                Start Preparing
                                            </Button>
                                        )}

                                        {order.status === 'preparing' && (
                                            <>
                                                {order.order_type === 'collection' ? (
                                                    <Button
                                                        onClick={() => handleStatusChange(order.id, 'ready_for_collection')}
                                                        className="flex-1 bg-green-600 hover:bg-green-700"
                                                    >
                                                        Ready for Collection
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        onClick={() => handleStatusChange(order.id, 'out_for_delivery')}
                                                        className="flex-1 bg-orange-600 hover:bg-orange-700"
                                                    >
                                                        Mark as Dispatched
                                                    </Button>
                                                )}
                                            </>
                                        )}

                                        {order.status === 'out_for_delivery' && (
                                            <Button
                                                onClick={() => handleStatusChange(order.id, 'delivered')}
                                                className="flex-1 bg-green-600 hover:bg-green-700"
                                            >
                                                Mark as Delivered
                                            </Button>
                                        )}

                                        {order.status === 'ready_for_collection' && (
                                            <Button
                                                onClick={() => handleStatusChange(order.id, 'collected')}
                                                className="flex-1 bg-green-600 hover:bg-green-700"
                                            >
                                                Mark as Collected
                                            </Button>
                                        )}

                                        <Button
                                            onClick={() => printOrderDetails(order.id)}
                                            variant="outline"
                                            size="icon"
                                            title="Print to Browser"
                                        >
                                            <Printer className="h-4 w-4" />
                                        </Button>
                                        {restaurant?.printer_config?.bluetooth_printer && (
                                            <Button
                                                onClick={async () => {
                                                    try {
                                                        await printerService.printReceipt(order, restaurant, restaurant.printer_config);
                                                        toast.success('Receipt printed to Bluetooth printer');
                                                    } catch (error) {
                                                        toast.error('Print failed: ' + error.message);
                                                    }
                                                }}
                                                variant="outline"
                                                size="icon"
                                                className="bg-blue-50 border-blue-200 hover:bg-blue-100"
                                                title="Print to Bluetooth Printer"
                                            >
                                                <Printer className="h-4 w-4 text-blue-600" />
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}

            <RejectOrderDialog
                open={!!rejectingOrder}
                onClose={() => setRejectingOrder(null)}
                onReject={(reason) => handleReject(rejectingOrder.id, reason)}
                orderNumber={rejectingOrder?.id.slice(-6)}
            />
        </div>
    );
}