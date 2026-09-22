import { stockState } from '@/lib/pos-stock-logic';
import React from 'react';
import { Input } from "@/components/ui/input";
import { ShoppingCart, Search } from 'lucide-react';

/**
 * Tile colour accent.
 *
 * Rendered as a thick LEFT STRIPE rather than a full background fill. A full
 * fill fights the food photography and the price, which are what staff actually
 * read; a stripe gives the at-a-glance grouping (all drinks blue, all sides amber)
 * without competing with either. Colour is read before text, which is where the
 * speed comes from on a menu used every day.
 *
 * Full literal class strings so Tailwind's JIT keeps them - building
 * `border-l-${c}-500` dynamically would be purged from the production CSS.
 */
const TILE_STRIPE = {
    red:    'border-l-[6px] border-l-red-500',
    orange: 'border-l-[6px] border-l-orange-500',
    amber:  'border-l-[6px] border-l-amber-500',
    green:  'border-l-[6px] border-l-green-500',
    teal:   'border-l-[6px] border-l-teal-500',
    blue:   'border-l-[6px] border-l-blue-500',
    purple: 'border-l-[6px] border-l-purple-500',
    pink:   'border-l-[6px] border-l-pink-500',
};

/**
 * Grid density.
 *
 * A 15" landscape till and a 10" iPad want very different numbers of items on
 * screen, and the grid used one fixed size for both. A busy takeaway with a long
 * menu wants to see more at once; a small screen, or staff with less confidence,
 * want bigger targets.
 *
 * Stored per DEVICE, like light/dark and sound - it depends on the physical
 * screen, not the restaurant. Two tills in one shop can reasonably differ.
 *
 * Compact still keeps tiles well above the 44px touch floor; the saving comes
 * from shorter tiles and more columns, not smaller targets.
 */
const DENSITY = {
    comfortable: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[220px] gap-3',
    standard:    'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[200px] gap-3',
    compact:     'grid-cols-3 md:grid-cols-4 lg:grid-cols-6 auto-rows-[160px] gap-2',
};

export default function POSMenuGrid({ filteredItems, searchQuery, onSearchChange, onSearchFocus, onItemClick, t, density = 'standard' }) {
    return (
        <div className={`col-span-1 md:col-span-7 ${t.panel} border rounded-2xl overflow-hidden flex flex-col`}>
            <div className={`p-3 border-b ${t.panelHead} flex-shrink-0`}>
                <div className="relative">
                    <ShoppingCart className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${t.textSub}`} />
                    <Input
                        data-pos-search
                        type="text"
                        aria-label="Search menu items"
                        aria-keyshortcuts="/"
                        placeholder="Search menu items…  ( / )"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        onFocus={onSearchFocus}
                        className={`${t.searchBg} h-11 pl-9 rounded-xl focus:ring-0`}
                    />
                </div>
            </div>

            {/* Empty state. A blank grid gives no clue whether the search matched
                nothing, the category is empty, or the menu failed to load - during
                service staff need to know which. */}
            {filteredItems.length === 0 && (
                <div className={`flex-1 flex flex-col items-center justify-center text-center px-6 ${t.textSub}`}>
                    <Search className="h-12 w-12 mb-3 opacity-20" />
                    {searchQuery ? (
                        <>
                            <p className="text-sm font-semibold">No items match &ldquo;{searchQuery}&rdquo;</p>
                            <button
                                onClick={() => onSearchChange('')}
                                className="text-orange-500 text-xs font-semibold mt-2 underline"
                            >
                                Clear search
                            </button>
                        </>
                    ) : (
                        <>
                            <p className="text-sm font-semibold">No items in this category</p>
                            <p className="text-xs mt-1 opacity-70">Add items in Menu Management, or pick another category.</p>
                        </>
                    )}
                </div>
            )}

            <div className={`flex-1 overflow-y-auto p-3 grid ${DENSITY[density] || DENSITY.standard} content-start ${filteredItems.length === 0 ? 'hidden' : ''}`}>
                {filteredItems.map(item => {
                    const effectivePrice = item.pos_price != null ? item.pos_price : item.price;
                    // A live timed offer (happy hour etc) takes precedence: strike
                    // through the item's NORMAL till price, not its online price.
                    const onOffer = item._base_price != null;
                    const struckPrice = onOffer ? item._base_price : item.price;
                    const hasPosOverride = onOffer || (item.pos_price != null && item.pos_price !== item.price);
                    const hasOptions = item.customization_options?.length > 0;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onItemClick(item)}
                            title={item.name}
                            className={`${t.itemCard} border rounded-2xl overflow-hidden transition-all group text-left hover:shadow-lg active:scale-[0.97] flex flex-col h-full relative ${TILE_STRIPE[item.pos_tile_color] || ''}`}
                        >
                            {/* Image. Fixed 50% of tile height so every tile lines up
                                regardless of whether an item has a photo. */}
                            <div className={`h-[55%] flex-shrink-0 w-full ${t.itemImg} overflow-hidden relative`}>
                                {item.image_url ? (
                                    <img
                                        src={item.image_url}
                                        alt=""
                                        loading="lazy"
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        // A broken URL otherwise renders the browser's
                                        // broken-image glyph plus alt text, which looks
                                        // like a bug mid-service. Fall back to the
                                        // placeholder instead.
                                        onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
                                    />
                                ) : null}
                                <div
                                    className="w-full h-full items-center justify-center absolute inset-0"
                                    style={{ display: item.image_url ? 'none' : 'flex' }}
                                >
                                    <ShoppingCart className={`h-8 w-8 ${t.textSub} opacity-40`} />
                                </div>
                                {/* Flags an item that opens the options dialog, so staff
                                    know a tap won't add straight to the cart. */}
                                {hasOptions && (
                                    <span className="absolute top-1.5 right-1.5 bg-black/60 text-white text-[11px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                                        OPTIONS
                                    </span>
                                )}
                                {/* Live offer label so staff can tell the customer why
                                    the price is lower - and so nobody is surprised
                                    when it reverts at the end of the window. */}
                                {/* Low stock: shown so staff can warn a customer before
                                    promising the last portion. Sold-out items never reach
                                    here - they are already off sale. */}
                                {stockState(item) === 'low' && (
                                    <span className="absolute bottom-1.5 left-1.5 bg-amber-500 text-black text-[11px] font-bold px-1.5 py-0.5 rounded-md">
                                        {Math.floor(Number(item.stock_quantity))} left
                                    </span>
                                )}
                                {onOffer && (
                                    <span className="absolute top-1.5 left-1.5 bg-green-600 text-white text-[11px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide">
                                        {item._price_label}
                                    </span>
                                )}
                            </div>

                            <div className="px-2.5 py-2 flex flex-col flex-1 min-h-0">
                                {/* Name is deliberately quieter than the price: staff
                                    scan tiles by price and photo, and a bold name
                                    competing with a bold price slows that down. */}
                                <h3 className={`font-medium text-[13px] line-clamp-2 leading-tight transition-colors ${t.itemName}`}>
                                    {item.name}
                                </h3>
                                {/* Price pinned bottom-right: it is the value staff scan
                                    for, and a consistent position across tiles makes it
                                    findable without reading each card. */}
                                <div className="mt-auto pt-1 flex items-baseline justify-end gap-1.5">
                                    {hasPosOverride && (
                                        <span className={`text-[11px] line-through ${t.textMuted}`}>
                                            £{Number(struckPrice).toFixed(2)}
                                        </span>
                                    )}
                                    <span className="text-orange-500 font-bold text-xl tabular-nums leading-none">
                                        £{effectivePrice.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}