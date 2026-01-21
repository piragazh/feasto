import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Search, Plus, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import ConversationList from '@/components/messaging/ConversationList';
import ChatInterface from '@/components/messaging/ChatInterface';
import NewConversationDialog from '@/components/messaging/NewConversationDialog';

export default function Messages() {
    const [user, setUser] = useState(null);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [showNewConversation, setShowNewConversation] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const queryClient = useQueryClient();

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
        } catch (e) {
            base44.auth.redirectToLogin();
        }
    };

    // Fetch all message types - Order messages, Driver messages, Conversations
    const { data: conversations = [] } = useQuery({
        queryKey: ['all-messages', user?.email],
        queryFn: async () => {
            if (!user?.email) return [];
            
            const allMessages = [];

            // 1. Get conversations (support/general chats)
            const convos = await base44.entities.Conversation.list('-last_message_time');
            const userConvos = convos.filter(c => c.participants?.includes(user.email));
            allMessages.push(...userConvos.map(c => ({
                ...c,
                type: 'conversation',
                displayName: c.participants?.find(p => p !== user.email)?.split('@')[0] || 'Support',
                icon: 'user'
            })));

            // 2. Get order-related messages
            const orders = await base44.entities.Order.filter({ created_by: user.email });
            const orderIds = orders.map(o => o.id);
            
            for (const orderId of orderIds) {
                const orderMessages = await base44.entities.Message.filter({ order_id: orderId });
                if (orderMessages.length > 0) {
                    const order = orders.find(o => o.id === orderId);
                    const lastMsg = orderMessages[orderMessages.length - 1];
                    allMessages.push({
                        id: `order-${orderId}`,
                        type: 'order',
                        order_id: orderId,
                        restaurant_id: order?.restaurant_id,
                        displayName: order?.restaurant_name || 'Restaurant',
                        icon: 'restaurant',
                        last_message: lastMsg?.message,
                        last_message_time: lastMsg?.created_date,
                        messages: orderMessages,
                        unread_count: orderMessages.filter(m => 
                            m.sender_type === 'restaurant' && !m.is_read
                        ).length
                    });
                }
            }

            // 3. Get driver messages
            for (const order of orders) {
                if (order.driver_id && order.status === 'out_for_delivery') {
                    const driverMessages = await base44.entities.DriverMessage.filter({ 
                        order_id: order.id 
                    });
                    if (driverMessages.length > 0) {
                        const lastMsg = driverMessages[driverMessages.length - 1];
                        const drivers = await base44.entities.Driver.filter({ id: order.driver_id });
                        const driver = drivers[0];
                        
                        allMessages.push({
                            id: `driver-${order.id}`,
                            type: 'driver',
                            order_id: order.id,
                            driver_id: order.driver_id,
                            restaurant_id: order.restaurant_id,
                            displayName: driver?.full_name || 'Driver',
                            icon: 'driver',
                            last_message: lastMsg?.message,
                            last_message_time: lastMsg?.created_date,
                            messages: driverMessages,
                            unread_count: driverMessages.filter(m => 
                                m.sender_type === 'driver' && !m.is_read
                            ).length
                        });
                    }
                }
            }

            // Sort by most recent message
            return allMessages.sort((a, b) => {
                const timeA = new Date(a.last_message_time || 0).getTime();
                const timeB = new Date(b.last_message_time || 0).getTime();
                return timeB - timeA;
            });
        },
        enabled: !!user?.email,
        staleTime: 10000, // 10s cache
        refetchInterval: 15000, // Refetch every 15s instead of 3s
    });

    const filteredConversations = (conversations || []).filter(c =>
        !searchQuery || 
        c.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.last_message?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!user) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
                <div className="mb-6">
                    <Link to={createPageUrl('Home')}>
                        <Button variant="ghost" className="mb-4">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Home
                        </Button>
                    </Link>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    {/* Conversations List */}
                    <Card className="lg:col-span-1 h-[calc(100vh-200px)] sm:h-auto">
                        <CardHeader className="p-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                                    <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
                                    Messages
                                </CardTitle>
                                <Button
                                    size="sm"
                                    onClick={() => setShowNewConversation(true)}
                                    className="bg-orange-500 hover:bg-orange-600"
                                >
                                    <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                                </Button>
                            </div>
                            <div className="relative mt-4">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search conversations..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ConversationList
                                conversations={filteredConversations}
                                selectedConversation={selectedConversation}
                                onSelectConversation={setSelectedConversation}
                                currentUser={user}
                            />
                        </CardContent>
                    </Card>

                    {/* Chat Interface */}
                    <div className="lg:col-span-2 min-h-[500px]">
                        {selectedConversation ? (
                            <ChatInterface
                                conversation={selectedConversation}
                                currentUser={user}
                                onClose={() => setSelectedConversation(null)}
                            />
                        ) : (
                            <Card className="hidden lg:block">
                                <CardContent className="py-16 sm:py-24 text-center">
                                    <MessageSquare className="h-12 w-12 sm:h-16 sm:w-16 text-gray-300 mx-auto mb-4" />
                                    <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">
                                        Select a conversation
                                    </h3>
                                    <p className="text-sm sm:text-base text-gray-500">
                                        Choose a conversation from the list or start a new one
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>

            <NewConversationDialog
                open={showNewConversation}
                onOpenChange={setShowNewConversation}
                currentUser={user}
                onConversationCreated={setSelectedConversation}
            />
        </div>
    );
}