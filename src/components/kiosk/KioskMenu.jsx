import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ShoppingCart, Search, ArrowLeft, ChevronRight, X } from 'lucide-react';
import KioskItemModal from './KioskItemModal';

export default function KioskMenu({
    restaurant, restaurantId, cart, cartTotal, cartCount,
    orderType, onAddItem, onViewCart, onBack
}) {
    const [selectedCategory, setSelectedCategory] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);

    const { data: menuItems = [] } = useQuery({
        queryKey: ['kiosk-menu', restaurantId],
        queryFn: async () => {
            const items = await base44.entities.MenuItem.filter({ restaurant_id: restaurantId, is_available: true });
            return items.filter(i => !i.availability_channel || i.availability_channel !== 'online_only');
        },
        enabled: !!restaurantId,
    });

    const getOrderedCategories = () => {
        const order = restaurant?.category_order || [];
        const all = restaurant?.menu_categories || [...new Set(menuItems.map(i => i.category).filter(Boolean))];
        return [...order.filter(c => all.includes(c)), ...all.filter(c => !order.includes(c))];
    };

    const categories = getOrderedCategories();

    const filteredItems = (() => {
        let base = selectedCategory ? menuItems.filter(i => i.category === selectedCategory) : menuItems;
        if (searchQuery) base = base.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
        return base.filter(i => i.is_available !== false);
    })();

    const orderTypeLabel = orderType === 'dine_in' ? 'Eat In' : 'Takeaway';

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col">
            {/* Header */}
            <div className="bg-gray-900 border-b border-white/[0.06] px-6 py-4 flex items-center gap-4 sticky top-0 z-20">
                <button onClick={onBack} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors">
                    <ArrowLeft className="h-5 w-5 text-white" />
                </button>
                <div className="flex-1">
                    <h1 className="text-white font-bold text-xl">{restaurant.name}</h1>
                    <span className="text-xs text-orange-400 font-medium">{orderTypeLabel}</span>
                </div>

                {/* Cart Button */}
                {cartCount > 0 && (
                    <button
                        onClick={onViewCart}
                        className="flex items-center gap-3 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-2xl transition-all shadow-lg shadow-orange-500/30 active:scale-95"
                    >
                        <ShoppingCart className="h-5 w-5" />
                        <span>{cartCount} item{cartCount > 1 ? 's' : ''}</span>
                        <span className="bg-white/20 px-2 py-0.5 rounded-lg text-sm">£{cartTotal.toFixed(2)}</span>
                        <ChevronRight className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Search Bar - Sticky below header */}
            <div className="bg-gray-900 border-b border-white/[0.06] px-6 py-3 sticky top-[73px] z-10">
                <div className="relative max-w-xl">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search menu..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-orange-500/50"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                            <X className="h-4 w-4 text-gray-500" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-1" style={{ overflow: 'hidden', minHeight: 0 }}>
                {/* Category Sidebar */}
                <div className="w-52 bg-gray-900 border-r border-white/[0.06] flex-shrink-0" style={{ overflowY: 'auto', height: '100%' }}>
                    <div className="p-3 space-y-1">
                        <button
                            onClick={() => setSelectedCategory('')}
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                                selectedCategory === ''
                                    ? 'bg-orange-500 text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            All Items
                        </button>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                                    selectedCategory === cat
                                        ? 'bg-orange-500 text-white'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Menu Grid */}
                <div className="flex-1 p-6" style={{ overflowY: 'auto', height: '100%' }}>
                    {selectedCategory && (
                        <h2 className="text-white text-2xl font-bold mb-6">{selectedCategory}</h2>
                    )}
                    {!selectedCategory && searchQuery && (
                        <h2 className="text-white text-xl font-bold mb-6">
                            Results for "<span className="text-orange-400">{searchQuery}</span>"
                        </h2>
                    )}
                    {filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center">
                            <ShoppingCart className="h-12 w-12 text-gray-700 mb-4" />
                            <p className="text-gray-400">No items found</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredItems.map(item => (
                                <KioskMenuCard
                                    key={item.id}
                                    item={item}
                                    cartCount={cart.filter(c => c.id === item.id).reduce((s, c) => s + c.quantity, 0)}
                                    onClick={() => setSelectedItem(item)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Cart Bar */}
            {cartCount > 0 && (
                <div className="bg-gray-900 border-t border-white/[0.06] px-6 py-4">
                    <button
                        onClick={onViewCart}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-5 rounded-2xl text-lg transition-all shadow-lg shadow-orange-500/30 active:scale-[0.98] flex items-center justify-between px-6"
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm">
                                {cartCount}
                            </div>
                            <span>View Order</span>
                        </div>
                        <span className="text-xl">£{cartTotal.toFixed(2)}</span>
                    </button>
                </div>
            )}

            {selectedItem && (
                <KioskItemModal
                    item={selectedItem}
                    onClose={() => setSelectedItem(null)}
                    onAdd={(item) => {
                        onAddItem(item);
                        setSelectedItem(null);
                    }}
                />
            )}
        </div>
    );
}

function KioskMenuCard({ item, cartCount, onClick }) {
    const price = item.pos_price != null ? item.pos_price : item.price;
    return (
        <button
            onClick={onClick}
            className="bg-gray-900 hover:bg-gray-800 border border-white/[0.06] hover:border-orange-500/40 rounded-2xl overflow-hidden transition-all active:scale-[0.97] text-left group relative"
        >
            {cartCount > 0 && (
                <div className="absolute top-2 right-2 z-10 w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-black shadow-lg">
                    {cartCount}
                </div>
            )}
            <div className="h-44 bg-gray-800 overflow-hidden">
                {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <ShoppingCart className="h-10 w-10 text-gray-600" />
                    </div>
                )}
            </div>
            <div className="p-4">
                <h3 className="text-white font-semibold text-sm line-clamp-2 mb-1 group-hover:text-orange-300 transition-colors">
                    {item.name}
                </h3>
                {item.description && (
                    <p className="text-gray-500 text-xs line-clamp-2 mb-2">{item.description}</p>
                )}
                <div className="flex items-center justify-between mt-auto">
                    <span className="text-orange-400 font-bold text-base">£{price.toFixed(2)}</span>
                    <div className="w-8 h-8 rounded-xl bg-orange-500/10 group-hover:bg-orange-500 flex items-center justify-center transition-colors">
                        <span className="text-orange-400 group-hover:text-white font-bold text-lg leading-none">+</span>
                    </div>
                </div>
                {item.is_popular && (
                    <span className="inline-block mt-2 text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full font-medium">
                        ⭐ Popular
                    </span>
                )}
            </div>
        </button>
    );
}