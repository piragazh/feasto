import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Star, Clock, Bike, MapPin } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { motion } from 'framer-motion';

export default function RestaurantCard({ restaurant, distance }) {
    return (
        <Link to={createPageUrl('Restaurant') + `?id=${restaurant.id}`}>
            <motion.div
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl active:shadow-md transition-all duration-300 border border-gray-100"
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
                    <div className="absolute top-2 md:top-3 left-2 md:left-3">
                        <Badge className="bg-white/95 text-gray-800 hover:bg-white font-medium px-2 md:px-3 py-0.5 md:py-1 text-xs md:text-sm">
                            {restaurant.cuisine_type}
                        </Badge>
                    </div>
                    {restaurant.delivery_fee === 0 && (
                        <div className="absolute top-2 md:top-3 right-2 md:right-3">
                            <Badge className="bg-green-500 text-white hover:bg-green-600 font-medium px-2 md:px-3 py-0.5 md:py-1 text-xs md:text-sm">
                                Free Delivery
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
                
                <div className="p-3 md:p-4">
                    <div className="flex items-start justify-between mb-2 gap-2">
                        <h3 className="font-semibold text-base md:text-lg text-gray-900 group-hover:text-orange-500 transition-colors line-clamp-1 flex-1">
                            {restaurant.name}
                        </h3>
                        <div className="flex items-center gap-0.5 md:gap-1 bg-orange-50 px-1.5 md:px-2 py-0.5 md:py-1 rounded-lg whitespace-nowrap">
                            <Star className="h-3 w-3 md:h-4 md:w-4 fill-orange-400 text-orange-400" />
                            <span className="font-semibold text-xs md:text-sm text-gray-900">{restaurant.rating?.toFixed(1) || '4.5'}</span>
                            <span className="text-gray-500 text-xs md:text-sm hidden sm:inline">({restaurant.review_count || 0})</span>
                        </div>
                    </div>
                    
                    <p className="text-gray-500 text-xs md:text-sm mb-2 md:mb-3 line-clamp-1">{restaurant.description}</p>
                    
                    <div className="flex items-center gap-2 md:gap-4 text-xs md:text-sm text-gray-600">
                        <div className="flex items-center gap-1 md:gap-1.5">
                            <Clock className="h-3.5 w-3.5 md:h-4 md:w-4 text-gray-400" />
                            <span className="truncate">{restaurant.delivery_time || '25-35 min'}</span>
                        </div>
                        <div className="flex items-center gap-1 md:gap-1.5">
                            <Bike className="h-3.5 w-3.5 md:h-4 md:w-4 text-gray-400" />
                            <span>{restaurant.delivery_fee ? `£${restaurant.delivery_fee.toFixed(2)}` : 'Free'}</span>
                        </div>
                        {restaurant.minimum_order > 0 && (
                            <span className="text-gray-400 hidden md:inline">Min £{restaurant.minimum_order}</span>
                        )}
                    </div>
                </div>
            </motion.div>
        </Link>
    );
}