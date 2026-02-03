import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Minus } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { toast } from 'sonner';

export default function ItemCustomizationModal({ item, open, onClose, onAddToCart }) {
    const [quantity, setQuantity] = useState(1);
    const [customizations, setCustomizations] = useState({});
    const [itemQuantities, setItemQuantities] = useState({});
    const [error, setError] = useState('');

    useEffect(() => {
        if (open && item?.customization_options) {
            const defaults = {};
            const initialQuantities = {};
            
            item.customization_options.forEach(option => {
                if (option.type === 'single' && option.options?.length > 0) {
                    defaults[option.name] = option.options[0].label;
                } else if (option.type === 'multiple') {
                    defaults[option.name] = [];
                    option.options?.forEach((opt) => {
                        initialQuantities[`${option.name}_${opt.label}`] = 0;
                    });
                } else if (option.type === 'meal_upgrade' && option.options?.length > 0) {
                    defaults[option.name] = option.options[0].label;
                    defaults[`${option.name}_meal_customizations`] = {};
                    option.meal_customizations?.forEach((mealOpt) => {
                        if (mealOpt.type === 'multiple') {
                            mealOpt.options?.forEach((opt) => {
                                initialQuantities[`${option.name}_meal_${mealOpt.name}_${opt.label}`] = 0;
                            });
                        }
                    });
                }
            });
            
            setCustomizations(defaults);
            setItemQuantities(initialQuantities);
            setError('');
        }
    }, [open, item]);

    const handleSingleChoice = (optionName, choice) => {
        setCustomizations(prev => ({
            ...prev,
            [optionName]: choice
        }));
    };

    const handleMultipleChoice = (optionName, choice, checked, option) => {
        const quantityKey = `${optionName}_${choice}`;
        const newQuantities = { ...itemQuantities };
        const current = customizations[optionName] || [];
        
        if (checked) {
            // Check if adding this would exceed max_quantity
            const totalSelected = Object.keys(itemQuantities)
                .filter(k => k.startsWith(`${optionName}_`))
                .reduce((sum, k) => sum + (itemQuantities[k] || 0), 0);
            
            const maxQty = option.max_quantity || 10;
            if (totalSelected >= maxQty) {
                toast.error(`Maximum ${maxQty} item${maxQty > 1 ? 's' : ''} allowed for ${optionName}`);
                return;
            }
            
            newQuantities[quantityKey] = 1;
            if (!current.includes(choice)) {
                setCustomizations(prev => ({
                    ...prev,
                    [optionName]: [...current, choice]
                }));
            }
        } else {
            newQuantities[quantityKey] = 0;
            setCustomizations(prev => ({
                ...prev,
                [optionName]: current.filter(c => c !== choice)
            }));
        }
        
        setItemQuantities(newQuantities);
    };

    const calculatePrice = () => {
        let totalPrice = item.price;
        
        if (item.customization_options) {
            item.customization_options.forEach(option => {
                if (option.type === 'single' && customizations[option.name]) {
                    const selected = option.options.find(o => o.label === customizations[option.name]);
                    if (selected?.price) totalPrice += selected.price;
                } else if (option.type === 'multiple' && customizations[option.name] && Array.isArray(customizations[option.name])) {
                    customizations[option.name].forEach(choice => {
                        const quantityKey = `${option.name}_${choice}`;
                        const qty = itemQuantities[quantityKey] || 1;
                        const selected = option.options.find(o => o.label === choice);
                        if (selected?.price) totalPrice += selected.price * qty;
                    });
                } else if (option.type === 'meal_upgrade' && customizations[option.name]) {
                    const selected = option.options.find(o => o.label === customizations[option.name]);
                    if (selected?.price) totalPrice += selected.price;
                    
                    const mealCustoms = customizations[`${option.name}_meal_customizations`] || {};
                    if (option.meal_customizations) {
                        option.meal_customizations.forEach(mealOpt => {
                            if (mealOpt.type === 'single' && mealCustoms[mealOpt.name]) {
                                const mealChoice = mealOpt.options?.find(o => o.label === mealCustoms[mealOpt.name]);
                                if (mealChoice?.price) totalPrice += mealChoice.price;
                            } else if (mealOpt.type === 'multiple' && mealCustoms[mealOpt.name] && Array.isArray(mealCustoms[mealOpt.name])) {
                                mealCustoms[mealOpt.name].forEach(choice => {
                                    const quantityKey = `${option.name}_meal_${mealOpt.name}_${choice}`;
                                    const qty = itemQuantities[quantityKey] || 1;
                                    const mealChoice = mealOpt.options?.find(o => o.label === choice);
                                    if (mealChoice?.price) totalPrice += mealChoice.price * qty;
                                });
                            }
                        });
                    }
                }
            });
        }
        
        return totalPrice * quantity;
    };

    const handleAddToCart = () => {
        if (item.customization_options) {
            for (const option of item.customization_options) {
                if (option.required && (!customizations[option.name] || 
                    (Array.isArray(customizations[option.name]) && customizations[option.name].length === 0))) {
                    setError(`Please select ${option.name}`);
                    return;
                }
                
                if (option.type === 'meal_upgrade' && customizations[option.name] === 'Meal' && option.meal_customizations) {
                    const mealCustoms = customizations[`${option.name}_meal_customizations`] || {};
                    for (const mealOpt of option.meal_customizations) {
                        if (mealOpt.required && (!mealCustoms[mealOpt.name] || 
                            (Array.isArray(mealCustoms[mealOpt.name]) && mealCustoms[mealOpt.name].length === 0))) {
                            setError(`Please select ${mealOpt.name} for your meal`);
                            return;
                        }
                    }
                }
            }
        }

        onAddToCart({
            ...item,
            quantity,
            customizations,
            itemQuantities,
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
                                    {option.max_quantity && option.type !== 'single' && (
                                        <Badge variant="outline" className="text-xs">Max: {option.max_quantity}</Badge>
                                    )}
                                </div>

                                {option.type === 'meal_upgrade' ? (
                                    <>
                                        <RadioGroup
                                            value={customizations[option.name]}
                                            onValueChange={(value) => handleSingleChoice(option.name, value)}
                                        >
                                            {option.options?.map((choice, choiceIdx) => (
                                                <div 
                                                    key={choiceIdx} 
                                                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-all min-h-[56px]"
                                                    onClick={() => handleSingleChoice(option.name, choice.label)}
                                                >
                                                    <div className="flex items-center space-x-3 flex-1">
                                                        <RadioGroupItem value={choice.label} id={`${idx}-${choiceIdx}`} className="h-5 w-5" />
                                                        <Label htmlFor={`${idx}-${choiceIdx}`} className="cursor-pointer font-normal select-none">
                                                            {choice.label}
                                                        </Label>
                                                    </div>
                                                    {choice.price > 0 && (
                                                        <span className="text-sm text-orange-600 font-semibold">+£{choice.price.toFixed(2)}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </RadioGroup>
                                        
                                        {customizations[option.name] === 'Meal' && option.meal_customizations?.length > 0 && (
                                            <div className="mt-4 p-4 bg-blue-50 rounded-lg space-y-4">
                                                <Label className="text-sm font-medium text-blue-900">Meal Options</Label>
                                                {option.meal_customizations.map((mealOpt, mealIdx) => (
                                                    <div key={mealIdx} className="space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <Label className="font-semibold">{mealOpt.name}</Label>
                                                            {mealOpt.required && (
                                                                <Badge variant="destructive" className="text-xs">Required</Badge>
                                                            )}
                                                            {mealOpt.max_quantity && mealOpt.type !== 'single' && (
                                                                <Badge variant="outline" className="text-xs">Max: {mealOpt.max_quantity}</Badge>
                                                            )}
                                                        </div>
                                                        
                                                        {mealOpt.type === 'single' ? (
                                                            <RadioGroup
                                                                value={customizations[`${option.name}_meal_customizations`]?.[mealOpt.name]}
                                                                onValueChange={(value) => {
                                                                    setCustomizations(prev => ({
                                                                        ...prev,
                                                                        [`${option.name}_meal_customizations`]: {
                                                                            ...(prev[`${option.name}_meal_customizations`] || {}),
                                                                            [mealOpt.name]: value
                                                                        }
                                                                    }));
                                                                }}
                                                            >
                                                                {mealOpt.options?.map((mealChoice, mealChoiceIdx) => (
                                                                    <div 
                                                                        key={mealChoiceIdx} 
                                                                        className="flex items-center justify-between p-4 border rounded hover:bg-white cursor-pointer transition-all min-h-[56px]"
                                                                        onClick={() => {
                                                                            setCustomizations(prev => ({
                                                                                ...prev,
                                                                                [`${option.name}_meal_customizations`]: {
                                                                                    ...(prev[`${option.name}_meal_customizations`] || {}),
                                                                                    [mealOpt.name]: mealChoice.label
                                                                                }
                                                                            }));
                                                                        }}
                                                                    >
                                                                        <div className="flex items-center space-x-2 flex-1">
                                                                            <RadioGroupItem value={mealChoice.label} id={`meal-${mealIdx}-${mealChoiceIdx}`} className="h-5 w-5" />
                                                                            <Label htmlFor={`meal-${mealIdx}-${mealChoiceIdx}`} className="cursor-pointer text-sm select-none">
                                                                                {mealChoice.label}
                                                                            </Label>
                                                                        </div>
                                                                        {mealChoice.price > 0 && (
                                                                            <span className="text-xs text-orange-600 font-semibold">+£{mealChoice.price.toFixed(2)}</span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </RadioGroup>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                {mealOpt.options?.map((mealChoice, mealChoiceIdx) => {
                                                                    const quantityKey = `${option.name}_meal_${mealOpt.name}_${mealChoice.label}`;
                                                                    const currentQty = itemQuantities[quantityKey] || 0;
                                                                    const maxQty = mealOpt.max_quantity || 10;
                                                                    const totalSelected = Object.keys(itemQuantities)
                                                                        .filter(k => k.startsWith(`${option.name}_meal_${mealOpt.name}_`))
                                                                        .reduce((sum, k) => sum + (itemQuantities[k] || 0), 0);
                                                                    
                                                                    return (
                                                                        <div 
                                                                            key={mealChoiceIdx} 
                                                                            className={`flex items-center justify-between p-4 border rounded hover:bg-white transition-all min-h-[56px] ${
                                                                                currentQty > 0 ? 'bg-orange-50 border-orange-300' : ''
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center space-x-3 flex-1">
                                                                                <Checkbox
                                                                                    id={`meal-${mealIdx}-${mealChoiceIdx}`}
                                                                                    checked={currentQty > 0}
                                                                                    onCheckedChange={(checked) => {
                                                                                        const newQuantities = { ...itemQuantities };
                                                                                        const mealCustoms = customizations[`${option.name}_meal_customizations`] || {};
                                                                                        const currentChoices = mealCustoms[mealOpt.name] || [];
                                                                                        
                                                                                        if (checked) {
                                                                                            newQuantities[quantityKey] = 1;
                                                                                            if (!currentChoices.includes(mealChoice.label)) {
                                                                                                setCustomizations(prev => ({
                                                                                                    ...prev,
                                                                                                    [`${option.name}_meal_customizations`]: {
                                                                                                        ...mealCustoms,
                                                                                                        [mealOpt.name]: [...currentChoices, mealChoice.label]
                                                                                                    }
                                                                                                }));
                                                                                            }
                                                                                        } else {
                                                                                            newQuantities[quantityKey] = 0;
                                                                                            setCustomizations(prev => ({
                                                                                                ...prev,
                                                                                                [`${option.name}_meal_customizations`]: {
                                                                                                    ...mealCustoms,
                                                                                                    [mealOpt.name]: currentChoices.filter(c => c !== mealChoice.label)
                                                                                                }
                                                                                            }));
                                                                                        }
                                                                                        
                                                                                        setItemQuantities(newQuantities);
                                                                                    }}
                                                                                    className="h-5 w-5"
                                                                                />
                                                                                <Label htmlFor={`meal-${mealIdx}-${mealChoiceIdx}`} className="cursor-pointer text-sm select-none flex-1">
                                                                                    {mealChoice.label}
                                                                                </Label>
                                                                            </div>
                                                                            {currentQty > 0 && (
                                                                                <div className="flex items-center gap-2 ml-2">
                                                                                    <Button
                                                                                        type="button"
                                                                                        size="icon"
                                                                                        variant="outline"
                                                                                        onClick={() => {
                                                                                            const newQuantities = { ...itemQuantities };
                                                                                            const newQty = Math.max(0, currentQty - 1);
                                                                                            newQuantities[quantityKey] = newQty;
                                                                                            if (newQty === 0) {
                                                                                                const mealCustoms = customizations[`${option.name}_meal_customizations`] || {};
                                                                                                const currentChoices = mealCustoms[mealOpt.name] || [];
                                                                                                setCustomizations(prev => ({
                                                                                                    ...prev,
                                                                                                    [`${option.name}_meal_customizations`]: {
                                                                                                        ...mealCustoms,
                                                                                                        [mealOpt.name]: currentChoices.filter(c => c !== mealChoice.label)
                                                                                                    }
                                                                                                }));
                                                                                            }
                                                                                            setItemQuantities(newQuantities);
                                                                                        }}
                                                                                        className="h-10 w-10 rounded-full"
                                                                                    >
                                                                                        <Minus className="h-4 w-4" />
                                                                                    </Button>
                                                                                    <span className="text-lg font-semibold w-8 text-center">{currentQty}</span>
                                                                                    <Button
                                                                                        type="button"
                                                                                        size="icon"
                                                                                        variant="outline"
                                                                                        onClick={() => {
                                                                                            if (totalSelected < maxQty) {
                                                                                                const newQuantities = { ...itemQuantities };
                                                                                                newQuantities[quantityKey] = currentQty + 1;
                                                                                                setItemQuantities(newQuantities);
                                                                                            } else {
                                                                                                toast.error(`Maximum ${maxQty} item${maxQty > 1 ? 's' : ''} allowed`);
                                                                                            }
                                                                                        }}
                                                                                        className="h-10 w-10 rounded-full"
                                                                                        disabled={totalSelected >= maxQty}
                                                                                    >
                                                                                        <Plus className="h-4 w-4" />
                                                                                    </Button>
                                                                                </div>
                                                                            )}
                                                                            {mealChoice.price > 0 && (
                                                                                <span className="text-xs text-orange-600 font-semibold ml-2">
                                                                                    +£{mealChoice.price.toFixed(2)}{currentQty > 1 ? ` × ${currentQty}` : ''}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : option.type === 'single' ? (
                                    <RadioGroup
                                        value={customizations[option.name]}
                                        onValueChange={(value) => handleSingleChoice(option.name, value)}
                                    >
                                        {option.options?.map((choice, choiceIdx) => (
                                            <div 
                                                key={choiceIdx} 
                                                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-all min-h-[56px]"
                                                onClick={() => handleSingleChoice(option.name, choice.label)}
                                            >
                                                <div className="flex items-center space-x-3 flex-1">
                                                    <RadioGroupItem value={choice.label} id={`${idx}-${choiceIdx}`} className="h-5 w-5" />
                                                    <Label htmlFor={`${idx}-${choiceIdx}`} className="cursor-pointer font-normal select-none">
                                                        {choice.label}
                                                    </Label>
                                                </div>
                                                {choice.price > 0 && (
                                                    <span className="text-sm text-orange-600 font-semibold">+£{choice.price.toFixed(2)}</span>
                                                )}
                                            </div>
                                        ))}
                                    </RadioGroup>
                                ) : (
                                    <div className="space-y-2">
                                        {option.options?.map((choice, choiceIdx) => {
                                            const quantityKey = `${option.name}_${choice.label}`;
                                            const currentQty = itemQuantities[quantityKey] || 0;
                                            const maxQty = option.max_quantity || 10;
                                            const totalSelected = Object.keys(itemQuantities)
                                                .filter(k => k.startsWith(`${option.name}_`))
                                                .reduce((sum, k) => sum + (itemQuantities[k] || 0), 0);
                                            
                                            return (
                                                <div 
                                                    key={choiceIdx} 
                                                    className={`flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-all min-h-[56px] ${
                                                        currentQty > 0 ? 'bg-orange-50 border-orange-300' : ''
                                                    }`}
                                                >
                                                    <div className="flex items-center space-x-3 flex-1">
                                                        <Checkbox
                                                            id={`${idx}-${choiceIdx}`}
                                                            checked={currentQty > 0}
                                                            onCheckedChange={(checked) => handleMultipleChoice(option.name, choice.label, checked, option)}
                                                            className="h-5 w-5"
                                                        />
                                                        <Label htmlFor={`${idx}-${choiceIdx}`} className="cursor-pointer font-normal select-none flex-1">
                                                            {choice.label}
                                                        </Label>
                                                    </div>
                                                    {currentQty > 0 && (
                                                        <div className="flex items-center gap-2 ml-2">
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="outline"
                                                                onClick={() => {
                                                                    const newQuantities = { ...itemQuantities };
                                                                    const newQty = Math.max(0, currentQty - 1);
                                                                    newQuantities[quantityKey] = newQty;
                                                                    if (newQty === 0) {
                                                                        const current = customizations[option.name] || [];
                                                                        setCustomizations(prev => ({
                                                                            ...prev,
                                                                            [option.name]: current.filter(c => c !== choice.label)
                                                                        }));
                                                                    }
                                                                    setItemQuantities(newQuantities);
                                                                }}
                                                                className="h-10 w-10 rounded-full"
                                                            >
                                                                <Minus className="h-4 w-4" />
                                                            </Button>
                                                            <span className="text-lg font-semibold w-8 text-center">{currentQty}</span>
                                                            <Button
                                                                type="button"
                                                                size="icon"
                                                                variant="outline"
                                                                onClick={() => {
                                                                    if (totalSelected < maxQty) {
                                                                        const newQuantities = { ...itemQuantities };
                                                                        newQuantities[quantityKey] = currentQty + 1;
                                                                        setItemQuantities(newQuantities);
                                                                    } else {
                                                                        toast.error(`Maximum ${maxQty} item${maxQty > 1 ? 's' : ''} allowed`);
                                                                    }
                                                                }}
                                                                className="h-10 w-10 rounded-full"
                                                                disabled={totalSelected >= maxQty}
                                                            >
                                                                <Plus className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {choice.price > 0 && (
                                                        <span className="text-sm text-orange-600 font-semibold ml-2">
                                                            +£{choice.price.toFixed(2)}{currentQty > 1 ? ` × ${currentQty}` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
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
                            className="h-10 w-10 rounded-full"
                        >
                            <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-10 text-center font-semibold text-lg">{quantity}</span>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setQuantity(quantity + 1)}
                            className="h-10 w-10 rounded-full"
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