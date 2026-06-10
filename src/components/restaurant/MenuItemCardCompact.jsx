import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Flame, Leaf, Gift } from 'lucide-react';

export default function MenuItemCardCompact({ item, promotion, onAddToCart }) {
    const isAvailable = item.is_available !== false;

    return (
        <div className={`flex items-center justify-between gap-3 py-3 px-4 border-b last:border-b-0 transition-colors ${
            isAvailable ? 'hover:bg-gray-50' : 'opacity-60 bg-gray-50'
        }`}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`font-semibold text-sm ${isAvailable ? 'text-gray-900' : 'text-gray-500'}`}>
                        {item.name}
                    </span>
                    {promotion && isAvailable && (
                        <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs gap-0.5 px-1.5 py-0.5">
                            <Gift className="h-2.5 w-2.5" />
                            {promotion.promotion_type === 'buy_one_get_one' ? 'BOGO' : 'B2G1'}
                        </Badge>
                    )}
                    {item.is_popular && isAvailable && <span className="text-xs">⭐</span>}
                    {item.is_vegetarian && <Leaf className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />}
                    {item.is_spicy && <Flame className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />}
                </div>
                {item.description && (
                    <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{item.description}</p>
                )}
                <span className="font-bold text-sm text-gray-900 mt-0.5 block">£{item.price?.toFixed(2)}</span>
            </div>

            {item.image_url && (
                <img
                    src={item.image_url}
                    alt={item.name}
                    className={`w-14 h-14 rounded-xl object-cover flex-shrink-0 ${!isAvailable ? 'grayscale' : ''}`}
                />
            )}

            {isAvailable ? (
                <Button
                    onClick={() => { window.navigator?.vibrate?.([10]); onAddToCart(item); }}
                    size="icon"
                    className="add-to-cart-btn h-9 w-9 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-md flex-shrink-0"
                >
                    <Plus className="h-4 w-4" />
                </Button>
            ) : (
                <Badge variant="outline" className="text-xs flex-shrink-0">Unavailable</Badge>
            )}
        </div>
    );
}