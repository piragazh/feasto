import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Flame, Leaf } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MenuItemCard({ item, promotion, onAddToCart }) {
    const hasCustomizations = item.customization_options?.length > 0;
    const isAvailable = item.is_available !== false;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`group flex gap-4 p-4 rounded-2xl border transition-all duration-300 relative ${
                isAvailable 
                    ? 'bg-white border-gray-100 hover:border-orange-200 hover:shadow-lg' 
                    : 'bg-gray-50 border-gray-200 opacity-70 grayscale'
            }`}
        >
            {!isAvailable && (
                <div className="absolute top-2 right-2 z-10">
                    <Badge className="bg-red-500 text-white text-xs font-bold px-3 py-1">
                        OUT OF STOCK
                    </Badge>
                </div>
            )}
            
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className={`font-semibold ${isAvailable ? 'text-gray-900' : 'text-gray-500'}`}>
                        {item.name}
                    </h3>
                    {item.is_popular && isAvailable && (
                        <Badge className="bg-orange-100 text-orange-600 text-xs">Popular</Badge>
                    )}
                    {hasCustomizations && isAvailable && (
                        <Badge variant="outline" className="text-xs">Customizable</Badge>
                    )}
                </div>
                <p className="text-gray-500 text-sm mb-3 line-clamp-2">{item.description}</p>
                <div className="flex items-center gap-3">
                    <span className="font-bold text-lg text-gray-900">£{item.price?.toFixed(2)}</span>
                    {item.is_vegetarian && (
                        <div className="flex items-center gap-1 text-green-600">
                            <Leaf className="h-4 w-4" />
                            <span className="text-xs">Veg</span>
                        </div>
                    )}
                    {item.is_spicy && (
                        <div className="flex items-center gap-1 text-red-500">
                            <Flame className="h-4 w-4" />
                            <span className="text-xs">Spicy</span>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="relative">
                {item.image_url ? (
                    <div className="relative">
                        <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-28 h-28 rounded-xl object-cover"
                        />
                        {!isAvailable && (
                            <div className="absolute inset-0 bg-gray-900/50 rounded-xl flex items-center justify-center">
                                <span className="text-white text-xs font-bold">UNAVAILABLE</span>
                            </div>
                        )}
                        {isAvailable && (
                            <Button
                                onClick={() => onAddToCart(item)}
                                size="icon"
                                className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/30"
                            >
                                <Plus className="h-5 w-5" />
                            </Button>
                        )}
                    </div>
                ) : (
                    isAvailable && (
                        <Button
                            onClick={() => onAddToCart(item)}
                            size="icon"
                            className="h-10 w-10 rounded-full bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/30"
                        >
                            <Plus className="h-5 w-5" />
                        </Button>
                    )
                )}
            </div>
        </motion.div>
    );
}