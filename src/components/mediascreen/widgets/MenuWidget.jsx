import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { scheduledPrice } from '@/lib/pos-schedule-logic';
import { whyNotSellable, sellsAt, nextOpening } from '@/lib/item-availability';
import { useScreenManifest } from '../ScreenManifestContext';

/**
 * Live menu board — driven by the POS menu.
 *
 * Uses the SAME rules as the till (src/lib/pos-schedule-logic.js and
 * src/lib/item-availability.js), so the board always matches what the till charges:
 *  - price = till price (pos_price, else price), lowered by any active timed
 *    price window (happy hour / lunch deal) — shown with the normal price struck through
 *  - items switched off or auto-86'd (out of stock) are hidden, or shown "Sold out"
 *  - items outside their availability hours are hidden, or shown "Back at 17:00"
 *  - online-only items never appear on an in-store board
 * Re-evaluated every minute; long menus page automatically.
 *
 * Config (all optional, backwards compatible):
 *   title, category_filter ('all' | name), categories [names], max_items (per page),
 *   page_seconds, show_prices, show_images, show_descriptions, columns (1-3),
 *   theme (dark|light|branded), refresh_interval (s), show_unavailable
 */

const THEMES = {
    dark:    { bg: 'bg-gray-950', header: 'bg-gray-900', text: 'text-white', sub: 'text-gray-400', card: 'bg-gray-900', border: 'border-gray-800', price: 'text-orange-400', badge: 'bg-orange-500 text-white', cat: 'text-orange-400' },
    light:   { bg: 'bg-white',    header: 'bg-gray-100', text: 'text-gray-900', sub: 'text-gray-500', card: 'bg-gray-50', border: 'border-gray-200', price: 'text-orange-600', badge: 'bg-orange-500 text-white', cat: 'text-orange-600' },
    branded: { bg: 'bg-orange-950', header: 'bg-orange-900', text: 'text-white', sub: 'text-orange-300', card: 'bg-orange-900', border: 'border-orange-800', price: 'text-yellow-400', badge: 'bg-yellow-400 text-orange-950', cat: 'text-yellow-400' },
};

const gbp = (n) => `£${Number(n || 0).toFixed(2)}`;

