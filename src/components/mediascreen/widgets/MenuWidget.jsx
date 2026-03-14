import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const THEMES = {
    dark:    { bg: 'bg-gray-900', header: 'bg-gray-800', text: 'text-white', sub: 'text-gray-400', card: 'bg-gray-800', border: 'border-gray-700', price: 'text-orange-400', badge: 'bg-orange-500 text-white' },
    light:   { bg: 'bg-white',    header: 'bg-gray-100', text: 'text-gray-900', sub: 'text-gray-500', card: 'bg-gray-50', border: 'border-gray-200', price: 'text-orange-600', badge: 'bg-orange-500 text-white' },
    branded: { bg: 'bg-orange-950', header: 'bg-orange-900', text: 'text-white', sub: 'text-orange-300', card: 'bg-orange-900', border: 'border-orange-800', price: 'text-yellow-400', badge: 'bg-yellow-400 text-orange-950' },
};

export default function MenuWidget({ config = {}, restaurantId, className = '' }) {
    const {
        category_filter = 'all',
        max_items = 12,
        show_prices = true,
        show_images = true,
        columns = 2,
        theme = 'dark',
        refresh_interval = 60,
        title = 'Our Menu',
        show_unavailable = false,
    } = config;

    const [items, setItems] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            if (!restaurantId) { setLoading(false); return; }
            try {
                const all = await base44.entities.MenuItem.filter({ restaurant_id: restaurantId });
                const available = show_unavailable ? all : all.filter(i => i.is_available !== false);
                const cats = [...new Set(available.map(i => i.category).filter(Boolean))];
                setCategories(cats);
                const filtered = category_filter === 'all'
                    ? available
                    : available.filter(i => i.category === category_filter);
                setItems(filtered.slice(0, max_items));
            } catch {}
            finally { setLoading(false); }
        };
        load();
        const interval = setInterval(load, refresh_interval * 1000);
        return () => clearInterval(interval);
    }, [restaurantId, category_filter, max_items, show_unavailable, refresh_interval]);

    const t = THEMES[theme] || THEMES.dark;
    const gridCols = columns === 1 ? 'grid-cols-1' : 'grid-cols-2';

    if (loading) return (
        <div className={`${t.bg} h-full flex items-center justify-center ${className}`}>
            <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className={`${t.bg} h-full flex flex-col overflow-hidden ${className}`}>
            {/* Header */}
            <div className={`${t.header} px-4 py-3 flex items-center justify-between flex-shrink-0 border-b ${t.border}`}>
                <h2 className={`font-black text-lg tracking-tight ${t.text}`}>{title}</h2>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.badge}`}>
                    {items.length} items
                </span>
            </div>

            {/* Items Grid */}
            <div className={`flex-1 overflow-hidden p-3 grid ${gridCols} gap-2 content-start`}>
                {items.map(item => (
                    <div
                        key={item.id}
                        className={`${t.card} rounded-xl overflow-hidden border ${t.border} flex ${columns === 1 ? 'flex-row items-center gap-3 p-3' : 'flex-col'}`}
                    >
                        {show_images && item.image_url && (
                            <img
                                src={item.image_url}
                                alt={item.name}
                                className={columns === 1 ? 'w-14 h-14 rounded-lg object-cover flex-shrink-0' : 'w-full h-24 object-cover'}
                            />
                        )}
                        <div className={columns === 1 ? 'flex-1 min-w-0' : 'p-2.5 flex-1'}>
                            <p className={`font-bold text-sm leading-tight truncate ${t.text}`}>{item.name}</p>
                            {item.description && (
                                <p className={`text-xs mt-0.5 line-clamp-1 ${t.sub}`}>{item.description}</p>
                            )}
                            <div className="flex items-center justify-between mt-1.5 gap-2">
                                {show_prices && (
                                    <span className={`font-black text-base ${t.price}`}>
                                        £{(item.price || 0).toFixed(2)}
                                    </span>
                                )}
                                {item.is_available === false && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                                        Unavailable
                                    </span>
                                )}
                                {item.is_popular && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                                        Popular
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                {items.length === 0 && (
                    <div className={`col-span-full text-center py-8 ${t.sub} text-sm`}>No menu items found</div>
                )}
            </div>
        </div>
    );
}