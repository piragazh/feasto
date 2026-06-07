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

export default function RestaurantCardDark({ restaurant, distance, showFavoriteButton = true }) {
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
            {showFavoriteButton && isAuthenticated && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleFavorite}
                    aria-label={isFavorite ? `Remove ${restaurant.name} from favourites` : `Add ${restaurant.name} to favourites`}
                    className="absolute top-3 right-3 z-10 bg-black/40 hover:bg-black/60 rounded-full h-8 w-8 md:h-10 md:w-10"
                >
                    <Heart className={`h-4 w-4 md:h-5 md:w-5 ${isFavorite ? 'fill-red-400 text-red-400' : 'text-white'}`} />
                </Button>
            )}
            <Link to={restaurantUrl}>
                <motion.div
                    whileHover={{ y: -6, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="group relative rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 h-52 md:h-60"
                >
                    {/* Background image */}
                    <img
                        src={restaurant.image_url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600'}
                        alt={restaurant.name}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />

                    {/* Dark gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                    {/* Closed overlay */}
                    {!restaurant.is_open && (
                        <div className="absolute inset-0 bg-black/65 flex items-center justify-center">
                            <span className="text-white font-semibold text-lg">Currently Closed</span>
                        </div>
                    )}

                    {/* Top badges */}
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                        {cuisines.map(ct => (
                            <Badge key={ct} className="bg-white/20 backdrop-blur-sm text-white border border-white/30 font-medium px-2 py-0.5 text-xs">
                                {ct}
                            </Badge>
                        ))}
                        {promotions.length > 0 && (
                            <Badge className="bg-orange-500 text-white font-medium px-2 py-0.5 text-xs animate-pulse">
                                <Tag className="h-3 w-3 mr-1 inline" />
                                {promotions.length} Deal{promotions.length > 1 ? 's' : ''}
                            </Badge>
                        )}
                    </div>

                    {/* Bottom content */}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                        <div className="flex items-end justify-between gap-2 mb-2.5">
                            <h3 className="font-bold text-xl md:text-2xl text-white leading-tight line-clamp-2 flex-1 drop-shadow-lg group-hover:text-orange-300 transition-colors">
                                {restaurant.name}
                            </h3>
                            <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm border border-white/30 px-2.5 py-1.5 rounded-xl flex-shrink-0">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="font-bold text-sm text-white">{restaurant.rating?.toFixed(1) || '4.5'}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                                <Clock className="h-3.5 w-3.5 text-blue-300" />
                                <span className="text-white text-xs font-medium">{restaurant.delivery_time || '25-35 min'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                                <Bike className="h-3.5 w-3.5 text-green-300" />
                                <span className="text-white text-xs font-semibold">{restaurant.delivery_fee ? `£${restaurant.delivery_fee.toFixed(2)}` : 'Free delivery'}</span>
                            </div>
                            {distance != null && (
                                <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                                    <MapPin className="h-3.5 w-3.5 text-orange-300" />
                                    <span className="text-white text-xs font-medium">{distance.toFixed(1)} mi</span>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </Link>
        </div>
    );
}