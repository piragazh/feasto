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
     const [isMeal, setIsMeal] = useState(false);
     const [mealCustomizations, setMealCustomizations] = useState({});

     const optionCount = item?.customization_options?.length || 0;
     const columns = Math.min(Math.max(optionCount, 1), 4);

     // Calculate total price including customizations
     const calculatePrice = () => {
         let total = item?.price || 0;
         
         // Add customization prices
         item?.customization_options?.forEach(option => {
             if (option.type === 'single' && customizations[option.name]) {
                 const selected = option.options?.find(opt => opt.label === customizations[option.name]);
                 if (selected?.price) total += selected.price;
             } else if (option.type === 'multiple' && customizations[option.name]) {
                 customizations[option.name].forEach(label => {
                     const selected = option.options?.find(opt => opt.label === label);
                     if (selected?.price) total += selected.price;
                 });
             } else if (option.type === 'meal_upgrade' && isMeal) {
                 const mealOption = option.options?.find(opt => opt.label.toLowerCase().includes('meal'));
                 if (mealOption?.price) total += mealOption.price;
             }
         });

         // Add meal customization prices
         if (isMeal) {
             const mealUpgrade = item?.customization_options?.find(opt => opt.type === 'meal_upgrade');
             mealUpgrade?.meal_customizations?.forEach(mealOpt => {
                 if (mealOpt.type === 'single' && mealCustomizations[mealOpt.name]) {
                     const selected = mealOpt.options?.find(opt => opt.label === mealCustomizations[mealOpt.name]);
                     if (selected?.price) total += selected.price;
                 } else if (mealOpt.type === 'multiple' && mealCustomizations[mealOpt.name]) {
                     mealCustomizations[mealOpt.name].forEach(label => {
                         const selected = mealOpt.options?.find(opt => opt.label === label);
                         if (selected?.price) total += selected.price;
                     });
                 }
             });
         }

         return total;
     };

     const currentPrice = calculatePrice();

    const handleConfirm = () => {
        const allCustomizations = isMeal ? { ...customizations, ...mealCustomizations } : customizations;
        onConfirm({ 
            ...item, 
            price: currentPrice,
            customizations: allCustomizations,
            specialInstructions: specialInstructions.trim(),
            isMeal
        });
        setCustomizations({});
        setMealCustomizations({});
        setSpecialInstructions('');
        setIsMeal(false);
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
                className="bg-gray-800 border-gray-700 p-0 flex flex-col max-h-[85vh]"
                style={{
                    maxWidth: columns === 1 ? '90vw' : columns === 2 ? '95vw' : '98vw'
                }}
            >
                <div className="flex items-center justify-between p-3 md:p-4 border-b border-gray-700 flex-shrink-0">
                    <div className="flex-1">
                        <DialogTitle className={`font-bold text-white ${columns === 1 ? 'text-lg' : 'text-base'}`}>
                            {item.name}
                        </DialogTitle>
                        <p className="text-orange-400 font-bold text-lg mt-1">
                            £{currentPrice.toFixed(2)}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="h-8 w-8 text-white hover:bg-gray-700"
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                <div 
                    className="flex-1 overflow-y-auto p-2 md:p-4 min-h-0"
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columns}, 1fr)`,
                        gap: columns > 2 ? '0.75rem' : '1rem'
                    }}
                >
                    {item.customization_options?.map(option => (
                        <div key={option.name} className="space-y-2">
                           <div className="flex items-baseline gap-1">
                               <Label className={`font-bold text-white ${columns === 1 ? 'text-xl' : columns === 2 ? 'text-lg' : 'text-base'}`}>
                                   {option.name}
                               </Label>
                               {option.required && (
                                   <span className="text-red-500 font-bold">*</span>
                               )}
                           </div>

                           {option.type === 'meal_upgrade' ? (
                               <RadioGroup 
                                   value={isMeal ? 'meal' : 'single'}
                                   onValueChange={(value) => {
                                       setIsMeal(value === 'meal');
                                       if (value !== 'meal') {
                                           setMealCustomizations({});
                                       }
                                   }}
                                   className="space-y-2"
                               >
                                   {option.options?.map(opt => (
                                       <div 
                                           key={opt.label} 
                                           className="flex items-center space-x-2 p-2 md:p-3 rounded-lg bg-gray-700 hover:bg-gray-600 cursor-pointer transition-all border-2 border-transparent hover:border-orange-500"
                                           onClick={() => {
                                               const newIsMeal = opt.label.toLowerCase().includes('meal');
                                               setIsMeal(newIsMeal);
                                               if (!newIsMeal) {
                                                   setMealCustomizations({});
                                               }
                                           }}
                                       >
                                           <RadioGroupItem 
                                               value={opt.label.toLowerCase().includes('meal') ? 'meal' : 'single'}
                                               id={opt.label}
                                               className="w-4 h-4"
                                           />
                                           <Label 
                                               htmlFor={opt.label} 
                                               className="text-white cursor-pointer flex-1 font-medium text-sm"
                                           >
                                               {opt.label}
                                           </Label>
                                           {opt.price > 0 && (
                                               <span className="font-bold text-orange-400 text-sm">
                                                   +£{opt.price.toFixed(2)}
                                               </span>
                                           )}
                                       </div>
                                   ))}
                               </RadioGroup>
                           ) : option.type === 'single' ? (
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
                    
                    {/* Meal Customizations - Show when meal is selected */}
                    {isMeal && item.customization_options?.find(opt => opt.type === 'meal_upgrade')?.meal_customizations?.map(mealOpt => (
                        <div key={mealOpt.name} className="space-y-2 col-span-full border-t border-orange-500/30 pt-3">
                            <div className="flex items-baseline gap-1">
                                <Label className="font-bold text-orange-400 text-base">
                                    {mealOpt.name}
                                </Label>
                                {mealOpt.required && (
                                    <span className="text-red-500 font-bold">*</span>
                                )}
                            </div>

                            {mealOpt.type === 'single' ? (
                                <RadioGroup 
                                    value={mealCustomizations[mealOpt.name] || ''}
                                    onValueChange={(value) => setMealCustomizations(prev => ({
                                        ...prev,
                                        [mealOpt.name]: value
                                    }))}
                                    className="grid grid-cols-2 gap-2"
                                >
                                    {mealOpt.options?.map(opt => (
                                        <div 
                                            key={opt.label} 
                                            className="flex items-center space-x-2 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 cursor-pointer transition-all border-2 border-transparent hover:border-orange-500"
                                            onClick={() => setMealCustomizations(prev => ({
                                                ...prev,
                                                [mealOpt.name]: opt.label
                                            }))}
                                        >
                                            <RadioGroupItem 
                                                value={opt.label} 
                                                id={`meal-${opt.label}`}
                                                className="w-4 h-4"
                                            />
                                            <Label 
                                                htmlFor={`meal-${opt.label}`}
                                                className="text-white cursor-pointer flex-1 font-medium text-xs"
                                            >
                                                {opt.label}
                                            </Label>
                                            {opt.price > 0 && (
                                                <span className="font-bold text-orange-400 text-xs">
                                                    +£{opt.price.toFixed(2)}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </RadioGroup>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {mealOpt.options?.map(opt => (
                                        <div 
                                            key={opt.label}
                                            className="flex items-center space-x-2 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 cursor-pointer transition-all border-2 border-transparent hover:border-orange-500"
                                            onClick={() => {
                                                setMealCustomizations(prev => ({
                                                    ...prev,
                                                    [mealOpt.name]: prev[mealOpt.name]?.includes(opt.label)
                                                        ? prev[mealOpt.name].filter(v => v !== opt.label)
                                                        : [...(prev[mealOpt.name] || []), opt.label]
                                                }));
                                            }}
                                        >
                                            <Checkbox
                                                id={`meal-${opt.label}`}
                                                checked={mealCustomizations[mealOpt.name]?.includes(opt.label) || false}
                                                className="w-4 h-4"
                                            />
                                            <Label 
                                                htmlFor={`meal-${opt.label}`}
                                                className="text-white cursor-pointer flex-1 font-medium text-xs"
                                            >
                                                {opt.label}
                                            </Label>
                                            {opt.price > 0 && (
                                                <span className="font-bold text-orange-400 text-xs">
                                                    +£{opt.price.toFixed(2)}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                    

                    {/* Special Instructions Section */}
                    <div className="space-y-2 col-span-full">
                        <Label className="font-bold text-white text-base">Special Instructions</Label>
                        <Textarea
                            placeholder="Add any special requests (e.g., extra spicy, no onions, etc.)"
                            value={specialInstructions}
                            onChange={(e) => setSpecialInstructions(e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 resize-none h-24"
                        />
                    </div>
                </div>

                <div className="flex gap-2 p-3 md:p-4 border-t border-gray-700 flex-shrink-0 bg-gray-800">
                    <Button 
                        variant="outline" 
                        onClick={onClose}
                        className="flex-1 bg-gray-700 border-gray-600 text-white hover:bg-gray-600 font-bold rounded-lg h-12 text-sm"
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleConfirm}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg h-12 text-sm"
                    >
                        Add to Cart
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}