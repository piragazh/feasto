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
            className="group relative bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-200 p-3 hover:shadow-lg transition-all duration-300"
        >
            <div className="flex gap-3">
                {deal.image_url && (
                    <img
                        src={deal.image_url}
                        alt={deal.name}
                        className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                    />
                )}
                
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-bold text-base text-gray-900">{deal.name}</h3>
                        <Badge className="bg-orange-500 text-white text-xs flex-shrink-0">
                            <Percent className="h-3 w-3 mr-1" />
                            {discount}%
                        </Badge>
                    </div>
                    
                    <p className="text-gray-600 text-xs mb-2 line-clamp-1">{deal.description}</p>
                    
                    {deal.deal_type === 'category_based' && deal.category_rules?.length > 0 ? (
                        <p className="text-xs text-gray-500 mb-2 line-clamp-1">
                            {deal.category_rules.map(rule => rule.label || `${rule.quantity}x ${rule.category}`).join(' + ')}
                        </p>
                    ) : deal.items?.length > 0 ? (
                        <p className="text-xs text-gray-500 mb-2 line-clamp-1">
                            {deal.items.map(item => `${item.quantity}x ${item.name}`).join(', ')}
                        </p>
                    ) : null}

                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 line-through text-xs">
                                £{deal.original_price?.toFixed(2)}
                            </span>
                            <span className="font-bold text-lg text-orange-600">
                                £{deal.deal_price?.toFixed(2)}
                            </span>
                        </div>
                        
                        <Button
                            onClick={() => {
                                if (deal.deal_type === 'category_based' && onCustomize) {
                                    onCustomize(deal);
                                } else {
                                    onAddToCart(deal);
                                }
                            }}
                            size="sm"
                            className="bg-orange-500 hover:bg-orange-600 h-8"
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            {deal.deal_type === 'category_based' ? 'Customize' : 'Add'}
                        </Button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}