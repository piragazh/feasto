import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Plus, Flame, Leaf, Gift } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MenuItemCardGrid({ item, promotion, onAddToCart }) {
    const isAvailable = item.is_available !== false;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={isAvailable ? { y: -3 } : {}}
            className={`menu-card-custom group rounded-2xl overflow-hidden transition-all duration-300 relative flex flex-col ${
                isAvailable
                    ? 'shadow-md hover:shadow-xl'
                    : 'bg-gray-50 border border-gray-200 opacity-60 grayscale'
            }`}
        >
            {/* Image */}
            <div className="relative w-full aspect-square bg-gray-100">
                {item.image_url ? (
                    <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center">
                        <span className="text-4xl">🍽️</span>
                    </div>
                )}
                {!isAvailable && (
                    <div className="absolute inset-0 bg-gray-900/60 flex items-center justify-center">
                        <Badge className="bg-red-500 text-white text-xs font-bold">OUT OF STOCK</Badge>
                    </div>
                )}
                {promotion && isAvailable && (
                    <div className="absolute top-2 left-2">
                        <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs gap-1 shadow-lg">
                            <Gift className="h-3 w-3" />
                            {promotion.promotion_type === 'buy_one_get_one' ? 'BOGO' : 'B2G1'}
                        </Badge>
                    </div>
                )}
                {isAvailable && (
                    <button
                        type="button"
                        onClick={() => { window.navigator?.vibrate?.([10]); onAddToCart(item); }}
                        className="add-to-cart-btn absolute bottom-2 right-2 h-10 w-10 rounded-full shadow-lg transition-all hover:scale-110 flex items-center justify-center text-white font-bold"
                    >
                        <Plus className="h-5 w-5" />
                    </button>
                )}
            </div>

            {/* Info */}
            <div className="p-3 flex flex-col gap-1 flex-1">
                <h3 className={`font-bold text-sm leading-tight ${isAvailable ? 'text-gray-900' : 'text-gray-500'}`}>
                    {item.name}
                </h3>
                {item.description && (
                    <p className="text-xs text-gray-500 line-clamp-2">{item.description}</p>
                )}
                <div className="flex items-center justify-between mt-auto pt-1">
                    <span className="font-extrabold text-base text-gray-900">£{item.price?.toFixed(2)}</span>
                    <div className="flex items-center gap-1">
                        {item.is_vegetarian && <Leaf className="h-3.5 w-3.5 text-green-600" />}
                        {item.is_spicy && <Flame className="h-3.5 w-3.5 text-red-600" />}
                        {item.is_popular && <span className="text-xs">⭐</span>}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}