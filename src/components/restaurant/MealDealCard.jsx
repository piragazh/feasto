import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MealDealCard({ deal, onAddToCart, onCustomize, hasCustomization }) {
    const discount = deal.original_price && deal.original_price > deal.deal_price
        ? Math.round(((deal.original_price - deal.deal_price) / deal.original_price) * 100)
        : 0;
    const hasFixedItems = deal.items?.length > 0;
    const hasCategoryRules = deal.category_rules?.length > 0;
    const savings = deal.original_price && deal.original_price > deal.deal_price
        ? (deal.original_price - deal.deal_price).toFixed(2)
        : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="group relative bg-white rounded-xl border border-orange-100 overflow-hidden hover:shadow-lg transition-all duration-300 h-full flex flex-col"
        >
            {/* Savings badge */}
            {discount > 0 && (
                <div className="absolute top-2 left-2 z-10">
                    <Badge className="bg-green-500 text-white text-xs font-bold shadow">
                        Save {discount}%
                    </Badge>
                </div>
            )}

            {/* Image or gradient header */}
            {deal.image_url ? (
                <div className="relative h-32 overflow-hidden">
                    <img
                        src={deal.image_url}
                        alt={deal.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </div>
            ) : (
                <div className="h-16 bg-gradient-to-r from-orange-400 to-amber-400 flex items-center justify-center">
                    <span className="text-3xl">🍽️</span>
                </div>
            )}

            <div className="flex-1 p-3 flex flex-col">
                <div className="mb-2">
                    <h3 className="font-bold text-base text-gray-900 leading-tight mb-1">{deal.name}</h3>
                    {deal.description && (
                        <p className="text-gray-500 text-xs line-clamp-2">{deal.description}</p>
                    )}
                </div>

                {/* What's included */}
                <div className="flex-1 space-y-1 mb-3">
                    {hasCategoryRules && deal.category_rules.map((rule, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600 bg-orange-50 rounded-md px-2 py-1">
                            <span className="text-orange-500 font-bold">→</span>
                            <span className="font-medium">{rule.label || `Choose ${rule.quantity} ${rule.category}`}</span>
                        </div>
                    ))}
                    {hasFixedItems && deal.items.map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600 bg-blue-50 rounded-md px-2 py-1">
                            <span className="text-blue-400">•</span>
                            <span>{item.quantity}× {item.name}</span>
                        </div>
                    ))}
                </div>

                {/* Price & CTA */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                    <div>
                        {deal.original_price > 0 && (
                            <div className="text-xs text-gray-400 line-through">£{deal.original_price?.toFixed(2)}</div>
                        )}
                        <div className="font-bold text-xl text-orange-600 leading-tight">
                            £{deal.deal_price?.toFixed(2)}
                        </div>
                        {savings && (
                            <div className="text-xs text-green-600 font-medium">You save £{savings}</div>
                        )}
                    </div>

                    <Button
                        onClick={() => {
                            if (hasCategoryRules && onCustomize) {
                                onCustomize(deal);
                            } else {
                                onAddToCart(deal);
                            }
                        }}
                        size="sm"
                        className="bg-orange-500 hover:bg-orange-600 h-9 px-4 shrink-0"
                    >
                        {hasCategoryRules ? (
                            <>Choose <ChevronRight className="h-4 w-4 ml-1" /></>
                        ) : (
                            <><Plus className="h-4 w-4 mr-1" />Add</>
                        )}
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}