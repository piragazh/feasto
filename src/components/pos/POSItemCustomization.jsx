import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

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
            <DialogContent className="bg-gray-800 border-gray-700">
                <DialogHeader>
                    <DialogTitle className="text-white">Customize {item.name}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 max-h-96 overflow-y-auto py-4">
                    {item.customization_options.map(option => (
                        <div key={option.name} className="space-y-2 border-b border-gray-700 pb-4">
                            <Label className="text-white font-semibold">
                                {option.name}
                                {option.required && <span className="text-red-500 ml-1">*</span>}
                            </Label>

                            {option.type === 'single' ? (
                                <RadioGroup 
                                    value={customizations[option.name] || ''}
                                    onValueChange={(value) => handleSingleSelect(option.name, value)}
                                >
                                    {option.options?.map(opt => (
                                        <div key={opt.label} className="flex items-center space-x-2">
                                            <RadioGroupItem value={opt.label} id={opt.label} />
                                            <Label htmlFor={opt.label} className="text-gray-300 cursor-pointer flex-1">
                                                {opt.label}
                                                {opt.price > 0 && <span className="text-orange-400 ml-2">+£{opt.price.toFixed(2)}</span>}
                                            </Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            ) : (
                                <div className="space-y-2">
                                    {option.options?.map(opt => (
                                        <div key={opt.label} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={opt.label}
                                                checked={customizations[option.name]?.includes(opt.label) || false}
                                                onCheckedChange={() => handleMultipleSelect(option.name, opt.label)}
                                            />
                                            <Label htmlFor={opt.label} className="text-gray-300 cursor-pointer flex-1">
                                                {opt.label}
                                                {opt.price > 0 && <span className="text-orange-400 ml-2">+£{opt.price.toFixed(2)}</span>}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <DialogFooter>
                    <Button 
                        variant="outline" 
                        onClick={onClose}
                        className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleConfirm}
                        className="bg-orange-500 hover:bg-orange-600"
                    >
                        Add to Cart
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}