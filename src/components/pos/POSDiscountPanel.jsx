import React, { useState } from 'react';
import { Tag, X, Percent, DollarSign, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const REASON_CODES = [
    { value: 'staff_meal',                label: 'Staff Meal' },
    { value: 'customer_complaint',        label: 'Customer Complaint' },
    { value: 'loyalty_gesture',           label: 'Loyalty Gesture' },
    { value: 'promotional_event',         label: 'Promotional Event' },
    { value: 'pricing_error_correction',  label: 'Price Error Correction' },
    { value: 'manager_discretion',        label: 'Manager Discretion' },
    { value: 'other',                     label: 'Other' },
];

/**
 * POS Manual Discount Panel
 *
 * All discount applications are validated server-side via posApplyDiscount, which enforces:
 *   - Threshold limits (>20% or >£20 requires admin)
 *   - Mandatory reason code
 *   - Audit logging
 */
export default function POSDiscountPanel({
    cartSubtotal,
    discount,
    onApply,
    onRemove,
    restaurantId,
    orderId = null,
    isDark,
    couponActive = false, // mutual exclusion: true when a coupon is already applied
}) {
    const [type, setType] = useState('percentage');
    const [value, setValue] = useState('');
    const [reasonCode, setReasonCode] = useState('');
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleApply = async () => {
        const num = parseFloat(value);
        if (!num || num <= 0) return;
        if (type === 'percentage' && num > 100) return;
        if (type === 'fixed' && num > cartSubtotal) return;
        if (!reasonCode) {
            toast.error('Please select a reason for the discount');
            return;
        }

        setLoading(true);
        try {
            const result = await base44.functions.invoke('posApplyDiscount', {
                restaurant_id: restaurantId,
                order_id: orderId,
                discount_type: type,
                discount_value: num,
                subtotal: cartSubtotal,
                reason_code: reasonCode,
            });

            if (!result?.data?.allowed) {
                const err = result?.data?.error || 'Discount not allowed';
                if (result?.data?.requires_admin) {
                    toast.error('Admin approval required for discounts above the manager threshold');
                } else {
                    toast.error(err);
                }
                return;
            }

            const discountAmount = result.data.discount_amount;
            onApply({ type, value: num, amount: discountAmount, reason_code: reasonCode });
            setValue('');
            setReasonCode('');
            setOpen(false);
        } catch (err) {
            toast.error(err?.message || 'Failed to apply discount');
        } finally {
            setLoading(false);
        }
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

    const selectCls = `w-full px-3 py-2 rounded-xl border text-sm font-medium outline-none transition-colors appearance-none ${
        isDark
            ? 'bg-white/5 border-white/[0.08] text-white focus:border-orange-500/50'
            : 'bg-white border-gray-200 text-gray-900 focus:border-orange-400'
    }`;

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
                    {discount.reason_code && (
                        <span className={`text-xs italic ${isDark ? 'text-green-500' : 'text-green-500'}`}>
                            ({discount.reason_code.replace(/_/g, ' ')})
                        </span>
                    )}
                </div>
                <button onClick={onRemove} className="text-red-400 hover:text-red-300 transition-colors">
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
        );
    }

    // Mutual exclusion: block discount entry when a coupon is applied
    if (couponActive) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${isDark ? 'bg-white/5 border-white/[0.08] text-gray-500' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                <span>Coupon applied — remove it to add a manual discount</span>
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
                <button onClick={() => { setOpen(false); setValue(''); setReasonCode(''); }} className={`${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'} transition-colors`}>
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

            {/* Amount input */}
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
                />
            </div>

            {/* Reason (required) */}
            <div>
                <div className={`flex items-center gap-1 mb-1 text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <AlertCircle className="h-3 w-3 text-orange-400" />
                    Reason (required)
                </div>
                <select
                    value={reasonCode}
                    onChange={e => setReasonCode(e.target.value)}
                    className={selectCls}
                >
                    <option value="">Select reason…</option>
                    {REASON_CODES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                </select>
            </div>

            <button
                onClick={handleApply}
                disabled={!value || parseFloat(value) <= 0 || !reasonCode || loading}
                className="w-full h-9 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-colors"
            >
                {loading ? 'Checking…' : 'Apply Discount'}
            </button>
        </div>
    );
}