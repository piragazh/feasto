import React from 'react';
import MenuItemCard from './MenuItemCard';
import MenuItemCardGrid from './MenuItemCardGrid';
import MenuItemCardCompact from './MenuItemCardCompact';

export default function MenuLayoutWrapper({ items, layout, getPromotion, onAddToCart }) {
    if (layout === 'grid') {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {items.map(item => (
                    <MenuItemCardGrid
                        key={item.id}
                        item={item}
                        promotion={getPromotion(item.id)}
                        onAddToCart={onAddToCart}
                    />
                ))}
            </div>
        );
    }

    if (layout === 'compact') {
        return (
            <div className="menu-card-custom rounded-2xl shadow-md overflow-hidden">
                {items.map(item => (
                    <MenuItemCardCompact
                        key={item.id}
                        item={item}
                        promotion={getPromotion(item.id)}
                        onAddToCart={onAddToCart}
                    />
                ))}
            </div>
        );
    }

    // Default: list
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {items.map(item => (
                <MenuItemCard
                    key={item.id}
                    item={item}
                    promotion={getPromotion(item.id)}
                    onAddToCart={onAddToCart}
                />
            ))}
        </div>
    );
}