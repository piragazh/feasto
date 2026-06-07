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

export default function RestaurantCardHorizontal({ restaurant, distance, showFavoriteButton = true }) {
    const restaurantUrl = `${createPageUrl('Restaurant')}?id=${restaurant.id}`;
    const [isFavorite, setIsFavorite] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userEmail, setUserEmail] = useState(null);

    const { data: promotions = [] } = useQuery({
        queryKey: ['restaurant-promotions', restaurant.id],
        queryFn: async () => {
            const promos = await base44.entities.Promotion.filter({ restaurant_id: restaurant.id, is_active: true });
            const now = new Date();
            return promos.filter(p => {
                return isWithinInterval(now, { start: new Date(p.start_date), end: new Date(p.end_date) }) &&
                    (!p.usage_limit || p.usage_count < p.usage_limit);
            });
        },
    });

    useEffect(() => {
        (async () => {
            try {
                const authenticated = await base44.auth.isAuthenticated();
                setIsAuthenticated(authenticated);
                if (authenticated) {
                    const user = await base44.auth.me();
                    setUserEmail(user.email);
                    const favorites = await base44.entities.Favorite.filter({ user_email: user.email, restaurant_id: restaurant.id });
                    setIsFavorite(favorites.length > 0);
                }
            } catch (e) {}
        })();
    }, [restaurant.id]);

    const toggleFavorite = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isAuthenticated) {
            toast.error('Please sign in to favorite restaurants');
            base44.auth.redirectToLogin();
            return;
        }
        const prev = isFavorite;
        setIsFavorite(!prev);
        try {
            if (prev) {
                const favs = await base44.entities.Favorite.filter({ user_email: userEmail, restaurant_id: restaurant.id });
                if (favs[0]) await base44.entities.Favorite.delete(favs[0].id);
            } else {
                await base44.entities.Favorite.create({ user_email: userEmail, restaurant_id: restaurant.id, restaurant_name: restaurant.name });
            }
        } catch {
            setIsFavorite(prev);
            toast.error('Failed to update favorites');
        }
    };

    const cuisines = (restaurant.cuisine_types?.length ? restaurant.cuisine_types : restaurant.cuisine_type ? [restaurant.cuisine_type] : []).slice(0, 2);

    return (
        <div className="relative">
            <Link to={restaurantUrl}>
                <motion.div
                    whileHover={{ y: -2, scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className="group bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 flex h-32 md:h-36"
                >
                    {/* Image */}
                    <div className="relative w-[38%] flex-shrink-0">
                        <img
                            src={restaurant.image_url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400'}
                            alt={restaurant.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        {!restaurant.is_open && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <span className="text-white font-semibold text-xs">Closed</span>
                            </div>
                        )}
                        {promotions.length > 0 && (
                            <div className="absolute top-1.5 left-1.5">
                                <Badge className="bg-orange-500 text-white font-medium px-1.5 py-0.5 text-[10px] shadow">
                                    <Tag className="h-2.5 w-2.5 mr-0.5 inline" />
                                    {promotions.length} Deal{promotions.length > 1 ? 's' : ''}
                                </Badge>
                            </div>
                        )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-3 md:p-4 flex flex-col justify-between min-w-0">
                        <div>
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                                <h3 className="font-bold text-base md:text-lg text-gray-900 group-hover:text-orange-600 transition-colors line-clamp-1 flex-1 leading-tight">
                                    {restaurant.name}
                                </h3>
                                <div className="flex items-center gap-0.5 bg-orange-50 px-2 py-1 rounded-lg flex-shrink-0">
                                    <Star className="h-3.5 w-3.5 fill-orange-500 text-orange-500" />
                                    <span className="font-bold text-xs text-gray-900">{restaurant.rating?.toFixed(1) || '4.5'}</span>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-1 mb-2">
                                {cuisines.map(ct => (
                                    <Badge key={ct} variant="secondary" className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium border-0">
                                        {ct}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-600">
                            <div className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                                <span className="truncate">{restaurant.delivery_time || '25-35 min'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Bike className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                <span className="font-semibold">{restaurant.delivery_fee ? `£${restaurant.delivery_fee.toFixed(2)}` : 'Free'}</span>
                            </div>
                            {distance != null && (
                                <div className="flex items-center gap-1 ml-auto">
                                    <MapPin className="h-3 w-3 text-orange-400 flex-shrink-0" />
                                    <span>{distance.toFixed(1)} mi</span>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </Link>

            {showFavoriteButton && isAuthenticated && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleFavorite}
                    aria-label={isFavorite ? `Remove ${restaurant.name} from favourites` : `Add ${restaurant.name} to favourites`}
                    className="absolute top-2 right-2 z-10 bg-white/90 hover:bg-white rounded-full shadow-md h-7 w-7"
                >
                    <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-600'}`} />
                </Button>
            )}
        </div>
    );
}