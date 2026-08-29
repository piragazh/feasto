import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X, ChevronRight, ChevronLeft } from 'lucide-react';
import OnScreenKeyboard from './OnScreenKeyboard';
import { toast } from 'sonner';

/**
 * V2 — Stepped / Big-Button touch customization UI.
 * Each customization group gets its own "step" screen with large tap targets.
 * Business logic is identical to POSItemCustomization (same props/output).
 */
export default function POSItemCustomizationV2({ item, open, onClose, onConfirm, posTheme = 'dark', initialCustomizations = null, initialSpecialInstructions = '', initialIsMeal = false, initialMealCustomizations = null, isEditing = false }) {
    const isDark = posTheme === 'dark';

    const [customizations, setCustomizations] = useState({});
    const [specialInstructions, setSpecialInstructions] = useState('');
    const [isMeal, setIsMeal] = useState(false);
    const [mealCustomizations, setMealCustomizations] = useState({});
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [step, setStep] = useState(0); // which option group we're on
    const autoAdvanceTimer = useRef(null);

    useEffect(() => {
        // Seed from the cart line when editing an existing item, so changing one
        // topping doesn't mean re-picking every option. Blank for a fresh add.
        setCustomizations(initialCustomizations ? { ...initialCustomizations } : {});
        setMealCustomizations(initialMealCustomizations ? { ...initialMealCustomizations } : {});
        setSpecialInstructions(initialSpecialInstructions || '');
        setIsMeal(!!initialIsMeal);
        setShowKeyboard(false);
        setStep(0);
        // Clear any pending auto-advance timer when item/dialog resets
        if (autoAdvanceTimer.current) {
            clearTimeout(autoAdvanceTimer.current);
            autoAdvanceTimer.current = null;
        }
    }, [item?.id, open]);

    // Clean up pending auto-advance timer on unmount
    useEffect(() => {
        return () => {
            if (autoAdvanceTimer.current) {
                clearTimeout(autoAdvanceTimer.current);
                autoAdvanceTimer.current = null;
            }
        };
    }, []);

    // Helper: effective POS price for an option
    const optPrice = (opt) => {
        if (!opt) return 0;
        return opt.pos_price != null ? opt.pos_price : (opt.price || 0);
    };

    // Build the list of steps: one per customization_option + special instructions
    const buildSteps = () => {
        const steps = [...(item?.customization_options || [])];
        // If meal upgrade is chosen, append meal sub-options
        if (isMeal) {
            const mealUpgrade = item?.customization_options?.find(o => o.type === 'meal_upgrade');
            if (mealUpgrade?.meal_customizations?.length) {
                steps.push(...mealUpgrade.meal_customizations.map(mc => ({ ...mc, _isMealSub: true })));
            }
        }
        steps.push({ name: 'Special Instructions', type: 'instructions' });
        return steps;
    };

    const steps = buildSteps();
    const currentStep = steps[step];
    const isLastStep = step === steps.length - 1;

    const calculatePrice = () => {
        let total = (item?.pos_price != null ? item.pos_price : item?.price) || 0;
        item?.customization_options?.forEach(option => {
            if (option.type === 'single' && customizations[option.name]) {
                const sel = option.options?.find(o => o.label === customizations[option.name]);
                total += optPrice(sel);
            } else if (option.type === 'multiple' && customizations[option.name]) {
                customizations[option.name].forEach(label => {
                    const sel = option.options?.find(o => o.label === label);
                    total += optPrice(sel);
                });
            } else if (option.type === 'meal_upgrade') {
                const target = isMeal ? 'meal' : 'own';
                const mealOpt = option.options?.find(o => o.label.toLowerCase().includes(target)) || (isMeal ? option.options?.[1] : option.options?.[0]);
                total += optPrice(mealOpt);
            }
        });
        if (isMeal) {
            const mealUpgrade = item?.customization_options?.find(o => o.type === 'meal_upgrade');
            mealUpgrade?.meal_customizations?.forEach(mc => {
                if (mc.type === 'single' && mealCustomizations[mc.name]) {
                    const sel = mc.options?.find(o => o.label === mealCustomizations[mc.name]);
                    total += optPrice(sel);
                } else if (mc.type === 'multiple' && mealCustomizations[mc.name]) {
                    mealCustomizations[mc.name].forEach(label => {
                        const sel = mc.options?.find(o => o.label === label);
                        total += optPrice(sel);
                    });
                }
            });
        }
        return total;
    };

    const currentPrice = calculatePrice();

    const getMissingRequired = () => {
        const missing = [];
        item?.customization_options?.forEach(option => {
            if (!option.required) return;
            if (option.type === 'single' && !customizations[option.name]) missing.push(option.name);
            if (option.type === 'multiple' && (!customizations[option.name] || customizations[option.name].length === 0)) missing.push(option.name);
            if (option.type === 'meal_upgrade' && isMeal) {
                option.meal_customizations?.forEach(mc => {
                    if (!mc.required) return;
                    if (mc.type === 'single' && !mealCustomizations[mc.name]) missing.push(mc.name);
                    if (mc.type === 'multiple' && (!mealCustomizations[mc.name] || mealCustomizations[mc.name].length === 0)) missing.push(mc.name);
                });
            }
        });
        return missing;
    };

    const handleConfirm = () => {
        const missing = getMissingRequired();
        if (missing.length > 0) {
            toast.error(`Please select: ${missing.join(', ')}`);
            // Jump to first missing step
            const idx = steps.findIndex(s => missing.includes(s.name));
            if (idx >= 0) setStep(idx);
            return;
        }
        const allCustomizations = isMeal ? { ...customizations, ...mealCustomizations } : customizations;
        onConfirm({ ...item, price: currentPrice, customizations: allCustomizations, specialInstructions: specialInstructions.trim(), isMeal });
    };

    const handleNext = () => {
        if (isLastStep) { handleConfirm(); return; }
        // If current step is required and not filled, warn
        if (currentStep?.required) {
            const store = currentStep._isMealSub ? mealCustomizations : customizations;
            const isFilledSingle = currentStep.type === 'single' && store[currentStep.name];
            const isFilledMultiple = currentStep.type === 'multiple' && store[currentStep.name]?.length > 0;
            const isMealUpgrade = currentStep.type === 'meal_upgrade';
            if (!isFilledSingle && !isFilledMultiple && !isMealUpgrade) {
                toast.error(`Please select an option for: ${currentStep.name}`);
                return;
            }
        }
        setStep(s => s + 1);
    };

    const toggleSingle = (optionName, label, isMealSub = false, autoAdvance = true) => {
        if (isMealSub) {
            setMealCustomizations(prev => ({ ...prev, [optionName]: label }));
        } else {
            setCustomizations(prev => ({ ...prev, [optionName]: label }));
        }
        // Auto-advance to next step after a short delay for single-select
        if (autoAdvance && !isLastStep) {
            if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
            autoAdvanceTimer.current = setTimeout(() => {
                autoAdvanceTimer.current = null;
                setStep(s => s + 1);
            }, 250);
        }
    };

    const toggleMultiple = (optionName, label, isMealSub = false) => {
        const setter = isMealSub ? setMealCustomizations : setCustomizations;
        setter(prev => {
            const current = prev[optionName] || [];
            return {
                ...prev,
                [optionName]: current.includes(label) ? current.filter(v => v !== label) : [...current, label]
            };
        });
    };

    const bg = isDark ? 'bg-[#151720]' : 'bg-white';
    const text = isDark ? 'text-white' : 'text-gray-900';
    const subtext = isDark ? 'text-gray-400' : 'text-gray-500';
    const divider = isDark ? 'border-white/[0.06]' : 'border-gray-200';
    const optionBase = `w-full text-left rounded-2xl border-2 transition-all active:scale-95 flex items-center justify-between px-5 py-4 min-h-[72px]`;
    const optionUnselected = isDark ? 'bg-white/[0.04] border-white/[0.08] hover:border-orange-500/40' : 'bg-gray-50 border-gray-200 hover:border-orange-400';
    const optionSelected = 'bg-orange-500 border-orange-500 text-white';

    if (!item?.customization_options?.length) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className={`${bg} border ${divider} p-0 flex flex-col max-w-lg w-full max-h-[90vh]`}>

                {/* Header */}
                <div className={`flex items-center justify-between px-5 py-4 border-b ${divider} flex-shrink-0`}>
                    <div>
                        <p className={`font-bold text-lg ${text}`}>{item.name}</p>
                        <p className="text-orange-400 font-bold text-xl mt-0.5">£{currentPrice.toFixed(2)}</p>
                    </div>
                    <button onClick={onClose} className={`h-10 w-10 rounded-full flex items-center justify-center ${isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Step indicator */}
                <div className={`flex items-center gap-1.5 px-5 pt-3 pb-1 flex-shrink-0`}>
                    {steps.map((s, i) => (
                        <button key={i} onClick={() => setStep(i)}
                            className={`h-2 rounded-full transition-all ${i === step ? 'bg-orange-500 flex-1' : i < step ? 'bg-orange-300 w-4' : isDark ? 'bg-white/10 w-4' : 'bg-gray-200 w-4'}`}
                        />
                    ))}
                </div>

                {/* Step title */}
                <div className="px-5 pt-2 pb-1 flex-shrink-0">
                    <p className={`text-xs font-semibold uppercase tracking-wide ${subtext}`}>
                        Step {step + 1} of {steps.length}
                    </p>
                    <p className={`font-bold text-xl ${text} flex items-center gap-2`}>
                        {currentStep?.name}
                        {currentStep?.required && <span className="text-red-500 text-sm">*</span>}
                    </p>
                </div>

                {/* Step content */}
                <div className={`flex-1 overflow-y-auto px-5 py-3 space-y-3 ${showKeyboard ? 'pb-80' : ''}`}>

                    {/* Meal upgrade */}
                    {currentStep?.type === 'meal_upgrade' && currentStep.options?.map(opt => {
                        const isMealOpt = opt.label.toLowerCase().includes('meal');
                        const isSelected = isMeal === isMealOpt;
                        return (
                            <button key={opt.label}
                                className={`${optionBase} ${isSelected ? optionSelected : optionUnselected} ${!isSelected && text}`}
                                onClick={() => { setIsMeal(isMealOpt); if (!isMealOpt) setMealCustomizations({}); }}
                            >
                                <span className="font-semibold text-lg">{opt.label}</span>
                                <div className="flex items-center gap-3">
                                    {optPrice(opt) > 0 && <span className={`font-bold text-base ${isSelected ? 'text-white' : 'text-orange-400'}`}>+£{optPrice(opt).toFixed(2)}</span>}
                                    {isSelected && <Check className="h-6 w-6" />}
                                </div>
                            </button>
                        );
                    })}

                    {/* Single select */}
                    {currentStep?.type === 'single' && currentStep.options?.map(opt => {
                        const selected = currentStep._isMealSub
                            ? mealCustomizations[currentStep.name] === opt.label
                            : customizations[currentStep.name] === opt.label;
                        return (
                            <button key={opt.label}
                                className={`${optionBase} ${selected ? optionSelected : optionUnselected} ${!selected && text}`}
                                onClick={() => toggleSingle(currentStep.name, opt.label, currentStep._isMealSub)}
                            >
                                <span className="font-semibold text-lg">{opt.label}</span>
                                <div className="flex items-center gap-3">
                                    {optPrice(opt) > 0 && <span className={`font-bold text-base ${selected ? 'text-white' : 'text-orange-400'}`}>+£{optPrice(opt).toFixed(2)}</span>}
                                    {selected && <Check className="h-6 w-6" />}
                                </div>
                            </button>
                        );
                    })}

                    {/* Multiple select */}
                    {currentStep?.type === 'multiple' && currentStep.options?.map(opt => {
                        const selections = currentStep._isMealSub ? (mealCustomizations[currentStep.name] || []) : (customizations[currentStep.name] || []);
                        const selected = selections.includes(opt.label);
                        return (
                            <button key={opt.label}
                                className={`${optionBase} ${selected ? optionSelected : optionUnselected} ${!selected && text}`}
                                onClick={() => toggleMultiple(currentStep.name, opt.label, currentStep._isMealSub)}
                            >
                                <span className="font-semibold text-lg">{opt.label}</span>
                                <div className="flex items-center gap-3">
                                    {optPrice(opt) > 0 && <span className={`font-bold text-base ${selected ? 'text-white' : 'text-orange-400'}`}>+£{optPrice(opt).toFixed(2)}</span>}
                                    <div className={`h-6 w-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'bg-white border-white' : isDark ? 'border-white/30' : 'border-gray-300'}`}>
                                        {selected && <Check className="h-4 w-4 text-orange-500" />}
                                    </div>
                                </div>
                            </button>
                        );
                    })}

                    {/* Special instructions */}
                    {currentStep?.type === 'instructions' && (
                        <div className="space-y-2">
                            <Textarea
                                placeholder="e.g. extra spicy, no onions, allergen notes..."
                                value={specialInstructions}
                                onChange={(e) => setSpecialInstructions(e.target.value)}
                                onFocus={() => setShowKeyboard(true)}
                                className={`${isDark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'} resize-none h-32 text-base rounded-xl`}
                            />
                            <p className={`text-xs ${subtext}`}>Optional — tap Skip if no special requests</p>
                        </div>
                    )}
                </div>

                {/* Footer nav */}
                <div className={`flex gap-3 p-4 border-t ${divider} flex-shrink-0`}>
                    {step > 0 ? (
                        <Button onClick={() => setStep(s => s - 1)}
                            className={`h-14 px-5 font-bold text-base rounded-2xl ${isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10' : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'}`}
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                    ) : (
                        <Button onClick={onClose}
                            className={`flex-1 h-14 font-bold text-base rounded-2xl ${isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10' : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'}`}
                        >
                            Cancel
                        </Button>
                    )}

                    <Button onClick={handleNext}
                        className={`flex-[3] h-14 font-bold text-base rounded-2xl flex items-center justify-center gap-2 ${isLastStep ? 'bg-green-600 hover:bg-green-500' : 'bg-orange-500 hover:bg-orange-400'} text-white`}
                    >
                        {isLastStep ? (
                            <>
                                <Check className="h-5 w-5" />
                                Add to Cart — £{currentPrice.toFixed(2)}
                            </>
                        ) : currentStep?.type === 'instructions' ? (
                            <>Skip / Next <ChevronRight className="h-5 w-5" /></>
                        ) : (
                            <>Next <ChevronRight className="h-5 w-5" /></>
                        )}
                    </Button>
                </div>

                {showKeyboard && (
                    <OnScreenKeyboard
                        onKeyPress={(key) => setSpecialInstructions(prev => prev + key)}
                        onBackspace={() => setSpecialInstructions(prev => prev.slice(0, -1))}
                        onSpace={() => setSpecialInstructions(prev => prev + ' ')}
                        onClose={() => setShowKeyboard(false)}
                        isDark={isDark}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}