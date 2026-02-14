import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from 'lucide-react';

export default function CustomItemDialog({ open, onClose, onAdd }) {
    const [itemName, setItemName] = useState('');
    const [itemPrice, setItemPrice] = useState('');

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

    const quickItems = [
        { name: 'Delivery Charge', price: '2.50' },
        { name: 'Bag Fee', price: '0.50' },
        { name: 'Service Charge', price: '1.00' },
        { name: 'Extra Sauce', price: '0.75' },
    ];

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-md">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <DialogTitle className="text-white text-xl">Add Custom Item</DialogTitle>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="text-white hover:bg-gray-700"
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
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
                            {quickItems.map((item) => (
                                <Button
                                    key={item.name}
                                    onClick={() => {
                                        setItemName(item.name);
                                        setItemPrice(item.price);
                                    }}
                                    className="bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 h-auto py-3"
                                >
                                    <div className="text-left w-full">
                                        <div className="text-sm font-medium">{item.name}</div>
                                        <div className="text-xs text-orange-400">£{item.price}</div>
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