import React, { useState, useEffect, useRef } from 'react';
import { Phone, User, MapPin, Clock, StickyNote, Search, ChevronRight, CheckCircle2, Trash2, UserPlus, X, Loader2, Wifi, WifiOff, AlertCircle, Home } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const COLLECTION_TIMES = ['ASAP', '10 min', '15 min', '20 min', '25 min', '30 min', '45 min', '1 hour'];

// UK Postcode lookup via postcodes.io (free, no key needed)
async function lookupPostcode(postcode) {
    const clean = postcode.replace(/\s/g, '').toUpperCase();
    const res = await fetch(`https://api.postcodes.io/postcodes/${clean}`);
    if (!res.ok) throw new Error('Postcode not found');
    const data = await res.json();
    return data.result; // { postcode, admin_district, parish, ... }
}

async function autocompletePostcode(partial) {
    const clean = partial.replace(/\s/g, '').toUpperCase();
    if (clean.length < 3) return [];
    const res = await fetch(`https://api.postcodes.io/postcodes/${clean}/autocomplete`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.result || [];
}

export default function PhoneOrderPanel({ orderType, onOrderTypeChange, isDark, t, restaurantId }) {
    // Core state
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [postcode, setPostcode] = useState('');
    const [collectionTime, setCollectionTime] = useState('ASAP');
    const [notes, setNotes] = useState('');
    const [searching, setSearching] = useState(false);
    const [foundCustomer, setFoundCustomer] = useState(null);
    const [expanded, setExpanded] = useState(true);
    const [searchMode, setSearchMode] = useState('phone'); // 'phone' | 'postcode'
    const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
    const [postcodeResults, setPostcodeResults] = useState([]);
    const [postcodeSearching, setPostcodeSearching] = useState(false);
    const [postcodeAutocomplete, setPostcodeAutocomplete] = useState([]);
    const [showPostcodeDropdown, setShowPostcodeDropdown] = useState(false);
    const [cidStatus, setCidStatus] = useState(null); // null | 'connected' | 'disconnected'
    const [incomingCall, setIncomingCall] = useState(null);

    const postcodeRef = useRef(null);

    // Load POS phone settings
    const [posPhoneSettings, setPosPhoneSettings] = useState(null);
    useEffect(() => {
        const stored = localStorage.getItem(`pos_phone_settings_${restaurantId}`);
        if (stored) {
            try { setPosPhoneSettings(JSON.parse(stored)); } catch {}
        }
    }, [restaurantId]);

    // CID / VoIP integration - listen for incoming call events
    useEffect(() => {
        if (!posPhoneSettings?.cid_enabled) return;

        // Web Serial API for USB CID devices
        const handleSerialCID = async () => {
            if (!('serial' in navigator)) return;
            try {
                // Listen on already-opened port if available
                const ports = await navigator.serial.getPorts();
                if (ports.length === 0) return;
                setCidStatus('connected');

                const port = ports[0];
                if (!port.readable) await port.open({ baudRate: posPhoneSettings?.cid_baud || 9600 });

                const reader = port.readable.getReader();
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    const text = new TextDecoder().decode(value);
                    // Standard CID format: NMBR = 07xxxxxxxxx
                    const match = text.match(/NMBR\s*=\s*([\d+\s]+)/);
                    if (match) {
                        const phone = match[1].trim();
                        setIncomingCall(phone);
                        setCustomerPhone(phone);
                        toast.success(`📞 Incoming call from ${phone}`, { duration: 8000 });
                        // Auto-search
                        doPhoneSearch(phone);
                    }
                }
                reader.releaseLock();
            } catch {}
        };

        handleSerialCID();

        // VoIP Webhook: poll for incoming calls if webhook URL configured
        let pollInterval;
        if (posPhoneSettings?.voip_webhook_url) {
            pollInterval = setInterval(async () => {
                try {
                    const res = await fetch(posPhoneSettings.voip_webhook_url);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.incoming_call && data.phone !== incomingCall) {
                            setIncomingCall(data.phone);
                            setCustomerPhone(data.phone);
                            toast.success(`📞 Incoming call from ${data.phone}`, { duration: 8000 });
                            doPhoneSearch(data.phone);
                        }
                    }
                } catch {}
            }, 3000);
        }

        return () => { if (pollInterval) clearInterval(pollInterval); };
    }, [posPhoneSettings]);

    const doPhoneSearch = async (phone) => {
        if (!phone || phone.length < 5) return;
        setSearching(true);
        try {
            // Search Customer entity first
            const customers = await base44.entities.Customer.filter({ phone_number: phone, restaurant_id: restaurantId });
            if (customers.length > 0) {
                const customer = customers[0];
                setFoundCustomer({
                    id: customer.id,
                    name: customer.full_name,
                    address: customer.delivery_address || '',
                    orderCount: customer.total_orders || 0,
                });
                setShowNewCustomerForm(false);
                setCustomerName(customer.full_name);
                if (customer.delivery_address) setDeliveryAddress(customer.delivery_address);
                toast.success(`Found customer — ${customer.total_orders || 0} previous order${customer.total_orders !== 1 ? 's' : ''}`);
            } else {
                setFoundCustomer(null);
                setShowNewCustomerForm(true);
                toast.info('New customer — no previous orders found');
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
            const customers = await base44.entities.Customer.filter({ restaurant_id: restaurantId });
            const matches = customers.filter(c =>
                c.delivery_address?.toLowerCase().includes(postcode.toLowerCase().replace(/\s/g, ''))
                || c.delivery_address?.toLowerCase().includes(postcode.toLowerCase())
            );
            if (matches.length > 0) {
                setPostcodeResults(matches.slice(0, 10));
            } else {
                setPostcodeResults([]);
                toast.info('No customers found with that postcode');
            }
        } catch {
            toast.error('Search failed');
        } finally {
            setPostcodeSearching(false);
        }
    };

    // UK Postcode autocomplete for address entry
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
                // Append/set postcode into address
                const withoutPostcode = prev.replace(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/gi, '').trim();
                return withoutPostcode ? `${withoutPostcode}, ${info.postcode}` : info.postcode;
            });
        } catch {}
    };

    // Address postcode lookup in new customer form
    const [newAddressLine, setNewAddressLine] = useState('');
    const [newPostcode, setNewPostcode] = useState('');
    const [newPostcodeAuto, setNewPostcodeAuto] = useState([]);
    const [showNewPostcodeDropdown, setShowNewPostcodeDropdown] = useState(false);
    const [postcodeInfo, setPostcodeInfo] = useState(null);

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
            // Auto-fill address with postcode + district
            if (!newAddressLine) {
                setNewAddressLine(`${info.admin_district || ''}`);
            }
        } catch {
            toast.error('Invalid postcode');
        }
    };

    const saveNewCustomer = async () => {
        const fullAddress = newAddressLine ? `${newAddressLine}, ${newPostcode}` : newPostcode;
        setDeliveryAddress(fullAddress);
        try {
            const newCustomer = await base44.entities.Customer.create({
                phone_number: customerPhone,
                full_name: customerName,
                delivery_address: fullAddress,
                restaurant_id: restaurantId,
                total_orders: 0,
            });
            setFoundCustomer({ id: newCustomer.id, name: customerName, address: fullAddress, orderCount: 0, isNew: true });
        } catch {
            setFoundCustomer({ name: customerName, address: fullAddress, orderCount: 0, isNew: true });
        }
        setShowNewCustomerForm(false);
        toast.success('New customer saved');
    };

    const selectFromPostcodeSearch = (customer) => {
        setCustomerName(customer.full_name || '');
        setCustomerPhone(customer.phone_number || '');
        setDeliveryAddress(customer.delivery_address || '');
        setFoundCustomer({ id: customer.id, name: customer.full_name || '', address: customer.delivery_address || '', orderCount: customer.total_orders || 0 });
        setPostcodeResults([]);
        setSearchMode('phone');
        toast.success('Customer loaded from postcode search');
    };

    // Expose to window for POS to read
    useEffect(() => {
        window.__phoneOrderDetails = {
            phone: customerPhone,
            name: customerName,
            address: deliveryAddress,
            collectionTime,
            notes,
        };
        return () => { delete window.__phoneOrderDetails; };
    }, [customerPhone, customerName, deliveryAddress, collectionTime, notes]);

    const clearAll = () => {
        setCustomerPhone(''); setCustomerName(''); setDeliveryAddress('');
        setNotes(''); setFoundCustomer(null); setCollectionTime('ASAP');
        setPostcode(''); setPostcodeResults([]); setShowNewCustomerForm(false);
        setNewAddressLine(''); setNewPostcode(''); setPostcodeInfo(null); setIncomingCall(null);
    };

    const hasDetails = customerPhone || customerName;

    const inputCls = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${
        isDark
            ? 'bg-[#0f1117] border-white/[0.08] text-white placeholder-gray-500 focus:border-orange-500/50'
            : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400'
    }`;
    const labelCls = `text-xs font-semibold mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-500'}`;

    return (
        <div className={`${t.panel} border rounded-2xl overflow-hidden`}>
            {/* Header */}
            <button
                onClick={() => setExpanded(p => !p)}
                className={`w-full flex items-center justify-between px-4 py-3 ${t.panelHead} border-b`}
            >
                <div className="flex items-center gap-2">
                    <Phone className={`h-4 w-4 ${hasDetails ? 'text-orange-400' : isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                    <span className={`text-sm font-bold ${t.text}`}>Phone Order</span>
                    {incomingCall && <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full animate-pulse">📞 Incoming</span>}
                    {cidStatus === 'connected' && !incomingCall && <Wifi className="h-3 w-3 text-green-400" />}
                    {hasDetails && !incomingCall && <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />}
                </div>
                <ChevronRight className={`h-4 w-4 ${t.textMuted} transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>

            {expanded && (
                <div className="p-3 space-y-3">
                    {/* Incoming call banner */}
                    {incomingCall && (
                        <div className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold ${isDark ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-green-50 border border-green-200 text-green-700'}`}>
                            <div className="flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5" />
                                Incoming: {incomingCall}
                            </div>
                            <button onClick={() => setIncomingCall(null)}><X className="h-3 w-3" /></button>
                        </div>
                    )}

                    {/* Order type sub-selector */}
                    <div className={`flex rounded-xl overflow-hidden border ${isDark ? 'border-white/[0.08]' : 'border-gray-200'} text-xs font-semibold`}>
                        {[
                            { id: 'phone_collection', label: '🏪 Collection' },
                            { id: 'phone_delivery', label: '🚚 Delivery' },
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

                    {/* Search mode tabs */}
                    <div className={`flex rounded-lg overflow-hidden border text-xs font-semibold ${isDark ? 'border-white/[0.06]' : 'border-gray-200'}`}>
                        <button
                            onClick={() => setSearchMode('phone')}
                            className={`flex-1 py-1.5 transition-colors ${searchMode === 'phone' ? (isDark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-800') : t.textMuted}`}
                        >📞 Phone</button>
                        <button
                            onClick={() => setSearchMode('postcode')}
                            className={`flex-1 py-1.5 transition-colors ${searchMode === 'postcode' ? (isDark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-800') : t.textMuted}`}
                        >📮 Postcode</button>
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
                                />
                                <button
                                    onClick={() => doPhoneSearch(customerPhone)}
                                    disabled={searching}
                                    className={`px-3 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1 ${
                                        isDark
                                            ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20'
                                            : 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100'
                                    }`}
                                >
                                    {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                                    {searching ? '' : 'Find'}
                                </button>
                            </div>
                            {foundCustomer && (
                                <div className={`mt-1.5 flex items-center gap-1.5 text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                                    <CheckCircle2 className="h-3 w-3" />
                                    {foundCustomer.isNew ? 'New customer' : `Returning · ${foundCustomer.orderCount} order${foundCustomer.orderCount !== 1 ? 's' : ''}`}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Postcode search */}
                    {searchMode === 'postcode' && (
                        <div>
                            <label className={labelCls}>Search by Postcode</label>
                            <div className="flex gap-2">
                                <input
                                    className={inputCls + ' flex-1 uppercase'}
                                    placeholder="e.g. SW1A 1AA"
                                    value={postcode}
                                    onChange={e => setPostcode(e.target.value.toUpperCase())}
                                    onKeyDown={e => e.key === 'Enter' && doPostcodeSearch()}
                                />
                                <button
                                    onClick={doPostcodeSearch}
                                    disabled={postcodeSearching}
                                    className={`px-3 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1 ${
                                        isDark ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20' : 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100'
                                    }`}
                                >
                                    {postcodeSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                                </button>
                            </div>
                            {postcodeResults.length > 0 && (
                                <div className={`mt-2 rounded-xl border overflow-hidden ${isDark ? 'border-white/[0.08]' : 'border-gray-200'}`}>
                                    {postcodeResults.map((order, i) => (
                                        <button
                                            key={i}
                                            onClick={() => selectFromPostcodeSearch(order)}
                                            className={`w-full text-left px-3 py-2 text-xs border-b last:border-0 transition-colors ${isDark ? 'border-white/[0.05] hover:bg-white/5 text-gray-300' : 'border-gray-100 hover:bg-orange-50 text-gray-700'}`}
                                        >
                                            <p className="font-semibold">{order.guest_name || 'Unknown'} · {order.phone}</p>
                                            <p className={`truncate ${t.textMuted}`}>{order.delivery_address}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* New customer form */}
                    {showNewCustomerForm && (
                        <div className={`rounded-xl border p-3 space-y-2.5 ${isDark ? 'border-orange-500/20 bg-orange-500/5' : 'border-orange-200 bg-orange-50'}`}>
                            <div className={`flex items-center gap-1.5 text-xs font-semibold ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                                <UserPlus className="h-3.5 w-3.5" /> New Customer
                            </div>
                            <div>
                                <label className={labelCls}>Full Name *</label>
                                <input className={inputCls} placeholder="Customer name" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                            </div>
                            {orderType === 'phone_delivery' && (
                                <>
                                    <div>
                                        <label className={labelCls}>Address Line</label>
                                        <input className={inputCls} placeholder="House number & street" value={newAddressLine} onChange={e => setNewAddressLine(e.target.value)} />
                                    </div>
                                    <div className="relative">
                                        <label className={labelCls}>Postcode *</label>
                                        <input
                                            className={inputCls + ' uppercase'}
                                            placeholder="e.g. SW1A 1AA"
                                            value={newPostcode}
                                            onChange={e => handleNewPostcodeChange(e.target.value.toUpperCase())}
                                        />
                                        {showNewPostcodeDropdown && newPostcodeAuto.length > 0 && (
                                            <div className={`absolute z-50 w-full mt-1 rounded-xl border overflow-hidden shadow-lg ${isDark ? 'bg-[#1a1d27] border-white/[0.08]' : 'bg-white border-gray-200'}`}>
                                                {newPostcodeAuto.slice(0, 6).map(pc => (
                                                    <button
                                                        key={pc}
                                                        onClick={() => selectNewPostcode(pc)}
                                                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${isDark ? 'text-gray-300 hover:bg-white/5' : 'text-gray-700 hover:bg-orange-50'}`}
                                                    >
                                                        <MapPin className="h-3 w-3 inline mr-1.5 opacity-50" />{pc}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {postcodeInfo && (
                                            <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                                📍 {postcodeInfo.admin_district}, {postcodeInfo.region}
                                            </p>
                                        )}
                                    </div>
                                </>
                            )}
                            <button
                                onClick={saveNewCustomer}
                                disabled={!customerName}
                                className="w-full py-2 rounded-xl bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors"
                            >
                                Save Customer
                            </button>
                        </div>
                    )}

                    {/* Customer name (if not in new form) */}
                    {!showNewCustomerForm && (
                        <div>
                            <label className={labelCls}>Customer Name</label>
                            <div className="relative">
                                <User className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textMuted}`} />
                                <input className={inputCls + ' pl-8'} placeholder="Full name" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                            </div>
                        </div>
                    )}

                    {/* Delivery address with UK postcode autocomplete */}
                    {orderType === 'phone_delivery' && !showNewCustomerForm && (
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
                            {/* Quick postcode lookup */}
                            <div className="relative mt-1.5">
                                <input
                                    className={inputCls + ' uppercase text-xs py-2 pr-20'}
                                    placeholder="Look up postcode (e.g. SW1A 1AA)"
                                    onChange={e => handlePostcodeInputChange(e.target.value.toUpperCase())}
                                    value={postcode}
                                />
                                {showPostcodeDropdown && postcodeAutocomplete.length > 0 && (
                                    <div className={`absolute z-50 w-full mt-1 rounded-xl border overflow-hidden shadow-lg ${isDark ? 'bg-[#1a1d27] border-white/[0.08]' : 'bg-white border-gray-200'}`}>
                                        {postcodeAutocomplete.slice(0, 6).map(pc => (
                                            <button
                                                key={pc}
                                                onClick={() => selectPostcodeResult(pc)}
                                                className={`w-full text-left px-3 py-2 text-xs transition-colors ${isDark ? 'text-gray-300 hover:bg-white/5' : 'text-gray-700 hover:bg-orange-50'}`}
                                            >
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

                    {/* Add new customer button (if no customer found and not in new form) */}
                    {!foundCustomer && !showNewCustomerForm && customerPhone && (
                        <button
                            onClick={() => setShowNewCustomerForm(true)}
                            className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${isDark ? 'text-orange-400 hover:text-orange-300' : 'text-orange-500 hover:text-orange-600'}`}
                        >
                            <UserPlus className="h-3.5 w-3.5" /> Add as new customer
                        </button>
                    )}

                    {/* Clear */}
                    {hasDetails && (
                        <button
                            onClick={clearAll}
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