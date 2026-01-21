import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X } from 'lucide-react';

export default function POSItemCustomization({ item, open, onClose, onConfirm }) {
     const [customizations, setCustomizations] = useState({});
     const [specialInstructions, setSpecialInstructions] = useState('');
     const [removedIngredients, setRemovedIngredients] = useState([]);

     const optionCount = item?.customization_options?.length || 0;
     const columns = Math.min(Math.max(optionCount, 1), 4);

    const handleConfirm = () => {
        onConfirm({ ...item, customizations });
        setCustomizations({});
    };

    const handleSingleSelect = (optionName, selectedValue) => {
        setCustomizations(prev => ({
            ...prev,
            [optionName]: selectedValue
        }));
    };

    const handleMultipleSelect = (optionName, selectedValue) => {
        setCustomizations(prev => ({
            ...prev,
            [optionName]: prev[optionName]?.includes(selectedValue)
                ? prev[optionName].filter(v => v !== selectedValue)
                : [...(prev[optionName] || []), selectedValue]
        }));
    };

    if (!item?.customization_options?.length) {
        return null;
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent 
                className="bg-gray-800 border-gray-700 h-screen md:h-auto p-0 flex flex-col"
                style={{
                    maxWidth: columns === 1 ? '90vw' : columns === 2 ? '95vw' : '98vw'
                }}
            >
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-700 flex-shrink-0">
                    <DialogTitle className={`font-bold text-white ${columns === 1 ? 'text-xl' : 'text-lg'}`}>
                        {item.name}
                    </DialogTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="h-12 w-12 text-white hover:bg-gray-700"
                    >
                        <X className="h-8 w-8" />
                    </Button>
                </div>

                <div 
                    className="flex-1 overflow-y-auto p-3 md:p-6"
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columns}, 1fr)`,
                        gap: columns > 2 ? '1rem' : '1.5rem'
                    }}
                >
                    {item.customization_options.map(option => (
                        <div key={option.name} className="space-y-2">
                            <div className="flex items-baseline gap-1">
                                <Label className={`font-bold text-white ${columns === 1 ? 'text-xl' : columns === 2 ? 'text-lg' : 'text-base'}`}>
                                    {option.name}
                                </Label>
                                {option.required && (
                                    <span className="text-red-500 font-bold">*</span>
                                )}
                            </div>

                            {option.type === 'single' ? (
                                <RadioGroup 
                                    value={customizations[option.name] || ''}
                                    onValueChange={(value) => handleSingleSelect(option.name, value)}
                                    className={`space-y-${columns > 2 ? '1' : '2'}`}
                                >
                                    {option.options?.map(opt => (
                                        <div 
                                            key={opt.label} 
                                            className={`flex items-center space-x-2 p-2 md:p-3 rounded-lg bg-gray-700 hover:bg-gray-600 cursor-pointer transition-all border-2 border-transparent hover:border-orange-500`}
                                            onClick={() => handleSingleSelect(option.name, opt.label)}
                                        >
                                            <RadioGroupItem 
                                                value={opt.label} 
                                                id={opt.label}
                                                className={`${columns > 2 ? 'w-4 h-4' : 'w-5 h-5'}`}
                                            />
                                            <Label 
                                                htmlFor={opt.label} 
                                                className={`text-white cursor-pointer flex-1 font-medium ${columns === 1 ? 'text-lg' : columns === 2 ? 'text-sm' : 'text-xs'}`}
                                            >
                                                {opt.label}
                                            </Label>
                                            {opt.price > 0 && (
                                                <span className={`font-bold text-orange-400 ${columns === 1 ? 'text-lg' : columns === 2 ? 'text-sm' : 'text-xs'}`}>
                                                    +£{opt.price.toFixed(2)}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </RadioGroup>
                            ) : (
                                <div className={`space-y-${columns > 2 ? '1' : '2'}`}>
                                    {option.options?.map(opt => (
                                        <div 
                                            key={opt.label}
                                            className={`flex items-center space-x-2 p-2 md:p-3 rounded-lg bg-gray-700 hover:bg-gray-600 cursor-pointer transition-all border-2 border-transparent hover:border-orange-500`}
                                            onClick={() => handleMultipleSelect(option.name, opt.label)}
                                        >
                                            <Checkbox
                                                id={opt.label}
                                                checked={customizations[option.name]?.includes(opt.label) || false}
                                                onCheckedChange={() => handleMultipleSelect(option.name, opt.label)}
                                                className={`${columns > 2 ? 'w-4 h-4' : 'w-5 h-5'}`}
                                            />
                                            <Label 
                                                htmlFor={opt.label} 
                                                className={`text-white cursor-pointer flex-1 font-medium ${columns === 1 ? 'text-lg' : columns === 2 ? 'text-sm' : 'text-xs'}`}
                                            >
                                                {opt.label}
                                            </Label>
                                            {opt.price > 0 && (
                                                <span className={`font-bold text-orange-400 ${columns === 1 ? 'text-lg' : columns === 2 ? 'text-sm' : 'text-xs'}`}>
                                                    +£{opt.price.toFixed(2)}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className={`flex gap-2 md:gap-3 p-3 md:p-6 border-t border-gray-700 flex-shrink-0 bg-gray-800`}>
                    <Button 
                        variant="outline" 
                        onClick={onClose}
                        className={`flex-1 bg-gray-700 border-gray-600 text-white hover:bg-gray-600 font-bold rounded-lg ${columns === 1 ? 'h-16 text-lg' : 'h-12 text-sm md:text-base'}`}
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleConfirm}
                        className={`flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg ${columns === 1 ? 'h-16 text-lg' : 'h-12 text-sm md:text-base'}`}
                    >
                        Add to Cart
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}