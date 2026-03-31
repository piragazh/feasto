/**
 * Checkout initialization hook — safely restores cart and form data from localStorage
 * with corruption guards to prevent silent crashes on malformed JSON
 */

import { useEffect } from 'react';
import { useCheckoutRecovery } from '@/hooks/useCheckoutRecovery';

export function useCheckoutInit({
    setCart,
    setRestaurantId,
    setRestaurantName,
    loadRestaurantName,
    setGroupOrderId,
    setFormData,
    setDeliveryCoordinates,
    setOrderType,
    setAppliedPromotions,
    setPointsPerPound,
    base44,
}) {
    const {
        restoreCart,
        restoreRestaurantId,
        restoreRestaurantName,
        restoreGroupOrderId,
        restoreAddress,
        restoreCoordinates,
        restoreOrderType,
        restorePromotions,
    } = useCheckoutRecovery();

    useEffect(() => {
        // Restore cart with JSON corruption guard
        const cart = restoreCart();
        if (cart.length > 0) {
            setCart(cart);
        }

        // Restore restaurant info
        const restaurantId = restoreRestaurantId();
        if (restaurantId) {
            setRestaurantId(restaurantId);
            loadRestaurantName(restaurantId);
        }

        // Restore group order session
        const groupOrderId = restoreGroupOrderId();
        if (groupOrderId) {
            setGroupOrderId(groupOrderId);
        }

        // Restore previously entered address
        const address = restoreAddress();
        if (address) {
            setFormData(prev => ({ ...prev, delivery_address: address }));
        }

        // Restore address coordinates with JSON corruption guard
        const coords = restoreCoordinates();
        if (coords) {
            setDeliveryCoordinates(coords);
        }

        // Restore order type
        setOrderType(restoreOrderType());

        // Restore applied promotions with JSON corruption guard
        const promotions = restorePromotions();
        if (promotions.length > 0) {
            setAppliedPromotions(promotions);
        }

        // Load loyalty points per pound setting
        base44.entities.SystemSettings.filter({ setting_key: 'loyalty_points_per_pound' })
            .then(results => {
                if (results?.[0]?.setting_value) setPointsPerPound(parseFloat(results[0].setting_value) || 1);
            })
            .catch(() => {});
    }, []); // Only on mount
}