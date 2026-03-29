import React, { useCallback, useEffect, useRef, useState } from 'react';
import MealDealCard from './MealDealCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function MealDealsSection({ deals, onAddToCart, onCustomize }) {
    const scrollRef = React.useRef(null);
    const [canScrollPrev, setCanScrollPrev] = React.useState(false);
    const [canScrollNext, setCanScrollNext] = React.useState(false);

    const updateButtons = React.useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollPrev(el.scrollLeft > 0);
        setCanScrollNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    }, []);

    const scrollPrev = React.useCallback(() => {
        scrollRef.current?.scrollBy({ left: -320, behavior: 'smooth' });
    }, []);

    const scrollNext = React.useCallback(() => {
        scrollRef.current?.scrollBy({ left: 320, behavior: 'smooth' });
    }, []);

    React.useEffect(() => {
        updateButtons();
        const el = scrollRef.current;
        if (!el) return;
        el.addEventListener('scroll', updateButtons);
        window.addEventListener('resize', updateButtons);
        return () => {
            el.removeEventListener('scroll', updateButtons);
            window.removeEventListener('resize', updateButtons);
        };
    }, [updateButtons]);

    if (deals.length === 0) return null;

    const showCarousel = deals.length > 3;
    const displayDeals = showCarousel ? deals : deals.slice(0, 3);

    return (
        <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">🔥 Meal Deals</h2>
                {showCarousel && (
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={scrollPrev}
                            disabled={!canScrollPrev}
                            className="h-8 w-8 rounded-full"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={scrollNext}
                            disabled={!canScrollNext}
                            className="h-8 w-8 rounded-full"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </div>

            {showCarousel ? (
                <div
                    ref={scrollRef}
                    className="flex gap-4 overflow-x-auto scroll-smooth scrollbar-hide pb-2 touch-pan-y"
                >
                    {deals.map((deal) => (
                        <div key={deal.id} className="flex-[0_0_100%] min-w-0 sm:flex-[0_0_calc(50%-8px)] md:flex-[0_0_calc(33.333%-11px)]">
                            <MealDealCard 
                                deal={deal} 
                                onAddToCart={onAddToCart}
                                onCustomize={onCustomize}
                                hasCustomization={deal.category_rules?.length > 0}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-4">
                    {displayDeals.map((deal) => (
                        <MealDealCard 
                            key={deal.id} 
                            deal={deal} 
                            onAddToCart={onAddToCart}
                            onCustomize={onCustomize}
                            hasCustomization={deal.category_rules?.length > 0}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}