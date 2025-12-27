import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, User } from 'lucide-react';
import { format } from 'date-fns';

export default function DriverChat({ order, driver }) {
    const [message, setMessage] = useState('');
    const scrollRef = useRef(null);
    const queryClient = useQueryClient();

    const { data: messages = [] } = useQuery({
        queryKey: ['driver-messages', order.id],
        queryFn: () => base44.entities.Message.filter({ 
            order_id: order.id 
        }, 'created_date'),
        refetchInterval: 3000,
    });

    const sendMessageMutation = useMutation({
        mutationFn: (msg) => base44.entities.Message.create({
            order_id: order.id,
            restaurant_id: order.restaurant_id,
            sender_type: 'driver',
            message: msg
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['driver-messages']);
            setMessage('');
        },
    });

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = (e) => {
        e.preventDefault();
        if (message.trim()) {
            sendMessageMutation.mutate(message.trim());
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Order Chat
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-64 mb-4 rounded-lg border p-4" ref={scrollRef}>
                    {messages.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">
                            No messages yet
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {messages.map((msg) => (
                                <div 
                                    key={msg.id} 
                                    className={`flex ${msg.sender_type === 'driver' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[70%] ${
                                        msg.sender_type === 'driver' 
                                            ? 'bg-orange-500 text-white' 
                                            : 'bg-gray-100 text-gray-900'
                                    } rounded-lg px-4 py-2`}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <User className="h-3 w-3" />
                                            <span className="text-xs font-medium">
                                                {msg.sender_type === 'driver' ? 'You' : 
                                                 msg.sender_type === 'customer' ? 'Customer' : 'Restaurant'}
                                            </span>
                                        </div>
                                        <p className="text-sm">{msg.message}</p>
                                        <p className={`text-xs mt-1 ${
                                            msg.sender_type === 'driver' ? 'text-orange-100' : 'text-gray-500'
                                        }`}>
                                            {format(new Date(msg.created_date), 'h:mm a')}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
                <form onSubmit={handleSend} className="flex gap-2">
                    <Input
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type a message..."
                        disabled={sendMessageMutation.isPending}
                    />
                    <Button type="submit" disabled={!message.trim() || sendMessageMutation.isPending}>
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}