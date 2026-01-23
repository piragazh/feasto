import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ShoppingBag, Trash2, ArrowLeft, Lock, Send } from 'lucide-react';
import { toast } from 'sonner';

export default function GroupOrder() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const urlParams = new URLSearchParams(window.location.search);
    const shareCode = urlParams.get('code');
    
    const [user, setUser] = useState(null);
    const [myCart, setMyCart] = useState([]);

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

    const { data: groupOrder, isLoading } = useQuery({
        queryKey: ['group-order', shareCode],
        queryFn: async () => {
            const orders = await base44.entities.GroupOrder.filter({ share_code: shareCode });
            return Array.isArray(orders) ? orders[0] : null;
        },
        enabled: !!shareCode,
        refetchInterval: 3000,
    });

    const updateGroupOrderMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.GroupOrder.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['group-order']);
            toast.success('Group order updated');
        },
    });

    const addItemsToGroup = () => {
        if (myCart.length === 0) {
            toast.error('Add some items first');
            return;
        }

        const participants = groupOrder.participants || [];
        const existingIdx = participants.findIndex(p => p.email === user.email);
        
        if (existingIdx >= 0) {
            participants[existingIdx].items = myCart;
        } else {
            participants.push({
                email: user.email,
                name: user.full_name,
                items: myCart
            });
        }

        updateGroupOrderMutation.mutate({
            id: groupOrder.id,
            data: { participants }
        });
        setMyCart([]);
    };

    const removeMyItems = () => {
        const participants = (groupOrder.participants || []).filter(p => p.email !== user.email);
        updateGroupOrderMutation.mutate({
            id: groupOrder.id,
            data: { participants }
        });
        toast.success('Your items removed');
    };

    const lockOrder = () => {
        updateGroupOrderMutation.mutate({
            id: groupOrder.id,
            data: { status: 'locked' }
        });
    };

    const proceedToCheckout = () => {
        // Collect all items from all participants
        const allItems = [];
        groupOrder.participants?.forEach(participant => {
            participant.items?.forEach(item => {
                allItems.push(item);
            });
        });

        // Save to localStorage for checkout
        localStorage.setItem('cart', JSON.stringify(allItems));
        localStorage.setItem('cartRestaurantId', groupOrder.restaurant_id);
        localStorage.setItem('groupOrderId', groupOrder.id);
        
        navigate(createPageUrl('Checkout'));
    };

    const myParticipation = groupOrder?.participants?.find(p => p.email === user?.email);
    const isHost = groupOrder?.host_email === user?.email;
    const totalItems = groupOrder?.participants?.reduce((sum, p) => sum + (p.items?.length || 0), 0) || 0;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 p-4">
                <Skeleton className="h-64 w-full max-w-4xl mx-auto" />
            </div>
        );
    }

    if (!groupOrder) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="text-center py-8">
                        <p className="text-gray-600 mb-4">Group order not found or expired</p>
                        <Link to={createPageUrl('Home')}>
                            <Button>Go Home</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
                    <Link to={createPageUrl('Home')}>
                        <Button size="icon" variant="ghost" className="rounded-full">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div className="flex-1">
                        <h1 className="text-xl font-bold text-gray-900">Group Order</h1>
                        <p className="text-sm text-gray-500">{groupOrder.restaurant_name}</p>
                    </div>
                    <Badge className={groupOrder.status === 'open' ? 'bg-green-500' : 'bg-gray-500'}>
                        {groupOrder.status === 'open' ? 'Open' : 'Locked'}
                    </Badge>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-4">
                    <Card>
                        <CardContent className="pt-6 text-center">
                            <Users className="h-8 w-8 mx-auto mb-2 text-orange-500" />
                            <p className="text-2xl font-bold">{groupOrder.participants?.length || 0}</p>
                            <p className="text-sm text-gray-500">Participants</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6 text-center">
                            <ShoppingBag className="h-8 w-8 mx-auto mb-2 text-orange-500" />
                            <p className="text-2xl font-bold">{totalItems}</p>
                            <p className="text-sm text-gray-500">Total Items</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Add items to cart */}
                {groupOrder.status === 'open' && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Add Your Items</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-gray-600">
                                Browse the restaurant menu and add items. They'll be added to the group order.
                            </p>
                            <Link to={createPageUrl('Restaurant') + '?id=' + groupOrder.restaurant_id}>
                                <Button className="w-full bg-orange-500 hover:bg-orange-600">
                                    <ShoppingBag className="h-4 w-4 mr-2" />
                                    Browse Menu
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {/* Participants */}
                <Card>
                    <CardHeader>
                        <CardTitle>Participants & Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!groupOrder.participants || groupOrder.participants.length === 0 ? (
                            <p className="text-center text-gray-500 py-4">No one has added items yet</p>
                        ) : (
                            <div className="space-y-4">
                                {groupOrder.participants.map((participant, idx) => (
                                    <div key={idx}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                                                    <span className="text-sm font-semibold text-orange-600">
                                                        {participant.name?.charAt(0) || '?'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="font-medium">{participant.name}</p>
                                                    <p className="text-xs text-gray-500">{participant.items?.length || 0} items</p>
                                                </div>
                                            </div>
                                            {participant.email === user?.email && groupOrder.status === 'open' && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={removeMyItems}
                                                    className="text-red-600"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                        {participant.items?.map((item, itemIdx) => (
                                            <div key={itemIdx} className="ml-10 text-sm text-gray-600 flex justify-between">
                                                <span>{item.quantity}x {item.name}</span>
                                                <span>£{(item.price * item.quantity).toFixed(2)}</span>
                                            </div>
                                        ))}
                                        {idx < groupOrder.participants.length - 1 && <Separator className="mt-4" />}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Actions */}
                {isHost && groupOrder.status === 'open' && (
                    <Card>
                        <CardContent className="pt-6">
                            <Button
                                onClick={lockOrder}
                                className="w-full bg-orange-500 hover:bg-orange-600"
                                disabled={!groupOrder.participants || groupOrder.participants.length === 0}
                            >
                                <Lock className="h-4 w-4 mr-2" />
                                Lock Order & Proceed to Checkout
                            </Button>
                            <p className="text-xs text-gray-500 mt-2 text-center">
                                This will prevent others from adding more items
                            </p>
                        </CardContent>
                    </Card>
                )}

                {groupOrder.status === 'locked' && isHost && (
                    <Card>
                        <CardContent className="pt-6">
                            <Button
                                onClick={proceedToCheckout}
                                className="w-full bg-green-600 hover:bg-green-700"
                            >
                                <Send className="h-4 w-4 mr-2" />
                                Complete Group Order
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {groupOrder.status === 'locked' && !isHost && (
                    <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="pt-6 text-center">
                            <p className="text-blue-800 font-medium mb-2">Order Locked</p>
                            <p className="text-sm text-blue-600">
                                The host is completing the checkout. You'll be notified once the order is placed.
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}