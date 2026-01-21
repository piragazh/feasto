import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import POSAdminLayout from '@/components/pos-admin/POSAdminLayout';
import POSAdminDashboard from '@/components/pos-admin/POSAdminDashboard';
import POSAdminOrders from '@/components/pos-admin/POSAdminOrders';
import POSAdminMenu from '@/components/pos-admin/POSAdminMenu';

export default function POSAdmin() {
    const [user, setUser] = useState(null);
    const [restaurant, setRestaurant] = useState(null);
    const [currentSection, setCurrentSection] = useState('dashboard');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadUserAndRestaurant();
    }, []);

    const loadUserAndRestaurant = async () => {
        try {
            const userData = await base44.auth.me();
            if (!userData) {
                base44.auth.redirectToLogin();
                return;
            }

            // Only admins can access POS Admin
            if (userData.role !== 'admin') {
                toast.error('Admin access required');
                base44.auth.redirectToLogin();
                return;
            }

            setUser(userData);

            // Get restaurant from URL param or first restaurant
            const urlParams = new URLSearchParams(window.location.search);
            const restaurantId = urlParams.get('restaurantId');

            let restId = restaurantId;
            if (!restId) {
                const restaurants = await base44.entities.Restaurant.list();
                restId = restaurants[0]?.id;
            }

            if (restId) {
                const restaurantData = await base44.entities.Restaurant.filter({ id: restId });
                if (restaurantData?.[0]) {
                    setRestaurant(restaurantData[0]);
                }
            }

            setIsLoading(false);
        } catch (e) {
            console.error('Error loading POS Admin:', e);
            toast.error('Failed to load POS Admin');
            setTimeout(() => base44.auth.redirectToLogin(), 1500);
        }
    };

    if (isLoading || !user || !restaurant) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading POS Admin...</p>
                </div>
            </div>
        );
    }

    const renderSection = () => {
        switch (currentSection) {
            case 'dashboard':
                return <POSAdminDashboard restaurantId={restaurant.id} />;
            case 'orders':
                return <POSAdminOrders restaurantId={restaurant.id} />;
            case 'menu':
                return <POSAdminMenu restaurantId={restaurant.id} />;
            case 'tables':
                return <div className="text-gray-500">Tables management coming soon</div>;
            case 'staff':
                return <div className="text-gray-500">Staff management coming soon</div>;
            case 'payments':
                return <div className="text-gray-500">Payments coming soon</div>;
            case 'settings':
                return <div className="text-gray-500">Settings coming soon</div>;
            default:
                return <POSAdminDashboard restaurantId={restaurant.id} />;
        }
    };

    return (
        <POSAdminLayout
            currentSection={currentSection}
            onNavigate={setCurrentSection}
            restaurant={restaurant}
            user={user}
        >
            {renderSection()}
        </POSAdminLayout>
    );
}