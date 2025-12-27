import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, Clock, Phone, MapPin, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function LiveOrders({ restaurantId, onOrderUpdate }) {
    const queryClient = useQueryClient();

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['live-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: { $in: ['pending', 'confirmed', 'preparing', 'out_for_delivery'] }
        }, '-created_date'),
        refetchInterval: 3000,
    });

    const updateOrderMutation = useMutation({
        mutationFn: ({ orderId, status }) => 
            base44.entities.Order.update(orderId, { status }),
        onSuccess: () => {
            queryClient.invalidateQueries(['live-orders']);
            onOrderUpdate();
        },
    });

    const handleAccept = (orderId) => {
        updateOrderMutation.mutate({ orderId, status: 'confirmed' });
        toast.success('Order accepted! Preparing...');
        printOrderDetails(orderId);
    };

    const handleReject = (orderId) => {
        if (confirm('Are you sure you want to reject this order?')) {
            updateOrderMutation.mutate({ orderId, status: 'cancelled' });
            toast.success('Order cancelled');
        }
    };

    const handleStatusChange = (orderId, newStatus) => {
        updateOrderMutation.mutate({ orderId, status: newStatus });
        if (newStatus === 'out_for_delivery') {
            toast.success('Customer notified: Order dispatched!');
        }
    };

    const printOrderDetails = (orderId) => {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;

        // Create printable content
        const printWindow = window.open('', '', 'width=300,height=600');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Order #${order.id.slice(-6)}</title>
                    <style>
                        body { font-family: monospace; width: 280px; margin: 10px; }
                        h2 { text-align: center; margin: 10px 0; }
                        .separator { border-top: 2px dashed #000; margin: 10px 0; }
                        .item { margin: 5px 0; }
                        .total { font-weight: bold; font-size: 16px; margin-top: 10px; }
                    </style>
                </head>
                <body>
                    <h2>KITCHEN ORDER</h2>
                    <div class="separator"></div>
                    <p><strong>Order #:</strong> ${order.id.slice(-6)}</p>
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
                    <p class="total">TOTAL: $${order.total.toFixed(2)}</p>
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
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    if (isLoading) {
        return <div className="text-center py-8">Loading orders...</div>;
    }

    if (orders.length === 0) {
        return (
            <Card>
                <CardContent className="text-center py-16">
                    <Clock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-600 mb-2">No Active Orders</h3>
                    <p className="text-gray-500">New orders will appear here</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="grid gap-4">
            {orders.map((order, index) => (
                <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                >
                    <Card className={order.status === 'pending' ? 'border-2 border-red-500 shadow-lg' : ''}>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        Order #{order.id.slice(-6)}
                                        <Badge className={getStatusColor(order.status)}>
                                            {order.status.replace('_', ' ')}
                                        </Badge>
                                    </CardTitle>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {format(new Date(order.created_date), 'MMM d, h:mm a')}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-bold text-gray-900">${order.total.toFixed(2)}</p>
                                    <p className="text-xs text-gray-500">{order.payment_method}</p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Order Items */}
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
                                        <span>${(item.price * item.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>

                            <Separator />

                            {/* Customer Info */}
                            <div className="space-y-2 text-sm">
                                <div className="flex items-start gap-2">
                                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                                    <span className="text-gray-700">{order.delivery_address}</span>
                                </div>
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
                                            onClick={() => handleReject(order.id)}
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
                                    <Button
                                        onClick={() => handleStatusChange(order.id, 'out_for_delivery')}
                                        className="flex-1 bg-orange-600 hover:bg-orange-700"
                                    >
                                        Mark as Dispatched
                                    </Button>
                                )}

                                {order.status === 'out_for_delivery' && (
                                    <Button
                                        onClick={() => handleStatusChange(order.id, 'delivered')}
                                        className="flex-1 bg-green-600 hover:bg-green-700"
                                    >
                                        Mark as Delivered
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
    );
}