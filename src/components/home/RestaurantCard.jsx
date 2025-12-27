import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Star, Clock, Bike, MapPin } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { motion } from 'framer-motion';

export default function RestaurantCard({ restaurant, distance }) {
    return (
        <Link to={createPageUrl(`Restaurant?id=${restaurant.id}`)}>
            <motion.div
                whileHover={{ y: -4 }}
                className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100"
            >
                <div className="relative h-48 overflow-hidden">
                    <img
                        src={restaurant.image_url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600'}
                        alt={restaurant.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    {!restaurant.is_open && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <span className="text-white font-semibold text-lg">Currently Closed</span>
                        </div>
                    )}
                    <div className="absolute top-3 left-3">
                        <Badge className="bg-white/95 text-gray-800 hover:bg-white font-medium px-3 py-1">
                            {restaurant.cuisine_type}
                        </Badge>
                    </div>
                    {restaurant.delivery_fee === 0 && (
                        <div className="absolute top-3 right-3">
                            <Badge className="bg-green-500 text-white hover:bg-green-600 font-medium px-3 py-1">
                                Free Delivery
                            </Badge>
                        </div>
                    )}
                    {distance !== null && distance !== undefined && (
                        <div className="absolute bottom-3 right-3">
                            <Badge className="bg-orange-500 text-white font-medium px-3 py-1">
                                <MapPin className="h-3 w-3 mr-1 inline" />
                                {distance.toFixed(1)} mi
                            </Badge>
                        </div>
                    )}
                </div>
                
                <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-lg text-gray-900 group-hover:text-orange-500 transition-colors">
                            {restaurant.name}
                        </h3>
                        <div className="flex items-center gap-1 bg-orange-50 px-2 py-1 rounded-lg">
                            <Star className="h-4 w-4 fill-orange-400 text-orange-400" />
                            <span className="font-semibold text-sm text-gray-900">{restaurant.rating?.toFixed(1) || '4.5'}</span>
                            <span className="text-gray-500 text-sm">({restaurant.review_count || 0})</span>
                        </div>
                    </div>
                    
                    <p className="text-gray-500 text-sm mb-3 line-clamp-1">{restaurant.description}</p>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-gray-400" />
                            <span>{restaurant.delivery_time || '25-35 min'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Bike className="h-4 w-4 text-gray-400" />
                            <span>{restaurant.delivery_fee ? `£${restaurant.delivery_fee.toFixed(2)}` : 'Free'}</span>
                        </div>
                        {restaurant.minimum_order > 0 && (
                            <span className="text-gray-400">Min £{restaurant.minimum_order}</span>
                        )}
                    </div>
                </div>
            </motion.div>
        </Link>
    );
}