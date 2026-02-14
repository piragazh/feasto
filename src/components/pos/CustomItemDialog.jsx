import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import OnScreenKeyboard from './OnScreenKeyboard';

export default function CustomItemDialog({ open, onClose, onAdd, restaurantId }) {
    const [itemName, setItemName] = useState('');
    const [itemPrice, setItemPrice] = useState('');
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [activeInput, setActiveInput] = useState(null);

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
        enabled: !!restaurantId,
    });

    const quickItems = restaurant?.custom_pos_items || [
        { name: 'Delivery Charge', price: '2.50' },
        { name: 'Bag Fee', price: '0.50' },
        { name: 'Service Charge', price: '1.00' },
        { name: 'Extra Sauce', price: '0.75' },
    ];

    const handleAdd = () => {
        if (!itemName.trim() || !itemPrice || parseFloat(itemPrice) <= 0) {
            return;
        }

        const customItem = {
            id: `custom-${Date.now()}`,
            menu_item_id: `custom-${Date.now()}`,
            name: itemName.trim(),
            price: parseFloat(itemPrice),
            quantity: 1,
            customizations: {},
            isCustomItem: true
        };

        onAdd(customItem);
        setItemName('');
        setItemPrice('');
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-white text-xl">Add Custom Item</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div>
                        <Label className="text-white mb-2">Item Name</Label>
                        <Input
                            value={itemName}
                            onChange={(e) => setItemName(e.target.value)}
                            placeholder="e.g., Delivery Charge"
                            className="bg-gray-700 border-gray-600 text-white text-lg h-12"
                        />
                    </div>

                    <div>
                        <Label className="text-white mb-2">Price (£)</Label>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={itemPrice}
                            onChange={(e) => setItemPrice(e.target.value)}
                            placeholder="0.00"
                            className="bg-gray-700 border-gray-600 text-white text-lg h-12"
                        />
                    </div>

                    <div>
                        <Label className="text-white mb-2">Quick Add</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {quickItems.map((item, idx) => (
                                <Button
                                    key={idx}
                                    onClick={() => {
                                        setItemName(item.name);
                                        setItemPrice(typeof item.price === 'number' ? item.price.toFixed(2) : item.price);
                                    }}
                                    className="bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 h-auto py-3"
                                >
                                    <div className="text-left w-full">
                                        <div className="text-sm font-medium">{item.name}</div>
                                        <div className="text-xs text-orange-400">
                                            £{typeof item.price === 'number' ? item.price.toFixed(2) : item.price}
                                        </div>
                                    </div>
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button
                        onClick={onClose}
                        variant="outline"
                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleAdd}
                        disabled={!itemName.trim() || !itemPrice || parseFloat(itemPrice) <= 0}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
                    >
                        Add to Cart
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}