import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function CategoryDealCustomizationModal({ deal, menuItems, open, onClose, onAddToCart }) {
    const [selections, setSelections] = useState({});
    const [quantity, setQuantity] = useState(1);

    useEffect(() => {
        if (open && deal?.category_rules) {
            // Initialize selections for each category rule
            const initialSelections = {};
            deal.category_rules.forEach((rule, idx) => {
                initialSelections[idx] = [];
            });
            setSelections(initialSelections);
        }
    }, [open, deal]);

    const getCategoryItems = (category) => {
        return menuItems.filter(item => 
            item.category === category && item.is_available !== false
        );
    };

    const handleItemToggle = (ruleIdx, itemId) => {
        const rule = deal.category_rules[ruleIdx];
        const currentSelections = selections[ruleIdx] || [];
        
        if (currentSelections.includes(itemId)) {
            // Remove item
            setSelections({
                ...selections,
                [ruleIdx]: currentSelections.filter(id => id !== itemId)
            });
        } else {
            // Add item (enforce max quantity)
            if (currentSelections.length < rule.quantity) {
                setSelections({
                    ...selections,
                    [ruleIdx]: [...currentSelections, itemId]
                });
            } else {
                toast.error(`You can only select ${rule.quantity} item${rule.quantity > 1 ? 's' : ''} from ${rule.category}`);
            }
        }
    };

    const isValid = () => {
        // Check if all categories have the required number of selections
        return deal.category_rules.every((rule, idx) => {
            const selected = selections[idx] || [];
            return selected.length === rule.quantity;
        });
    };

    const handleSubmit = () => {
        if (!isValid()) {
            toast.error('Please complete all selections');
            return;
        }

        // Build selected items list
        const selectedItems = [];
        deal.category_rules.forEach((rule, idx) => {
            const selectedIds = selections[idx] || [];
            selectedIds.forEach(itemId => {
                const item = menuItems.find(m => m.id === itemId);
                if (item) {
                    selectedItems.push({
                        menu_item_id: item.id,
                        name: item.name,
                        category: item.category,
                        price: item.price
                    });
                }
            });
        });

        onAddToCart({
            deal_id: deal.id,
            deal_name: deal.name,
            deal_price: deal.deal_price,
            selected_items: selectedItems,
            quantity: quantity
        });

        onClose();
    };

    if (!deal || !deal.category_rules) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Customize Your {deal.name}</DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Deal Info */}
                    <div className="bg-orange-50 rounded-lg p-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="font-semibold text-lg">{deal.name}</h3>
                                {deal.description && (
                                    <p className="text-sm text-gray-600">{deal.description}</p>
                                )}
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold text-orange-600">
                                    £{deal.deal_price.toFixed(2)}
                                </div>
                                {deal.original_price && (
                                    <div className="text-sm text-gray-500 line-through">
                                        £{deal.original_price.toFixed(2)}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Category Selections */}
                    {deal.category_rules.map((rule, ruleIdx) => {
                        const categoryItems = getCategoryItems(rule.category);
                        const currentSelections = selections[ruleIdx] || [];
                        const isComplete = currentSelections.length === rule.quantity;

                        return (
                            <div key={ruleIdx} className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-lg font-semibold">
                                        {rule.label || `Choose ${rule.quantity} ${rule.category}`}
                                    </Label>
                                    <Badge variant={isComplete ? "success" : "secondary"}>
                                        {currentSelections.length} / {rule.quantity} selected
                                    </Badge>
                                </div>

                                <div className="grid gap-2">
                                    {categoryItems.map(item => {
                                        const isSelected = currentSelections.includes(item.id);
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => handleItemToggle(ruleIdx, item.id)}
                                                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                                                    isSelected
                                                        ? 'border-orange-500 bg-orange-50'
                                                        : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                            >
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                    isSelected
                                                        ? 'border-orange-500 bg-orange-500'
                                                        : 'border-gray-300'
                                                }`}>
                                                    {isSelected && (
                                                        <div className="w-2 h-2 bg-white rounded-full" />
                                                    )}
                                                </div>
                                                {item.image_url && (
                                                    <img
                                                        src={item.image_url}
                                                        alt={item.name}
                                                        className="w-12 h-12 object-cover rounded-md"
                                                    />
                                                )}
                                                <div className="flex-1">
                                                    <div className="font-medium">{item.name}</div>
                                                    {item.description && (
                                                        <div className="text-xs text-gray-500 line-clamp-1">
                                                            {item.description}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-sm text-gray-600">
                                                    £{item.price.toFixed(2)}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {categoryItems.length === 0 && (
                                    <div className="text-center py-4 text-gray-500 text-sm">
                                        No items available in this category
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Quantity Selector */}
                    <div className="flex items-center justify-between pt-4 border-t">
                        <Label className="text-base">Quantity</Label>
                        <div className="flex items-center gap-3">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                className="rounded-full w-8 h-8 p-0"
                            >
                                <Minus className="h-4 w-4" />
                            </Button>
                            <span className="font-semibold text-lg w-8 text-center">{quantity}</span>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setQuantity(quantity + 1)}
                                className="rounded-full w-8 h-8 p-0"
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Add to Cart Button */}
                    <Button
                        onClick={handleSubmit}
                        disabled={!isValid()}
                        className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-lg"
                    >
                        Add to Cart • £{(deal.deal_price * quantity).toFixed(2)}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}