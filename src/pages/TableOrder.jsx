import React, { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, ShoppingCart, X, ChevronRight, CheckCircle, Search } from 'lucide-react';

// ─── Standalone QR Ordering Page ───────────────────────────────────────────────
// Completely independent from the MealDrop ordering flow.
// Accessed via: /TableOrder?restaurant_id=...&table_id=...
// ───────────────────────────────────────────────────────────────────────────────

export default function TableOrder() {
    const urlParams = new URLSearchParams(window.location.search);
    const restaurantId = urlParams.get('restaurant_id');
    const tableId = urlParams.get('table_id');

    const [step, setStep] = useState('loading'); // loading | error | menu | cart | confirm | success
    const [restaurant, setRestaurant] = useState(null);
    const [table, setTable] = useState(null);
    const [menuItems, setMenuItems] = useState([]);
    const [categories, setCategories] = useState([]);
    const [activeCategory, setActiveCategory] = useState('all');
    const [cart, setCart] = useState([]);
    const [search, setSearch] = useState('');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [orderId, setOrderId] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!restaurantId || !tableId) {
            setErrorMsg('Invalid QR code. Please ask a member of staff for help.');
            setStep('error');
            return;
        }
        loadData();
    }, []);

    const loadData = async () => {
        try {
            // Also checked server-side in tableCreateOrder - this is only so a
            // customer is told up front rather than after building a whole cart.
            const [restaurants, items, tables] = await Promise.all([
                base44.entities.Restaurant.filter({ id: restaurantId }),
                base44.entities.MenuItem.filter({ restaurant_id: restaurantId, is_available: true }),
                base44.entities.RestaurantTable.filter({ id: tableId, restaurant_id: restaurantId }),
            ]);

            const r = restaurants?.[0];
            const t = tables?.[0];

            if (!r) { setErrorMsg('Restaurant not found.'); setStep('error'); return; }
            if (!t) { setErrorMsg('Table not found. Please ask staff for assistance.'); setStep('error'); return; }
            if (r.qr_ordering_enabled === false) {
                setErrorMsg('Table ordering isn\u2019t available right now. Please order with a member of staff.');
                setStep('error');
                return;
            }

            setRestaurant(r);
            setTable(t);
            setMenuItems(items || []);

            // Build categories
            const cats = ['all', ...new Set((items || []).map(i => i.category).filter(Boolean))];
            setCategories(cats);

            setStep('menu');
        } catch (e) {
            setErrorMsg('Could not load the menu. Please try again or ask staff.');
            setStep('error');
        }
    };

    const addToCart = useCallback((item) => {
        setCart(prev => {
            const existing = prev.find(c => c.id === item.id);
            if (existing) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
            return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
        });
    }, []);

    const removeFromCart = useCallback((itemId) => {
        setCart(prev => {
            const existing = prev.find(c => c.id === itemId);
            if (!existing) return prev;
            if (existing.qty === 1) return prev.filter(c => c.id !== itemId);
            return prev.map(c => c.id === itemId ? { ...c, qty: c.qty - 1 } : c);
        });
    }, []);

    const getQty = (itemId) => cart.find(c => c.id === itemId)?.qty || 0;

    const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const cartCount = cart.reduce((s, c) => s + c.qty, 0);

    const filteredItems = menuItems.filter(item => {
        const matchCat = activeCategory === 'all' || item.category === activeCategory;
        const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || item.description?.toLowerCase().includes(search.toLowerCase());
        return matchCat && matchSearch;
    });

    const placeOrder = async () => {
        if (cart.length === 0) return;
        setSubmitting(true);
        try {
            setErrorMsg('');
            const orderItems = cart.map(c => ({
                menu_item_id: c.id,
                name: c.name,
                price: c.price,
                quantity: c.qty,
            }));

            // SECURITY: No direct entity write. This page is public and
            // unauthenticated, so client-supplied prices cannot be trusted -
            // tableCreateOrder recomputes every price from the live menu,
            // verifies the table belongs to this restaurant, and refuses to
            // mark anything as paid. See base44/functions/tableCreateOrder.
            const response = await base44.functions.invoke('tableCreateOrder', {
                restaurant_id: restaurantId,
                table_id: tableId,
                items: orderItems,
                notes,
            });
            const result = response?.data ?? response;
            if (!result?.success) {
                setErrorMsg(result?.error || 'Could not place your order. Please ask a member of staff.');
                setSubmitting(false);
                return;
            }
            const order = result.order;

            setOrderId(order.id);
            setStep('success');
        } catch (e) {
            // Use the page's own error UI rather than a native alert(): on a
            // customer's phone a browser dialog is jarring and, in some in-app
            // browsers, suppressed entirely - leaving no feedback at all.
            setErrorMsg('Could not place your order. Please try again or ask a member of staff.');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Loading ──
    if (step === 'loading') return (
        <div className="min-h-screen bg-orange-50 flex items-center justify-center">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-600 font-medium">Loading menu…</p>
            </div>
        </div>
    );

    // ── Error ──
    if (step === 'error') return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className="text-center max-w-sm">
                <div className="text-5xl mb-4">❌</div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Something went wrong</h2>
                <p className="text-gray-500">{errorMsg}</p>
            </div>
        </div>
    );

    // ── Success ──
    if (step === 'success') return (
        <div className="min-h-screen bg-green-50 flex items-center justify-center p-6">
            <div className="text-center max-w-sm">
                <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Order Placed!</h2>
                <p className="text-gray-500 mb-1">
                    Your order has been sent to the kitchen for <strong>{table?.table_number}</strong>.
                </p>
                <p className="text-gray-400 text-sm mb-6">Staff will bring your food shortly.</p>
                <div className="bg-white rounded-2xl border border-green-200 p-4 text-left space-y-2 mb-6">
                    {cart.map(c => (
                        <div key={c.id} className="flex justify-between text-sm">
                            <span>{c.qty}× {c.name}</span>
                            <span className="text-gray-500">£{(c.price * c.qty).toFixed(2)}</span>
                        </div>
                    ))}
                    <div className="border-t pt-2 flex justify-between font-semibold">
                        <span>Total</span>
                        <span>£{cartTotal.toFixed(2)}</span>
                    </div>
                </div>
                <Button
                    className="w-full bg-orange-500 hover:bg-orange-600"
                    onClick={() => { setCart([]); setNotes(''); setStep('menu'); }}
                >
                    Order More Items
                </Button>
            </div>
        </div>
    );

    // ── Cart / Confirm ──
    if (step === 'cart') return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
                <button onClick={() => setStep('menu')} className="p-2 rounded-full hover:bg-gray-100">
                    <X className="h-5 w-5" />
                </button>
                <div>
                    <h1 className="font-bold text-lg text-gray-900">Your Order</h1>
                    <p className="text-xs text-gray-500">{table?.table_number} · {restaurant?.name}</p>
                </div>
            </div>

            <div className="flex-1 p-4 space-y-3 overflow-y-auto">
                {cart.map(c => (
                    <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                        <div className="flex-1">
                            <p className="font-semibold text-gray-900">{c.name}</p>
                            <p className="text-sm text-gray-500">£{c.price.toFixed(2)} each</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => removeFromCart(c.id)} className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center hover:bg-orange-200">
                                <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-6 text-center font-semibold">{c.qty}</span>
                            <button onClick={() => addToCart({ id: c.id, name: c.name, price: c.price })} className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600">
                                <Plus className="h-4 w-4" />
                            </button>
                        </div>
                        <p className="w-16 text-right font-semibold text-gray-900">£{(c.price * c.qty).toFixed(2)}</p>
                    </div>
                ))}

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <label className="text-sm font-medium text-gray-700 block mb-2">Special requests / allergies</label>
                    <textarea
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-orange-400"
                        placeholder="e.g. No onions, extra sauce, nut allergy…"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="bg-white border-t p-4 safe-area-bottom">
                {/* Inline failure message. Switching to the full error screen
                    would discard the customer's cart, so problems are surfaced
                    here where they can simply retry. */}
                {errorMsg && (
                    <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                        {errorMsg}
                    </div>
                )}
                <div className="flex justify-between mb-3">
                    <span className="text-gray-600">Total</span>
                    <span className="text-xl font-bold text-gray-900">£{cartTotal.toFixed(2)}</span>
                </div>
                <Button
                    className="w-full bg-orange-500 hover:bg-orange-600 h-14 text-lg font-semibold"
                    onClick={placeOrder}
                    disabled={submitting}
                >
                    {submitting ? 'Placing Order…' : 'Place Order'}
                </Button>
                <p className="text-xs text-center text-gray-400 mt-2">Payment will be handled by staff at the table</p>
            </div>
        </div>
    );

    // ── Menu ──
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="px-4 pt-4 pb-3">
                    <div className="flex items-center justify-between mb-1">
                        {restaurant?.logo_url ? (
                            <img src={restaurant.logo_url} alt={restaurant.name} className="h-10 w-10 rounded-xl object-cover" />
                        ) : (
                            <span className="text-2xl">🍽️</span>
                        )}
                        <Badge className="bg-orange-100 text-orange-700 border-0">📍 {table?.table_number}</Badge>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900">{restaurant?.name}</h1>
                    <p className="text-sm text-gray-500">Dine-in menu · Pay at table</p>

                    {/* Search */}
                    <div className="relative mt-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50"
                            placeholder="Search menu…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {/* Category tabs */}
                <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${
                                activeCategory === cat
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {cat === 'all' ? 'All' : cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Menu Items */}
            <div className="flex-1 p-4 pb-32 space-y-3">
                {filteredItems.length === 0 && (
                    <div className="text-center py-16 text-gray-400">
                        <p className="text-lg">No items found</p>
                    </div>
                )}
                {filteredItems.map(item => (
                    <div key={item.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex">
                        {item.image_url && (
                            <img src={item.image_url} alt={item.name} className="w-24 h-24 object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                            <div>
                                <div className="flex items-center gap-1 flex-wrap mb-0.5">
                                    {item.is_popular && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">Popular</span>}
                                    {item.is_vegetarian && <span className="text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full font-medium">Veg</span>}
                                    {item.is_spicy && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">🌶 Spicy</span>}
                                </div>
                                <p className="font-semibold text-gray-900 text-sm leading-tight">{item.name}</p>
                                {item.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>}
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <span className="font-bold text-gray-900">£{item.price.toFixed(2)}</span>
                                {getQty(item.id) === 0 ? (
                                    <button
                                        onClick={() => addToCart(item)}
                                        className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 flex-shrink-0"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center hover:bg-orange-200">
                                            <Minus className="h-3.5 w-3.5" />
                                        </button>
                                        <span className="w-5 text-center text-sm font-bold">{getQty(item.id)}</span>
                                        <button onClick={() => addToCart(item)} className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600">
                                            <Plus className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Floating Cart Button */}
            {cartCount > 0 && (
                <div className="fixed bottom-6 left-4 right-4 z-20">
                    <button
                        onClick={() => setStep('cart')}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-2xl p-4 flex items-center justify-between shadow-xl shadow-orange-200 transition-all active:scale-[0.98]"
                    >
                        <span className="bg-orange-600 text-white text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">
                            {cartCount}
                        </span>
                        <span className="font-semibold text-lg">View Order</span>
                        <span className="font-bold text-lg">£{cartTotal.toFixed(2)}</span>
                    </button>
                </div>
            )}
        </div>
    );
}