import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function DriverCommunication({ driverId }) {
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [messageText, setMessageText] = useState('');
    const queryClient = useQueryClient();

    const { data: recentOrders = [] } = useQuery({
        queryKey: ['driver-recent-orders', driverId],
        queryFn: () => base44.entities.Order.filter({
            driver_id: driverId,
            status: { $in: ['out_for_delivery', 'delivered'] }
        }, '-created_date', 10),
    });

    const { data: messages = [] } = useQuery({
        queryKey: ['driver-messages', selectedOrder?.id],
        queryFn: () => base44.entities.Message.filter({
            order_id: selectedOrder.id
        }),
        enabled: !!selectedOrder,
        refetchInterval: 3000,
    });

    const sendMessageMutation = useMutation({
        mutationFn: (data) => base44.entities.Message.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['driver-messages']);
            setMessageText('');
            toast.success('Message sent');
        },
    });

    const handleSendMessage = () => {
        if (!messageText.trim() || !selectedOrder) return;

        sendMessageMutation.mutate({
            order_id: selectedOrder.id,
            restaurant_id: selectedOrder.restaurant_id,
            sender_type: 'driver',
            message: messageText
        });
    };

    if (!selectedOrder) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Messages</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-gray-600 mb-4">
                        Select an order to view messages
                    </p>
                    <div className="space-y-2">
                        {recentOrders.map((order) => (
                            <Button
                                key={order.id}
                                variant="outline"
                                className="w-full justify-start"
                                onClick={() => setSelectedOrder(order)}
                            >
                                <div className="text-left">
                                    <p className="font-semibold">{order.restaurant_name}</p>
                                    <p className="text-xs text-gray-500">
                                        Order #{order.id.slice(-6)}
                                    </p>
                                </div>
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="h-[600px] flex flex-col overflow-hidden">
            <CardHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-blue-600" />
                            <CardTitle className="text-blue-900">{selectedOrder.restaurant_name}</CardTitle>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">Order #{selectedOrder.id.slice(-6)}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedOrder(null)}>
                        Back
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="flex-1 p-4 overflow-y-auto bg-gray-50 space-y-3">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-12">
                            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                                <MessageSquare className="h-8 w-8 text-blue-500" />
                            </div>
                            <p className="text-gray-600 font-medium">No messages yet</p>
                            <p className="text-sm text-gray-500 mt-1">Start the conversation with the restaurant</p>
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.sender_type === 'driver' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                                        msg.sender_type === 'driver'
                                            ? 'bg-blue-500 text-white rounded-br-sm'
                                            : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm'
                                    }`}
                                >
                                    <p className="text-sm leading-relaxed">{msg.message}</p>
                                    <p className={`text-xs mt-1.5 ${msg.sender_type === 'driver' ? 'text-blue-100' : 'text-gray-500'}`}>
                                        {format(new Date(msg.created_date), 'h:mm a')}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}

                <div className="border-t bg-white p-4 mt-auto">
                    <div className="flex gap-2">
                        <Textarea
                            placeholder="Type a message..."
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            className="flex-1 min-h-[60px] resize-none rounded-xl border-gray-300 focus:border-blue-500"
                        />
                        <Button 
                            onClick={handleSendMessage} 
                            disabled={!messageText.trim()}
                            className="bg-blue-500 hover:bg-blue-600 rounded-xl h-[60px] px-4"
                        >
                            <Send className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}