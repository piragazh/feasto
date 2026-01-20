import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import CartQuickAddSection from './CartQuickAddSection';

export default function CartQuickAddContainer({ restaurantId, onAddToCart, onClose }) {
    const { data: quickAddItems = [] } = useQuery({
        queryKey: ['quick-add-items', restaurantId],
        queryFn: async () => {
            if (!restaurantId) return [];
            try {
                const items = await base44.entities.MenuItem.filter({
                    restaurant_id: restaurantId,
                    show_in_cart_quick_add: true,
                    is_available: true
                });
                return items.slice(0, 6); // Show top 6 items
            } catch (error) {
                console.error('Failed to fetch quick add items:', error);
                return [];
            }
        },
        enabled: !!restaurantId,
        staleTime: 5 * 60 * 1000 // Cache for 5 minutes
    });

    return (
        <CartQuickAddSection 
            quickAddItems={quickAddItems} 
            onAddToCart={onAddToCart}
            onClose={onClose}
        />
    );
}