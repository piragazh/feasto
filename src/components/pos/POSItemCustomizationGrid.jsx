import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, X } from 'lucide-react';
import OnScreenKeyboard from './OnScreenKeyboard';
import { toast } from 'sonner';

/**
 * Grid layout — options shown in a 2-column tile grid per group.
 * All groups are scrollable on one screen (no stepping).
 */
export default function POSItemCustomizationGrid({ item, open, onClose, onConfirm, posTheme = 'dark', initialCustomizations = null, initialSpecialInstructions = '', initialIsMeal = false, initialMealCustomizations = null, isEditing = false }) {
    const isDark = posTheme === 'dark';

    const [customizations, setCustomizations] = useState({});
    const [specialInstructions, setSpecialInstructions] = useState('');
    const [isMeal, setIsMeal] = useState(false);
    const [mealCustomizations, setMealCustomizations] = useState({});
    const [showKeyboard, setShowKeyboard] = useState(false);

    useEffect(() => {
        // Seed from the cart line when editing an existing item, so changing one
        // topping doesn't mean re-picking every option. Blank for a fresh add.
        setCustomizations(initialCustomizations ? { ...initialCustomizations } : {});
        setMealCustomizations(initialMealCustomizations ? { ...initialMealCustomizations } : {});
        setSpecialInstructions(initialSpecialInstructions || '');
        setIsMeal(!!initialIsMeal);
        setShowKeyboard(false);
    }, [item?.id, open]);

    const optPrice = (opt) => opt?.pos_price != null ? opt.pos_price : (opt?.price || 0);

    const calculatePrice = () => {
        let total = (item?.pos_price != null ? item.pos_price : item?.price) || 0;
        item?.customization_options?.forEach(option => {
            if (option.type === 'single' && customizations[option.name]) {
                total += optPrice(option.options?.find(o => o.label === customizations[option.name]));
            } else if (option.type === 'multiple' && customizations[option.name]) {
                customizations[option.name].forEach(label => { total += optPrice(option.options?.find(o => o.label === label)); });
            } else if (option.type === 'meal_upgrade') {
                const targetLabel = isMeal ? 'meal' : 'own';
                const mealOpt = option.options?.find(o => o.label.toLowerCase().includes(targetLabel)) || (isMeal ? option.options?.[1] : option.options?.[0]);
                total += optPrice(mealOpt);
            }
        });
        if (isMeal) {
            const mealUpgrade = item?.customization_options?.find(o => o.type === 'meal_upgrade');
            mealUpgrade?.meal_customizations?.forEach(mc => {
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
            if (option.type === 'meal_upgrade' && isMeal) {
                option.meal_customizations?.forEach(mc => {
                    if (!mc.required) return;
                    if (mc.type === 'single' && !mealCustomizations[mc.name]) missing.push(mc.name);
                    if (mc.type === 'multiple' && (!mealCustomizations[mc.name] || mealCustomizations[mc.name].length === 0)) missing.push(mc.name);
                });
            }
        });
        if (missing.length > 0) { toast.error(`Please select: ${missing.join(', ')}`); return; }
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

    const toggleSingle = (name, label, isMealSub = false) => {
        if (isMealSub) setMealCustomizations(p => ({ ...p, [name]: label === p[name] ? undefined : label }));
        else setCustomizations(p => ({ ...p, [name]: label === p[name] ? undefined : label }));
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

    const bg = isDark ? 'bg-[#151720]' : 'bg-white';
    const text = isDark ? 'text-white' : 'text-gray-900';
    const subtext = isDark ? 'text-gray-400' : 'text-gray-500';
    const divider = isDark ? 'border-white/[0.06]' : 'border-gray-200';
    const sectionHead = isDark ? 'text-gray-300 bg-white/[0.04]' : 'text-gray-700 bg-gray-50';
    const tileUnsel = isDark ? 'bg-white/[0.04] border-white/[0.08] hover:border-orange-500/40' : 'bg-gray-50 border-gray-200 hover:border-orange-400';
    const tileSel = 'bg-orange-500 border-orange-500 text-white';

    if (!item?.customization_options?.length) return null;

    const allGroups = [...(item?.customization_options || [])];
    if (isMeal) {
        const mealUpgrade = item?.customization_options?.find(o => o.type === 'meal_upgrade');
        if (mealUpgrade?.meal_customizations?.length) allGroups.push(...mealUpgrade.meal_customizations.map(mc => ({ ...mc, _isMealSub: true })));
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className={`${bg} border ${divider} p-0 flex flex-col max-w-xl w-full max-h-[90vh]`}>
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

                {/* Scrollable options */}
                <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-5 ${showKeyboard ? 'pb-80' : ''}`}>
                    {allGroups.map((option) => (
                        <div key={option.name + (option._isMealSub ? '_meal' : '')}>
                            <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg mb-2 ${sectionHead}`}>
                                <span className={`text-sm font-bold uppercase tracking-wide`}>{option.name}</span>
                                {option.required && <span className="text-xs text-red-400 font-semibold">Required</span>}
                            </div>

                            {/* Meal upgrade */}
                            {option.type === 'meal_upgrade' && (
                                <div className="grid grid-cols-2 gap-2">
                                    {option.options?.map(opt => {
                                        const isMealOpt = opt.label.toLowerCase().includes('meal');
                                        const isSelected = isMeal === isMealOpt;
                                        return (
                                            <button key={opt.label}
                                                onClick={() => { setIsMeal(isMealOpt); if (!isMealOpt) setMealCustomizations({}); }}
                                                className={`rounded-xl border-2 p-3 flex flex-col items-center justify-center gap-1 min-h-[80px] transition-all active:scale-95 ${isSelected ? tileSel : `${tileUnsel} ${text}`}`}
                                            >
                                                <span className="font-semibold text-base text-center">{opt.label}</span>
                                                {optPrice(opt) > 0 && <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-orange-400'}`}>+£{optPrice(opt).toFixed(2)}</span>}
                                                {isSelected && <Check className="h-5 w-5" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Single select grid */}
                            {option.type === 'single' && (
                                <div className="grid grid-cols-2 gap-2">
                                    {option.options?.map(opt => {
                                        const isSelected = option._isMealSub
                                            ? mealCustomizations[option.name] === opt.label
                                            : customizations[option.name] === opt.label;
                                        return (
                                            <button key={opt.label}
                                                onClick={() => toggleSingle(option.name, opt.label, option._isMealSub)}
                                                className={`rounded-xl border-2 p-3 flex flex-col items-center justify-center gap-1 min-h-[80px] transition-all active:scale-95 ${isSelected ? tileSel : `${tileUnsel} ${text}`}`}
                                            >
                                                <span className="font-semibold text-base text-center">{opt.label}</span>
                                                {optPrice(opt) > 0 && <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-orange-400'}`}>+£{optPrice(opt).toFixed(2)}</span>}
                                                {isSelected && <Check className="h-5 w-5" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Multiple select grid */}
                            {option.type === 'multiple' && (
                                <div className="grid grid-cols-2 gap-2">
                                    {option.options?.map(opt => {
                                        const selections = option._isMealSub ? (mealCustomizations[option.name] || []) : (customizations[option.name] || []);
                                        const isSelected = selections.includes(opt.label);
                                        return (
                                            <button key={opt.label}
                                                onClick={() => toggleMultiple(option.name, opt.label, option._isMealSub)}
                                                className={`rounded-xl border-2 p-3 flex flex-col items-center justify-center gap-1 min-h-[80px] transition-all active:scale-95 ${isSelected ? tileSel : `${tileUnsel} ${text}`}`}
                                            >
                                                <span className="font-semibold text-base text-center">{opt.label}</span>
                                                {optPrice(opt) > 0 && <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-orange-400'}`}>+£{optPrice(opt).toFixed(2)}</span>}
                                                {isSelected && <Check className="h-5 w-5" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Special instructions */}
                    <div>
                        <div className={`flex items-center px-3 py-1.5 rounded-lg mb-2 ${sectionHead}`}>
                            <span className="text-sm font-bold uppercase tracking-wide">Special Instructions</span>
                        </div>
                        <Textarea
                            placeholder="e.g. extra spicy, no onions..."
                            value={specialInstructions}
                            onChange={(e) => setSpecialInstructions(e.target.value)}
                            onFocus={() => setShowKeyboard(true)}
                            className={`${isDark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'} resize-none h-24 text-base rounded-xl`}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className={`flex gap-3 p-4 border-t ${divider} flex-shrink-0`}>
                    <Button onClick={onClose} className={`flex-1 h-14 font-bold text-base rounded-2xl ${isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10' : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'}`}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} className="flex-[3] h-14 font-bold text-base rounded-2xl bg-green-600 hover:bg-green-500 text-white flex items-center justify-center gap-2">
                        <Check className="h-5 w-5" />
                        {isEditing ? 'Update Item' : 'Add to Cart'} — £{currentPrice.toFixed(2)}
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