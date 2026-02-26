import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function POSCategoryGrid({ categories, onSelectCategory, t, isDark }) {
    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-auto p-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {categories.map((category) => (
                        <button
                            key={category}
                            onClick={() => onSelectCategory(category)}
                            className={`aspect-square rounded-xl border-2 transition-all hover:shadow-lg active:scale-95 flex flex-col items-center justify-center text-center px-3 ${t.itemCard}`}
                        >
                            <div className={`text-sm sm:text-base font-semibold line-clamp-2 ${t.text}`}>
                                {category}
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}