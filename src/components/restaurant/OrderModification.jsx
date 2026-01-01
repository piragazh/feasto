import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit2, XCircle, AlertCircle, MessageSquare, Minus, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function OrderModification({ restaurantId }) {
    const [editingOrder, setEditingOrder] = useState(null);
    const [cancellingOrder, setCancellingOrder] = useState(null);
    const [cancelReason, setCancelReason] = useState('');
    const [modifiedItems, setModifiedItems] = useState([]);
    const [modificationNote, setModificationNote] = useState('');
    const queryClient = useQueryClient();

    const { data: activeOrders = [], isLoading } = useQuery({
        queryKey: ['modifiable-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: { $in: ['pending', 'confirmed', 'preparing'] }
        }, '-created_date'),
        refetchInterval: 5000,
    });

    const cancelOrderMutation = useMutation({
        mutationFn: async ({ orderId, reason }) => {
            const order = activeOrders.find(o => o.id === orderId);
            
            await base44.entities.Order.update(orderId, {
                status: 'cancelled',
                rejection_reason: reason,
                status_history: [
                    ...(order.status_history || []),
                    {
                        status: 'cancelled',
                        timestamp: new Date().toISOString(),
                        note: `Restaurant cancelled: ${reason}`
                    }
                ]
            });

            // Send notification to customer
            await base44.entities.Message.create({
                order_id: orderId,
                restaurant_id: restaurantId,
                sender_type: 'restaurant',
                message: `Your order has been cancelled. Reason: ${reason}`
            });

            // Notify driver if assigned
            if (order.driver_id) {
                await base44.entities.DriverMessage.create({
                    order_id: orderId,
                    driver_id: order.driver_id,
                    restaurant_id: restaurantId,
                    sender_type: 'restaurant',
                    message: `Order #${orderId.slice(-6)} has been cancelled by the restaurant.`
                });

                // Free up driver
                await base44.entities.Driver.update(order.driver_id, {
                    is_available: true,
                    current_order_id: null
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['modifiable-orders']);
            toast.success('Order cancelled and customer notified');
            setCancellingOrder(null);
            setCancelReason('');
        },
    });

    const modifyOrderMutation = useMutation({
        mutationFn: async ({ orderId, items, note }) => {
            const order = activeOrders.find(o => o.id === orderId);
            const newSubtotal = items.reduce((sum, item) => 
                sum + (item.price * item.quantity), 0
            );
            const newTotal = newSubtotal + (order.delivery_fee || 0) - (order.discount || 0);

            await base44.entities.Order.update(orderId, {
                items: items,
                subtotal: newSubtotal,
                total: newTotal,
                status_history: [
                    ...(order.status_history || []),
                    {
                        status: order.status,
                        timestamp: new Date().toISOString(),
                        note: `Order modified by restaurant: ${note}`
                    }
                ]
            });

            // Notify customer about modification
            const itemsText = items.map(i => `${i.quantity}x ${i.name}`).join(', ');
            await base44.entities.Message.create({
                order_id: orderId,
                restaurant_id: restaurantId,
                sender_type: 'restaurant',
                message: `Your order has been modified. New items: ${itemsText}. Updated total: £${newTotal.toFixed(2)}. Note: ${note}`
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['modifiable-orders']);
            toast.success('Order modified and customer notified');
            setEditingOrder(null);
            setModifiedItems([]);
            setModificationNote('');
        },
    });

    const handleOpenEdit = (order) => {
        setEditingOrder(order);
        setModifiedItems(JSON.parse(JSON.stringify(order.items)));
        setModificationNote('');
    };

    const updateItemQuantity = (index, change) => {
        const newItems = [...modifiedItems];
        const newQuantity = newItems[index].quantity + change;
        
        if (newQuantity <= 0) {
            newItems.splice(index, 1);
        } else {
            newItems[index].quantity = newQuantity;
        }
        
        setModifiedItems(newItems);
    };

    const calculateNewTotal = () => {
        if (!editingOrder) return 0;
        const subtotal = modifiedItems.reduce((sum, item) => 
            sum + (item.price * item.quantity), 0
        );
        return subtotal + (editingOrder.delivery_fee || 0) - (editingOrder.discount || 0);
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Edit2 className="h-5 w-5 text-blue-500" />
                        Order Modifications & Cancellations
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">Loading orders...</div>
                    ) : activeOrders.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No active orders to modify
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {activeOrders.map((order) => (
                                <div key={order.id} className="border rounded-lg p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <h3 className="font-semibold">
                                                Order #{order.id.slice(-6)}
                                            </h3>
                                            <p className="text-sm text-gray-600">
                                                {order.phone} • {format(new Date(order.created_date), 'h:mm a')}
                                            </p>
                                        </div>
                                        <Badge variant="outline" className="capitalize">
                                            {order.status}
                                        </Badge>
                                    </div>

                                    <div className="space-y-1 mb-3 text-sm">
                                        {order.items.map((item, i) => (
                                            <div key={i} className="flex justify-between">
                                                <span>{item.quantity}x {item.name}</span>
                                                <span>£{(item.price * item.quantity).toFixed(2)}</span>
                                            </div>
                                        ))}
                                        <div className="border-t pt-1 flex justify-between font-semibold">
                                            <span>Total:</span>
                                            <span>£{order.total.toFixed(2)}</span>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        {order.status === 'pending' || order.status === 'confirmed' ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleOpenEdit(order)}
                                            >
                                                <Edit2 className="h-3 w-3 mr-1" />
                                                Modify Items
                                            </Button>
                                        ) : (
                                            <Badge variant="secondary" className="text-xs">
                                                Too late to modify
                                            </Badge>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setCancellingOrder(order)}
                                            className="text-red-600"
                                        >
                                            <XCircle className="h-3 w-3 mr-1" />
                                            Cancel Order
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Modify Order Dialog */}
            <Dialog open={!!editingOrder} onOpenChange={() => setEditingOrder(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            Modify Order #{editingOrder?.id?.slice(-6)}
                        </DialogTitle>
                    </DialogHeader>
                    {editingOrder && (
                        <div className="space-y-4">
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex gap-2">
                                <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0" />
                                <div className="text-sm">
                                    <p className="font-semibold text-yellow-900">Important:</p>
                                    <p className="text-yellow-800">
                                        Customer will be notified of any changes. Make sure to explain the reason.
                                    </p>
                                </div>
                            </div>

                            <div>
                                <Label className="mb-2 block">Order Items</Label>
                                <div className="space-y-2 border rounded-lg p-3">
                                    {modifiedItems.map((item, i) => (
                                        <div key={i} className="flex items-center justify-between">
                                            <span className="flex-1">{item.name}</span>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="icon"
                                                    variant="outline"
                                                    className="h-7 w-7"
                                                    onClick={() => updateItemQuantity(i, -1)}
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </Button>
                                                <span className="w-8 text-center">{item.quantity}</span>
                                                <Button
                                                    size="icon"
                                                    variant="outline"
                                                    className="h-7 w-7"
                                                    onClick={() => updateItemQuantity(i, 1)}
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </Button>
                                                <span className="w-16 text-right">
                                                    £{(item.price * item.quantity).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    {modifiedItems.length === 0 && (
                                        <p className="text-sm text-red-600 text-center">
                                            Cannot have zero items in order
                                        </p>
                                    )}
                                    <div className="border-t pt-2 flex justify-between font-semibold">
                                        <span>New Total:</span>
                                        <span>£{calculateNewTotal().toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="mod-note" className="mb-2 block">
                                    Reason for Modification *
                                </Label>
                                <Textarea
                                    id="mod-note"
                                    placeholder="E.g., Item out of stock, size adjustment, etc."
                                    value={modificationNote}
                                    onChange={(e) => setModificationNote(e.target.value)}
                                    rows={3}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingOrder(null)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => modifyOrderMutation.mutate({
                                orderId: editingOrder.id,
                                items: modifiedItems,
                                note: modificationNote
                            })}
                            disabled={
                                modifiedItems.length === 0 || 
                                !modificationNote.trim() || 
                                modifyOrderMutation.isPending
                            }
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            Save Changes & Notify Customer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Cancel Order Dialog */}
            <AlertDialog open={!!cancellingOrder} onOpenChange={() => setCancellingOrder(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Order #{cancellingOrder?.id?.slice(-6)}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will cancel the order and notify the customer and driver (if assigned).
                            Please provide a reason for cancellation.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                        <Label htmlFor="cancel-reason" className="mb-2 block">
                            Cancellation Reason *
                        </Label>
                        <Select value={cancelReason} onValueChange={setCancelReason}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a reason..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Out of ingredients">Out of ingredients</SelectItem>
                                <SelectItem value="Kitchen too busy">Kitchen too busy</SelectItem>
                                <SelectItem value="Unable to deliver to address">Unable to deliver to address</SelectItem>
                                <SelectItem value="Technical issue">Technical issue</SelectItem>
                                <SelectItem value="Customer requested">Customer requested</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep Order</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => cancelOrderMutation.mutate({
                                orderId: cancellingOrder.id,
                                reason: cancelReason
                            })}
                            disabled={!cancelReason || cancelOrderMutation.isPending}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Cancel Order
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}