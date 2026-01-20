import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, Clock, Phone, MapPin, Printer, Search, Filter, ChevronDown, ChevronUp, User } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import RejectOrderDialog from './RejectOrderDialog';

export default function LiveOrders({ restaurantId, onOrderUpdate }) {
    const [rejectingOrder, setRejectingOrder] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [orderTypeFilter, setOrderTypeFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedOrders, setSelectedOrders] = useState([]);
    const [showFilters, setShowFilters] = useState(false);
    const queryClient = useQueryClient();

    const { data: allOrders = [], isLoading } = useQuery({
        queryKey: ['live-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: { $in: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'ready_for_collection'] }
        }, '-created_date'),
        refetchInterval: 3000,
    });

    const { data: availableDrivers = [] } = useQuery({
        queryKey: ['available-drivers'],
        queryFn: () => base44.entities.Driver.filter({ is_available: true }),
        refetchInterval: 5000,
    });

    // Filter orders
    const orders = allOrders.filter(order => {
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchesSearch = 
                order.phone?.toLowerCase().includes(query) ||
                order.delivery_address?.toLowerCase().includes(query) ||
                order.order_number?.toLowerCase().includes(query) ||
                order.id?.toLowerCase().includes(query) ||
                order.guest_name?.toLowerCase().includes(query) ||
                order.guest_email?.toLowerCase().includes(query);
            if (!matchesSearch) return false;
        }

        if (statusFilter !== 'all' && order.status !== statusFilter) return false;
        if (orderTypeFilter !== 'all' && order.order_type !== orderTypeFilter) return false;

        if (dateFrom) {
            const orderDate = new Date(order.created_date);
            const fromDate = new Date(dateFrom);
            if (orderDate < fromDate) return false;
        }
        if (dateTo) {
            const orderDate = new Date(order.created_date);
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            if (orderDate > toDate) return false;
        }

        return true;
    });

    const bulkUpdateStatus = useMutation({
        mutationFn: async ({ orderIds, newStatus }) => {
            return Promise.all(
                orderIds.map(orderId => {
                    const order = allOrders.find(o => o.id === orderId);
                    const statusHistory = order?.status_history || [];
                    statusHistory.push({
                        status: newStatus,
                        timestamp: new Date().toISOString(),
                        note: `Bulk updated to ${newStatus}`
                    });
                    return base44.entities.Order.update(orderId, { 
                        status: newStatus,
                        status_history: statusHistory
                    });
                })
            );
        },
        onSuccess: async (_, { orderIds, newStatus }) => {
            queryClient.invalidateQueries(['live-orders']);
            
            for (const orderId of orderIds) {
                const order = allOrders.find(o => o.id === orderId);
                if (order) {
                    await sendCustomerNotification(orderId, newStatus);
                }
            }
            
            toast.success(`${orderIds.length} orders updated to ${newStatus}`);
            setSelectedOrders([]);
            if (onOrderUpdate) onOrderUpdate();
        },
    });

    const updateOrderMutation = useMutation({
        mutationFn: async ({ orderId, status, rejection_reason, notify = true }) => {
            const updateData = { status };
            if (rejection_reason) {
                updateData.rejection_reason = rejection_reason;
            }
            
            const order = allOrders.find(o => o.id === orderId);
            const statusHistory = order?.status_history || [];
            statusHistory.push({
                status,
                timestamp: new Date().toISOString(),
                note: rejection_reason || ''
            });
            updateData.status_history = statusHistory;
            
            const result = await base44.entities.Order.update(orderId, updateData);
            
            if (notify) {
                await sendCustomerNotification(orderId, status, rejection_reason);
            }
            
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['live-orders']);
            onOrderUpdate();
        },
    });

    const sendCustomerNotification = async (orderId, status, rejectionReason) => {
        try {
            const order = allOrders.find(o => o.id === orderId);
            if (!order) return;

            const orderLabel = order.order_type === 'collection' && order.order_number 
                ? order.order_number 
                : `#${order.id.slice(-6)}`;

            const statusMessages = {
                confirmed: `Your order ${orderLabel} has been confirmed and will be prepared shortly. ✅`,
                preparing: `Your order ${orderLabel} is being prepared. 👨‍🍳`,
                out_for_delivery: `Your order ${orderLabel} is on its way! 🚗`,
                ready_for_collection: `Your order ${orderLabel} is ready for collection! Please come to the restaurant to collect. 🏪`,
                delivered: `Your order ${orderLabel} has been delivered. Enjoy your meal! 🎉`,
                collected: `Thank you for collecting your order ${orderLabel}! Enjoy! 🎉`,
                cancelled: `Your order ${orderLabel} has been cancelled. ${rejectionReason ? `Reason: ${rejectionReason}` : 'Please contact the restaurant for more details.'} ❌`
            };

            const message = statusMessages[status] || `Order ${orderLabel} status updated.`;
            
            await base44.functions.invoke('sendSMS', {
                to: order.phone,
                message: message
            });
        } catch (error) {
            console.error('SMS notification error:', error);
        }
    };

    const handleAccept = (orderId) => {
        updateOrderMutation.mutate({ orderId, status: 'confirmed' });
        toast.success('Order accepted! Preparing...');
        printOrderDetails(orderId);
    };

    const handleReject = (orderId, reason) => {
        updateOrderMutation.mutate({ 
            orderId, 
            status: 'cancelled',
            rejection_reason: reason
        });
        toast.success('Order rejected and customer notified');
    };

    const assignDriverMutation = useMutation({
        mutationFn: async ({ orderId, driverId }) => {
            const driver = availableDrivers.find(d => d.id === driverId);
            
            const etaPrompt = `Calculate estimated delivery time for a food delivery order.
Distance: Assume 3-5 km average urban delivery.
Traffic: Consider it's ${new Date().getHours()}:00, adjust for peak hours (12-14, 18-21).
Vehicle: ${driver.vehicle_type}
Provide only the time range (e.g., "25-30 min").`;
            
            const etaResponse = await base44.integrations.Core.InvokeLLM({
                prompt: etaPrompt
            });
            
            await base44.entities.Order.update(orderId, { 
                driver_id: driverId,
                estimated_delivery: etaResponse,
                status: 'out_for_delivery'
            });
            
            await base44.entities.Driver.update(driverId, {
                current_order_id: orderId,
                is_available: false
            });
            
            return { driver };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries(['live-orders']);
            queryClient.invalidateQueries(['available-drivers']);
            toast.success(`Driver ${data.driver.full_name} assigned - Customer notified`);
            if (onOrderUpdate) onOrderUpdate();
        },
    });

    const handleStatusChange = async (orderId, newStatus) => {
        if (newStatus === 'out_for_delivery') {
            const drivers = await base44.entities.Driver.filter({ 
                is_available: true,
                current_order_id: null 
            });
            
            if (drivers.length > 0) {
                const driver = drivers[0];
                
                const etaPrompt = `Calculate estimated delivery time for a food delivery order.
Distance: Assume 3-5 km average urban delivery.
Traffic: Consider it's ${new Date().getHours()}:00, adjust for peak hours (12-14, 18-21).
Vehicle: ${driver.vehicle_type}
Provide only the time range (e.g., "25-30 min").`;
                
                try {
                    const etaResponse = await base44.integrations.Core.InvokeLLM({
                        prompt: etaPrompt
                    });
                    
                    await base44.entities.Order.update(orderId, { 
                        driver_id: driver.id,
                        estimated_delivery: etaResponse
                    });
                    
                    await base44.entities.Driver.update(driver.id, {
                        current_order_id: orderId,
                        is_available: false
                    });
                } catch (e) {
                    console.error('ETA calculation failed:', e);
                }
            }
        }
        
        updateOrderMutation.mutate({ orderId, status: newStatus });
        const statusLabels = {
            confirmed: 'Order accepted',
            preparing: 'Preparing order',
            out_for_delivery: 'Order dispatched - Driver assigned',
            ready_for_collection: 'Order ready for collection',
            delivered: 'Order delivered',
            collected: 'Order collected'
        };
        toast.success(`${statusLabels[newStatus]} - Customer notified via SMS`);
    };

    const printOrderDetails = (orderId) => {
        const order = allOrders.find(o => o.id === orderId);
        if (!order) return;

        const printWindow = window.open('', '', 'width=300,height=600');
        const orderLabel = order.order_type === 'collection' && order.order_number 
            ? order.order_number 
            : `#${order.id.slice(-6)}`;
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>Order ${orderLabel}</title>
                    <style>
                        body { font-family: monospace; width: 280px; margin: 10px; }
                        h2 { text-align: center; margin: 10px 0; }
                        .separator { border-top: 2px dashed #000; margin: 10px 0; }
                        .item { margin: 5px 0; }
                        .total { font-weight: bold; font-size: 16px; margin-top: 10px; }
                        .collection-badge { 
                            text-align: center; 
                            background: #dbeafe; 
                            padding: 5px; 
                            font-weight: bold;
                            border-radius: 4px;
                            margin: 10px 0;
                        }
                    </style>
                </head>
                <body>
                    <h2>KITCHEN ORDER</h2>
                    ${order.order_type === 'collection' ? '<div class="collection-badge">🏪 COLLECTION ORDER</div>' : ''}
                    <div class="separator"></div>
                    <p><strong>Order:</strong> ${orderLabel}</p>
                    <p><strong>Type:</strong> ${order.order_type === 'collection' ? 'COLLECTION' : 'DELIVERY'}</p>
                    <p><strong>Time:</strong> ${format(new Date(order.created_date), 'HH:mm')}</p>
                    <div class="separator"></div>
                    <h3>ITEMS:</h3>
                    ${order.items.map(item => `
                        <div class="item">
                            <strong>${item.quantity}x ${item.name}</strong>
                            ${item.customizations ? `<br/><small>${JSON.stringify(item.customizations)}</small>` : ''}
                        </div>
                    `).join('')}
                    <div class="separator"></div>
                    ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ''}
                    <p><strong>Customer:</strong> ${order.phone}</p>
                    <div class="separator"></div>
                    <p class="total">TOTAL: £${order.total.toFixed(2)}</p>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    const getStatusColor = (status) => {
        const colors = {
            pending: 'bg-yellow-100 text-yellow-800',
            confirmed: 'bg-blue-100 text-blue-800',
            preparing: 'bg-purple-100 text-purple-800',
            out_for_delivery: 'bg-orange-100 text-orange-800',
            ready_for_collection: 'bg-green-100 text-green-800',
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    const handleSelectAll = (checked) => {
        setSelectedOrders(checked ? orders.map(o => o.id) : []);
    };

    const handleSelectOrder = (orderId, checked) => {
        if (checked) {
            setSelectedOrders([...selectedOrders, orderId]);
        } else {
            setSelectedOrders(selectedOrders.filter(id => id !== orderId));
        }
    };

    const clearFilters = () => {
        setSearchQuery('');
        setStatusFilter('all');
        setOrderTypeFilter('all');
        setDateFrom('');
        setDateTo('');
    };

    if (isLoading) {
        return <div className="text-center py-8">Loading orders...</div>;
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Live Orders ({orders.length})</h2>
                {selectedOrders.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">{selectedOrders.length} selected</span>
                        <Select onValueChange={(status) => {
                            if (status) {
                                bulkUpdateStatus.mutate({ orderIds: selectedOrders, newStatus: status });
                            }
                        }}>
                            <SelectTrigger className="w-48">
                                <SelectValue placeholder="Bulk Update Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="confirmed">Mark as Confirmed</SelectItem>
                                <SelectItem value="preparing">Mark as Preparing</SelectItem>
                                <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                                <SelectItem value="ready_for_collection">Ready for Collection</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={() => setSelectedOrders([])} size="sm">
                            Clear Selection
                        </Button>
                    </div>
                )}
            </div>

            {/* Search and Filters */}
            <Card className="mb-6">
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search by phone, address, order number, customer name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>

                        <Button
                            variant="outline"
                            onClick={() => setShowFilters(!showFilters)}
                            className="w-full"
                        >
                            <Filter className="h-4 w-4 mr-2" />
                            {showFilters ? 'Hide Filters' : 'Show Filters'}
                            {showFilters ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
                        </Button>

                        {showFilters && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Status</label>
                                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                                        <SelectTrigger>
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
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">Order Type</label>
                                    <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Types</SelectItem>
                                            <SelectItem value="delivery">🚚 Delivery</SelectItem>
                                            <SelectItem value="collection">🏪 Collection</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">From Date</label>
                                    <Input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">To Date</label>
                                    <Input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                    />
                                </div>

                                <div className="md:col-span-2 lg:col-span-4">
                                    <Button variant="ghost" onClick={clearFilters} className="w-full">
                                        Clear All Filters
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {orders.length === 0 ? (
                <Card>
                    <CardContent className="text-center py-16">
                        <Clock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-600 mb-2">No Orders Found</h3>
                        <p className="text-gray-500">Try adjusting your search or filters</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {orders.length > 0 && (
                        <div className="flex items-center gap-2 mb-4 p-4 bg-gray-50 rounded-lg">
                            <Checkbox
                                checked={selectedOrders.length === orders.length}
                                onCheckedChange={handleSelectAll}
                            />
                            <span className="text-sm font-medium">Select All ({orders.length} orders)</span>
                        </div>
                    )}

                    <div className="grid gap-4">
                        {orders.map((order, index) => (
                            <motion.div
                                key={order.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                            >
                                <Card className={`${order.status === 'pending' ? 'border-2 border-red-500 shadow-lg' : ''} ${selectedOrders.includes(order.id) ? 'ring-2 ring-orange-500' : ''}`}>
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={selectedOrders.includes(order.id)}
                                                    onCheckedChange={(checked) => handleSelectOrder(order.id, checked)}
                                                    className="mt-1"
                                                />
                                                <div>
                                                   <CardTitle className="flex items-center gap-2 flex-wrap">
                                                       {order.order_type === 'collection' && order.order_number ? (
                                                           <span className="text-2xl font-bold text-blue-600">{order.order_number}</span>
                                                       ) : (
                                                           <>Order #{order.id.slice(-6)}</>
                                                       )}
                                                       <Badge className={order.order_type === 'collection' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}>
                                                           {order.order_type === 'collection' ? '🏪 Collection' : '🚚 Delivery'}
                                                       </Badge>
                                                       <Badge className={getStatusColor(order.status)}>
                                                           {order.status.replace('_', ' ')}
                                                       </Badge>
                                                   </CardTitle>
                                                   <p className="text-sm text-gray-500 mt-1">
                                                       {format(new Date(order.created_date), 'MMM d, h:mm a')}
                                                   </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-bold text-gray-900">£{order.total.toFixed(2)}</p>
                                                <p className="text-xs text-gray-500">{order.payment_method}</p>
                                                {order.order_type === 'collection' && order.order_number && (
                                                    <div className="mt-2">
                                                        <img 
                                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${order.order_number}`}
                                                            alt="QR Code"
                                                            className="w-20 h-20 border-2 border-gray-200 rounded"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            {order.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between text-sm">
                                                    <div>
                                                        <span className="font-medium">{item.quantity}x {item.name}</span>
                                                        {item.customizations && (
                                                            <div className="text-xs text-gray-500 ml-4">
                                                                {Object.entries(item.customizations).map(([key, val]) => (
                                                                    <div key={key}>{key}: {Array.isArray(val) ? val.join(', ') : val}</div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span>£{(item.price * item.quantity).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <Separator />

                                        <div className="space-y-2 text-sm">
                                            {order.order_type === 'delivery' && (
                                                <div className="flex items-start gap-2">
                                                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                                                    <span className="text-gray-700">{order.delivery_address}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2">
                                                <Phone className="h-4 w-4 text-gray-400" />
                                                <span className="text-gray-700">{order.phone}</span>
                                            </div>
                                            {order.notes && (
                                                <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                                                    <p className="text-xs font-semibold text-yellow-900">Special Instructions:</p>
                                                    <p className="text-sm text-yellow-800">{order.notes}</p>
                                                </div>
                                            )}
                                        </div>

                                        <Separator />

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
                                                        <>
                                                            {availableDrivers.length > 0 ? (
                                                                <Select onValueChange={(driverId) => assignDriverMutation.mutate({ orderId: order.id, driverId })}>
                                                                    <SelectTrigger className="flex-1">
                                                                        <SelectValue placeholder="Assign Driver & Dispatch" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {availableDrivers.map(driver => (
                                                                            <SelectItem key={driver.id} value={driver.id}>
                                                                                <div className="flex items-center gap-2">
                                                                                    <User className="h-4 w-4" />
                                                                                    {driver.full_name} ({driver.vehicle_type})
                                                                                </div>
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
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
                                            >
                                                <Printer className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </>
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