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

    const { data: conversations = [] } = useQuery({
        queryKey: ['conversations', user?.email],
        queryFn: async () => {
            if (!user?.email) return [];
            const allConvos = await base44.entities.Conversation.list('-last_message_time');
            return allConvos.filter(c => c.participants?.includes(user.email));
        },
        enabled: !!user?.email,
        refetchInterval: 3000,
    });

    const filteredConversations = conversations.filter(c =>
        !searchQuery || 
        c.last_message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.participants?.some(p => p.toLowerCase().includes(searchQuery.toLowerCase()))
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
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="mb-6">
                    <Link to={createPageUrl('Home')}>
                        <Button variant="ghost" className="mb-4">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Home
                        </Button>
                    </Link>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Conversations List */}
                    <Card className="lg:col-span-1">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <MessageSquare className="h-5 w-5" />
                                    Messages
                                </CardTitle>
                                <Button
                                    size="sm"
                                    onClick={() => setShowNewConversation(true)}
                                    className="bg-orange-500 hover:bg-orange-600"
                                >
                                    <Plus className="h-4 w-4" />
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
                    <div className="lg:col-span-2">
                        {selectedConversation ? (
                            <ChatInterface
                                conversation={selectedConversation}
                                currentUser={user}
                                onClose={() => setSelectedConversation(null)}
                            />
                        ) : (
                            <Card>
                                <CardContent className="py-24 text-center">
                                    <MessageSquare className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                                    <h3 className="text-xl font-semibold text-gray-700 mb-2">
                                        Select a conversation
                                    </h3>
                                    <p className="text-gray-500">
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