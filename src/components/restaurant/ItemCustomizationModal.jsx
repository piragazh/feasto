import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Minus } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

export default function ItemCustomizationModal({ item, open, onClose, onAddToCart }) {
    const [quantity, setQuantity] = useState(1);
    const [customizations, setCustomizations] = useState({});
    const [error, setError] = useState('');

    useEffect(() => {
        if (open && item?.customization_options) {
            // Initialize with defaults
            const defaults = {};
            item.customization_options.forEach(option => {
                if (option.type === 'single' && option.options?.length > 0) {
                    defaults[option.name] = option.options[0].label;
                } else if (option.type === 'multiple') {
                    defaults[option.name] = [];
                }
            });
            setCustomizations(defaults);
            setError('');
        }
    }, [open, item]);

    const handleSingleChoice = (optionName, choice) => {
        setCustomizations(prev => ({
            ...prev,
            [optionName]: choice
        }));
    };

    const handleMultipleChoice = (optionName, choice, checked) => {
        setCustomizations(prev => ({
            ...prev,
            [optionName]: checked
                ? [...(prev[optionName] || []), choice]
                : (prev[optionName] || []).filter(c => c !== choice)
        }));
    };

    const calculatePrice = () => {
        let totalPrice = item.price;
        
        if (item.customization_options) {
            item.customization_options.forEach(option => {
                if (option.type === 'single' && customizations[option.name]) {
                    const selected = option.options.find(o => o.label === customizations[option.name]);
                    if (selected?.price) totalPrice += selected.price;
                } else if (option.type === 'multiple' && customizations[option.name]) {
                    customizations[option.name].forEach(choice => {
                        const selected = option.options.find(o => o.label === choice);
                        if (selected?.price) totalPrice += selected.price;
                    });
                }
            });
        }
        
        return totalPrice * quantity;
    };

    const handleAddToCart = () => {
        // Validate required options
        if (item.customization_options) {
            const missingRequired = item.customization_options.find(option => 
                option.required && (!customizations[option.name] || 
                (Array.isArray(customizations[option.name]) && customizations[option.name].length === 0))
            );
            
            if (missingRequired) {
                setError(`Please select ${missingRequired.name}`);
                return;
            }
        }

        onAddToCart({
            ...item,
            quantity,
            customizations,
            final_price: calculatePrice() / quantity
        });
        onClose();
    };

    if (!item) return null;

    const hasCustomizations = item.customization_options?.length > 0;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl">{item.name}</DialogTitle>
                </DialogHeader>

                {item.image_url && (
                    <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-48 object-cover rounded-lg"
                    />
                )}

                <p className="text-gray-600">{item.description}</p>
                <p className="text-xl font-bold text-gray-900">Base Price: £{item.price?.toFixed(2)}</p>

                {hasCustomizations && (
                    <div className="space-y-6 py-4">
                        {item.customization_options.map((option, idx) => (
                            <div key={idx} className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Label className="text-lg font-semibold">{option.name}</Label>
                                    {option.required && (
                                        <Badge variant="destructive" className="text-xs">Required</Badge>
                                    )}
                                </div>

                                {option.type === 'single' ? (
                                    <RadioGroup
                                        value={customizations[option.name]}
                                        onValueChange={(value) => handleSingleChoice(option.name, value)}
                                    >
                                        {option.options?.map((choice, choiceIdx) => (
                                            <div key={choiceIdx} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                                                <div className="flex items-center space-x-3">
                                                    <RadioGroupItem value={choice.label} id={`${idx}-${choiceIdx}`} />
                                                    <Label htmlFor={`${idx}-${choiceIdx}`} className="cursor-pointer font-normal">
                                                        {choice.label}
                                                    </Label>
                                                </div>
                                                {choice.price > 0 && (
                                                    <span className="text-sm text-gray-600">+£{choice.price.toFixed(2)}</span>
                                                )}
                                            </div>
                                        ))}
                                    </RadioGroup>
                                ) : (
                                    <div className="space-y-2">
                                        {option.options?.map((choice, choiceIdx) => (
                                            <div key={choiceIdx} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                                                <div className="flex items-center space-x-3">
                                                    <Checkbox
                                                        id={`${idx}-${choiceIdx}`}
                                                        checked={(customizations[option.name] || []).includes(choice.label)}
                                                        onCheckedChange={(checked) => 
                                                            handleMultipleChoice(option.name, choice.label, checked)
                                                        }
                                                    />
                                                    <Label htmlFor={`${idx}-${choiceIdx}`} className="cursor-pointer font-normal">
                                                        {choice.label}
                                                    </Label>
                                                </div>
                                                {choice.price > 0 && (
                                                    <span className="text-sm text-gray-600">+£{choice.price.toFixed(2)}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {error && (
                    <p className="text-red-500 text-sm">{error}</p>
                )}

                <DialogFooter className="flex flex-col sm:flex-row gap-4">
                    <div className="flex items-center gap-3 bg-gray-100 rounded-full px-2 py-1">
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            className="h-8 w-8 rounded-full"
                        >
                            <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center font-semibold">{quantity}</span>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setQuantity(quantity + 1)}
                            className="h-8 w-8 rounded-full"
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    <Button
                        onClick={handleAddToCart}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 h-12"
                    >
                        Add to Cart • £{calculatePrice().toFixed(2)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}