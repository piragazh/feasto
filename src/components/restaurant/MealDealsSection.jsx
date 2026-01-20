import React from 'react';
import MealDealCard from './MealDealCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import useEmblaCarousel from 'embla-carousel-react';

export default function MealDealsSection({ deals, onAddToCart, onCustomize }) {
    const [emblaRef, emblaApi] = useEmblaCarousel({ 
        loop: false, 
        align: 'start',
        slidesToScroll: 1,
        containScroll: 'trimSnaps'
    });
    const [canScrollPrev, setCanScrollPrev] = React.useState(false);
    const [canScrollNext, setCanScrollNext] = React.useState(false);

    const scrollPrev = React.useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
    const scrollNext = React.useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

    const onSelect = React.useCallback(() => {
        if (!emblaApi) return;
        setCanScrollPrev(emblaApi.canScrollPrev());
        setCanScrollNext(emblaApi.canScrollNext());
    }, [emblaApi]);

    React.useEffect(() => {
        if (!emblaApi) return;
        onSelect();
        emblaApi.on('select', onSelect);
        emblaApi.on('reInit', onSelect);
    }, [emblaApi, onSelect]);

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
                <div className="overflow-hidden" ref={emblaRef}>
                    <div className="flex gap-4 touch-pan-y">
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