import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';

export default function NewConversationDialog({ open, onOpenChange, currentUser, onConversationCreated }) {
    const [selectedRestaurant, setSelectedRestaurant] = useState('');
    const queryClient = useQueryClient();

    const { data: restaurants = [] } = useQuery({
        queryKey: ['restaurants-for-messaging'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const createConversationMutation = useMutation({
        mutationFn: async (restaurantId) => {
            const restaurant = restaurants.find(r => r.id === restaurantId);
            const restaurantEmail = `restaurant_${restaurantId}@system.com`;

            // Check if conversation exists
            const existingConvos = await base44.entities.Conversation.list();
            const existing = (existingConvos || []).find(c =>
                c.participants?.includes(currentUser.email) &&
                c.participants?.includes(restaurantEmail)
            );

            if (existing) {
                return existing;
            }

            // Create new conversation
            const conversation = await base44.entities.Conversation.create({
                participants: [currentUser.email, restaurantEmail],
                participant_types: {
                    [currentUser.email]: 'customer',
                    [restaurantEmail]: 'restaurant'
                },
                restaurant_id: restaurantId,
                unread_count: {
                    [currentUser.email]: 0,
                    [restaurantEmail]: 0
                }
            });

            return conversation;
        },
        onSuccess: (conversation) => {
            queryClient.invalidateQueries(['conversations']);
            toast.success('Conversation created');
            onConversationCreated(conversation);
            onOpenChange(false);
            setSelectedRestaurant('');
        },
    });

    const handleCreate = () => {
        if (!selectedRestaurant) {
            toast.error('Please select a restaurant');
            return;
        }
        createConversationMutation.mutate(selectedRestaurant);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Start New Conversation</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label>Select Restaurant</Label>
                        <select
                            value={selectedRestaurant}
                            onChange={(e) => setSelectedRestaurant(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            <option value="">Choose a restaurant...</option>
                            {restaurants.map((restaurant) => (
                                <option key={restaurant.id} value={restaurant.id}>
                                    {restaurant.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={createConversationMutation.isPending}
                        className="bg-orange-500 hover:bg-orange-600"
                    >
                        Start Conversation
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}