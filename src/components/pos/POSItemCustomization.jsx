import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { X } from 'lucide-react';

export default function POSItemCustomization({ item, open, onClose, onConfirm }) {
    const [customizations, setCustomizations] = useState({});

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
            <DialogContent className="bg-gray-800 border-gray-700 max-w-2xl h-screen md:h-auto p-0 flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-gray-700 flex-shrink-0">
                    <DialogTitle className="text-2xl md:text-3xl font-bold text-white">
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

                <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {item.customization_options.map(option => (
                        <div key={option.name} className="space-y-4">
                            <div className="flex items-baseline gap-2">
                                <Label className="text-xl md:text-2xl font-bold text-white">
                                    {option.name}
                                </Label>
                                {option.required && (
                                    <span className="text-red-500 text-lg font-bold">*</span>
                                )}
                            </div>

                            {option.type === 'single' ? (
                                <RadioGroup 
                                    value={customizations[option.name] || ''}
                                    onValueChange={(value) => handleSingleSelect(option.name, value)}
                                    className="space-y-3"
                                >
                                    {option.options?.map(opt => (
                                        <div 
                                            key={opt.label} 
                                            className="flex items-center space-x-4 p-4 rounded-lg bg-gray-700 hover:bg-gray-600 cursor-pointer transition-all border-2 border-transparent hover:border-orange-500"
                                            onClick={() => handleSingleSelect(option.name, opt.label)}
                                        >
                                            <RadioGroupItem 
                                                value={opt.label} 
                                                id={opt.label}
                                                className="w-6 h-6"
                                            />
                                            <Label 
                                                htmlFor={opt.label} 
                                                className="text-lg md:text-xl text-white cursor-pointer flex-1 font-medium"
                                            >
                                                {opt.label}
                                            </Label>
                                            {opt.price > 0 && (
                                                <span className="text-xl font-bold text-orange-400">
                                                    +£{opt.price.toFixed(2)}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </RadioGroup>
                            ) : (
                                <div className="space-y-3">
                                    {option.options?.map(opt => (
                                        <div 
                                            key={opt.label}
                                            className="flex items-center space-x-4 p-4 rounded-lg bg-gray-700 hover:bg-gray-600 cursor-pointer transition-all border-2 border-transparent hover:border-orange-500"
                                            onClick={() => handleMultipleSelect(option.name, opt.label)}
                                        >
                                            <Checkbox
                                                id={opt.label}
                                                checked={customizations[option.name]?.includes(opt.label) || false}
                                                onCheckedChange={() => handleMultipleSelect(option.name, opt.label)}
                                                className="w-6 h-6"
                                            />
                                            <Label 
                                                htmlFor={opt.label} 
                                                className="text-lg md:text-xl text-white cursor-pointer flex-1 font-medium"
                                            >
                                                {opt.label}
                                            </Label>
                                            {opt.price > 0 && (
                                                <span className="text-xl font-bold text-orange-400">
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

                <div className="flex gap-3 p-6 border-t border-gray-700 flex-shrink-0 bg-gray-800">
                    <Button 
                        variant="outline" 
                        onClick={onClose}
                        className="flex-1 h-16 text-lg bg-gray-700 border-gray-600 text-white hover:bg-gray-600 font-bold rounded-lg"
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleConfirm}
                        className="flex-1 h-16 text-lg bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg"
                    >
                        Add to Cart
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}