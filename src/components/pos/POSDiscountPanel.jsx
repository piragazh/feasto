import React, { useState } from 'react';
import { Tag, X, Percent, DollarSign } from 'lucide-react';

export default function POSDiscountPanel({ cartSubtotal, discount, onApply, onRemove, t, isDark }) {
    const [type, setType] = useState('percentage'); // 'percentage' | 'fixed'
    const [value, setValue] = useState('');
    const [open, setOpen] = useState(false);

    const handleApply = () => {
        const num = parseFloat(value);
        if (!num || num <= 0) return;
        if (type === 'percentage' && num > 100) return;
        if (type === 'fixed' && num > cartSubtotal) return;

        const discountAmount = type === 'percentage'
            ? (cartSubtotal * num) / 100
            : num;

        onApply({ type, value: num, amount: parseFloat(discountAmount.toFixed(2)) });
        setValue('');
        setOpen(false);
    };

    const inputCls = `w-full px-3 py-2 rounded-xl border text-sm font-medium outline-none transition-colors ${
        isDark
            ? 'bg-white/5 border-white/[0.08] text-white placeholder-gray-500 focus:border-orange-500/50'
            : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400'
    }`;

    const typeBtnActive = 'bg-orange-500 text-white';
    const typeBtnInactive = isDark
        ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/[0.08]'
        : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-200';

    if (discount) {
        return (
            <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${isDark ? 'bg-green-500/10 border border-green-500/30' : 'bg-green-50 border border-green-200'}`}>
                <div className="flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-green-500" />
                    <span className={`text-xs font-semibold ${isDark ? 'text-green-400' : 'text-green-700'}`}>
                        {discount.type === 'percentage' ? `${discount.value}% off` : `£${discount.value.toFixed(2)} off`}
                    </span>
                    <span className={`text-xs ${isDark ? 'text-green-300' : 'text-green-600'}`}>
                        −£{discount.amount.toFixed(2)}
                    </span>
                </div>
                <button onClick={onRemove} className="text-red-400 hover:text-red-300 transition-colors">
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
        );
    }

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className={`w-full flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-semibold border transition-colors ${
                    isDark
                        ? 'bg-white/5 hover:bg-white/10 border-white/[0.08] text-gray-400 hover:text-orange-400'
                        : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-500 hover:text-orange-500'
                }`}
            >
                <Tag className="h-3.5 w-3.5" />
                Add Discount
            </button>
        );
    }

    return (
        <div className={`rounded-xl border p-3 space-y-2 ${isDark ? 'bg-white/5 border-white/[0.08]' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Apply Discount</span>
                <button onClick={() => { setOpen(false); setValue(''); }} className={`${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'} transition-colors`}>
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Type selector */}
            <div className="grid grid-cols-2 gap-1.5">
                <button
                    onClick={() => setType('percentage')}
                    className={`h-8 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${type === 'percentage' ? typeBtnActive : typeBtnInactive}`}
                >
                    <Percent className="h-3 w-3" /> Percentage
                </button>
                <button
                    onClick={() => setType('fixed')}
                    className={`h-8 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${type === 'fixed' ? typeBtnActive : typeBtnInactive}`}
                >
                    <DollarSign className="h-3 w-3" /> Fixed £
                </button>
            </div>

            {/* Quick picks */}
            {type === 'percentage' ? (
                <div className="grid grid-cols-4 gap-1">
                    {[5, 10, 15, 20].map(p => (
                        <button
                            key={p}
                            onClick={() => setValue(String(p))}
                            className={`h-7 rounded-lg text-xs font-bold transition-colors ${value === String(p) ? typeBtnActive : typeBtnInactive}`}
                        >
                            {p}%
                        </button>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 5, 10].map(a => (
                        <button
                            key={a}
                            onClick={() => setValue(String(a))}
                            className={`h-7 rounded-lg text-xs font-bold transition-colors ${value === String(a) ? typeBtnActive : typeBtnInactive}`}
                        >
                            £{a}
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="flex gap-1.5">
                <input
                    type="number"
                    min="0"
                    max={type === 'percentage' ? 100 : cartSubtotal}
                    step={type === 'percentage' ? 1 : 0.01}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder={type === 'percentage' ? '% e.g. 15' : '£ e.g. 5.00'}
                    className={inputCls}
                    onKeyDown={e => e.key === 'Enter' && handleApply()}
                />
                <button
                    onClick={handleApply}
                    disabled={!value || parseFloat(value) <= 0}
                    className="px-3 h-9 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
                >
                    Apply
                </button>
            </div>
        </div>
    );
}