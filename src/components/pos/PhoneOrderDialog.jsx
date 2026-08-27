import React, { useState, useEffect } from 'react';
import { Phone, User, MapPin, StickyNote, Search, CheckCircle2, Trash2, UserPlus, X, Loader2, Wifi, ExternalLink, Star, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import CustomerProfileModal from './CustomerProfileModal';

const COLLECTION_TIMES = ['ASAP', '10 min', '15 min', '20 min', '25 min', '30 min', '45 min', '1 hour'];

async function lookupPostcode(postcode) {
    const clean = postcode.replace(/\s/g, '').toUpperCase();
    const res = await fetch(`https://api.postcodes.io/postcodes/${clean}`);
    if (!res.ok) throw new Error('Postcode not found');
    const data = await res.json();
    return data.result;
}

async function autocompletePostcode(partial) {
    const clean = partial.replace(/\s/g, '').toUpperCase();
    if (clean.length < 3) return [];
    const res = await fetch(`https://api.postcodes.io/postcodes/${clean}/autocomplete`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.result || [];
}

export default function PhoneOrderDialog({ open, onClose, orderType, onOrderTypeChange, isDark, restaurantId }) {
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [postcode, setPostcode] = useState('');
    const [collectionTime, setCollectionTime] = useState('ASAP');
    const [notes, setNotes] = useState('');
    const [searching, setSearching] = useState(false);
    const [foundCustomer, setFoundCustomer] = useState(null);
    const [searchMode, setSearchMode] = useState('phone');
    const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
    const [postcodeResults, setPostcodeResults] = useState([]);
    const [postcodeSearching, setPostcodeSearching] = useState(false);
    const [postcodeAutocomplete, setPostcodeAutocomplete] = useState([]);
    const [showPostcodeDropdown, setShowPostcodeDropdown] = useState(false);
    const [incomingCall, setIncomingCall] = useState(null);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [newAddressLine, setNewAddressLine] = useState('');
    const [newPostcode, setNewPostcode] = useState('');
    const [newPostcodeAuto, setNewPostcodeAuto] = useState([]);
    const [showNewPostcodeDropdown, setShowNewPostcodeDropdown] = useState(false);
    const [postcodeInfo, setPostcodeInfo] = useState(null);

    // Sync to window so POS cart can read
    useEffect(() => {
        window.__phoneOrderDetails = { phone: customerPhone, name: customerName, address: deliveryAddress, collectionTime, notes };
    }, [customerPhone, customerName, deliveryAddress, collectionTime, notes]);

    if (!open) return null;

    const doPhoneSearch = async (phone) => {
        if (!phone || phone.length < 5) return;
        setSearching(true);
        try {
            const customers = await base44.entities.Customer.filter({ phone_number: phone, restaurant_id: restaurantId });
            if (customers.length > 0) {
                const customer = customers[0];
                const defaultAddr = customer.saved_addresses?.find(a => a.is_default)?.address || customer.delivery_address || '';
                setFoundCustomer({ id: customer.id, name: customer.full_name, address: defaultAddr, orderCount: customer.total_orders || 0, savedAddresses: customer.saved_addresses || [], raw: customer });
                setShowNewCustomerForm(false);
                setCustomerName(customer.full_name);
                if (defaultAddr) setDeliveryAddress(defaultAddr);
                toast.success(`Found customer — ${customer.total_orders || 0} previous order${customer.total_orders !== 1 ? 's' : ''}`);
            } else {
                setFoundCustomer(null);
                setShowNewCustomerForm(true);
                toast.info('New customer — fill in their details below');
            }
        } catch {
            toast.error('Could not search customer history');
        } finally {
            setSearching(false);
        }
    };

    const doPostcodeSearch = async () => {
        if (!postcode || postcode.length < 3) return;
        setPostcodeSearching(true);
        try {
            const customers = await base44.entities.Customer.filter({ restaurant_id: restaurantId }, '-created_date', 500);
            const matches = customers.filter(c =>
                c.delivery_address?.toLowerCase().includes(postcode.toLowerCase().replace(/\s/g, ''))
                || c.delivery_address?.toLowerCase().includes(postcode.toLowerCase())
                || c.saved_addresses?.some(a => a.address?.toLowerCase().includes(postcode.toLowerCase()))
            );
            setPostcodeResults(matches.slice(0, 10));
            if (!matches.length) toast.info('No customers found with that postcode');
        } catch {
            toast.error('Search failed');
        } finally {
            setPostcodeSearching(false);
        }
    };

    const handlePostcodeInputChange = async (val) => {
        setPostcode(val);
        if (val.length >= 3) {
            const suggestions = await autocompletePostcode(val);
            setPostcodeAutocomplete(suggestions);
            setShowPostcodeDropdown(suggestions.length > 0);
        } else {
            setPostcodeAutocomplete([]);
            setShowPostcodeDropdown(false);
        }
    };

    const selectPostcodeResult = async (pc) => {
        setShowPostcodeDropdown(false);
        setPostcode(pc);
        try {
            const info = await lookupPostcode(pc);
            setDeliveryAddress(prev => {
                const withoutPostcode = prev.replace(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/gi, '').trim();
                return withoutPostcode ? `${withoutPostcode}, ${info.postcode}` : info.postcode;
            });
        } catch {}
    };

    const handleNewPostcodeChange = async (val) => {
        setNewPostcode(val);
        if (val.length >= 3) {
            const suggestions = await autocompletePostcode(val);
            setNewPostcodeAuto(suggestions);
            setShowNewPostcodeDropdown(suggestions.length > 0);
        } else {
            setNewPostcodeAuto([]);
            setShowNewPostcodeDropdown(false);
            setPostcodeInfo(null);
        }
    };

    const selectNewPostcode = async (pc) => {
        setNewPostcode(pc);
        setShowNewPostcodeDropdown(false);
        try {
            const info = await lookupPostcode(pc);
            setPostcodeInfo(info);
        } catch {
            toast.error('Invalid postcode');
        }
    };

    const saveNewCustomer = async () => {
        if (!customerName) { toast.error('Please enter a name'); return; }
        const fullAddress = newAddressLine ? `${newAddressLine}, ${newPostcode}` : newPostcode;
        setDeliveryAddress(fullAddress);
        try {
            const newCustomer = await base44.entities.Customer.create({
                phone_number: customerPhone,
                full_name: customerName,
                delivery_address: fullAddress,
                restaurant_id: restaurantId,
                total_orders: 0,
                saved_addresses: fullAddress ? [{ label: 'Default', address: fullAddress, is_default: true }] : [],
            });
            setFoundCustomer({ id: newCustomer.id, name: customerName, address: fullAddress, orderCount: 0, isNew: true, savedAddresses: newCustomer.saved_addresses || [], raw: newCustomer });
            toast.success('New customer saved');
        } catch {
            setFoundCustomer({ name: customerName, address: fullAddress, orderCount: 0, isNew: true, savedAddresses: [] });
            toast.success('Customer details saved');
        }
        setShowNewCustomerForm(false);
    };

    const selectFromPostcodeSearch = (customer) => {
        const defaultAddr = customer.saved_addresses?.find(a => a.is_default)?.address || customer.delivery_address || '';
        setCustomerName(customer.full_name || '');
        setCustomerPhone(customer.phone_number || '');
        setDeliveryAddress(defaultAddr);
        setFoundCustomer({ id: customer.id, name: customer.full_name || '', address: defaultAddr, orderCount: customer.total_orders || 0, savedAddresses: customer.saved_addresses || [], raw: customer });
        setPostcodeResults([]);
        setSearchMode('phone');
        toast.success('Customer loaded');
    };

    const clearAll = () => {
        setCustomerPhone(''); setCustomerName(''); setDeliveryAddress('');
        setNotes(''); setFoundCustomer(null); setCollectionTime('ASAP');
        setPostcode(''); setPostcodeResults([]); setShowNewCustomerForm(false);
        setNewAddressLine(''); setNewPostcode(''); setPostcodeInfo(null); setIncomingCall(null);
        window.__phoneOrderDetails = {};
    };

    const confirmAndClose = () => {
        if (!customerName) { toast.error('Please enter a customer name'); return; }
        toast.success(`Phone order ready — ${customerName}`);
        onClose();
    };

    const bg = isDark ? 'bg-[#151720]' : 'bg-white';
    const text = isDark ? 'text-white' : 'text-gray-900';
    const textMuted = isDark ? 'text-gray-400' : 'text-gray-500';
    const borderCls = isDark ? 'border-white/[0.08]' : 'border-gray-200';
    const inputCls = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-[#0f1117] border-white/[0.08] text-white placeholder-gray-500 focus:border-orange-500/50' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400'}`;
    const labelCls = `text-xs font-semibold mb-1 block ${textMuted}`;

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

                {/* Dialog */}
                <div className={`relative z-10 w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border ${borderCls} ${bg} shadow-2xl overflow-hidden`}>

                    {/* Header */}
                    <div className={`flex items-center justify-between px-5 py-4 border-b ${borderCls} flex-shrink-0`}>
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-orange-500/15 flex items-center justify-center">
                                <Phone className="h-4 w-4 text-orange-400" />
                            </div>
                            <div>
                                <h2 className={`font-bold text-base ${text}`}>Phone Order</h2>
                                <p className={`text-xs ${textMuted}`}>Enter customer details to proceed</p>
                            </div>
                            {incomingCall && (
                                <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full animate-pulse ml-2">📞 Incoming</span>
                            )}
                        </div>
                        <button onClick={onClose} className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${isDark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Scrollable body */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">

                        {/* Order type toggle */}
                        <div className={`flex rounded-xl overflow-hidden border ${borderCls} text-xs font-semibold`}>
                            {[
                                { id: 'phone_collection', label: '🏪 Collection' },
                                { id: 'phone_delivery', label: '🚚 Delivery' },
                            ].map(opt => (
                                <button key={opt.id} onClick={() => onOrderTypeChange(opt.id)}
                                    className={`flex-1 py-2.5 transition-colors ${orderType === opt.id ? 'bg-orange-500 text-white' : `${textMuted} ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}`}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {/* Search mode tabs */}
                        <div className={`flex rounded-xl overflow-hidden border ${borderCls} text-xs font-semibold`}>
                            <button onClick={() => setSearchMode('phone')}
                                className={`flex-1 py-2 transition-colors ${searchMode === 'phone' ? (isDark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-800') : textMuted}`}>
                                📞 Search by Phone
                            </button>
                            <button onClick={() => setSearchMode('postcode')}
                                className={`flex-1 py-2 transition-colors ${searchMode === 'postcode' ? (isDark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-800') : textMuted}`}>
                                📮 Search by Postcode
                            </button>
                        </div>

                        {/* Phone search */}
                        {searchMode === 'phone' && (
                            <div>
                                <label className={labelCls}>Customer Phone *</label>
                                <div className="flex gap-2">
                                    <input
                                        className={inputCls + ' flex-1'}
                                        placeholder="07xxx xxxxxx"
                                        value={customerPhone}
                                        onChange={e => setCustomerPhone(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && doPhoneSearch(customerPhone)}
                                        autoFocus
                                    />
                                    <button onClick={() => doPhoneSearch(customerPhone)} disabled={searching}
                                        className={`px-4 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 ${isDark ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20' : 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100'}`}>
                                        {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                                        {searching ? 'Searching…' : 'Find'}
                                    </button>
                                </div>
                                {foundCustomer && (
                                    <div className={`mt-2 flex items-center justify-between px-3 py-2 rounded-xl border ${isDark ? 'border-green-500/20 bg-green-500/5' : 'border-green-200 bg-green-50'}`}>
                                        <div className={`flex items-center gap-2 text-xs font-semibold ${isDark ? 'text-green-400' : 'text-green-700'}`}>
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            {foundCustomer.isNew ? 'New customer saved' : `Returning customer · ${foundCustomer.orderCount} order${foundCustomer.orderCount !== 1 ? 's' : ''}`}
                                        </div>
                                        {foundCustomer.id && (
                                            <button onClick={() => setShowProfileModal(true)}
                                                className={`flex items-center gap-1 text-xs ${isDark ? 'text-gray-400 hover:text-orange-400' : 'text-gray-500 hover:text-orange-600'} transition-colors`}>
                                                <ExternalLink className="h-3 w-3" /> Profile
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Postcode search */}
                        {searchMode === 'postcode' && (
                            <div>
                                <label className={labelCls}>Search by Postcode</label>
                                <div className="flex gap-2">
                                    <input className={inputCls + ' flex-1 uppercase'} placeholder="e.g. SW1A 1AA"
                                        value={postcode} onChange={e => setPostcode(e.target.value.toUpperCase())}
                                        onKeyDown={e => e.key === 'Enter' && doPostcodeSearch()} />
                                    <button onClick={doPostcodeSearch} disabled={postcodeSearching}
                                        className={`px-4 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20' : 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100'}`}>
                                        {postcodeSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                                        Find
                                    </button>
                                </div>
                                {postcodeResults.length > 0 && (
                                    <div className={`mt-2 rounded-xl border overflow-hidden ${borderCls}`}>
                                        {postcodeResults.map((c, i) => (
                                            <button key={i} onClick={() => selectFromPostcodeSearch(c)}
                                                className={`w-full text-left px-3 py-2.5 text-xs border-b last:border-0 transition-colors ${isDark ? 'border-white/[0.05] hover:bg-white/5 text-gray-300' : 'border-gray-100 hover:bg-orange-50 text-gray-700'}`}>
                                                <p className="font-semibold">{c.full_name || 'Unknown'} · {c.phone_number}</p>
                                                <p className={`truncate ${textMuted}`}>{c.delivery_address}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── New Customer Form ── shown automatically after failed phone search */}
                        {showNewCustomerForm && (
                            <div className={`rounded-xl border p-4 space-y-3 ${isDark ? 'border-orange-500/25 bg-orange-500/5' : 'border-orange-200 bg-orange-50'}`}>
                                <div className={`flex items-center gap-2 text-sm font-bold ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                                    <UserPlus className="h-4 w-4" /> New Customer
                                    <span className={`ml-auto text-xs font-normal ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Phone: {customerPhone}</span>
                                </div>
                                <div>
                                    <label className={labelCls}>Full Name *</label>
                                    <input className={inputCls} placeholder="Customer name" value={customerName}
                                        onChange={e => setCustomerName(e.target.value)} autoFocus />
                                </div>
                                {orderType === 'phone_delivery' && (
                                    <>
                                        <div>
                                            <label className={labelCls}>Address Line</label>
                                            <input className={inputCls} placeholder="House number & street"
                                                value={newAddressLine} onChange={e => setNewAddressLine(e.target.value)} />
                                        </div>
                                        <div className="relative">
                                            <label className={labelCls}>Postcode</label>
                                            <input className={inputCls + ' uppercase'} placeholder="e.g. SW1A 1AA"
                                                value={newPostcode} onChange={e => handleNewPostcodeChange(e.target.value.toUpperCase())} />
                                            {showNewPostcodeDropdown && newPostcodeAuto.length > 0 && (
                                                <div className={`absolute z-50 w-full mt-1 rounded-xl border overflow-hidden shadow-lg ${isDark ? 'bg-[#1a1d27] border-white/[0.08]' : 'bg-white border-gray-200'}`}>
                                                    {newPostcodeAuto.slice(0, 6).map(pc => (
                                                        <button key={pc} onClick={() => selectNewPostcode(pc)}
                                                            className={`w-full text-left px-3 py-2 text-xs transition-colors ${isDark ? 'text-gray-300 hover:bg-white/5' : 'text-gray-700 hover:bg-orange-50'}`}>
                                                            <MapPin className="h-3 w-3 inline mr-1.5 opacity-50" />{pc}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {postcodeInfo && (
                                                <p className={`text-xs mt-1 ${textMuted}`}>📍 {postcodeInfo.admin_district}, {postcodeInfo.region}</p>
                                            )}
                                        </div>
                                    </>
                                )}
                                <button onClick={saveNewCustomer} disabled={!customerName}
                                    className="w-full py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors">
                                    Save Customer & Continue
                                </button>
                            </div>
                        )}

                        {/* Customer name field (when not in new-customer form) */}
                        {!showNewCustomerForm && (
                            <div>
                                <label className={labelCls}>Customer Name</label>
                                <div className="relative">
                                    <User className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${textMuted}`} />
                                    <input className={inputCls + ' pl-9'} placeholder="Full name" value={customerName}
                                        onChange={e => setCustomerName(e.target.value)} />
                                </div>
                            </div>
                        )}

                        {/* Delivery address */}
                        {orderType === 'phone_delivery' && !showNewCustomerForm && (
                            <div>
                                <label className={labelCls}>Delivery Address</label>
                                {foundCustomer?.savedAddresses?.length > 0 && (
                                    <div className="flex gap-1.5 flex-wrap mb-2">
                                        {foundCustomer.savedAddresses.map((addr, i) => (
                                            <button key={i} onClick={() => setDeliveryAddress(addr.address)}
                                                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${deliveryAddress === addr.address ? 'bg-orange-500 text-white border-orange-500' : isDark ? 'border-white/[0.08] text-gray-400 hover:border-orange-500/30 hover:text-orange-400' : 'border-gray-200 text-gray-500 hover:border-orange-300 hover:text-orange-500'}`}>
                                                {addr.is_default && <Star className="h-2.5 w-2.5" />}
                                                {addr.label || `Address ${i + 1}`}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="relative mb-2">
                                    <MapPin className={`absolute left-3 top-3 h-3.5 w-3.5 ${textMuted}`} />
                                    <textarea className={inputCls + ' pl-9 resize-none'} rows={2}
                                        placeholder="Full delivery address" value={deliveryAddress}
                                        onChange={e => setDeliveryAddress(e.target.value)} />
                                </div>
                                {/* Postcode lookup */}
                                <div className="relative">
                                    <input className={inputCls + ' uppercase text-xs py-2'}
                                        placeholder="Postcode lookup (e.g. SW1A 1AA)"
                                        onChange={e => handlePostcodeInputChange(e.target.value.toUpperCase())}
                                        value={postcode} />
                                    {showPostcodeDropdown && postcodeAutocomplete.length > 0 && (
                                        <div className={`absolute z-50 w-full mt-1 rounded-xl border overflow-hidden shadow-lg ${isDark ? 'bg-[#1a1d27] border-white/[0.08]' : 'bg-white border-gray-200'}`}>
                                            {postcodeAutocomplete.slice(0, 6).map(pc => (
                                                <button key={pc} onClick={() => selectPostcodeResult(pc)}
                                                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${isDark ? 'text-gray-300 hover:bg-white/5' : 'text-gray-700 hover:bg-orange-50'}`}>
                                                    <MapPin className="h-3 w-3 inline mr-1.5 opacity-50" />{pc}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Collection time */}
                        {orderType === 'phone_collection' && (
                            <div>
                                <label className={labelCls}>Ready In</label>
                                <div className="flex gap-2 flex-wrap">
                                    {COLLECTION_TIMES.map(t2 => (
                                        <button key={t2} onClick={() => setCollectionTime(t2)}
                                            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${collectionTime === t2 ? 'bg-orange-500 text-white border-orange-500' : `${isDark ? 'border-white/[0.08] text-gray-400 hover:border-orange-500/30 hover:text-orange-400' : 'border-gray-200 text-gray-500 hover:border-orange-300 hover:text-orange-500'}`}`}>
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
                                <StickyNote className={`absolute left-3 top-3 h-3.5 w-3.5 ${textMuted}`} />
                                <textarea className={inputCls + ' pl-9 resize-none'} rows={2}
                                    placeholder="Allergies, special instructions…" value={notes}
                                    onChange={e => setNotes(e.target.value)} />
                            </div>
                        </div>

                        {/* Add new customer CTA — if phone searched but no customer found and form was dismissed */}
                        {!foundCustomer && !showNewCustomerForm && customerPhone && (
                            <button onClick={() => setShowNewCustomerForm(true)}
                                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors ${isDark ? 'border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/50' : 'border-orange-300 text-orange-600 hover:bg-orange-50 hover:border-orange-400'}`}>
                                <UserPlus className="h-4 w-4" /> Add as New Customer
                            </button>
                        )}

                        {/* Clear link */}
                        {(customerPhone || customerName) && (
                            <button onClick={clearAll} className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'} transition-colors`}>
                                <Trash2 className="h-3 w-3" /> Clear all details
                            </button>
                        )}
                    </div>

                    {/* Footer actions */}
                    <div className={`flex gap-3 px-5 py-4 border-t ${borderCls} flex-shrink-0`}>
                        <button onClick={onClose}
                            className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition-colors ${isDark ? 'border-white/[0.08] text-gray-400 hover:bg-white/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                            Cancel
                        </button>
                        <button onClick={confirmAndClose} disabled={!customerName}
                            className="flex-2 flex-grow-[2] py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
                            <Phone className="h-4 w-4" />
                            Confirm & Add Items
                        </button>
                    </div>
                </div>
            </div>

            {/* Customer Profile Modal */}
            {showProfileModal && foundCustomer?.raw && (
                <CustomerProfileModal
                    customer={foundCustomer.raw}
                    onClose={() => setShowProfileModal(false)}
                    onUpdated={(updated) => {
                        setFoundCustomer(f => ({ ...f, name: updated.full_name, raw: updated }));
                        setCustomerName(updated.full_name);
                    }}
                    isDark={isDark}
                    restaurantId={restaurantId}
                />
            )}
        </>
    );
}