import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, ChevronRight, ChevronLeft } from 'lucide-react';
import OnScreenKeyboard from './OnScreenKeyboard';
import { toast } from 'sonner';

/**
 * Fullscreen layout — one OPTION per screen (not per group).
 * Maximum tap target — great for kiosk-style touch terminals.
 */
export default function POSItemCustomizationFullscreen({ item, open, onClose, onConfirm, posTheme = 'dark', initialCustomizations = null, initialSpecialInstructions = '', initialIsMeal = false, initialMealCustomizations = null, isEditing = false }) {
    const isDark = posTheme === 'dark';

    const [customizations, setCustomizations] = useState({});
    const [specialInstructions, setSpecialInstructions] = useState('');
    const [isMeal, setIsMeal] = useState(false);
    const [mealCustomizations, setMealCustomizations] = useState({});
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        // Seed from the cart line when editing an existing item, so changing one
        // topping doesn't mean re-picking every option. Blank for a fresh add.
        setCustomizations(initialCustomizations ? { ...initialCustomizations } : {});
        setMealCustomizations(initialMealCustomizations ? { ...initialMealCustomizations } : {});
        setSpecialInstructions(initialSpecialInstructions || '');
        setIsMeal(!!initialIsMeal);
        setShowKeyboard(false);
        setStep(0);
     
    }, [item?.id, open]);

    const optPrice = (opt) => opt?.pos_price != null ? opt.pos_price : (opt?.price || 0);

    const buildSteps = () => {
        const steps = [...(item?.customization_options || [])];
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
            if (option.type === 'single' && customizations[option.name]) total += optPrice(option.options?.find(o => o.label === customizations[option.name]));
            else if (option.type === 'multiple' && customizations[option.name]) customizations[option.name].forEach(l => { total += optPrice(option.options?.find(o => o.label === l)); });
            else if (option.type === 'meal_upgrade') {
                const target = isMeal ? 'meal' : 'own';
                const mealOpt = option.options?.find(o => o.label.toLowerCase().includes(target)) || (isMeal ? option.options?.[1] : option.options?.[0]);
                total += optPrice(mealOpt);
            }
        });
        if (isMeal) {
            const mu = item?.customization_options?.find(o => o.type === 'meal_upgrade');
            mu?.meal_customizations?.forEach(mc => {
                if (mc.type === 'single' && mealCustomizations[mc.name]) total += optPrice(mc.options?.find(o => o.label === mealCustomizations[mc.name]));
                else if (mc.type === 'multiple' && mealCustomizations[mc.name]) mealCustomizations[mc.name].forEach(l => { total += optPrice(mc.options?.find(o => o.label === l)); });
            });
        }
        return total;
    };

    const currentPrice = calculatePrice();

    const handleConfirm = () => {
        const missing = [];
        item?.customization_options?.forEach(option => {
            if (!option.required) return;
            if (option.type === 'single' && !customizations[option.name]) missing.push(option.name);
            if (option.type === 'multiple' && (!customizations[option.name] || customizations[option.name].length === 0)) missing.push(option.name);
        });
        if (missing.length > 0) {
            toast.error(`Please select: ${missing.join(', ')}`);
            const idx = steps.findIndex(s => missing.includes(s.name));
            if (idx >= 0) setStep(idx);
            return;
        }
        onConfirm({
            ...item,
            price: currentPrice,
            pos_price: item?.pos_price != null ? currentPrice : undefined,
            customizations: isMeal ? { ...customizations, ...mealCustomizations } : customizations,
            mealCustomizations: isMeal ? { ...mealCustomizations } : null,
            specialInstructions: specialInstructions.trim(),
            isMeal,
        });
    };

    const handleNext = () => {
        if (isLastStep) { handleConfirm(); return; }
        if (currentStep?.required) {
            const store = currentStep._isMealSub ? mealCustomizations : customizations;
            const isFilledSingle = currentStep.type === 'single' && store[currentStep.name];
            const isFilledMultiple = currentStep.type === 'multiple' && store[currentStep.name]?.length > 0;
            if (!isFilledSingle && !isFilledMultiple && currentStep.type !== 'meal_upgrade') {
                toast.error(`Please select an option for: ${currentStep.name}`);
                return;
            }
        }
        setStep(s => s + 1);
    };

    const toggleSingle = (name, label, isMealSub = false) => {
        if (isMealSub) setMealCustomizations(p => ({ ...p, [name]: label }));
        else setCustomizations(p => ({ ...p, [name]: label }));
        if (!isLastStep) setTimeout(() => setStep(s => s + 1), 200);
    };

    const toggleMealUpgrade = (isMealOpt) => {
        setIsMeal(isMealOpt);
        if (!isMealOpt) setMealCustomizations({});
        if (!isLastStep) setTimeout(() => setStep(s => s + 1), 200);
    };

    // max_quantity caps how many options a 'multiple' group allows. The kiosk and
    // the deal modal already enforce it; the POS layouts did not, so a restaurant
    // configuring "max 3 toppings" had it honoured on the kiosk while POS staff
    // could add unlimited - inconsistent orders and under-charging.
    const findGroup = (name, isMealSub) => {
        if (isMealSub) {
            const mealUpgrade = item?.customization_options?.find(o => o.type === 'meal_upgrade');
            return mealUpgrade?.meal_customizations?.find(o => o.name === name);
        }
        return item?.customization_options?.find(o => o.name === name);
    };

    const toggleMultiple = (name, label, isMealSub = false) => {
        const setter = isMealSub ? setMealCustomizations : setCustomizations;
        const max = findGroup(name, isMealSub)?.max_quantity;
        setter(p => {
            const c = p[name] || [];
            if (c.includes(label)) return { ...p, [name]: c.filter(v => v !== label) };
            if (max && c.length >= max) {
                toast.error(`You can only select up to ${max} for ${name}`);
                return p;
            }
            return { ...p, [name]: [...c, label] };
        });
    };

    const bg = isDark ? 'bg-[#0c0e16]' : 'bg-white';
    const text = isDark ? 'text-white' : 'text-gray-900';
    const subtext = isDark ? 'text-gray-400' : 'text-gray-500';
    const divider = isDark ? 'border-white/[0.06]' : 'border-gray-200';

    if (!item?.customization_options?.length) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent hideClose className={`${bg} border-0 p-0 flex flex-col w-full h-full max-w-full max-h-full rounded-none`} style={{ width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh' }}>

                {/* Top bar */}
                <div className={`flex items-center justify-between px-6 py-4 border-b ${divider} flex-shrink-0`}>
                    <div>
                        <p className={`font-bold text-xl ${text}`}>{item.name}</p>
                        <p className="text-orange-400 font-bold text-2xl">£{currentPrice.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-sm font-semibold ${subtext}`}>{step + 1} / {steps.length}</span>
                        <button onClick={onClose} className={`h-11 w-11 rounded-full flex items-center justify-center ${isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                            <X className="h-6 w-6" />
                        </button>
                    </div>
                </div>

                {/* Progress bar */}
                <div className={`h-1.5 ${isDark ? 'bg-white/10' : 'bg-gray-200'} flex-shrink-0`}>
                    <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
                </div>

                {/* Step title */}
                <div className="px-8 pt-6 pb-3 flex-shrink-0">
                    <p className={`text-sm font-semibold uppercase tracking-widest ${subtext}`}>{currentStep?.name}</p>
                    {currentStep?.required && <span className="text-xs text-red-400 font-semibold">* Required</span>}
                </div>

                {/* Options — fills remaining space */}
                <div className={`flex-1 overflow-y-auto px-6 pb-4 ${showKeyboard ? 'pb-80' : ''}`}>
                    {/* Meal upgrade */}
                    {currentStep?.type === 'meal_upgrade' && (
                        <div className="grid grid-cols-1 gap-4 h-full">
                            {currentStep.options?.map(opt => {
                                const isMealOpt = opt.label.toLowerCase().includes('meal');
                                const isSelected = isMeal === isMealOpt;
                                return (
                                    <button key={opt.label}
                                        onClick={() => toggleMealUpgrade(isMealOpt)}
                                        className={`w-full rounded-3xl border-2 p-8 flex items-center justify-between transition-all active:scale-[0.98] ${isSelected ? 'bg-orange-500 border-orange-500' : isDark ? 'bg-white/[0.04] border-white/[0.08] hover:border-orange-500/40' : 'bg-gray-50 border-gray-200 hover:border-orange-400'}`}
                                    >
                                        <span className={`font-bold text-2xl ${isSelected ? 'text-white' : text}`}>{opt.label}</span>
                                        <div className="flex items-center gap-4">
                                            {optPrice(opt) > 0 && <span className={`font-bold text-xl ${isSelected ? 'text-white' : 'text-orange-400'}`}>+£{optPrice(opt).toFixed(2)}</span>}
                                            {isSelected && <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center"><Check className="h-6 w-6 text-orange-500" /></div>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Single */}
                    {currentStep?.type === 'single' && (
                        <div className="grid grid-cols-1 gap-4">
                            {currentStep.options?.map(opt => {
                                const isSelected = currentStep._isMealSub
                                    ? mealCustomizations[currentStep.name] === opt.label
                                    : customizations[currentStep.name] === opt.label;
                                return (
                                    <button key={opt.label}
                                        onClick={() => toggleSingle(currentStep.name, opt.label, currentStep._isMealSub)}
                                        className={`w-full rounded-3xl border-2 p-8 flex items-center justify-between transition-all active:scale-[0.98] ${isSelected ? 'bg-orange-500 border-orange-500' : isDark ? 'bg-white/[0.04] border-white/[0.08] hover:border-orange-500/40' : 'bg-gray-50 border-gray-200 hover:border-orange-400'}`}
                                    >
                                        <span className={`font-bold text-2xl ${isSelected ? 'text-white' : text}`}>{opt.label}</span>
                                        <div className="flex items-center gap-4">
                                            {optPrice(opt) > 0 && <span className={`font-bold text-xl ${isSelected ? 'text-white' : 'text-orange-400'}`}>+£{optPrice(opt).toFixed(2)}</span>}
                                            {isSelected && <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center"><Check className="h-6 w-6 text-orange-500" /></div>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Multiple */}
                    {currentStep?.type === 'multiple' && (
                        <div className="grid grid-cols-1 gap-4">
                            {currentStep.options?.map(opt => {
                                const selections = currentStep._isMealSub ? (mealCustomizations[currentStep.name] || []) : (customizations[currentStep.name] || []);
                                const isSelected = selections.includes(opt.label);
                                return (
                                    <button key={opt.label}
                                        onClick={() => toggleMultiple(currentStep.name, opt.label, currentStep._isMealSub)}
                                        className={`w-full rounded-3xl border-2 p-8 flex items-center justify-between transition-all active:scale-[0.98] ${isSelected ? 'bg-orange-500 border-orange-500' : isDark ? 'bg-white/[0.04] border-white/[0.08] hover:border-orange-500/40' : 'bg-gray-50 border-gray-200 hover:border-orange-400'}`}
                                    >
                                        <span className={`font-bold text-2xl ${isSelected ? 'text-white' : text}`}>{opt.label}</span>
                                        <div className="flex items-center gap-4">
                                            {optPrice(opt) > 0 && <span className={`font-bold text-xl ${isSelected ? 'text-white' : 'text-orange-400'}`}>+£{optPrice(opt).toFixed(2)}</span>}
                                            <div className={`h-10 w-10 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-white border-white' : isDark ? 'border-white/30' : 'border-gray-300'}`}>
                                                {isSelected && <Check className="h-6 w-6 text-orange-500" />}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Instructions */}
                    {currentStep?.type === 'instructions' && (
                        <div className="space-y-3">
                            <Textarea
                                placeholder="e.g. extra spicy, no onions, allergen notes..."
                                value={specialInstructions}
                                onChange={(e) => setSpecialInstructions(e.target.value)}
                                onFocus={() => setShowKeyboard(true)}
                                className={`${isDark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'} resize-none h-40 text-xl rounded-2xl`}
                            />
                            <p className={`text-sm ${subtext}`}>Optional — tap Skip / Next if no special requests</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={`flex gap-4 px-6 py-5 border-t ${divider} flex-shrink-0`}>
                    {step > 0 ? (
                        <Button onClick={() => setStep(s => s - 1)} className={`h-16 px-6 font-bold text-lg rounded-2xl ${isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10' : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'}`}>
                            <ChevronLeft className="h-6 w-6" />
                        </Button>
                    ) : (
                        <Button onClick={onClose} className={`flex-1 h-16 font-bold text-lg rounded-2xl ${isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10' : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'}`}>
                            Cancel
                        </Button>
                    )}
                    <Button onClick={handleNext} className={`flex-[4] h-16 font-bold text-xl rounded-2xl flex items-center justify-center gap-3 bg-orange-500 hover:bg-orange-400 text-white`}>
                        {isLastStep ? (<><Check className="h-6 w-6" />{isEditing ? 'Update Item' : 'Add to Cart'} — £{currentPrice.toFixed(2)}</>) : currentStep?.type === 'instructions' ? (<>Skip / Next <ChevronRight className="h-6 w-6" /></>) : (<>Next <ChevronRight className="h-6 w-6" /></>)}
                    </Button>
                </div>

                {showKeyboard && (
                    <OnScreenKeyboard
                        onKeyPress={(key) => setSpecialInstructions(prev => prev + key)}
                        onBackspace={() => setSpecialInstructions(prev => prev.slice(0, -1))}
                        onSpace={() => setSpecialInstructions(prev => prev + ' ')}
                        onClose={() => setShowKeyboard(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}