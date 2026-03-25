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

    const QUICK_REPLIES = [
        "I've picked up the order, on my way!",
        "Running slightly late, approx 5 mins.",
        "Order is ready for pickup.",
        "I'm outside the restaurant.",
    ];

    return (
        <Card className="flex flex-col overflow-hidden" style={{ height: '560px' }}>
            <CardHeader className="px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-indigo-50 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-blue-600" />
                            <CardTitle className="text-blue-900 text-base">{selectedOrder.restaurant_name}</CardTitle>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">Order #{selectedOrder.id.slice(-6)}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedOrder(null)}>Back</Button>
                </div>
            </CardHeader>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-3">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                            <MessageSquare className="h-6 w-6 text-blue-500" />
                        </div>
                        <p className="text-gray-600 text-sm font-medium">No messages yet</p>
                        <p className="text-xs text-gray-500 mt-1">Use quick replies or type a message</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.sender_type === 'driver' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[78%] rounded-2xl px-3 py-2 shadow-sm text-sm ${
                                msg.sender_type === 'driver'
                                    ? 'bg-blue-500 text-white rounded-br-sm'
                                    : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm'
                            }`}>
                                <p className="leading-relaxed">{msg.message}</p>
                                <p className={`text-xs mt-1 ${msg.sender_type === 'driver' ? 'text-blue-100' : 'text-gray-400'}`}>
                                    {format(new Date(msg.created_date), 'h:mm a')}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Quick replies + input — fixed at bottom */}
            <div className="border-t bg-white px-3 pt-2 pb-3 flex-shrink-0 space-y-2">
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
                    {QUICK_REPLIES.map((r) => (
                        <button
                            key={r}
                            onClick={() => setMessageText(r)}
                            className="text-xs bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-700 px-2.5 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 transition-colors border border-gray-200 hover:border-blue-300"
                        >
                            {r}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <Textarea
                        placeholder="Type a message..."
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                        className="flex-1 min-h-[52px] max-h-[100px] resize-none rounded-xl text-sm"
                        rows={2}
                    />
                    <Button
                        onClick={handleSendMessage}
                        disabled={!messageText.trim() || sendMessageMutation.isPending}
                        className="bg-blue-500 hover:bg-blue-600 rounded-xl h-[52px] px-4 flex-shrink-0"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </Card>
    );
}