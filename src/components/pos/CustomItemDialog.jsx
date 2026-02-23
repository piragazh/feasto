import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import OnScreenKeyboard from './OnScreenKeyboard';

export default function CustomItemDialog({ open, onClose, onAdd, restaurantId, posTheme = 'dark' }) {
    const isDark = posTheme === 'dark';
    const [itemName, setItemName] = useState('');
    const [itemPrice, setItemPrice] = useState('');
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [activeInput, setActiveInput] = useState(null);
    const [activeTab, setActiveTab] = useState(null);

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
        enabled: !!restaurantId,
    });

    const allItems = restaurant?.custom_pos_items || [];

    // Group items by category
    const grouped = allItems.reduce((acc, item) => {
        const cat = item.category || 'General';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {});
    const categories = Object.keys(grouped);
    const currentTab = activeTab && grouped[activeTab] ? activeTab : categories[0] || null;
    const quickItems = currentTab ? grouped[currentTab] : allItems;

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

    const dlg = isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900';
    const labelCls = isDark ? 'text-white' : 'text-gray-900';
    const inputCls = isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900';
    const inactTabCls = isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200';
    const quickBtnCls = isDark ? 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-200';
    const cancelCls = isDark ? 'bg-gray-700 hover:bg-gray-600 text-white border-gray-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-300';

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className={`${dlg} max-w-md max-h-[85vh] overflow-y-auto ${showKeyboard ? 'pb-80' : ''}`}>
                <DialogHeader>
                    <DialogTitle className={`${labelCls} text-xl`}>Add Custom Item</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {allItems.length > 0 && (
                    <div>
                        <Label className={`${labelCls} mb-2`}>Quick Add</Label>

                        {categories.length > 1 && (
                            <div className="flex gap-1.5 mb-3 flex-wrap">
                                {categories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setActiveTab(cat)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                            currentTab === cat ? 'bg-orange-500 text-white' : inactTabCls
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            {quickItems.map((item, idx) => (
                                <Button
                                    key={idx}
                                    onClick={() => {
                                        setItemName(item.name);
                                        setItemPrice(typeof item.price === 'number' ? item.price.toFixed(2) : item.price);
                                    }}
                                    className={`${quickBtnCls} h-auto py-3`}
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
                    )}

                    <div>
                        <Label className={`${labelCls} mb-2`}>Item Name</Label>
                        <Input
                            value={itemName}
                            onChange={(e) => setItemName(e.target.value)}
                            onFocus={(e) => {
                                setShowKeyboard(true);
                                setActiveInput('name');
                                setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                            }}
                            placeholder="e.g., Delivery Charge"
                            className={`${inputCls} text-lg h-12`}
                        />
                    </div>

                    <div>
                        <Label className={`${labelCls} mb-2`}>Price (£)</Label>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={itemPrice}
                            onChange={(e) => setItemPrice(e.target.value)}
                            onFocus={(e) => {
                                setShowKeyboard(true);
                                setActiveInput('price');
                                setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                            }}
                            placeholder="0.00"
                            className={`${inputCls} text-lg h-12`}
                        />
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button onClick={onClose} variant="outline" className={`flex-1 ${cancelCls}`}>
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

                {showKeyboard && (
                    <OnScreenKeyboard
                        onKeyPress={(key) => {
                            if (activeInput === 'name') {
                                setItemName(prev => prev + key);
                            } else if (activeInput === 'price') {
                                if (/[0-9.]/.test(key)) {
                                    setItemPrice(prev => prev + key);
                                }
                            }
                        }}
                        onBackspace={() => {
                            if (activeInput === 'name') {
                                setItemName(prev => prev.slice(0, -1));
                            } else if (activeInput === 'price') {
                                setItemPrice(prev => prev.slice(0, -1));
                            }
                        }}
                        onSpace={() => {
                            if (activeInput === 'name') {
                                setItemName(prev => prev + ' ');
                            }
                        }}
                        onClose={() => setShowKeyboard(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}