import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { X, User, MapPin, Star, Plus, Trash2, Edit2, Check, Clock, ShoppingBag } from 'lucide-react';
import { format } from 'date-fns';

export default function CustomerProfileModal({ customer, onClose, onUpdated, isDark, restaurantId }) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [orders, setOrders] = useState([]);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [activeTab, setActiveTab] = useState('details');

    const [form, setForm] = useState({
        full_name: customer.full_name || '',
        phone_number: customer.phone_number || '',
        email: customer.email || '',
        notes: customer.notes || '',
        delivery_address: customer.delivery_address || '',
        saved_addresses: customer.saved_addresses || [],
    });

    const [newAddress, setNewAddress] = useState('');
    const [newAddressLabel, setNewAddressLabel] = useState('');
    const [showAddAddress, setShowAddAddress] = useState(false);

    useEffect(() => {
        loadOrders();
    }, []);

    const loadOrders = async () => {
        setLoadingOrders(true);
        try {
            const result = await base44.entities.Order.filter({ phone: customer.phone_number, restaurant_id: restaurantId }, '-created_date', 50);
            setOrders(result.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
        } catch {
            setOrders([]);
        } finally {
            setLoadingOrders(false);
        }
    };

    const handleSave = async () => {
        if (!form.full_name || !form.phone_number) {
            toast.error('Name and phone are required');
            return;
        }
        setSaving(true);
        try {
            await base44.entities.Customer.update(customer.id, {
                full_name: form.full_name,
                phone_number: form.phone_number,
                email: form.email,
                notes: form.notes,
                delivery_address: form.delivery_address,
                saved_addresses: form.saved_addresses,
            });
            toast.success('Customer updated');
            setEditing(false);
            onUpdated?.({ ...customer, ...form });
        } catch {
            toast.error('Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    const setDefaultAddress = (idx) => {
        const updated = form.saved_addresses.map((a, i) => ({ ...a, is_default: i === idx }));
        setForm(f => ({ ...f, saved_addresses: updated, delivery_address: updated[idx].address }));
    };

    const removeAddress = (idx) => {
        const updated = form.saved_addresses.filter((_, i) => i !== idx);
        setForm(f => ({ ...f, saved_addresses: updated }));
    };

    const addAddress = () => {
        if (!newAddress.trim()) return;
        const isFirst = form.saved_addresses.length === 0;
        const entry = { label: newAddressLabel || 'Address', address: newAddress.trim(), is_default: isFirst };
        const updated = [...form.saved_addresses, entry];
        setForm(f => ({
            ...f,
            saved_addresses: updated,
            delivery_address: isFirst ? newAddress.trim() : f.delivery_address,
        }));
        setNewAddress('');
        setNewAddressLabel('');
        setShowAddAddress(false);
    };

    const bg = isDark ? 'bg-[#1a1d27]' : 'bg-white';
    const border = isDark ? 'border-white/[0.08]' : 'border-gray-200';
    const text = isDark ? 'text-white' : 'text-gray-900';
    const textSub = isDark ? 'text-gray-400' : 'text-gray-500';
    const inputCls = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-[#0f1117] border-white/[0.08] text-white placeholder-gray-500 focus:border-orange-500/50' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400'}`;
    const labelCls = `text-xs font-semibold mb-1 block ${textSub}`;
    const tabCls = (tab) => `flex-1 py-2 text-xs font-semibold transition-colors rounded-lg ${activeTab === tab ? (isDark ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-800') : textSub}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className={`${bg} rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border ${border}`}>
                {/* Header */}
                <div className={`flex items-center justify-between px-5 py-4 border-b ${border}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-orange-500/10' : 'bg-orange-50'}`}>
                            <User className="h-5 w-5 text-orange-500" />
                        </div>
                        <div>
                            <p className={`font-bold text-sm ${text}`}>{customer.full_name}</p>
                            <p className={`text-xs ${textSub}`}>{customer.phone_number}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {activeTab === 'details' && !editing && (
                            <button onClick={() => setEditing(true)} className={`p-2 rounded-xl border ${isDark ? 'border-white/[0.08] text-gray-300 hover:bg-white/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50'} transition-colors`}>
                                <Edit2 className="h-4 w-4" />
                            </button>
                        )}
                        <button onClick={onClose} className={`p-2 rounded-xl border ${isDark ? 'border-white/[0.08] text-gray-400 hover:bg-white/5' : 'border-gray-200 text-gray-400 hover:bg-gray-50'} transition-colors`}>
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className={`flex gap-1 p-3 border-b ${border}`}>
                    <button onClick={() => setActiveTab('details')} className={tabCls('details')}>Details</button>
                    <button onClick={() => setActiveTab('addresses')} className={tabCls('addresses')}>Addresses</button>
                    <button onClick={() => { setActiveTab('orders'); loadOrders(); }} className={tabCls('orders')}>
                        Order History {orders.length > 0 && `(${orders.length})`}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {/* Details Tab */}
                    {activeTab === 'details' && (
                        <>
                            <div>
                                <label className={labelCls}>Full Name</label>
                                <input className={inputCls} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} disabled={!editing} />
                            </div>
                            <div>
                                <label className={labelCls}>Phone Number</label>
                                <input className={inputCls} value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} disabled={!editing} />
                            </div>
                            <div>
                                <label className={labelCls}>Email (optional)</label>
                                <input className={inputCls} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} disabled={!editing} placeholder="customer@email.com" />
                            </div>
                            <div>
                                <label className={labelCls}>Internal Notes</label>
                                <textarea className={inputCls + ' resize-none'} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} disabled={!editing} placeholder="Allergies, preferences, etc." />
                            </div>
                            <div className={`flex items-center gap-2 text-xs ${textSub}`}>
                                <ShoppingBag className="h-3.5 w-3.5" />
                                <span>{customer.total_orders || 0} total orders</span>
                                {customer.last_order_date && (
                                    <>
                                        <span>·</span>
                                        <Clock className="h-3.5 w-3.5" />
                                        <span>Last order {format(new Date(customer.last_order_date), 'd MMM yyyy')}</span>
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {/* Addresses Tab */}
                    {activeTab === 'addresses' && (
                        <>
                            {form.saved_addresses.length === 0 && !showAddAddress && (
                                <p className={`text-xs text-center py-4 ${textSub}`}>No saved addresses yet</p>
                            )}
                            {form.saved_addresses.map((addr, i) => (
                                <div key={i} className={`rounded-xl border p-3 space-y-1 ${addr.is_default ? (isDark ? 'border-orange-500/40 bg-orange-500/5' : 'border-orange-300 bg-orange-50') : border}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <MapPin className={`h-3.5 w-3.5 ${addr.is_default ? 'text-orange-500' : textSub}`} />
                                            <span className={`text-xs font-semibold ${addr.is_default ? 'text-orange-500' : text}`}>{addr.label}</span>
                                            {addr.is_default && (
                                                <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-semibold">Default</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {!addr.is_default && (
                                                <button onClick={() => setDefaultAddress(i)} className={`text-xs px-2 py-1 rounded-lg border transition-colors ${isDark ? 'border-white/[0.08] text-gray-400 hover:text-orange-400' : 'border-gray-200 text-gray-500 hover:text-orange-500'}`}>
                                                    <Star className="h-3 w-3" />
                                                </button>
                                            )}
                                            <button onClick={() => removeAddress(i)} className={`text-xs px-2 py-1 rounded-lg border transition-colors ${isDark ? 'border-white/[0.08] text-gray-400 hover:text-red-400' : 'border-gray-200 text-gray-500 hover:text-red-500'}`}>
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </div>
                                    </div>
                                    <p className={`text-xs ${textSub} pl-5`}>{addr.address}</p>
                                </div>
                            ))}

                            {showAddAddress && (
                                <div className={`rounded-xl border p-3 space-y-2 ${isDark ? 'border-orange-500/20 bg-orange-500/5' : 'border-orange-200 bg-orange-50'}`}>
                                    <input className={inputCls} placeholder="Label (e.g. Home, Work)" value={newAddressLabel} onChange={e => setNewAddressLabel(e.target.value)} />
                                    <textarea className={inputCls + ' resize-none'} rows={2} placeholder="Full address" value={newAddress} onChange={e => setNewAddress(e.target.value)} />
                                    <div className="flex gap-2">
                                        <button onClick={addAddress} disabled={!newAddress.trim()} className="flex-1 py-2 rounded-xl bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1">
                                            <Check className="h-3.5 w-3.5" /> Add Address
                                        </button>
                                        <button onClick={() => setShowAddAddress(false)} className={`px-4 py-2 rounded-xl border text-xs font-semibold ${isDark ? 'border-white/[0.08] text-gray-400' : 'border-gray-200 text-gray-500'} transition-colors`}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {!showAddAddress && (
                                <button onClick={() => setShowAddAddress(true)} className={`w-full py-2.5 rounded-xl border border-dashed text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${isDark ? 'border-white/[0.08] text-gray-400 hover:border-orange-500/40 hover:text-orange-400' : 'border-gray-300 text-gray-500 hover:border-orange-400 hover:text-orange-500'}`}>
                                    <Plus className="h-3.5 w-3.5" /> Add New Address
                                </button>
                            )}
                        </>
                    )}

                    {/* Orders Tab */}
                    {activeTab === 'orders' && (
                        <>
                            {loadingOrders ? (
                                <div className={`text-center py-6 text-xs ${textSub}`}>Loading orders...</div>
                            ) : orders.length === 0 ? (
                                <p className={`text-xs text-center py-6 ${textSub}`}>No orders found for this customer</p>
                            ) : (
                                orders.map(order => (
                                    <div key={order.id} className={`rounded-xl border p-3 space-y-2 ${border}`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-bold ${text}`}>#{order.order_number || order.id.slice(-6).toUpperCase()}</span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${
                                                    order.status === 'delivered' || order.status === 'collected' ? 'bg-green-500/10 text-green-500' :
                                                    order.status === 'cancelled' ? 'bg-red-500/10 text-red-500' :
                                                    'bg-orange-500/10 text-orange-500'
                                                }`}>{order.status?.replace(/_/g, ' ')}</span>
                                            </div>
                                            <span className={`text-xs font-bold ${text}`}>£{order.total?.toFixed(2)}</span>
                                        </div>
                                        <div className={`text-xs ${textSub}`}>
                                            {order.items?.slice(0, 3).map((item, i) => (
                                                <span key={i}>{item.name}{item.quantity > 1 ? ` x${item.quantity}` : ''}{i < Math.min(order.items.length, 3) - 1 ? ', ' : ''}</span>
                                            ))}
                                            {order.items?.length > 3 && <span> +{order.items.length - 3} more</span>}
                                        </div>
                                        <div className={`flex items-center gap-2 text-[10px] ${textSub}`}>
                                            <Clock className="h-3 w-3" />
                                            {format(new Date(order.created_date), 'd MMM yyyy, HH:mm')}
                                            {order.order_type && <span className="capitalize">· {order.order_type.replace(/_/g, ' ')}</span>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </>
                    )}
                </div>

                {/* Footer actions */}
                {(editing || activeTab === 'addresses') && (
                    <div className={`px-4 py-3 border-t ${border} flex gap-2`}>
                        {editing && (
                            <button onClick={() => { setEditing(false); setForm({ full_name: customer.full_name || '', phone_number: customer.phone_number || '', email: customer.email || '', notes: customer.notes || '', delivery_address: customer.delivery_address || '', saved_addresses: customer.saved_addresses || [] }); }} className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${isDark ? 'border-white/[0.08] text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                                Cancel
                            </button>
                        )}
                        <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors disabled:opacity-50">
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}