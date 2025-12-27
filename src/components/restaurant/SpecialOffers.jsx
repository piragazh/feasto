import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Tag, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SpecialOffers({ offers }) {
    if (!offers || offers.length === 0) return null;

    return (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-4 border border-orange-200">
            <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-orange-600" />
                <h3 className="font-bold text-gray-900">Special Offers</h3>
            </div>
            <div className="space-y-2">
                {offers.map((offer, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-start gap-3 bg-white rounded-lg p-3"
                    >
                        <Tag className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-gray-900">{offer.title}</h4>
                                {offer.discount && (
                                    <Badge className="bg-orange-500 text-white">{offer.discount}</Badge>
                                )}
                            </div>
                            <p className="text-sm text-gray-600">{offer.description}</p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}