/**
 * Checkout recovery hook — safely restores cart & settings from localStorage with JSON corruption guards
 * Prevents silent crashes from malformed JSON (browser crash during write, etc.)
 */

import { useState } from 'react';

export function useCheckoutRecovery() {
    const [recoveryErrors, setRecoveryErrors] = useState([]);

    const safeParseJSON = (jsonString, fallback = null, description = 'data') => {
        if (!jsonString) return fallback;
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.error(`[Checkout] Corrupted ${description} JSON, cleared:`, e.message);
            setRecoveryErrors(prev => [...prev, description]);
            return fallback;
        }
    };

    const restoreCart = () => {
        const savedCart = localStorage.getItem('cart');
        if (!savedCart) return [];

        const parsed = safeParseJSON(savedCart, [], 'cart');
        if (!Array.isArray(parsed)) {
            console.warn('[Checkout] Cart is not an array, clearing');
            localStorage.removeItem('cart');
            return [];
        }
        return parsed;
    };

    const restoreRestaurantId = () => {
        return localStorage.getItem('cartRestaurantId');
    };

    const restoreRestaurantName = () => {
        return localStorage.getItem('cartRestaurantName');
    };

    const restoreGroupOrderId = () => {
        return localStorage.getItem('groupOrderId');
    };

    const restoreAddress = () => {
        return localStorage.getItem('userAddress');
    };

    const restoreCoordinates = () => {
        const savedCoords = localStorage.getItem('userCoordinates');
        if (!savedCoords) return null;

        const parsed = safeParseJSON(savedCoords, null, 'coordinates');
        if (parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
            return parsed;
        }
        // Invalid coordinates — clear storage
        localStorage.removeItem('userCoordinates');
        return null;
    };

    const restoreOrderType = () => {
        return localStorage.getItem('orderType') || 'delivery';
    };

    const restorePromotions = () => {
        const savedPromotions = localStorage.getItem('appliedPromotions');
        if (!savedPromotions) return [];

        const parsed = safeParseJSON(savedPromotions, [], 'promotions');
        if (!Array.isArray(parsed)) {
            localStorage.removeItem('appliedPromotions');
            return [];
        }
        return parsed;
    };

    return {
        restoreCart,
        restoreRestaurantId,
        restoreRestaurantName,
        restoreGroupOrderId,
        restoreAddress,
        restoreCoordinates,
        restoreOrderType,
        restorePromotions,
        recoveryErrors,
    };
}