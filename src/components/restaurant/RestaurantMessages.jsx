import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function RestaurantMessages({ restaurantId }) {
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [messageText, setMessageText] = useState('');
    const queryClient = useQueryClient();

    const { data: orders = [] } = useQuery({
        queryKey: ['orders-with-messages', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId }, '-created_date', 50),
    });

    const { data: messages = [] } = useQuery({
        queryKey: ['messages', selectedOrder],
        queryFn: () => base44.entities.Message.filter({ order_id: selectedOrder }, 'created_date'),
        enabled: !!selectedOrder,
        refetchInterval: 3000,
    });

    const sendMutation = useMutation({
        mutationFn: (data) => base44.entities.Message.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['messages']);
            setMessageText('');
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

    return (
        <div className="grid md:grid-cols-3 gap-4 h-[600px]">
            {/* Orders List */}
            <Card className="md:col-span-1">
                <CardHeader>
                    <CardTitle className="text-lg">Orders</CardTitle>
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
                                {messages.length === 0 ? (
                                    <div className="text-center text-gray-500 py-8">
                                        <MessageSquare className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                                        <p>No messages yet</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {messages.map((msg) => (
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
                                                    <p className="text-sm">{msg.message}</p>
                                                    <p className="text-xs opacity-70 mt-1">
                                                        {format(new Date(msg.created_date), 'h:mm a')}
                                                    </p>
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
    );
}