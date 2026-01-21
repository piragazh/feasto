import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Minus, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function OrderEditDialog({ order, open, onClose, onUpdate, restaurantId }) {
    const [items, setItems] = useState(order?.items || []);
    const [discount, setDiscount] = useState(order?.discount || 0);

    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId, is_available: true }),
        enabled: !!restaurantId,
    });

    const updateQuantity = (index, quantity) => {
        if (quantity < 1) {
            removeItem(index);
            return;
        }
        const newItems = [...items];
        newItems[index].quantity = quantity;
        setItems(newItems);
    };

    const removeItem = (index) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const addItem = (menuItem) => {
        const existing = items.find(i => i.menu_item_id === menuItem.id);
        if (existing) {
            updateQuantity(items.indexOf(existing), existing.quantity + 1);
        } else {
            setItems([...items, {
                menu_item_id: menuItem.id,
                name: menuItem.name,
                price: menuItem.price,
                quantity: 1
            }]);
        }
        toast.success(`${menuItem.name} added`);
    };

    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = Math.max(0, subtotal - discount);

    const handleSave = async () => {
        try {
            await base44.entities.Order.update(order.id, {
                items,
                subtotal,
                discount,
                total
            });
            toast.success('Order updated successfully');
            onUpdate();
            onClose();
        } catch (error) {
            toast.error('Failed to update order');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-gray-800 border-gray-700 max-w-2xl max-h-screen overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-white text-lg">Edit Order #{order?.id.slice(0, 8)}</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-4">
                    {/* Items Section */}
                    <div className="col-span-2">
                        <Label className="text-white mb-2">Order Items</Label>
                        <div className="space-y-2 mb-4 bg-gray-700 p-3 rounded">
                            {items.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-gray-600 p-2 rounded">
                                    <div className="flex-1">
                                        <p className="text-white text-sm font-medium">{item.name}</p>
                                        <p className="text-gray-400 text-xs">£{item.price.toFixed(2)}</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => updateQuantity(idx, item.quantity - 1)}
                                            className="h-6 w-6 text-white hover:bg-gray-700"
                                        >
                                            <Minus className="h-3 w-3" />
                                        </Button>
                                        <span className="text-white text-sm w-6 text-center">{item.quantity}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => updateQuantity(idx, item.quantity + 1)}
                                            className="h-6 w-6 text-white hover:bg-gray-700"
                                        >
                                            <Plus className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeItem(idx)}
                                            className="h-6 w-6 text-red-400 hover:bg-red-500/10"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Add Items Section */}
                    <div className="col-span-2">
                        <Label className="text-white mb-2">Add Items</Label>
                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                            {menuItems.map(item => (
                                <Button
                                    key={item.id}
                                    onClick={() => addItem(item)}
                                    variant="outline"
                                    className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600 text-xs h-8"
                                >
                                    {item.name}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Discount */}
                    <div>
                        <Label className="text-white text-sm">Discount (£)</Label>
                        <Input
                            type="number"
                            value={discount}
                            onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                            min="0"
                            step="0.01"
                            className="bg-gray-700 border-gray-600 text-white"
                        />
                    </div>

                    {/* Totals */}
                    <div className="space-y-2">
                        <div>
                            <p className="text-gray-400 text-xs">Subtotal</p>
                            <p className="text-white font-bold">£{subtotal.toFixed(2)}</p>
                        </div>
                        <div>
                            <p className="text-gray-400 text-xs">Total</p>
                            <p className="text-orange-400 text-2xl font-bold">£{total.toFixed(2)}</p>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} className="bg-gray-700 border-gray-600 text-white">Cancel</Button>
                    <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600">Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}