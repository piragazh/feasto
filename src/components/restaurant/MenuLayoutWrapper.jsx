import React from 'react';
import MenuItemCard from './MenuItemCard';
import MenuItemCardGrid from './MenuItemCardGrid';
import MenuItemCardCompact from './MenuItemCardCompact';

/**
 * offHours: Map of item id -> when it next comes on ("17:00", "Fri 17:00", or
 * '' if not this week). Those items stay on the menu, so customers can see a
 * dinner menu at lunch, but are greyed out and cannot be added - the server
 * would refuse them (item-availability.js).
 */
export default function MenuLayoutWrapper({ items, layout, getPromotion, onAddToCart, offHours }) {
    const Card = layout === 'grid' ? MenuItemCardGrid : layout === 'compact' ? MenuItemCardCompact : MenuItemCard;

    const render = (item) => {
        const card = (
            <Card
                key={item.id}
                item={item}
                promotion={getPromotion(item.id)}
                onAddToCart={onAddToCart}
            />
        );
        if (!offHours?.has(item.id)) return card;
        const opens = offHours.get(item.id);
        const label = opens ? `Available from ${opens}` : 'Not available now';
        return (
            <div key={item.id} className="relative" aria-disabled="true" title={label}>
                <div className="opacity-50 grayscale pointer-events-none select-none" inert="">
                    {card}
                </div>
                <span className="absolute top-2 right-2 z-10 rounded-full bg-gray-900/85 text-white text-xs font-semibold px-2.5 py-1 shadow">
                    {label}
                </span>
            </div>
        );
    };

    if (layout === 'grid') {
        return <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{items.map(render)}</div>;
    }
    if (layout === 'compact') {
        return <div className="menu-card-custom rounded-2xl shadow-md overflow-hidden">{items.map(render)}</div>;
    }
    // Default: list
    return <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{items.map(render)}</div>;
}
