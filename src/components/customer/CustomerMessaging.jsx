import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MessageSquare, Send, Trash2, Edit2, X, Check } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function CustomerMessaging({ orderId, restaurantId }) {
    const [newMessage, setNewMessage] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editText, setEditText] = useState('');
    const [deletingId, setDeletingId] = useState(null);
    const queryClient = useQueryClient();

    const { data: user } = useQuery({
        queryKey: ['current-user'],
        queryFn: () => base44.auth.me(),
    });

    const { data: messages = [], isLoading } = useQuery({
        queryKey: ['messages', orderId],
        queryFn: async () => {
            const msgs = await base44.entities.Message.filter({ order_id: orderId }, '-created_date');
            return Array.isArray(msgs) ? msgs : [];
        },
        enabled: !!orderId,
        refetchInterval: 10000,
    });

    const sendMutation = useMutation({
        mutationFn: (text) => base44.entities.Message.create({
            order_id: orderId,
            restaurant_id: restaurantId,
            sender_type: 'customer',
            message: text
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['messages', orderId]);
            setNewMessage('');
            toast.success('Message sent');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, text }) => base44.entities.Message.update(id, { message: text }),
        onSuccess: () => {
            queryClient.invalidateQueries(['messages', orderId]);
            setEditingId(null);
            setEditText('');
            toast.success('Message updated');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.Message.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['messages', orderId]);
            setDeletingId(null);
            toast.success('Message deleted');
        },
    });

    const handleSend = () => {
        if (!newMessage.trim()) return;
        sendMutation.mutate(newMessage);
    };

    const handleEdit = (msg) => {
        setEditingId(msg.id);
        setEditText(msg.message);
    };

    const handleSaveEdit = () => {
        if (!editText.trim()) return;
        updateMutation.mutate({ id: editingId, text: editText });
    };

    return (
        <Card className="h-[600px] flex flex-col overflow-hidden">
            <CardHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardTitle className="flex items-center gap-2 text-blue-900">
                    <MessageSquare className="h-5 w-5 text-blue-600" />
                    Messages with Restaurant
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-4 overflow-y-auto bg-gray-50 space-y-3">
                        {isLoading ? (
                            <>
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-20 w-full" />
                            </>
                        ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center py-12">
                                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                                    <MessageSquare className="h-8 w-8 text-blue-500" />
                                </div>
                                <p className="text-gray-600 font-medium">No messages yet</p>
                                <p className="text-sm text-gray-500 mt-1">Start the conversation with the restaurant</p>
                            </div>
                        ) : (
                            messages.map((msg) => {
                                const isCustomer = msg.sender_type === 'customer';
                                const isMyMessage = isCustomer && msg.created_by === user?.email;

                                return (
                                    <div
                                        key={msg.id}
                                        className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className={`max-w-[75%] rounded-2xl p-3 shadow-sm ${isCustomer ? 'bg-blue-500 text-white rounded-br-sm' : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm'}`}>
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <Badge variant={isCustomer ? 'default' : 'secondary'} className="text-xs">
                                                    {isCustomer ? 'You' : 'Restaurant'}
                                                </Badge>
                                                {isMyMessage && editingId !== msg.id && (
                                                    <div className="flex gap-1">
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-6 w-6"
                                                            onClick={() => handleEdit(msg)}
                                                        >
                                                            <Edit2 className="h-3 w-3" />
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-6 w-6 text-red-600"
                                                            onClick={() => setDeletingId(msg.id)}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {editingId === msg.id ? (
                                                <div className="space-y-2">
                                                    <Textarea
                                                        value={editText}
                                                        onChange={(e) => setEditText(e.target.value)}
                                                        rows={2}
                                                        className="text-sm"
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button size="sm" onClick={handleSaveEdit}>
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
                                                        >
                                                            <X className="h-3 w-3 mr-1" />
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="text-sm leading-relaxed">{msg.message}</p>
                                                    <p className={`text-xs mt-1.5 ${isCustomer ? 'text-blue-100' : 'text-gray-500'}`}>
                                                        {format(new Date(msg.created_date), 'h:mm a')}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}

                    {/* Send Message */}
                    <div className="border-t bg-white p-4 mt-auto">
                        <div className="flex gap-2">
                            <Textarea
                                placeholder="Type your message..."
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                className="flex-1 min-h-[60px] resize-none rounded-xl border-gray-300 focus:border-blue-500"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                            />
                            <Button
                                onClick={handleSend}
                                disabled={!newMessage.trim() || sendMutation.isPending}
                                className="bg-blue-500 hover:bg-blue-600 rounded-xl h-[60px] px-4"
                                size="lg"
                            >
                                <Send className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>

                {/* Delete Confirmation */}
                <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Message?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete your message. This action cannot be undone.
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
            </CardContent>
        </Card>
    );
}