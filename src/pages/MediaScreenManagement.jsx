import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Monitor } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PromotionalContentManagement from '@/components/restaurant/PromotionalContentManagement';

export default function MediaScreenManagement() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [restaurant, setRestaurant] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);

            const urlParams = new URLSearchParams(window.location.search);
            const restaurantId = urlParams.get('restaurantId');

            if (userData.role === 'admin' && restaurantId) {
                const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
                setRestaurant(restaurants[0]);
            } else {
                const managers = await base44.entities.RestaurantManager.filter({ 
                    user_email: userData.email 
                });
                
                if (managers.length > 0) {
                    const restaurantIds = managers[0].restaurant_ids;
                    const restaurants = await base44.entities.Restaurant.filter({ 
                        id: restaurantIds[0] 
                    });
                    setRestaurant(restaurants[0]);
                }
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        }
    };

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <p className="text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    if (!restaurant) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <p className="text-gray-600">No restaurant found</p>
                </div>
            </div>
        );
    }



    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate(createPageUrl('RestaurantDashboard'))}
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">Media Screen Management</h1>
                                <p className="text-sm text-gray-500">{restaurant.name}</p>
                            </div>
                        </div>
                        <Monitor className="h-6 w-6 text-orange-500" />
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <PromotionalContentManagement restaurantId={restaurant.id} />
            </div>
        </div>
    );
}