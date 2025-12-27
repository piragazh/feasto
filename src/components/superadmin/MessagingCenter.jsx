import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
    MessageSquare, 
    Send, 
    AlertCircle,
    CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { format } from 'date-fns';

export default function MessagingCenter() {
    const [selectedRestaurant, setSelectedRestaurant] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [priority, setPriority] = useState('normal');
    const queryClient = useQueryClient();

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const { data: messages = [] } = useQuery({
        queryKey: ['restaurant-messages'],
        queryFn: () => base44.entities.RestaurantMessage.list('-created_date', 100),
    });

    const sendMessage = useMutation({
        mutationFn: async (messageData) => {
            return base44.entities.RestaurantMessage.create(messageData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-messages']);
            setSelectedRestaurant('');
            setSubject('');
            setMessage('');
            setPriority('normal');
            toast.success('Message sent successfully!');
        },
    });

    const handleSend = () => {
        if (!selectedRestaurant || !message) {
            toast.error('Please select a restaurant and enter a message');
            return;
        }

        sendMessage.mutate({
            restaurant_id: selectedRestaurant,
            sender_type: 'admin',
            subject: subject || 'Support Message',
            message,
            priority,
        });
    };

    const priorityColors = {
        low: 'bg-gray-100 text-gray-800',
        normal: 'bg-blue-100 text-blue-800',
        high: 'bg-orange-100 text-orange-800',
        urgent: 'bg-red-100 text-red-800',
    };

    return (
        <div className="grid lg:grid-cols-2 gap-6">
            {/* Send Message */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Send className="h-5 w-5 text-orange-500" />
                        Send Message
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="text-sm font-medium mb-2 block">Restaurant</label>
                        <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select restaurant..." />
                            </SelectTrigger>
                            <SelectContent>
                                {restaurants.map(restaurant => (
                                    <SelectItem key={restaurant.id} value={restaurant.id}>
                                        {restaurant.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-2 block">Subject</label>
                        <Input
                            placeholder="Message subject..."
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-2 block">Priority</label>
                        <Select value={priority} onValueChange={setPriority}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="normal">Normal</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-2 block">Message</label>
                        <Textarea
                            placeholder="Type your message..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={6}
                        />
                    </div>

                    <Button 
                        onClick={handleSend}
                        disabled={sendMessage.isPending}
                        className="w-full"
                    >
                        <Send className="h-4 w-4 mr-2" />
                        Send Message
                    </Button>
                </CardContent>
            </Card>

            {/* Message History */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-orange-500" />
                        Message History
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                        {messages.map(msg => {
                            const restaurant = restaurants.find(r => r.id === msg.restaurant_id);
                            return (
                                <div key={msg.id} className="border rounded-lg p-3">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="font-semibold text-sm text-gray-900">
                                                    {restaurant?.name || 'Unknown'}
                                                </p>
                                                <Badge className={priorityColors[msg.priority]}>
                                                    {msg.priority}
                                                </Badge>
                                            </div>
                                            {msg.subject && (
                                                <p className="text-sm font-medium text-gray-700">{msg.subject}</p>
                                            )}
                                        </div>
                                        {msg.is_read ? (
                                            <CheckCircle className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <AlertCircle className="h-4 w-4 text-orange-500" />
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600">{msg.message}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Badge variant="outline" className="text-xs">
                                            {msg.sender_type}
                                        </Badge>
                                        <p className="text-xs text-gray-500">
                                            {format(new Date(msg.created_date), 'MMM d, h:mm a')}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                        {messages.length === 0 && (
                            <p className="text-center text-gray-500 py-8">No messages yet</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}