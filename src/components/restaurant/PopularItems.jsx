import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import MenuItemCard from './MenuItemCard';
import { Skeleton } from "@/components/ui/skeleton";
import useEmblaCarousel from 'embla-carousel-react';
import { Button } from "@/components/ui/button";

export default function PopularItems({ restaurantId, onItemClick }) {
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

    const { data: orders = [] } = useQuery({
        queryKey: ['restaurant-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: 'delivered'
        }, '-created_date', 100),
        enabled: !!restaurantId,
    });

    const { data: menuItems = [], isLoading } = useQuery({
        queryKey: ['menuItems', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    // Calculate item popularity based on order data
    const itemPopularity = React.useMemo(() => {
        const counts = {};
        orders.forEach(order => {
            order.items?.forEach(item => {
                const itemId = item.menu_item_id;
                counts[itemId] = (counts[itemId] || 0) + item.quantity;
            });
        });
        return counts;
    }, [orders]);

    // Get top 6 popular items
    const popularItems = React.useMemo(() => {
        return menuItems
            .map(item => ({
                ...item,
                orderCount: itemPopularity[item.id] || 0
            }))
            .filter(item => item.orderCount > 0)
            .sort((a, b) => b.orderCount - a.orderCount)
            .slice(0, 6);
    }, [menuItems, itemPopularity]);

    if (isLoading) {
        return (
            <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="h-6 w-6 text-orange-500" />
                    Popular Items
                </h2>
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (popularItems.length === 0) return null;

    const showCarousel = popularItems.length > 3;
    const displayItems = showCarousel ? popularItems : popularItems.slice(0, 3);

    return (
        <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <TrendingUp className="h-6 w-6 text-orange-500" />
                    Popular Items
                </h2>
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
                        {popularItems.map((item, index) => (
                            <div key={item.id} className="relative flex-[0_0_100%] min-w-0 sm:flex-[0_0_calc(50%-8px)] md:flex-[0_0_calc(33.333%-11px)]">
                                <div className="absolute -left-3 top-3 bg-orange-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm z-10 shadow-lg">
                                    {index + 1}
                                </div>
                                <MenuItemCard item={item} onAddToCart={onItemClick} />
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {displayItems.map((item, index) => (
                        <div key={item.id} className="relative">
                            <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-orange-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm z-10 shadow-lg">
                                {index + 1}
                            </div>
                            <MenuItemCard item={item} onAddToCart={onItemClick} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}