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
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>{selectedOrder.restaurant_name}</CardTitle>
                        <p className="text-sm text-gray-500">Order #{selectedOrder.id.slice(-6)}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedOrder(null)}>
                        Back
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex ${msg.sender_type === 'driver' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-lg p-3 ${
                                    msg.sender_type === 'driver'
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

                <div className="flex gap-2">
                    <Textarea
                        placeholder="Type a message..."
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        rows={2}
                    />
                    <Button onClick={handleSendMessage} disabled={!messageText.trim()}>
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}