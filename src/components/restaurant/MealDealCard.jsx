import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Percent } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MealDealCard({ deal, onAddToCart, onCustomize }) {
    const discount = deal.original_price ? Math.round(((deal.original_price - deal.deal_price) / deal.original_price) * 100) : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="group relative bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border-2 border-orange-200 p-4 hover:shadow-xl transition-all duration-300"
        >
            <div className="absolute top-3 right-3">
                <Badge className="bg-orange-500 text-white">
                    <Percent className="h-3 w-3 mr-1" />
                    Save {discount}%
                </Badge>
            </div>

            <div className="flex gap-4">
                {deal.image_url && (
                    <img
                        src={deal.image_url}
                        alt={deal.name}
                        className="w-28 h-28 rounded-xl object-cover"
                    />
                )}
                
                <div className="flex-1">
                    <h3 className="font-bold text-lg text-gray-900 mb-1">{deal.name}</h3>
                    <p className="text-gray-600 text-sm mb-2 line-clamp-2">{deal.description}</p>
                    
                    <div className="flex items-center gap-3 mb-3">
                        <span className="text-gray-400 line-through text-sm">
                            £{deal.original_price?.toFixed(2)}
                        </span>
                        <span className="font-bold text-xl text-orange-600">
                            £{deal.deal_price?.toFixed(2)}
                        </span>
                    </div>

                    {deal.deal_type === 'category_based' && deal.category_rules?.length > 0 ? (
                        <p className="text-xs text-gray-500 mb-3">
                            {deal.category_rules.map(rule => rule.label || `${rule.quantity}x ${rule.category}`).join(' + ')}
                        </p>
                    ) : deal.items?.length > 0 ? (
                        <p className="text-xs text-gray-500 mb-3">
                            Includes: {deal.items.map(item => `${item.quantity}x ${item.name}`).join(', ')}
                        </p>
                    ) : null}

                    <Button
                        onClick={() => {
                            if (deal.deal_type === 'category_based' && onCustomize) {
                                onCustomize(deal);
                            } else {
                                onAddToCart(deal);
                            }
                        }}
                        size="sm"
                        className="bg-orange-500 hover:bg-orange-600"
                    >
                        <Plus className="h-4 w-4 mr-1" />
                        {deal.deal_type === 'category_based' ? 'Customize Deal' : 'Add Deal'}
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}