import React, { useState } from 'react';
import { Phone, User, MapPin, Clock, StickyNote, Search, ChevronRight, CheckCircle2, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

const COLLECTION_TIMES = ['ASAP', '10 min', '15 min', '20 min', '25 min', '30 min', '45 min', '1 hour'];

export default function PhoneOrderPanel({ orderType, onOrderTypeChange, isDark, t }) {
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [collectionTime, setCollectionTime] = useState('ASAP');
    const [notes, setNotes] = useState('');
    const [searching, setSearching] = useState(false);
    const [foundCustomer, setFoundCustomer] = useState(null);
    const [expanded, setExpanded] = useState(true);

    const inputCls = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${
        isDark
            ? 'bg-[#0f1117] border-white/[0.08] text-white placeholder-gray-500 focus:border-orange-500/50'
            : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400'
    }`;

    const labelCls = `text-xs font-semibold mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-500'}`;

    const searchCustomer = async () => {
        if (!customerPhone || customerPhone.length < 5) return;
        setSearching(true);
        try {
            // Search past orders by phone
            const orders = await base44.entities.Order.filter({ phone: customerPhone });
            if (orders.length > 0) {
                const latest = orders.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
                setFoundCustomer({
                    name: latest.guest_name || '',
                    address: latest.delivery_address || '',
                    orderCount: orders.length,
                });
                if (latest.guest_name && !customerName) setCustomerName(latest.guest_name);
                if (latest.delivery_address && !deliveryAddress) setDeliveryAddress(latest.delivery_address);
                toast.success(`Found customer — ${orders.length} previous order${orders.length > 1 ? 's' : ''}`);
            } else {
                setFoundCustomer(null);
                toast.info('New customer — no previous orders found');
            }
        } catch {
            toast.error('Could not search customer history');
        } finally {
            setSearching(false);
        }
    };

    // Expose data via a ref-accessible method by storing in window so POSOrderEntry can read it
    React.useEffect(() => {
        window.__phoneOrderDetails = {
            phone: customerPhone,
            name: customerName,
            address: deliveryAddress,
            collectionTime,
            notes,
        };
        return () => { delete window.__phoneOrderDetails; };
    }, [customerPhone, customerName, deliveryAddress, collectionTime, notes]);

    const hasDetails = customerPhone || customerName;

    return (
        <div className={`${t.panel} border rounded-2xl overflow-hidden`}>
            {/* Header */}
            <button
                onClick={() => setExpanded(p => !p)}
                className={`w-full flex items-center justify-between px-4 py-3 ${t.panelHead} border-b`}
            >
                <div className="flex items-center gap-2">
                    <Phone className={`h-4 w-4 ${hasDetails ? 'text-orange-400' : isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                    <span className={`text-sm font-bold ${t.text}`}>Phone Order Details</span>
                    {hasDetails && (
                        <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                    )}
                </div>
                <ChevronRight className={`h-4 w-4 ${t.textMuted} transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>

            {expanded && (
                <div className="p-3 space-y-3">
                    {/* Order type sub-selector */}
                    <div className={`flex rounded-xl overflow-hidden border ${isDark ? 'border-white/[0.08]' : 'border-gray-200'} text-xs font-semibold`}>
                        {[
                            { id: 'phone_collection', label: 'Collection' },
                            { id: 'phone_delivery', label: 'Delivery' },
                        ].map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => onOrderTypeChange(opt.id)}
                                className={`flex-1 py-2 transition-colors ${
                                    orderType === opt.id
                                        ? 'bg-orange-500 text-white'
                                        : `${t.textMuted} ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Phone lookup */}
                    <div>
                        <label className={labelCls}>Customer Phone *</label>
                        <div className="flex gap-2">
                            <input
                                className={inputCls + ' flex-1'}
                                placeholder="07xxx xxxxxx"
                                value={customerPhone}
                                onChange={e => setCustomerPhone(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && searchCustomer()}
                            />
                            <button
                                onClick={searchCustomer}
                                disabled={searching}
                                className={`px-3 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1 ${
                                    isDark
                                        ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20'
                                        : 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100'
                                }`}
                            >
                                <Search className="h-3.5 w-3.5" />
                                {searching ? '...' : 'Lookup'}
                            </button>
                        </div>
                        {foundCustomer && (
                            <div className={`mt-1.5 flex items-center gap-1.5 text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                                <CheckCircle2 className="h-3 w-3" />
                                Returning customer · {foundCustomer.orderCount} order{foundCustomer.orderCount > 1 ? 's' : ''}
                            </div>
                        )}
                    </div>

                    {/* Name */}
                    <div>
                        <label className={labelCls}>Customer Name</label>
                        <div className="relative">
                            <User className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textMuted}`} />
                            <input
                                className={inputCls + ' pl-8'}
                                placeholder="Full name"
                                value={customerName}
                                onChange={e => setCustomerName(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Delivery address (only for delivery) */}
                    {orderType === 'phone_delivery' && (
                        <div>
                            <label className={labelCls}>Delivery Address</label>
                            <div className="relative">
                                <MapPin className={`absolute left-3 top-3 h-3.5 w-3.5 ${t.textMuted}`} />
                                <textarea
                                    className={inputCls + ' pl-8 resize-none'}
                                    rows={2}
                                    placeholder="Full delivery address"
                                    value={deliveryAddress}
                                    onChange={e => setDeliveryAddress(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Collection time (only for collection) */}
                    {orderType === 'phone_collection' && (
                        <div>
                            <label className={labelCls}>Ready In</label>
                            <div className="flex gap-1.5 flex-wrap">
                                {COLLECTION_TIMES.map(t2 => (
                                    <button
                                        key={t2}
                                        onClick={() => setCollectionTime(t2)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                            collectionTime === t2
                                                ? 'bg-orange-500 text-white border-orange-500'
                                                : `${isDark ? 'border-white/[0.08] text-gray-400 hover:border-orange-500/30 hover:text-orange-400' : 'border-gray-200 text-gray-500 hover:border-orange-300 hover:text-orange-500'}`
                                        }`}
                                    >
                                        {t2}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <label className={labelCls}>Order Notes</label>
                        <div className="relative">
                            <StickyNote className={`absolute left-3 top-3 h-3.5 w-3.5 ${t.textMuted}`} />
                            <textarea
                                className={inputCls + ' pl-8 resize-none'}
                                rows={2}
                                placeholder="Allergies, special instructions…"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Clear */}
                    {hasDetails && (
                        <button
                            onClick={() => { setCustomerPhone(''); setCustomerName(''); setDeliveryAddress(''); setNotes(''); setFoundCustomer(null); setCollectionTime('ASAP'); }}
                            className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'} transition-colors`}
                        >
                            <Trash2 className="h-3 w-3" /> Clear details
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}