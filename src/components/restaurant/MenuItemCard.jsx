import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Flame, Leaf, Gift, Settings2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MenuItemCard({ item, promotion, onAddToCart }) {
    const [expanded, setExpanded] = React.useState(false);
    const hasCustomizations = item.customization_options?.length > 0;
    const isAvailable = item.is_available !== false;
    const hasLongDescription = item.description && item.description.length > 100;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={isAvailable ? { y: -2, scale: 1.01 } : {}}
            className={`group flex gap-4 p-5 rounded-3xl transition-all duration-300 relative h-[180px] ${
                isAvailable 
                    ? 'bg-white shadow-md hover:shadow-2xl border-0' 
                    : 'bg-gray-50 border border-gray-200 opacity-70 grayscale'
            }`}
        >
            {!isAvailable && (
                <div className="absolute top-3 right-3 z-10">
                    <Badge className="bg-red-500 text-white text-xs font-bold px-4 py-1.5 shadow-lg">
                        OUT OF STOCK
                    </Badge>
                </div>
            )}
            
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className={`font-bold text-lg ${isAvailable ? 'text-gray-900' : 'text-gray-500'}`}>
                        {item.name}
                    </h3>
                    {promotion && isAvailable && (
                        <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs gap-1 animate-pulse shadow-lg">
                            <Gift className="h-3 w-3" />
                            {promotion.promotion_type === 'buy_one_get_one' ? 'BOGO' : 'B2G1'}
                        </Badge>
                    )}
                    {item.is_popular && isAvailable && (
                        <Badge className="bg-gradient-to-r from-orange-100 to-orange-200 text-orange-700 text-xs font-semibold border-0">⭐ Popular</Badge>
                    )}
                    {hasCustomizations && isAvailable && (
                        <div className="text-orange-500 bg-orange-50 p-1.5 rounded-lg">
                            <Settings2 className="h-4 w-4" />
                        </div>
                    )}
                </div>
                {item.description && (
                    <div className="mb-4">
                        <p className={`text-gray-600 text-sm leading-relaxed ${!expanded && hasLongDescription ? 'line-clamp-2' : ''}`}>
                            {item.description}
                        </p>
                        {hasLongDescription && (
                            <button
                                onClick={() => setExpanded(!expanded)}
                                className="text-orange-600 hover:text-orange-700 text-xs font-semibold mt-1.5"
                            >
                                {expanded ? 'Show less' : 'Read more'}
                            </button>
                        )}
                    </div>
                )}
                <div className="flex items-center gap-4 flex-wrap">
                    <span className="font-extrabold text-xl text-gray-900 whitespace-nowrap">£{item.price?.toFixed(2)}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                        {item.is_vegetarian && (
                            <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded-lg">
                                <Leaf className="h-3.5 w-3.5 text-green-600" />
                                <span className="text-xs font-medium text-green-700">Veg</span>
                            </div>
                        )}
                        {item.is_spicy && (
                            <div className="flex items-center gap-1 bg-red-50 px-2 py-1 rounded-lg">
                                <Flame className="h-3.5 w-3.5 text-red-600" />
                                <span className="text-xs font-medium text-red-700">Spicy</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="relative flex-shrink-0">
                {item.image_url ? (
                    <div className="relative">
                        <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-32 h-32 rounded-2xl object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        {!isAvailable && (
                            <div className="absolute inset-0 bg-gray-900/60 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                                <span className="text-white text-xs font-bold">UNAVAILABLE</span>
                            </div>
                        )}
                        {isAvailable && (
                            <Button
                                onClick={() => onAddToCart(item)}
                                size="icon"
                                className="absolute -bottom-2 -right-2 h-12 w-12 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-xl shadow-orange-500/40 transition-all hover:scale-110"
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
                            className="h-12 w-12 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-xl shadow-orange-500/40 transition-all hover:scale-110"
                        >
                            <Plus className="h-5 w-5" />
                        </Button>
                    )
                )}
            </div>
        </motion.div>
    );
}