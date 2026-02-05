import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function CategoryDealCustomizationModal({ deal, menuItems, open, onClose, onAddToCart }) {
    const [selections, setSelections] = useState({});
    const [itemCustomizations, setItemCustomizations] = useState({});
    const [quantity, setQuantity] = useState(1);

    useEffect(() => {
        if (open && deal?.category_rules) {
            // Initialize selections for each category rule
            const initialSelections = {};
            deal.category_rules.forEach((rule, idx) => {
                initialSelections[idx] = [];
            });
            setSelections(initialSelections);
            setItemCustomizations({});
            setQuantity(1);
        }
    }, [open, deal]);

    const getCategoryItems = (category) => {
        return menuItems.filter(item => 
            item.category === category && item.is_available !== false
        );
    };

    const hasRequiredCustomizations = (item) => {
        if (!item.customization_options || item.customization_options.length === 0) return false;
        return item.customization_options.some(opt => opt.required === true);
    };

    const handleItemToggle = (ruleIdx, itemId) => {
        const rule = deal.category_rules[ruleIdx];
        const currentSelections = selections[ruleIdx] || [];
        const item = menuItems.find(m => m.id === itemId);
        
        // Check if item has required customizations
        if (item && hasRequiredCustomizations(item)) {
            toast.error(`"${item.name}" requires customization and cannot be added to meal deals. Please remove required customizations from this item or exclude it from meal deals.`);
            return;
        }
        
        if (currentSelections.includes(itemId)) {
            // Remove item and its customizations
            setSelections({
                ...selections,
                [ruleIdx]: currentSelections.filter(id => id !== itemId)
            });
            // Remove customizations for this item
            const newCustomizations = { ...itemCustomizations };
            delete newCustomizations[itemId];
            setItemCustomizations(newCustomizations);
        } else {
            // Add item (enforce max quantity)
            if (currentSelections.length < rule.quantity) {
                setSelections({
                    ...selections,
                    [ruleIdx]: [...currentSelections, itemId]
                });
                
                // Initialize default customizations if item has optional customizations
                if (item?.customization_options?.length > 0) {
                    const defaultCustomizations = {};
                    item.customization_options.forEach(option => {
                        if (option.type === 'single' && option.options?.length > 0) {
                            defaultCustomizations[option.name] = option.options[0].label;
                        }
                    });
                    if (Object.keys(defaultCustomizations).length > 0) {
                        setItemCustomizations({
                            ...itemCustomizations,
                            [itemId]: defaultCustomizations
                        });
                    }
                }
            } else {
                toast.error(`You can only select ${rule.quantity} item${rule.quantity > 1 ? 's' : ''} from ${rule.category}`);
            }
        }
    };

    const handleItemCustomization = (itemId, customizationName, value) => {
        setItemCustomizations({
            ...itemCustomizations,
            [itemId]: {
                ...(itemCustomizations[itemId] || {}),
                [customizationName]: value
            }
        });
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

        // Build selected items list with customizations
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
                        price: item.price,
                        customizations: itemCustomizations[itemId] || {}
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

                                <div className="grid gap-3">
                                    {categoryItems.map(item => {
                                        const isSelected = currentSelections.includes(item.id);
                                        const hasRequired = hasRequiredCustomizations(item);
                                        const hasOptionalCustomizations = item.customization_options?.length > 0 && !hasRequired;
                                        
                                        return (
                                            <div key={item.id} className="space-y-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleItemToggle(ruleIdx, item.id)}
                                                    disabled={hasRequired}
                                                    className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                                                        hasRequired 
                                                            ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                                                            : isSelected
                                                                ? 'border-orange-500 bg-gradient-to-r from-orange-50 to-amber-50 shadow-md'
                                                                : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/30'
                                                    }`}
                                                >
                                                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                                                        isSelected
                                                            ? 'border-orange-500 bg-orange-500'
                                                            : 'border-gray-300 bg-white'
                                                    }`}>
                                                        {isSelected && (
                                                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    {item.image_url && (
                                                        <img
                                                            src={item.image_url}
                                                            alt={item.name}
                                                            className="w-16 h-16 object-cover rounded-lg flex-shrink-0 shadow-sm"
                                                        />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-semibold text-gray-900 flex items-center gap-2 mb-1">
                                                            {item.name}
                                                            {hasRequired && (
                                                                <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                                                                    Requires customization
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {item.description && (
                                                            <div className="text-xs text-gray-500 line-clamp-1 mb-1">
                                                                {item.description}
                                                            </div>
                                                        )}
                                                        {hasOptionalCustomizations && (
                                                            <div className="text-xs text-orange-600 font-medium">
                                                                ✨ Customizable
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-sm font-semibold text-gray-700 flex-shrink-0">
                                                        £{item.price?.toFixed(2)}
                                                    </div>
                                                </button>
                                                
                                                {/* Show customization options for selected items */}
                                                {isSelected && hasOptionalCustomizations && (
                                                    <div className="ml-9 pl-4 border-l-2 border-orange-300 space-y-3 py-2">
                                                        {item.customization_options
                                                            .filter(opt => opt.type === 'single' && !opt.required)
                                                            .map((option, optIdx) => (
                                                                <div key={optIdx} className="space-y-2">
                                                                    <Label className="text-xs font-semibold text-gray-700">
                                                                        {option.name}
                                                                    </Label>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {option.options?.map((opt, idx) => {
                                                                            const isSelectedOption = itemCustomizations[item.id]?.[option.name] === opt.label;
                                                                            return (
                                                                                <button
                                                                                    key={idx}
                                                                                    type="button"
                                                                                    onClick={() => handleItemCustomization(item.id, option.name, opt.label)}
                                                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                                                                        isSelectedOption
                                                                                            ? 'bg-orange-500 text-white shadow-sm'
                                                                                            : 'bg-white border border-gray-300 text-gray-700 hover:border-orange-300'
                                                                                    }`}
                                                                                >
                                                                                    {opt.label}
                                                                                    {opt.price > 0 && ` (+£${opt.price.toFixed(2)})`}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                    </div>
                                                )}
                                            </div>
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