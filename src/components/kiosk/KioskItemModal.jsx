import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, ShoppingCart } from 'lucide-react';

function MealSubCustomizations({ opt, selectedUpgrade, customizations, setCustomizations, setError }) {
    if (!selectedUpgrade) return null;
    const mealCustomizations = opt.meal_customizations ||
        opt.options?.find(o => o.label === selectedUpgrade)?.meal_customizations;
    if (!mealCustomizations?.length) return null;

    return (
        <>
            {mealCustomizations.map((mealOpt, mi) => {
                const key = `${opt.name}_meal_${mealOpt.name}`;
                const selectedArr = Array.isArray(customizations[key]) ? customizations[key] : [];
                const maxQty = mealOpt.max_quantity || (mealOpt.type === 'multiple' ? 99 : null);
                const requiredCount = mealOpt.required && mealOpt.type === 'multiple' ? (mealOpt.max_quantity || 1) : null;

                return (
                    <div key={mi} className="mt-4 pl-3 border-l-2 border-orange-500/40">
                        <div className="flex items-center gap-2 mb-2">
                            <h4 className="text-white font-semibold text-sm">{mealOpt.name}</h4>
                            {mealOpt.required && (
                                <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-xs px-2 py-0.5 rounded-full">Required</span>
                            )}
                            {requiredCount && (
                                <span className="bg-gray-700 text-gray-400 text-xs px-2 py-0.5 rounded-full">
                                    {selectedArr.length}/{requiredCount} selected
                                </span>
                            )}
                        </div>
                        {mealOpt.type === 'single' ? (
                            <div className="grid grid-cols-2 gap-2">
                                {mealOpt.options?.map((mc, mci) => (
                                    <button
                                        key={mci}
                                        onClick={() => setCustomizations(p => ({ ...p, [key]: mc.label }))}
                                        className={`p-3 rounded-xl border text-left transition-all ${
                                            customizations[key] === mc.label
                                                ? 'bg-orange-500 border-orange-500 text-white'
                                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                                        }`}
                                    >
                                        <p className="font-semibold text-xs">{mc.label}</p>
                                        {mc.price > 0 && (
                                            <p className={`text-xs mt-0.5 ${customizations[key] === mc.label ? 'text-white/70' : 'text-orange-400'}`}>
                                                +£{mc.price.toFixed(2)}
                                            </p>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {mealOpt.options?.map((mc, mci) => {
                                    const curArr = customizations[key] || [];
                                    const mealSelected = curArr.includes(mc.label);
                                    const atMax = maxQty && curArr.length >= maxQty;
                                    return (
                                        <button
                                            key={mci}
                                            onClick={() => {
                                                if (!mealSelected && atMax) {
                                                    setError(`Max ${maxQty} selection${maxQty > 1 ? 's' : ''} for ${mealOpt.name}`);
                                                    return;
                                                }
                                                setCustomizations(p => ({
                                                    ...p,
                                                    [key]: mealSelected ? curArr.filter(c => c !== mc.label) : [...curArr, mc.label]
                                                }));
                                            }}
                                            className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                                                mealSelected ? 'bg-orange-500/10 border-orange-500/40' : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${mealSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-600'}`}>
                                                    {mealSelected && <span className="text-white text-xs font-black">✓</span>}
                                                </div>
                                                <span className={`font-semibold text-xs ${mealSelected ? 'text-white' : 'text-gray-300'}`}>{mc.label}</span>
                                            </div>
                                            {mc.price > 0 && <span className="text-orange-400 text-xs font-semibold">+£{mc.price.toFixed(2)}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
}

export default function KioskItemModal({ item, onClose, onAdd, initialCustomizations, initialItemQuantities, initialQuantity }) {
    const [quantity, setQuantity] = useState(initialQuantity || 1);
    const [customizations, setCustomizations] = useState({});
    const [itemQuantities, setItemQuantities] = useState({});
    const [error, setError] = useState('');

    useEffect(() => {
        if (item?.customization_options) {
            // If editing, pre-fill with existing selections; otherwise use defaults
            if (initialCustomizations && Object.keys(initialCustomizations).length > 0) {
                setCustomizations(initialCustomizations);
                setItemQuantities(initialItemQuantities || {});
            } else {
                const defaults = {};
                const initialQty = {};
                item.customization_options.forEach(opt => {
                    if (opt.type === 'single' && opt.options?.length > 0) {
                        defaults[opt.name] = opt.options[0].label;
                    } else if (opt.type === 'multiple') {
                        defaults[opt.name] = [];
                        opt.options?.forEach(o => { initialQty[`${opt.name}_${o.label}`] = 0; });
                    } else if (opt.type === 'meal_upgrade' && opt.options?.length > 0) {
                        defaults[opt.name] = opt.options[0].label;
                    }
                });
                setCustomizations(defaults);
                setItemQuantities(initialQty);
            }
        }
    }, [item]);

    const basePrice = item.pos_price != null ? item.pos_price : item.price;

    const calculateTotal = () => {
        let total = basePrice;
        if (item.customization_options) {
            item.customization_options.forEach(opt => {
                if (opt.type === 'single' && customizations[opt.name]) {
                    const sel = opt.options?.find(o => o.label === customizations[opt.name]);
                    if (sel?.price) total += sel.price;
                } else if (opt.type === 'multiple' && Array.isArray(customizations[opt.name])) {
                    customizations[opt.name].forEach(choice => {
                        const qty = itemQuantities[`${opt.name}_${choice}`] || 1;
                        const sel = opt.options?.find(o => o.label === choice);
                        if (sel?.price) total += sel.price * qty;
                    });
                } else if (opt.type === 'meal_upgrade' && customizations[opt.name]) {
                    const sel = opt.options?.find(o => o.label === customizations[opt.name]);
                    if (sel?.price) total += sel.price;
                    // Add sub-customization prices
                    const mealCustomizations = opt.meal_customizations ||
                        sel?.meal_customizations;
                    if (mealCustomizations) {
                        mealCustomizations.forEach(mealOpt => {
                            const key = `${opt.name}_meal_${mealOpt.name}`;
                            const val = customizations[key];
                            if (mealOpt.type === 'single' && val) {
                                const mc = mealOpt.options?.find(o => o.label === val);
                                if (mc?.price) total += mc.price;
                            } else if (mealOpt.type === 'multiple' && Array.isArray(val)) {
                                val.forEach(chosen => {
                                    const mc = mealOpt.options?.find(o => o.label === chosen);
                                    if (mc?.price) total += mc.price;
                                });
                            }
                        });
                    }
                }
            });
        }
        return total * quantity;
    };

    const handleAdd = () => {
        setError('');
        if (item.customization_options) {
            for (const opt of item.customization_options) {
                if (opt.required && (!customizations[opt.name] ||
                    (Array.isArray(customizations[opt.name]) && customizations[opt.name].length === 0))) {
                    setError(`Please select ${opt.name}`);
                    return;
                }
                // Validate meal_upgrade sub-customizations
                if (opt.type === 'meal_upgrade' && customizations[opt.name]) {
                    const mealCustomizations = opt.meal_customizations ||
                        opt.options?.find(o => o.label === customizations[opt.name])?.meal_customizations;
                    if (mealCustomizations) {
                        for (const mealOpt of mealCustomizations) {
                            const mealCustomKey = `${opt.name}_meal_${mealOpt.name}`;
                            const selected = customizations[mealCustomKey];
                            if (mealOpt.required) {
                                if (mealOpt.type === 'single' && !selected) {
                                    setError(`Please select ${mealOpt.name}`);
                                    return;
                                }
                                if (mealOpt.type === 'multiple') {
                                    const selectedArr = Array.isArray(selected) ? selected : [];
                                    const required = mealOpt.max_quantity || 1;
                                    if (selectedArr.length < required) {
                                        setError(`Please select ${required} option${required > 1 ? 's' : ''} for ${mealOpt.name}`);
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        onAdd({
            ...item,
            price: calculateTotal() / quantity,
            quantity,
            customizations,
            itemQuantities,
        });
    };

    const handleSingle = (name, value) => setCustomizations(p => ({ ...p, [name]: value }));

    const handleMultiple = (optName, choice, add, maxQty) => {
        const key = `${optName}_${choice}`;
        const current = customizations[optName] || [];
        const totalSel = Object.keys(itemQuantities).filter(k => k.startsWith(`${optName}_`)).reduce((s, k) => s + (itemQuantities[k] || 0), 0);
        if (add && totalSel >= maxQty) { setError(`Max ${maxQty} for ${optName}`); return; }
        setItemQuantities(p => ({ ...p, [key]: add ? 1 : 0 }));
        setCustomizations(p => ({ ...p, [optName]: add ? [...current, choice] : current.filter(c => c !== choice) }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
            <div
                className="bg-gray-900 border border-white/10 rounded-3xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Image / Header */}
                <div className="relative">
                    {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-full h-56 object-cover" />
                    ) : (
                        <div className="w-full h-32 bg-gray-800 flex items-center justify-center">
                            <ShoppingCart className="h-12 w-12 text-gray-600" />
                        </div>
                    )}
                    <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors">
                        <X className="h-5 w-5 text-white" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-900 to-transparent h-20" />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div>
                        <h2 className="text-white text-2xl font-bold">{item.name}</h2>
                        {item.description && <p className="text-gray-400 mt-1 text-sm">{item.description}</p>}
                        <p className="text-orange-400 font-bold text-xl mt-2">£{basePrice.toFixed(2)}</p>
                    </div>

                    {/* Customization Options */}
                    {item.customization_options?.map((opt, idx) => (
                        <div key={idx}>
                            <div className="flex items-center gap-2 mb-3">
                                <h3 className="text-white font-bold text-base">{opt.name}</h3>
                                {opt.required && (
                                    <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-xs px-2 py-0.5 rounded-full font-medium">Required</span>
                                )}
                                {opt.max_quantity && opt.type !== 'single' && (
                                    <span className="bg-gray-700 text-gray-400 text-xs px-2 py-0.5 rounded-full">Max {opt.max_quantity}</span>
                                )}
                            </div>

                            {opt.type === 'single' ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {opt.options?.map((choice, ci) => (
                                        <button
                                            key={ci}
                                            onClick={() => handleSingle(opt.name, choice.label)}
                                            className={`p-4 rounded-2xl border text-left transition-all ${
                                                customizations[opt.name] === choice.label
                                                    ? 'bg-orange-500 border-orange-500 text-white'
                                                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                                            }`}
                                        >
                                            <p className="font-semibold text-sm">{choice.label}</p>
                                            {choice.price > 0 && (
                                                <p className={`text-sm mt-0.5 ${customizations[opt.name] === choice.label ? 'text-white/70' : 'text-orange-400'}`}>
                                                    +£{choice.price.toFixed(2)}
                                                </p>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ) : opt.type === 'meal_upgrade' ? (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        {opt.options?.map((choice, ci) => (
                                            <button
                                                key={ci}
                                                onClick={() => handleSingle(opt.name, choice.label)}
                                                className={`p-4 rounded-2xl border text-left transition-all ${
                                                    customizations[opt.name] === choice.label
                                                        ? 'bg-orange-500 border-orange-500 text-white'
                                                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                                                }`}
                                            >
                                                <p className="font-semibold text-sm">{choice.label}</p>
                                                {choice.price > 0 && (
                                                    <p className={`text-sm mt-0.5 ${customizations[opt.name] === choice.label ? 'text-white/70' : 'text-orange-400'}`}>
                                                        +£{choice.price.toFixed(2)}
                                                    </p>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                    {/* Show meal_customizations only when an upgrade option is selected */}
                                    <MealSubCustomizations
                                        opt={opt}
                                        selectedUpgrade={customizations[opt.name]}
                                        customizations={customizations}
                                        setCustomizations={setCustomizations}
                                        setError={setError}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {opt.options?.map((choice, ci) => {
                                        const key = `${opt.name}_${choice.label}`;
                                        const selected = (itemQuantities[key] || 0) > 0;
                                        return (
                                            <button
                                                key={ci}
                                                onClick={() => handleMultiple(opt.name, choice.label, !selected, opt.max_quantity || 99)}
                                                className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
                                                    selected
                                                        ? 'bg-orange-500/10 border-orange-500/40'
                                                        : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'bg-orange-500 border-orange-500' : 'border-gray-600'}`}>
                                                        {selected && <span className="text-white text-xs font-black">✓</span>}
                                                    </div>
                                                    <span className={`font-semibold text-sm ${selected ? 'text-white' : 'text-gray-300'}`}>{choice.label}</span>
                                                </div>
                                                {choice.price > 0 && (
                                                    <span className="text-orange-400 text-sm font-semibold">+£{choice.price.toFixed(2)}</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}

                    {error && (
                        <p className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm font-medium">
                            ⚠️ {error}
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-white/[0.06] p-6 flex items-center gap-4">
                    {/* Quantity */}
                    <div className="flex items-center gap-3 bg-gray-800 rounded-2xl p-1">
                        <button
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            className="w-12 h-12 rounded-xl bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors"
                        >
                            <Minus className="h-5 w-5 text-white" />
                        </button>
                        <span className="text-white font-bold text-xl w-8 text-center">{quantity}</span>
                        <button
                            onClick={() => setQuantity(quantity + 1)}
                            className="w-12 h-12 rounded-xl bg-orange-500 hover:bg-orange-600 flex items-center justify-center transition-colors"
                        >
                            <Plus className="h-5 w-5 text-white" />
                        </button>
                    </div>

                    <button
                        onClick={handleAdd}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-2xl text-lg transition-all active:scale-[0.98] shadow-lg shadow-orange-500/30"
                    >
                        Add to Order · £{calculateTotal().toFixed(2)}
                    </button>
                </div>
            </div>
        </div>
    );
}