import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Send, Image as ImageIcon, User, Store, Truck } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

export default function ChatInterface({ conversation, currentUser, onClose }) {
    const [message, setMessage] = useState('');
    const [uploadingImage, setUploadingImage] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const messagesEndRef = useRef(null);
    const queryClient = useQueryClient();

    const { data: messages = [] } = useQuery({
        queryKey: ['chat-messages', conversation?.id, conversation?.type],
        queryFn: async () => {
            if (conversation.type === 'conversation') {
                return base44.entities.ChatMessage.filter({ conversation_id: conversation.id }, 'created_date');
            } else if (conversation.type === 'order') {
                const msgs = await base44.entities.Message.filter({ order_id: conversation.order_id }, 'created_date');
                return msgs.map(m => ({
                    id: m.id,
                    sender_email: m.sender_type === 'restaurant' ? 'restaurant@system' : currentUser.email,
                    sender_name: m.sender_type === 'restaurant' ? conversation.displayName : 'You',
                    sender_type: m.sender_type,
                    message: m.message,
                    created_date: m.created_date,
                    read_by: m.is_read ? [currentUser.email] : []
                }));
            } else if (conversation.type === 'driver') {
                const msgs = await base44.entities.DriverMessage.filter({ order_id: conversation.order_id }, 'created_date');
                return msgs.map(m => ({
                    id: m.id,
                    sender_email: m.sender_type === 'driver' ? 'driver@system' : 'restaurant@system',
                    sender_name: m.sender_type === 'driver' ? conversation.displayName : 'Restaurant',
                    sender_type: m.sender_type,
                    message: m.message,
                    created_date: m.created_date,
                    read_by: m.is_read ? [currentUser.email] : []
                }));
            }
            return [];
        },
        enabled: !!conversation?.id,
        staleTime: 5000, // 5s cache
        refetchInterval: 10000, // Refetch every 10s instead of 2s
    });

    useEffect(() => {
        scrollToBottom();
        markMessagesAsRead();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const markMessagesAsRead = async () => {
        if (!messages || messages.length === 0 || !conversation?.id) return;
        
        const unreadMessages = messages.filter(m => 
            m.sender_email !== currentUser.email && 
            !m.read_by?.includes(currentUser.email)
        );

        if (conversation.type === 'conversation') {
            for (const msg of unreadMessages) {
                await base44.entities.ChatMessage.update(msg.id, {
                    read_by: [...(msg.read_by || []), currentUser.email]
                });
            }
            const newUnreadCount = { ...(conversation.unread_count || {}) };
            newUnreadCount[currentUser.email] = 0;
            await base44.entities.Conversation.update(conversation.id, {
                unread_count: newUnreadCount
            });
        } else if (conversation.type === 'order') {
            for (const msg of unreadMessages) {
                const originalMsg = await base44.entities.Message.filter({ id: msg.id });
                if (originalMsg[0]) {
                    await base44.entities.Message.update(msg.id, { is_read: true });
                }
            }
        } else if (conversation.type === 'driver') {
            for (const msg of unreadMessages) {
                const originalMsg = await base44.entities.DriverMessage.filter({ id: msg.id });
                if (originalMsg[0]) {
                    await base44.entities.DriverMessage.update(msg.id, { is_read: true });
                }
            }
        }

        queryClient.invalidateQueries(['all-messages']);
    };

    const sendMessageMutation = useMutation({
        mutationFn: async (messageData) => {
            if (conversation.type === 'conversation') {
                const newMessage = await base44.entities.ChatMessage.create(messageData);
                const unreadCount = { ...(conversation.unread_count || {}) };
                (conversation.participants || []).forEach(p => {
                    if (p !== currentUser.email) {
                        unreadCount[p] = (unreadCount[p] || 0) + 1;
                    }
                });
                await base44.entities.Conversation.update(conversation.id, {
                    last_message: messageData.message || '📷 Image',
                    last_message_time: new Date().toISOString(),
                    unread_count: unreadCount
                });
                return newMessage;
            } else if (conversation.type === 'order') {
                return base44.entities.Message.create({
                    order_id: conversation.order_id,
                    restaurant_id: conversation.restaurant_id,
                    sender_type: 'customer',
                    message: messageData.message,
                    is_read: false
                });
            } else if (conversation.type === 'driver') {
                return base44.entities.DriverMessage.create({
                    order_id: conversation.order_id,
                    driver_id: conversation.driver_id,
                    restaurant_id: conversation.restaurant_id,
                    sender_type: 'customer',
                    message: messageData.message,
                    is_read: false
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['chat-messages']);
            queryClient.invalidateQueries(['all-messages']);
            setMessage('');
            setImagePreview(null);
        },
    });

    const handleSend = () => {
        if (!message.trim() && !imagePreview) return;

        const userType = currentUser.role === 'admin' ? 'restaurant' : 'customer';

        if (conversation.type === 'conversation') {
            sendMessageMutation.mutate({
                conversation_id: conversation.id,
                sender_email: currentUser.email,
                sender_name: currentUser.full_name || currentUser.email,
                sender_type: userType,
                message: message.trim(),
                image_url: imagePreview
            });
        } else {
            sendMessageMutation.mutate({
                message: message.trim()
            });
        }
    };

    const handleImageUpload = async (file) => {
        setUploadingImage(true);
        try {
            const result = await base44.integrations.Core.UploadFile({ file });
            setImagePreview(result.file_url);
            toast.success('Image uploaded');
        } catch (error) {
            toast.error('Failed to upload image');
        } finally {
            setUploadingImage(false);
        }
    };

    const getParticipantName = () => {
        return conversation.displayName || 'Chat';
    };

    const getIcon = (type) => {
        switch (type) {
            case 'restaurant': return Store;
            case 'driver': return Truck;
            default: return User;
        }
    };

    return (
        <Card className="h-[600px] flex flex-col">
            <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        {getParticipantName()}
                    </CardTitle>
                    <Button size="icon" variant="ghost" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>
            </CardHeader>
            
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {!messages || messages.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">No messages yet. Start the conversation!</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isOwnMessage = msg.sender_email === currentUser.email;
                        const Icon = getIcon(msg.sender_type);

                        return (
                            <div
                                key={msg.id}
                                className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                    msg.sender_type === 'restaurant' ? 'bg-blue-100' :
                                    msg.sender_type === 'driver' ? 'bg-green-100' : 'bg-gray-100'
                                }`}>
                                    <Icon className={`h-4 w-4 ${
                                        msg.sender_type === 'restaurant' ? 'text-blue-600' :
                                        msg.sender_type === 'driver' ? 'text-green-600' : 'text-gray-600'
                                    }`} />
                                </div>
                                <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-[70%]`}>
                                    <div className={`rounded-2xl px-4 py-2 ${
                                        isOwnMessage 
                                            ? 'bg-orange-500 text-white' 
                                            : 'bg-gray-100 text-gray-900'
                                    }`}>
                                        {msg.image_url && (
                                            <img 
                                                src={msg.image_url} 
                                                alt="Attachment" 
                                                className="rounded-lg mb-2 max-w-full"
                                            />
                                        )}
                                        {msg.message && <p className="text-sm">{msg.message}</p>}
                                    </div>
                                    <span className="text-xs text-gray-500 mt-1">
                                        {moment(msg.created_date).format('h:mm A')}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </CardContent>

            <div className="border-t p-4">
                {imagePreview && (
                    <div className="mb-2 relative inline-block">
                        <img src={imagePreview} alt="Preview" className="h-20 rounded-lg" />
                        <Button
                            size="icon"
                            variant="destructive"
                            className="absolute -top-2 -right-2 h-6 w-6"
                            onClick={() => setImagePreview(null)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                )}
                <div className="flex gap-2">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(file);
                        }}
                        className="hidden"
                        id="image-upload"
                    />
                    <label htmlFor="image-upload">
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={uploadingImage}
                            asChild
                        >
                            <span className="cursor-pointer">
                                <ImageIcon className="h-5 w-5" />
                            </span>
                        </Button>
                    </label>
                    <Input
                        placeholder="Type a message..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        className="flex-1"
                    />
                    <Button
                        onClick={handleSend}
                        disabled={(!message.trim() && !imagePreview) || sendMessageMutation.isPending}
                        className="bg-orange-500 hover:bg-orange-600"
                    >
                        <Send className="h-5 w-5" />
                    </Button>
                </div>
            </div>
        </Card>
    );
}