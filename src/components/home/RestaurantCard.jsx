import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Star, Clock, Bike, MapPin, Heart, Tag } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { isWithinInterval } from 'date-fns';

export default function RestaurantCard({ restaurant, distance, showFavoriteButton = true }) {
    const restaurantUrl = `${createPageUrl('Restaurant')}?id=${restaurant.id}`;
    const [isFavorite, setIsFavorite] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userEmail, setUserEmail] = useState(null);
    
    // Fetch active promotions for this restaurant
    const { data: promotions = [] } = useQuery({
        queryKey: ['restaurant-promotions', restaurant.id],
        queryFn: async () => {
            const promos = await base44.entities.Promotion.filter({ 
                restaurant_id: restaurant.id,
                is_active: true 
            });
            // Filter for currently active promotions
            const now = new Date();
            return promos.filter(p => {
                const start = new Date(p.start_date);
                const end = new Date(p.end_date);
                return isWithinInterval(now, { start, end }) && 
                       (!p.usage_limit || p.usage_count < p.usage_limit);
            });
        },
    });
    
    useEffect(() => {
        checkFavoriteStatus();
    }, [restaurant.id]);

    const checkFavoriteStatus = async () => {
        try {
            const authenticated = await base44.auth.isAuthenticated();
            setIsAuthenticated(authenticated);
            
            if (authenticated) {
                const user = await base44.auth.me();
                setUserEmail(user.email);
                
                const favorites = await base44.entities.Favorite.filter({
                    user_email: user.email,
                    restaurant_id: restaurant.id
                });
                setIsFavorite(favorites.length > 0);
            }
        } catch (e) {
            // Not authenticated
        }
    };

    const toggleFavorite = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!isAuthenticated) {
            toast.error('Please sign in to favorite restaurants');
            base44.auth.redirectToLogin();
            return;
        }

        try {
            if (isFavorite) {
                const favorites = await base44.entities.Favorite.filter({
                    user_email: userEmail,
                    restaurant_id: restaurant.id
                });
                if (favorites[0]) {
                    await base44.entities.Favorite.delete(favorites[0].id);
                    setIsFavorite(false);
                    toast.success('Removed from favorites');
                }
            } else {
                await base44.entities.Favorite.create({
                    user_email: userEmail,
                    restaurant_id: restaurant.id,
                    restaurant_name: restaurant.name
                });
                setIsFavorite(true);
                toast.success('Added to favorites');
            }
        } catch (error) {
            toast.error('Failed to update favorites');
        }
    };
    
    return (
        <div className="relative">
            {showFavoriteButton && isAuthenticated && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleFavorite}
                    className="absolute top-2 right-2 z-10 bg-white/90 hover:bg-white rounded-full shadow-md h-8 w-8 md:h-10 md:w-10"
                >
                    <Heart className={`h-4 w-4 md:h-5 md:w-5 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-600'}`} />
                </Button>
            )}
            <Link to={restaurantUrl}>
                <motion.div
                    whileHover={{ y: -6, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="group bg-white rounded-3xl overflow-hidden shadow-md hover:shadow-2xl active:shadow-lg transition-all duration-300 border-0"
                >
                    <div className="relative h-40 md:h-48 overflow-hidden">
                        <img
                            src={restaurant.image_url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600'}
                            alt={restaurant.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        {!restaurant.is_open && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <span className="text-white font-semibold text-sm md:text-lg">Currently Closed</span>
                            </div>
                        )}
                        <div className="absolute top-3 left-3">
                            <Badge className="bg-white/95 backdrop-blur-sm text-gray-900 hover:bg-white font-semibold px-3 py-1.5 text-xs shadow-lg border-0">
                                {restaurant.cuisine_type}
                            </Badge>
                        </div>
                        {promotions.length > 0 && (
                            <div className="absolute top-2 md:top-3 right-2 md:right-3">
                                <Badge className="bg-orange-500 text-white hover:bg-orange-600 font-medium px-2 md:px-3 py-0.5 md:py-1 text-xs md:text-sm animate-pulse">
                                    <Tag className="h-3 w-3 mr-1 inline" />
                                    {promotions.length} {promotions.length === 1 ? 'Deal' : 'Deals'}
                                </Badge>
                            </div>
                        )}
                        {distance !== null && distance !== undefined && (
                            <div className="absolute bottom-2 md:bottom-3 right-2 md:right-3">
                                <Badge className="bg-orange-500 text-white font-medium px-2 md:px-3 py-0.5 md:py-1 text-xs md:text-sm">
                                    <MapPin className="h-3 w-3 mr-1 inline" />
                                    {distance.toFixed(1)} mi
                                </Badge>
                            </div>
                        )}
                    </div>
                    
                    <div className="p-4 md:p-5">
                        <div className="flex items-start justify-between mb-3 gap-2">
                            <h3 className="font-bold text-lg md:text-xl text-gray-900 group-hover:text-orange-600 transition-colors line-clamp-1 flex-1">
                                {restaurant.name}
                            </h3>
                            <div className="flex items-center gap-1 bg-gradient-to-br from-orange-50 to-orange-100 px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-sm">
                                <Star className="h-4 w-4 fill-orange-500 text-orange-500" />
                                <span className="font-bold text-sm text-gray-900">{restaurant.rating?.toFixed(1) || '4.5'}</span>
                                <span className="text-gray-600 text-xs hidden sm:inline">({restaurant.review_count || 0})</span>
                            </div>
                        </div>
                        
                        <p className="text-gray-600 text-sm mb-4 line-clamp-2 leading-relaxed">{restaurant.description}</p>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-600 pt-3 border-t border-gray-100">
                            <div className="flex items-center gap-1.5">
                                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                                    <Clock className="h-4 w-4 text-blue-600" />
                                </div>
                                <span className="font-medium truncate">{restaurant.delivery_time || '25-35 min'}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                                    <Bike className="h-4 w-4 text-green-600" />
                                </div>
                                <span className="font-bold">{restaurant.delivery_fee ? `£${restaurant.delivery_fee.toFixed(2)}` : 'Free'}</span>
                            </div>
                            {restaurant.minimum_order > 0 && (
                                <span className="text-gray-400 text-xs hidden lg:inline ml-auto">Min £{restaurant.minimum_order}</span>
                            )}
                        </div>
                    </div>
                </motion.div>
            </Link>
        </div>
    );
}