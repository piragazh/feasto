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
            className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-orange-200"
        >
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-orange-500 text-white rounded-full text-xs font-bold">
                        <Zap className="h-3.5 w-3.5" />
                        QUICK ADD
                    </div>
                    <p className="text-sm font-medium text-gray-700">Popular items - Add to order quickly!</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {quickAddItems.map((item) => (
                        <motion.div
                            key={item.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            <Button
                                onClick={() => {
                                    onAddToCart(item);
                                    toast.success(`✨ ${item.name} added to cart!`, {
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
                                className="w-full h-auto flex flex-col items-start gap-1.5 p-2 bg-white hover:bg-orange-50 border-orange-200 group"
                            >
                                <div className="flex items-center justify-between w-full">
                                    <span className="text-xs font-medium text-gray-900 line-clamp-1">{item.name}</span>
                                    <Plus className="h-3.5 w-3.5 text-orange-500 group-hover:scale-110 transition-transform" />
                                </div>
                                <div className="flex items-center justify-between w-full">
                                    <span className="text-xs text-gray-500">£{item.price.toFixed(2)}</span>
                                </div>
                            </Button>
                        </motion.div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}