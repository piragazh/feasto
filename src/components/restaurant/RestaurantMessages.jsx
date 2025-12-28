import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MessageSquare, Send, Edit2, Trash2, X, Check } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function RestaurantMessages({ restaurantId }) {
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [messageText, setMessageText] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editText, setEditText] = useState('');
    const [deletingId, setDeletingId] = useState(null);
    const queryClient = useQueryClient();

    const { data: orders = [] } = useQuery({
        queryKey: ['orders-with-messages', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 50),
    });

    const { data: orderMessages = [] } = useQuery({
        queryKey: ['messages', selectedOrder],
        queryFn: () => base44.entities.Message.filter({ order_id: selectedOrder }, 'created_date'),
        enabled: !!selectedOrder,
        refetchInterval: 3000,
    });

    const { data: adminMessages = [] } = useQuery({
        queryKey: ['admin-messages', restaurantId],
        queryFn: () => base44.entities.RestaurantMessage.filter({ restaurant_id: restaurantId }, '-created_date'),
        refetchInterval: 5000,
    });

    const markAsRead = useMutation({
        mutationFn: (messageId) => base44.entities.RestaurantMessage.update(messageId, { is_read: true }),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-messages']);
            queryClient.invalidateQueries(['restaurant-unread-messages']);
        },
    });

    const markOrderMessageAsRead = useMutation({
        mutationFn: (messageId) => base44.entities.Message.update(messageId, { is_read: true }),
        onSuccess: () => {
            queryClient.invalidateQueries(['messages']);
            queryClient.invalidateQueries(['restaurant-unread-messages']);
        },
    });

    // Mark order messages as read when viewing them
    React.useEffect(() => {
        if (selectedOrder && orderMessages.length > 0) {
            const unreadMessages = orderMessages.filter(m => m.sender_type === 'customer' && !m.is_read);
            unreadMessages.forEach(msg => {
                markOrderMessageAsRead.mutate(msg.id);
            });
        }
    }, [selectedOrder, orderMessages.length]);

    const sendMutation = useMutation({
        mutationFn: (data) => base44.entities.Message.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['messages']);
            setMessageText('');
            toast.success('Message sent');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, text }) => base44.entities.Message.update(id, { message: text }),
        onSuccess: () => {
            queryClient.invalidateQueries(['messages']);
            setEditingId(null);
            setEditText('');
            toast.success('Message updated');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.Message.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['messages']);
            setDeletingId(null);
            toast.success('Message deleted');
        },
    });

    const handleSend = () => {
        if (!messageText.trim() || !selectedOrder) return;
        
        sendMutation.mutate({
            order_id: selectedOrder,
            restaurant_id: restaurantId,
            sender_type: 'restaurant',
            message: messageText
        });
    };

    const unreadAdminMessages = adminMessages.filter(m => !m.is_read).length;

    return (
        <div className="space-y-4">
            {/* Admin Messages Section */}
            {adminMessages.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center justify-between">
                            <span>Messages from Platform</span>
                            {unreadAdminMessages > 0 && (
                                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                                    {unreadAdminMessages} new
                                </span>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[300px]">
                            <div className="space-y-3">
                                {adminMessages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`border rounded-lg p-4 ${!msg.is_read ? 'bg-orange-50 border-orange-200' : 'bg-white'}`}
                                        onClick={() => !msg.is_read && markAsRead.mutate(msg.id)}
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <p className="font-semibold text-sm">{msg.subject || 'Platform Message'}</p>
                                                <p className="text-xs text-gray-500">
                                                    {format(new Date(msg.created_date), 'MMM d, yyyy h:mm a')}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {msg.priority && (
                                                    <span className={`text-xs px-2 py-1 rounded ${
                                                        msg.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                                                        msg.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                                                        'bg-blue-100 text-blue-800'
                                                    }`}>
                                                        {msg.priority}
                                                    </span>
                                                )}
                                                {!msg.is_read && (
                                                    <span className="h-2 w-2 bg-orange-500 rounded-full"></span>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-700">{msg.message}</p>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            )}

            {/* Order Messages */}
            <div className="grid md:grid-cols-3 gap-4 h-[600px]">
                {/* Orders List */}
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-lg">Order Messages</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[500px]">
                            {orders.map((order) => (
                                <div
                                    key={order.id}
                                    onClick={() => setSelectedOrder(order.id)}
                                    className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                                        selectedOrder === order.id ? 'bg-orange-50' : ''
                                    }`}
                                >
                                    <p className="font-semibold">Order #{order.id.slice(-6)}</p>
                                    <p className="text-sm text-gray-500">{order.phone}</p>
                                    <p className="text-xs text-gray-400">
                                        {format(new Date(order.created_date), 'MMM d, h:mm a')}
                                    </p>
                                </div>
                            ))}
                        </ScrollArea>
                    </CardContent>
                </Card>

            {/* Messages */}
            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle className="text-lg">
                        {selectedOrder ? `Messages for Order #${selectedOrder.slice(-6)}` : 'Select an order'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {selectedOrder ? (
                        <>
                            <ScrollArea className="h-[400px] mb-4 p-4 border rounded-lg">
                                {orderMessages.length === 0 ? (
                                    <div className="text-center text-gray-500 py-8">
                                        <MessageSquare className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                                        <p>No messages yet</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {orderMessages.map((msg) => (
                                            <div
                                                key={msg.id}
                                                className={`flex ${msg.sender_type === 'restaurant' ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div
                                                    className={`max-w-[70%] rounded-lg p-3 ${
                                                        msg.sender_type === 'restaurant'
                                                            ? 'bg-orange-500 text-white'
                                                            : 'bg-gray-100 text-gray-900'
                                                    }`}
                                                >
                                                    {editingId === msg.id ? (
                                                        <div className="space-y-2">
                                                            <Textarea
                                                                value={editText}
                                                                onChange={(e) => setEditText(e.target.value)}
                                                                rows={2}
                                                                className="text-sm"
                                                            />
                                                            <div className="flex gap-2">
                                                                <Button 
                                                                    size="sm" 
                                                                    onClick={() => updateMutation.mutate({ id: editingId, text: editText })}
                                                                    className="h-7"
                                                                >
                                                                    <Check className="h-3 w-3 mr-1" />
                                                                    Save
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => {
                                                                        setEditingId(null);
                                                                        setEditText('');
                                                                    }}
                                                                    className="h-7"
                                                                >
                                                                    <X className="h-3 w-3 mr-1" />
                                                                    Cancel
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {msg.sender_type === 'restaurant' && (
                                                                <div className="flex gap-1 mb-2">
                                                                    <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-6 w-6 hover:bg-white/20"
                                                                        onClick={() => {
                                                                            setEditingId(msg.id);
                                                                            setEditText(msg.message);
                                                                        }}
                                                                    >
                                                                        <Edit2 className="h-3 w-3" />
                                                                    </Button>
                                                                    <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-6 w-6 hover:bg-white/20"
                                                                        onClick={() => setDeletingId(msg.id)}
                                                                    >
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                            <p className="text-sm">{msg.message}</p>
                                                            <p className="text-xs opacity-70 mt-1">
                                                                {format(new Date(msg.created_date), 'h:mm a')}
                                                            </p>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Type your message..."
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                />
                                <Button onClick={handleSend} className="bg-orange-500 hover:bg-orange-600">
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="h-[450px] flex items-center justify-center text-gray-400">
                            Select an order to view messages
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Message?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will permanently delete this message. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => deleteMutation.mutate(deletingId)}
                        className="bg-red-600 hover:bg-red-700"
                    >
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </div>
    );
}