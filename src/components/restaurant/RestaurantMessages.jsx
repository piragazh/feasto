import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MessageSquare, Send, Edit2, Trash2, X, Check, Eye, Bell, BellOff, CheckCheck, Volume2 } from 'lucide-react';
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
    const [previousMessageCount, setPreviousMessageCount] = useState({ admin: 0, order: 0 });
    const audioRef = useRef(null);
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
            toast.success('Message marked as read');
        },
    });

    const markAllAsRead = useMutation({
        mutationFn: async () => {
            const unreadMessages = adminMessages.filter(m => !m.is_read);
            for (const msg of unreadMessages) {
                await base44.entities.RestaurantMessage.update(msg.id, { is_read: true });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-messages']);
            queryClient.invalidateQueries(['restaurant-unread-messages']);
            toast.success('All messages marked as read');
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
    useEffect(() => {
        if (selectedOrder && orderMessages.length > 0) {
            const unreadMessages = orderMessages.filter(m => m.sender_type === 'customer' && !m.is_read);
            unreadMessages.forEach(msg => {
                if (!markOrderMessageAsRead.isPending) {
                    markOrderMessageAsRead.mutate(msg.id);
                }
            });
        }
    }, [selectedOrder]);

    // Play notification sound for new messages
    useEffect(() => {
        const currentAdminCount = adminMessages.filter(m => !m.is_read).length;
        const currentOrderCount = orderMessages.filter(m => m.sender_type === 'customer' && !m.is_read).length;

        // Only check for increases (new messages), not on initial load
        if (previousMessageCount.admin > 0 || previousMessageCount.order > 0) {
            if ((currentAdminCount > previousMessageCount.admin) || 
                (currentOrderCount > previousMessageCount.order && selectedOrder)) {
                // Play notification sound
                if (audioRef.current) {
                    audioRef.current.play().catch(e => console.log('Audio play failed:', e));
                }
                
                // Show toast notification
                if (currentAdminCount > previousMessageCount.admin) {
                    toast.info('New platform message received', {
                        icon: '📬',
                        duration: 4000
                    });
                }
                if (currentOrderCount > previousMessageCount.order && selectedOrder) {
                    toast.info('New customer message received', {
                        icon: '💬',
                        duration: 4000
                    });
                }
            }
        }

        setPreviousMessageCount({ admin: currentAdminCount, order: currentOrderCount });
    }, [adminMessages.length, orderMessages.length]);

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

    const deletePlatformMessageMutation = useMutation({
        mutationFn: (id) => base44.entities.RestaurantMessage.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-messages']);
            queryClient.invalidateQueries(['restaurant-unread-messages']);
            setDeletingPlatformMessage(null);
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
            {/* Hidden audio element for notification sound */}
            <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3" preload="auto" />

            {/* Admin Messages Section */}
            {adminMessages.length > 0 && (
                <Card className="border-2 border-gray-200 shadow-sm">
                    <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-3">
                                <div className="p-2 bg-blue-100 rounded-lg">
                                    <MessageSquare className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <span className="text-gray-900">Platform Messages</span>
                                    <p className="text-xs text-gray-500 font-normal mt-0.5">
                                        Messages from administrators
                                    </p>
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
                                            <CheckCheck className="h-4 w-4" />
                                            Mark all read
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4">
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
                                           <div className="flex-1">
                                               <div className="flex items-center gap-2 mb-1">
                                                   <p className="font-bold text-gray-900">
                                                       {msg.subject || 'Platform Message'}
                                                   </p>
                                                   {!msg.is_read && (
                                                       <Badge className="bg-orange-500 text-white text-xs px-1.5 py-0.5 animate-pulse">
                                                           NEW
                                                       </Badge>
                                                   )}
                                               </div>
                                               <div className="flex items-center gap-2">
                                                   <p className="text-xs text-gray-500">
                                                       {format(new Date(msg.created_date), 'MMM d, yyyy h:mm a')}
                                                   </p>
                                                   {msg.is_read && (
                                                       <CheckCheck className="h-3 w-3 text-green-600" />
                                                   )}
                                               </div>
                                           </div>
                                           <div className="flex items-center gap-2">
                                               {msg.priority && (
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
                                       <div className="flex gap-2">
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
                    </CardContent>
                </Card>
            )}

            {/* Order Messages */}
            <div className="grid md:grid-cols-3 gap-4 h-[600px]">
                {/* Orders List */}
                <Card className="md:col-span-1 border-2">
                    <CardHeader className="bg-gradient-to-r from-gray-50 to-slate-50">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-gray-600" />
                            Order Messages
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[500px]">
                            {orders.length === 0 ? (
                                <div className="text-center text-gray-500 py-12 px-4">
                                    <MessageSquare className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                                    <p className="text-sm">No orders yet</p>
                                </div>
                            ) : (
                                orders.map((order) => {
                                    const hasUnread = orderMessages.filter(
                                        m => m.order_id === order.id && m.sender_type === 'customer' && !m.is_read
                                    ).length > 0;
                                    
                                    return (
                                        <div
                                            key={order.id}
                                            onClick={() => setSelectedOrder(order.id)}
                                            className={`p-4 border-b cursor-pointer transition-all ${
                                                selectedOrder === order.id 
                                                    ? 'bg-gradient-to-r from-orange-100 to-amber-100 border-l-4 border-l-orange-500' 
                                                    : hasUnread 
                                                        ? 'bg-blue-50 hover:bg-blue-100'
                                                        : 'hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="font-bold text-gray-900">Order #{order.id.slice(-6)}</p>
                                                {hasUnread && selectedOrder !== order.id && (
                                                    <Badge className="bg-blue-500 text-white text-xs animate-pulse">
                                                        New
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-600">{order.phone}</p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {format(new Date(order.created_date), 'MMM d, h:mm a')}
                                            </p>
                                        </div>
                                    );
                                })
                            )}
                        </ScrollArea>
                    </CardContent>
                </Card>

            {/* Messages */}
            <Card className="md:col-span-2 border-2">
                <CardHeader className="bg-gradient-to-r from-gray-50 to-slate-50">
                    <CardTitle className="text-lg flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Send className="h-5 w-5 text-gray-600" />
                            {selectedOrder ? `Order #${selectedOrder.slice(-6)}` : 'Select an order'}
                        </div>
                        {selectedOrder && (
                            <Badge variant="outline" className="text-xs">
                                {orderMessages.length} message{orderMessages.length !== 1 ? 's' : ''}
                            </Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                    {selectedOrder ? (
                        <>
                            <ScrollArea className="h-[400px] mb-4 p-4 border-2 rounded-xl bg-gradient-to-b from-gray-50 to-white">
                                {orderMessages.length === 0 ? (
                                    <div className="text-center text-gray-500 py-12">
                                        <MessageSquare className="h-16 w-16 mx-auto mb-3 text-gray-300" />
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
                                                <div
                                                    className={`max-w-[70%] rounded-2xl p-4 shadow-sm ${
                                                        msg.sender_type === 'restaurant'
                                                            ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white'
                                                            : 'bg-white border-2 border-gray-200 text-gray-900'
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
                                                            </div>
                                                            <p className="text-sm leading-relaxed">{msg.message}</p>
                                                            <div className="flex items-center justify-between mt-2">
                                                                <p className="text-xs opacity-70">
                                                                    {format(new Date(msg.created_date), 'h:mm a')}
                                                                </p>
                                                                {msg.is_read && msg.sender_type === 'restaurant' && (
                                                                    <CheckCheck className="h-3 w-3 opacity-70" />
                                                                )}
                                                            </div>
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
                                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                                    className="border-2 focus:border-orange-500"
                                />
                                <Button 
                                    onClick={handleSend} 
                                    disabled={!messageText.trim()}
                                    className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-md"
                                >
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

        {/* View Platform Message Dialog */}
        <Dialog open={!!viewingPlatformMessage} onOpenChange={() => setViewingPlatformMessage(null)}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {viewingPlatformMessage?.subject || 'Platform Message'}
                    </DialogTitle>
                </DialogHeader>
                {viewingPlatformMessage && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-500">
                                {format(new Date(viewingPlatformMessage.created_date), 'MMM d, yyyy h:mm a')}
                            </span>
                            {viewingPlatformMessage.priority && (
                                <span className={`text-xs px-2 py-1 rounded ${
                                    viewingPlatformMessage.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                                    viewingPlatformMessage.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                                    'bg-blue-100 text-blue-800'
                                }`}>
                                    {viewingPlatformMessage.priority}
                                </span>
                            )}
                        </div>
                        <div className="border-t pt-4">
                            <p className="text-gray-700 whitespace-pre-wrap">{viewingPlatformMessage.message}</p>
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => setViewingPlatformMessage(null)}>
                        Close
                    </Button>
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
                        This will permanently delete this message from the platform. This action cannot be undone.
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