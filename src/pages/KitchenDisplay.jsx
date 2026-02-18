import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import KitchenDisplaySystem from '@/components/kds/KitchenDisplaySystem';
import { UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';

export default function KitchenDisplay() {
    const [restaurant, setRestaurant] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadRestaurant();
    }, []);

    const loadRestaurant = async () => {
        try {
            const userData = await base44.auth.me();
            if (!userData) { base44.auth.redirectToLogin(); return; }

            const urlParams = new URLSearchParams(window.location.search);
            const urlRestaurantId = urlParams.get('restaurant_id') || urlParams.get('restaurantId');

            let restaurantId = urlRestaurantId;

            if (!restaurantId) {
                if (userData.role === 'admin') {
                    const all = await base44.entities.Restaurant.list();
                    restaurantId = all[0]?.id;
                } else {
                    // Check RestaurantManager
                    const managers = await base44.entities.RestaurantManager.filter({ user_email: userData.email, is_active: true });
                    if (managers.length > 0) {
                        restaurantId = managers[0].restaurant_ids?.[0];
                    } else {
                        // Check StaffMember
                        const staff = await base44.entities.StaffMember.filter({ email: userData.email, is_active: true });
                        if (staff.length > 0) restaurantId = staff[0].restaurant_id;
                    }
                }
            }

            if (!restaurantId) { toast.error('No restaurant found'); setLoading(false); return; }

            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            if (restaurants.length > 0) setRestaurant(restaurants[0]);
            else toast.error('Restaurant not found');
        } catch (e) {
            toast.error('Failed to load KDS');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-400 text-lg">Loading Kitchen Display…</p>
                </div>
            </div>
        );
    }

    if (!restaurant) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="text-center">
                    <UtensilsCrossed className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400 text-lg">No restaurant access</p>
                </div>
            </div>
        );
    }

    return <KitchenDisplaySystem restaurant={restaurant} />;
}