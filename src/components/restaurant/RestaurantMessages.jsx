import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MessageSquare, Send, Edit2, Trash2, X, Check, Eye, CheckCheck, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function RestaurantMessages({ restaurantId }) {
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [messageText, setMessageText] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editText, setEditText] = useState('');
    const [deletingId, setDeletingId] = useState(null);
    const [viewingPlatformMessage, setViewingPlatformMessage] = useState(null);
    const [deletingPlatformMessage, setDeletingPlatformMessage] = useState(null);
    const prevAdminCountRef = useRef(null);
    const prevOrderCountRef = useRef(null);
    const audioRef = useRef(null);
    const messagesEndRef = useRef(null);
    const markedReadRef = useRef(new Set()); // track already-marked IDs to avoid re-triggering
    const queryClient = useQueryClient();

    const { data: orders = [], isLoading: ordersLoading } = useQuery({
        queryKey: ['orders-with-messages', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 50),
        enabled: !!restaurantId,
    });

    const { data: orderMessages = [], isLoading: messagesLoading } = useQuery({
        queryKey: ['messages', selectedOrder],
        queryFn: () => base44.entities.Message.filter({ order_id: selectedOrder }, 'created_date'),
        enabled: !!selectedOrder,
        refetchInterval: 5000,
    });

    const { data: adminMessages = [], isLoading: adminLoading } = useQuery({
        queryKey: ['admin-messages', restaurantId],
        queryFn: () => base44.entities.RestaurantMessage.filter({ restaurant_id: restaurantId }, '-created_date', 100),
        enabled: !!restaurantId,
        refetchInterval: 10000,
    });

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [orderMessages.length]);

    // Reset marked-read set when switching orders
    useEffect(() => {
        markedReadRef.current = new Set();
    }, [selectedOrder]);

    const markAsRead = useMutation({
        mutationFn: (messageId) => base44.entities.RestaurantMessage.update(messageId, { is_read: true }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-messages', restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['restaurant-unread-messages', restaurantId] });
        },
    });

    const markAllAsRead = useMutation({
        mutationFn: async () => {
            const unreadMessages = adminMessages.filter(m => !m.is_read);
            await Promise.all(unreadMessages.map(msg =>
                base44.entities.RestaurantMessage.update(msg.id, { is_read: true })
            ));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-messages', restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['restaurant-unread-messages', restaurantId] });
            toast.success('All messages marked as read');
        },
    });

    const markOrderMessageAsRead = useMutation({
        mutationFn: (messageId) => base44.entities.Message.update(messageId, { is_read: true }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', selectedOrder] });
            queryClient.invalidateQueries({ queryKey: ['unread-order-messages-count', restaurantId] });
        },
    });

    // Mark unread customer messages as read — deduplicated via ref to avoid infinite loops
    useEffect(() => {
        if (!selectedOrder || orderMessages.length === 0) return;
        const unread = orderMessages.filter(
            m => m.sender_type === 'customer' && !m.is_read && !markedReadRef.current.has(m.id)
        );
        unread.forEach(msg => {
            markedReadRef.current.add(msg.id);
            markOrderMessageAsRead.mutate(msg.id);
        });
    }, [selectedOrder, orderMessages]); // eslint-disable-line react-hooks/exhaustive-deps

    // Notification sound for new messages — uses refs to avoid stale closure issues
    useEffect(() => {
        const currentAdminCount = adminMessages.length;
        if (prevAdminCountRef.current !== null && currentAdminCount > prevAdminCountRef.current) {
            audioRef.current?.play().catch(() => {});
            toast.info('New platform message received', { icon: '📬', duration: 4000 });
        }
        prevAdminCountRef.current = currentAdminCount;
    }, [adminMessages.length]);

    useEffect(() => {
        const currentOrderCount = orderMessages.filter(m => m.sender_type === 'customer').length;
        if (prevOrderCountRef.current !== null && currentOrderCount > prevOrderCountRef.current && selectedOrder) {
            audioRef.current?.play().catch(() => {});
            toast.info('New customer message received', { icon: '💬', duration: 4000 });
        }
        prevOrderCountRef.current = currentOrderCount;
    }, [orderMessages.length, selectedOrder]); // eslint-disable-line react-hooks/exhaustive-deps

    const sendMutation = useMutation({
        mutationFn: (data) => base44.entities.Message.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', selectedOrder] });
            setMessageText('');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, text }) => base44.entities.Message.update(id, { message: text }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', selectedOrder] });
            setEditingId(null);
            setEditText('');
            toast.success('Message updated');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.Message.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', selectedOrder] });
            setDeletingId(null);
            toast.success('Message deleted');
        },
    });

    const deletePlatformMessageMutation = useMutation({
        mutationFn: (id) => base44.entities.RestaurantMessage.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-messages', restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['restaurant-unread-messages', restaurantId] });
            setDeletingPlatformMessage(null);
            toast.success('Message deleted');
        },
    });

    const handleSend = useCallback(() => {
        if (!messageText.trim() || !selectedOrder || sendMutation.isPending) return;
        sendMutation.mutate({
            order_id: selectedOrder,
            restaurant_id: restaurantId,
            sender_type: 'restaurant',
            message: messageText.trim()
        });
    }, [messageText, selectedOrder, restaurantId, sendMutation]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const unreadAdminMessages = adminMessages.filter(m => !m.is_read).length;

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        try { return format(new Date(dateStr), 'MMM d, yyyy h:mm a'); } catch { return '—'; }
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return '—';
        try { return format(new Date(dateStr), 'h:mm a'); } catch { return '—'; }
    };

    return (
        <div className="space-y-4">
            <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3" preload="auto" />

            {/* Platform Messages */}
            {(adminLoading || adminMessages.length > 0) && (
                <Card className="border-2 border-gray-200 shadow-sm">
                    <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-3">
                                <div className="p-2 bg-blue-100 rounded-lg">
                                    <MessageSquare className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <span className="text-gray-900">Platform Messages</span>
                                    <p className="text-xs text-gray-500 font-normal mt-0.5">Messages from administrators</p>
                                </div>
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                {unreadAdminMessages > 0 && (
                                    <>
                                        <Badge className="bg-red-500 text-white animate-pulse">
                                            {unreadAdminMessages} unread
                                        </Badge>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => markAllAsRead.mutate()}
                                            disabled={markAllAsRead.isPending}
                                            className="gap-2"
                                        >
                                            {markAllAsRead.isPending
                                                ? <RefreshCw className="h-4 w-4 animate-spin" />
                                                : <CheckCheck className="h-4 w-4" />
                                            }
                                            Mark all read
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4">
                        {adminLoading ? (
                            <div className="space-y-3">
                                <Skeleton className="h-24 w-full rounded-lg" />
                                <Skeleton className="h-24 w-full rounded-lg" />
                            </div>
                        ) : (
                            <ScrollArea className="h-[320px]">
                                <div className="space-y-3 pr-3">
                                    {adminMessages.map((msg) => (
                                        <div
                                            key={msg.id}
                                            className={`relative border-l-4 rounded-lg p-4 transition-all hover:shadow-md ${
                                                !msg.is_read
                                                    ? 'bg-gradient-to-r from-orange-50 to-amber-50 border-l-orange-500 shadow-sm'
                                                    : 'bg-white border-l-gray-300 hover:border-l-gray-400'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="font-bold text-gray-900 truncate">
                                                            {msg.subject || 'Platform Message'}
                                                        </p>
                                                        {!msg.is_read && (
                                                            <Badge className="bg-orange-500 text-white text-xs px-1.5 py-0.5 animate-pulse flex-shrink-0">
                                                                NEW
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-xs text-gray-500">{formatDate(msg.created_date)}</p>
                                                        {msg.is_read && <CheckCheck className="h-3 w-3 text-green-600" />}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                                    {msg.priority && msg.priority !== 'normal' && (
                                                        <Badge className={`text-xs font-semibold ${
                                                            msg.priority === 'urgent' ? 'bg-red-500 text-white' :
                                                            msg.priority === 'high' ? 'bg-orange-500 text-white' :
                                                            'bg-blue-500 text-white'
                                                        }`}>
                                                            {msg.priority.toUpperCase()}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-sm text-gray-700 line-clamp-2 mb-4 leading-relaxed">
                                                {msg.message}
                                            </p>
                                            <div className="flex gap-2 flex-wrap">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setViewingPlatformMessage(msg);
                                                        if (!msg.is_read) markAsRead.mutate(msg.id);
                                                    }}
                                                    className="bg-white hover:bg-gray-50"
                                                >
                                                    <Eye className="h-3 w-3 mr-1.5" />
                                                    View Full
                                                </Button>
                                                {!msg.is_read && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => markAsRead.mutate(msg.id)}
                                                        disabled={markAsRead.isPending}
                                                        className="bg-white hover:bg-green-50 text-green-600"
                                                    >
                                                        <CheckCheck className="h-3 w-3 mr-1.5" />
                                                        Mark Read
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setDeletingPlatformMessage(msg.id)}
                                                    className="bg-white hover:bg-red-50 text-red-600 ml-auto"
                                                >
                                                    <Trash2 className="h-3 w-3 mr-1.5" />
                                                    Delete
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Order Messages */}
            <div className="grid md:grid-cols-3 gap-4">
                {/* Orders List */}
                <Card className="md:col-span-1 border-2">
                    <CardHeader className="bg-gradient-to-r from-gray-50 to-slate-50 py-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-gray-600" />
                            Order Conversations
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[520px]">
                            {ordersLoading ? (
                                <div className="p-4 space-y-3">
                                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded" />)}
                                </div>
                            ) : orders.length === 0 ? (
                                <div className="text-center text-gray-500 py-12 px-4">
                                    <MessageSquare className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                                    <p className="text-sm">No orders yet</p>
                                </div>
                            ) : (
                                orders.map((order) => {
                                    const isSelected = selectedOrder === order.id;
                                    return (
                                        <div
                                            key={order.id}
                                            onClick={() => setSelectedOrder(order.id)}
                                            className={`p-4 border-b cursor-pointer transition-all ${
                                                isSelected
                                                    ? 'bg-gradient-to-r from-orange-100 to-amber-100 border-l-4 border-l-orange-500'
                                                    : 'hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="font-bold text-gray-900 text-sm">Order #{order.id.slice(-6)}</p>
                                                <Badge variant="outline" className={`text-xs ${
                                                    order.status === 'delivered' || order.status === 'collected' ? 'text-green-600' :
                                                    order.status === 'cancelled' ? 'text-red-600' : 'text-orange-600'
                                                }`}>
                                                    {order.status}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-gray-500">{order.phone || order.guest_name || '—'}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {formatDate(order.created_date)}
                                            </p>
                                        </div>
                                    );
                                })
                            )}
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* Chat Panel */}
                <Card className="md:col-span-2 border-2 flex flex-col" style={{ height: '580px' }}>
                    <CardHeader className="bg-gradient-to-r from-gray-50 to-slate-50 py-3 flex-shrink-0">
                        <CardTitle className="text-base flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Send className="h-4 w-4 text-gray-600" />
                                {selectedOrder ? `Order #${selectedOrder.slice(-6)}` : 'Select an order'}
                            </div>
                            {selectedOrder && (
                                <Badge variant="outline" className="text-xs">
                                    {orderMessages.length} message{orderMessages.length !== 1 ? 's' : ''}
                                </Badge>
                            )}
                        </CardTitle>
                    </CardHeader>

                    {selectedOrder ? (
                        <>
                            {/* Messages scroll area */}
                            <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-0">
                                {messagesLoading ? (
                                    <div className="space-y-4">
                                        <Skeleton className="h-16 w-3/4 rounded-2xl" />
                                        <Skeleton className="h-16 w-3/4 rounded-2xl ml-auto" />
                                        <Skeleton className="h-16 w-3/4 rounded-2xl" />
                                    </div>
                                ) : orderMessages.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                        <MessageSquare className="h-16 w-16 mb-3 text-gray-300" />
                                        <p className="font-medium">No messages yet</p>
                                        <p className="text-sm mt-1">Start a conversation with your customer</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {orderMessages.map((msg) => (
                                            <div
                                                key={msg.id}
                                                className={`flex ${msg.sender_type === 'restaurant' ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div className={`max-w-[70%] rounded-2xl p-4 shadow-sm ${
                                                    msg.sender_type === 'restaurant'
                                                        ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white'
                                                        : 'bg-white border-2 border-gray-200 text-gray-900'
                                                }`}>
                                                    {editingId === msg.id ? (
                                                        <div className="space-y-2">
                                                            <Textarea
                                                                value={editText}
                                                                onChange={(e) => setEditText(e.target.value)}
                                                                rows={2}
                                                                className="text-sm text-gray-900"
                                                                autoFocus
                                                            />
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => updateMutation.mutate({ id: editingId, text: editText })}
                                                                    disabled={!editText.trim() || updateMutation.isPending}
                                                                    className="h-7"
                                                                >
                                                                    <Check className="h-3 w-3 mr-1" />
                                                                    Save
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => { setEditingId(null); setEditText(''); }}
                                                                    className="h-7"
                                                                >
                                                                    <X className="h-3 w-3 mr-1" />
                                                                    Cancel
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <Badge variant="outline" className={`text-xs ${
                                                                    msg.sender_type === 'restaurant'
                                                                        ? 'bg-white/20 text-white border-white/30'
                                                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                                                }`}>
                                                                    {msg.sender_type === 'restaurant' ? 'You' : 'Customer'}
                                                                </Badge>
                                                                {msg.sender_type === 'restaurant' && (
                                                                    <div className="flex gap-1">
                                                                        <Button
                                                                            size="icon"
                                                                            variant="ghost"
                                                                            className="h-6 w-6 hover:bg-white/20"
                                                                            onClick={() => { setEditingId(msg.id); setEditText(msg.message); }}
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
                                                            </div>
                                                            <p className="text-sm leading-relaxed">{msg.message}</p>
                                                            <div className="flex items-center justify-between mt-2">
                                                                <p className="text-xs opacity-70">{formatTime(msg.created_date)}</p>
                                                                {msg.is_read && msg.sender_type === 'restaurant' && (
                                                                    <CheckCheck className="h-3 w-3 opacity-70" />
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {/* Scroll anchor */}
                                        <div ref={messagesEndRef} />
                                    </div>
                                )}
                            </div>

                            {/* Input — always visible at bottom */}
                            <div className="flex-shrink-0 border-t p-3 bg-white">
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Type your message..."
                                        value={messageText}
                                        onChange={(e) => setMessageText(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        className="border-2 focus:border-orange-500"
                                        disabled={sendMutation.isPending}
                                    />
                                    <Button
                                        onClick={handleSend}
                                        disabled={!messageText.trim() || sendMutation.isPending}
                                        className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-md flex-shrink-0"
                                    >
                                        {sendMutation.isPending
                                            ? <RefreshCw className="h-4 w-4 animate-spin" />
                                            : <Send className="h-4 w-4" />
                                        }
                                    </Button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400">
                            <div className="text-center">
                                <MessageSquare className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                                <p>Select an order to view messages</p>
                            </div>
                        </div>
                    )}
                </Card>
            </div>

            {/* View Platform Message Dialog */}
            <Dialog open={!!viewingPlatformMessage} onOpenChange={() => setViewingPlatformMessage(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{viewingPlatformMessage?.subject || 'Platform Message'}</DialogTitle>
                    </DialogHeader>
                    {viewingPlatformMessage && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">{formatDate(viewingPlatformMessage.created_date)}</span>
                                {viewingPlatformMessage.priority && viewingPlatformMessage.priority !== 'normal' && (
                                    <span className={`text-xs px-2 py-1 rounded font-medium ${
                                        viewingPlatformMessage.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                                        viewingPlatformMessage.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                                        'bg-blue-100 text-blue-800'
                                    }`}>
                                        {viewingPlatformMessage.priority.toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <div className="border-t pt-4">
                                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{viewingPlatformMessage.message}</p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setViewingPlatformMessage(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Order Message Confirmation */}
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

            {/* Delete Platform Message Confirmation */}
            <AlertDialog open={!!deletingPlatformMessage} onOpenChange={() => setDeletingPlatformMessage(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Platform Message?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this message. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deletePlatformMessageMutation.mutate(deletingPlatformMessage)}
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