export default function MenuWidget({ config = {}, restaurantId, className = '' }) {
    const {
        category_filter = 'all',
        categories: categoryList,
        max_items = 12,
        page_seconds = 12,
        show_prices = true,
        show_images = true,
        show_descriptions = true,
        columns = 2,
        theme = 'dark',
        refresh_interval = 60,
        title = 'Our Menu',
        show_unavailable = false,
    } = config;

    const manifest = useScreenManifest();
    const manifestItems = manifest?.menu_items;
    const [fetchedItems, setFetchedItems] = useState(null);
    const [now, setNow] = useState(() => new Date());
    const [page, setPage] = useState(0);

    // Legacy URL mode: read the menu directly (paired screens get it in the manifest)
    useEffect(() => {
        if (manifestItems || !restaurantId) return;
        let cancelled = false;
        const load = async () => {
            try {
                const all = await base44.entities.MenuItem.filter({ restaurant_id: restaurantId });
                if (!cancelled) setFetchedItems(all);
            } catch {
                if (!cancelled) setFetchedItems(prev => prev || []);
            }
        };
        load();
        const interval = setInterval(load, Math.max(30, Number(refresh_interval) || 60) * 1000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [restaurantId, refresh_interval, manifestItems]);

    // Prices and availability change with the clock (happy hour, breakfast menu…)
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(t);
    }, []);

    const rawItems = manifestItems || fetchedItems;
    const loading = !rawItems;

    const wantedCategories = useMemo(() => {
        if (Array.isArray(categoryList) && categoryList.length) return new Set(categoryList);
        if (category_filter && category_filter !== 'all') return new Set([category_filter]);
        return null;
    }, [categoryList, category_filter]);

    const items = useMemo(() => {
        if (!rawItems) return [];
        return rawItems
            .filter(item => sellsAt(item, 'till'))                       // never online-only items
            .filter(item => !wantedCategories || wantedCategories.has(item.category))
            .map(item => {
                const why = whyNotSellable(item, 'till', now);
                const base = Number(item.pos_price != null ? item.pos_price : item.price) || 0;
                const price = why ? base : scheduledPrice(base, item, now);
                return {
                    ...item,
                    _why: why,
                    _base: base,
                    _price: price,
                    _deal: !why && price < base,
                    _backAt: why === 'hours' ? nextOpening(item, now) : null,
                };
            })
            .filter(item => show_unavailable || !item._why)
            .sort((a, b) =>
                String(a.category || '').localeCompare(String(b.category || '')) ||
                (Number(a.menu_item_no) || 0) - (Number(b.menu_item_no) || 0) ||
                String(a.name || '').localeCompare(String(b.name || ''))
            );
    }, [rawItems, wantedCategories, show_unavailable, now]);

    const perPage = Math.max(1, Number(max_items) || 12);
    const pageCount = Math.max(1, Math.ceil(items.length / perPage));

    useEffect(() => {
        if (page >= pageCount) setPage(0);
        if (pageCount <= 1) return;
        const t = setTimeout(() => setPage(p => (p + 1) % pageCount), Math.max(5, Number(page_seconds) || 12) * 1000);
        return () => clearTimeout(t);
    }, [page, pageCount, page_seconds]);

    const visible = items.slice((page % pageCount) * perPage, (page % pageCount) * perPage + perPage);

    // Group the visible page by category, keeping order
    const groups = useMemo(() => {
        const out = [];
        for (const item of visible) {
            const cat = item.category || 'Menu';
            const last = out[out.length - 1];
            if (last && last.category === cat) last.items.push(item);
            else out.push({ category: cat, items: [item] });
        }
        return out;
    }, [visible]);

    const t = THEMES[theme] || THEMES.dark;
    const cols = Math.min(3, Math.max(1, Number(columns) || 2));
    const gridCols = cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-2' : 'grid-cols-3';
    const showCategoryHeadings = !wantedCategories || wantedCategories.size > 1;

    if (loading) return (
        <div className={`${t.bg} h-full flex items-center justify-center ${className}`}>
            <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className={`${t.bg} h-full w-full flex flex-col overflow-hidden ${className}`}>
            {/* Header */}
            <div className={`${t.header} px-6 py-4 flex items-center justify-between flex-shrink-0 border-b ${t.border}`}>
                <h2 className={`font-black text-2xl md:text-4xl tracking-tight ${t.text}`}>{title}</h2>
                {pageCount > 1 && (
                    <div className="flex gap-1.5" aria-hidden="true">
                        {Array.from({ length: pageCount }).map((_, i) => (
                            <span key={i} className={`h-2 rounded-full transition-all ${i === page % pageCount ? 'w-6 bg-orange-500' : 'w-2 bg-gray-500/50'}`} />
                        ))}
                    </div>
                )}
            </div>

            {/* Items */}
            <div className="flex-1 overflow-hidden px-5 py-4 space-y-4">
                {groups.map(group => (
                    <section key={`${group.category}-${page}`}>
                        {showCategoryHeadings && (
                            <h3 className={`text-sm md:text-lg font-extrabold uppercase tracking-widest mb-2 ${t.cat}`}>{group.category}</h3>
                        )}
                        <div className={`grid ${gridCols} gap-3`}>
                            {group.items.map(item => {
                                const off = !!item._why;
                                return (
                                    <div
                                        key={item.id}
                                        className={`${t.card} rounded-2xl border ${t.border} flex items-center gap-4 p-3 md:p-4 ${off ? 'opacity-50' : ''}`}
                                    >
                                        {show_images && item.image_url && (
                                            <img
                                                src={item.image_url}
                                                alt=""
                                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                className="w-16 h-16 md:w-24 md:h-24 rounded-xl object-cover flex-shrink-0"
                                            />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className={`font-bold text-lg md:text-2xl leading-tight ${t.text} ${off ? 'line-through' : ''}`}>{item.name}</p>
                                                {show_prices && !off && (
                                                    <div className="text-right flex-shrink-0">
                                                        {item._deal && (
                                                            <span className={`block text-xs md:text-sm line-through ${t.sub}`}>{gbp(item._base)}</span>
                                                        )}
                                                        <span className={`font-black text-xl md:text-3xl ${t.price}`}>{gbp(item._price)}</span>
                                                    </div>
                                                )}
                                            </div>
                                            {show_descriptions && item.description && (
                                                <p className={`text-sm md:text-base mt-1 line-clamp-2 ${t.sub}`}>{item.description}</p>
                                            )}
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {item._deal && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500 text-white">Deal now</span>}
                                                {item._why === 'unavailable' && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">Sold out</span>}
                                                {item._why === 'hours' && (
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-600 text-white">
                                                        {item._backAt ? `Back at ${item._backAt}` : 'Not available now'}
                                                    </span>
                                                )}
                                                {!off && item.is_popular && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">Popular</span>}
                                                {!off && item.is_vegetarian && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">Vegetarian</span>}
                                                {!off && item.is_spicy && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">Spicy</span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}
                {items.length === 0 && (
                    <div className={`text-center py-12 ${t.sub} text-lg`}>Menu coming soon</div>
                )}
            </div>
        </div>
    );
}
