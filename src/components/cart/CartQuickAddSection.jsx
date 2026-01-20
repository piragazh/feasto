import React from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function CartQuickAddSection({ quickAddItems, onAddToCart, onClose }) {
    if (!quickAddItems || quickAddItems.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-3 py-2.5 sm:px-6 sm:py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-orange-200"
        >
            <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-1 px-2 py-0.5 sm:px-3 sm:py-1 bg-orange-500 text-white rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap">
                        <Zap className="h-3 w-3" />
                        <span>QUICK ADD</span>
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-gray-700 hidden sm:block">Popular items - Add to order quickly!</p>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-2 md:grid-cols-3 gap-1.5 sm:gap-2">
                    {quickAddItems.slice(0, 6).map((item) => (
                        <motion.div
                            key={item.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            <Button
                                onClick={() => {
                                    onAddToCart(item);
                                    toast.success(`✨ ${item.name} added!`, {
                                        duration: 2000,
                                        style: {
                                            background: '#f97316',
                                            color: '#fff',
                                            fontWeight: '600',
                                            padding: '12px',
                                            borderRadius: '8px'
                                        }
                                    });
                                }}
                                variant="outline"
                                className="w-full h-auto flex flex-col items-start gap-1 p-1.5 sm:p-2 bg-white hover:bg-orange-50 border-orange-200 group text-left"
                            >
                                <span className="text-[10px] sm:text-xs font-medium text-gray-900 line-clamp-2 leading-tight">{item.name}</span>
                                <div className="flex items-center justify-between w-full">
                                    <span className="text-[9px] sm:text-xs text-gray-600 font-semibold">£{item.price.toFixed(2)}</span>
                                    <Plus className="h-3 w-3 text-orange-500 flex-shrink-0" />
                                </div>
                            </Button>
                        </motion.div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}