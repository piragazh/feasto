import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Edit2, X, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function CustomItemsManager({ restaurantId }) {
    const [newItemName, setNewItemName] = useState('');
    const [newItemPrice, setNewItemPrice] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editPrice, setEditPrice] = useState('');

    const queryClient = useQueryClient();

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
        enabled: !!restaurantId,
    });

    const customItems = restaurant?.custom_pos_items || [];

    const updateMutation = useMutation({
        mutationFn: async (newItems) => {
            await base44.entities.Restaurant.update(restaurantId, {
                custom_pos_items: newItems
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant', restaurantId]);
            toast.success('Custom items updated');
        },
        onError: () => {
            toast.error('Failed to update custom items');
        }
    });

    const handleAdd = () => {
        if (!newItemName.trim() || !newItemPrice || parseFloat(newItemPrice) <= 0) {
            toast.error('Please enter valid name and price');
            return;
        }

        const newItems = [
            ...customItems,
            { name: newItemName.trim(), price: parseFloat(newItemPrice) }
        ];

        updateMutation.mutate(newItems);
        setNewItemName('');
        setNewItemPrice('');
    };

    const handleDelete = (index) => {
        const newItems = customItems.filter((_, i) => i !== index);
        updateMutation.mutate(newItems);
    };

    const handleEdit = (index) => {
        setEditingId(index);
        setEditName(customItems[index].name);
        setEditPrice(customItems[index].price.toString());
    };

    const handleSaveEdit = (index) => {
        if (!editName.trim() || !editPrice || parseFloat(editPrice) <= 0) {
            toast.error('Please enter valid name and price');
            return;
        }

        const newItems = customItems.map((item, i) => 
            i === index 
                ? { name: editName.trim(), price: parseFloat(editPrice) }
                : item
        );

        updateMutation.mutate(newItems);
        setEditingId(null);
        setEditName('');
        setEditPrice('');
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditName('');
        setEditPrice('');
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <Label>Item Name</Label>
                    <Input
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        placeholder="e.g., Delivery Charge"
                        className="mt-1"
                    />
                </div>
                <div>
                    <Label>Price (£)</Label>
                    <div className="flex gap-2 mt-1">
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={newItemPrice}
                            onChange={(e) => setNewItemPrice(e.target.value)}
                            placeholder="0.00"
                        />
                        <Button 
                            onClick={handleAdd}
                            disabled={!newItemName.trim() || !newItemPrice}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add
                        </Button>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                {customItems.length === 0 ? (
                    <Card className="bg-gray-50">
                        <CardContent className="p-6 text-center text-gray-500">
                            No custom items yet. Add items like delivery charge, bag fee, etc.
                        </CardContent>
                    </Card>
                ) : (
                    customItems.map((item, index) => (
                        <Card key={index}>
                            <CardContent className="p-4">
                                {editingId === index ? (
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            className="flex-1"
                                        />
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={editPrice}
                                            onChange={(e) => setEditPrice(e.target.value)}
                                            className="w-32"
                                        />
                                        <Button
                                            size="sm"
                                            onClick={() => handleSaveEdit(index)}
                                            className="bg-green-600 hover:bg-green-700"
                                        >
                                            <Check className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={handleCancelEdit}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium">{item.name}</p>
                                            <p className="text-sm text-orange-600 font-semibold">
                                                £{item.price.toFixed(2)}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleEdit(index)}
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => handleDelete(index)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}