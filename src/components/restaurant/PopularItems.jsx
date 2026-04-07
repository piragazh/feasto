import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

export default function PopularItems({ restaurantId, onItemClick }) {
    const scrollRef = React.useRef(null);
    const [canScrollPrev, setCanScrollPrev] = React.useState(false);
    const [canScrollNext, setCanScrollNext] = React.useState(false);

    const updateButtons = React.useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollPrev(el.scrollLeft > 4);
        setCanScrollNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    }, []);

    React.useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        updateButtons();
        el.addEventListener('scroll', updateButtons, { passive: true });
        window.addEventListener('resize', updateButtons);
        return () => {
            el.removeEventListener('scroll', updateButtons);
            window.removeEventListener('resize', updateButtons);
        };
    }, [updateButtons]);

    const scroll = React.useCallback((dir) => {
        const el = scrollRef.current;
        if (!el) return;
        const cardWidth = el.firstElementChild?.offsetWidth || 200;
        el.scrollBy({ left: dir * (cardWidth + 12), behavior: 'smooth' });
    }, []);

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

    const popularItems = React.useMemo(() => {
        const counts = {};
        orders.forEach(order => {
            order.items?.forEach(item => {
                counts[item.menu_item_id] = (counts[item.menu_item_id] || 0) + item.quantity;
            });
        });
        return menuItems
            .map(item => ({ ...item, orderCount: counts[item.id] || 0 }))
            .filter(item => item.orderCount > 0 && item.is_available !== false)
            .sort((a, b) => b.orderCount - a.orderCount)
            .slice(0, 8);
    }, [menuItems, orders]);

    if (isLoading) {
        return (
            <div className="mb-10">
                <Skeleton className="h-7 w-52 mb-4 rounded-lg" />
                <div className="flex gap-3">
                    {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="flex-shrink-0 w-44 h-56 rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (popularItems.length === 0) return null;

    return (
        <div className="mb-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-0">
                <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                        <TrendingUp className="h-5 w-5 text-white" />
                    </div>
                    Popular Items
                </h2>
                <div className="flex gap-1.5">
                    <button
                        onClick={() => scroll(-1)}
                        disabled={!canScrollPrev}
                        className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center shadow-sm disabled:opacity-30 hover:border-gray-400 transition-colors"
                        aria-label="Scroll left"
                    >
                        <ChevronLeft className="h-4 w-4 text-gray-600" />
                    </button>
                    <button
                        onClick={() => scroll(1)}
                        disabled={!canScrollNext}
                        className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center shadow-sm disabled:opacity-30 hover:border-gray-400 transition-colors"
                        aria-label="Scroll right"
                    >
                        <ChevronRight className="h-4 w-4 text-gray-600" />
                    </button>
                </div>
            </div>

            {/* Carousel */}
            <div
                ref={scrollRef}
                className="flex gap-3 overflow-x-auto scroll-smooth scrollbar-hide snap-x snap-mandatory -mx-4 px-4"
            >
                {popularItems.map((item) => (
                    <PopularItemCard key={item.id} item={item} onClick={() => onItemClick(item)} />
                ))}
            </div>
        </div>
    );
}

function PopularItemCard({ item, onClick }) {
    const calories = item.nutrition?.calories;

    return (
        <button
            type="button"
            onClick={onClick}
            className="flex-shrink-0 w-44 snap-start text-left group focus:outline-none"
        >
            {/* Image container */}
            <div className="relative w-44 h-36 rounded-xl overflow-hidden bg-gray-100 mb-2">
                {item.image_url ? (
                    <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                        <span className="text-4xl">🍽️</span>
                    </div>
                )}
                {/* Teal + button overlay */}
                <div className="absolute bottom-2.5 right-2.5 w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-lg border border-gray-100 group-hover:scale-110 transition-transform duration-200">
                    <Plus className="h-5 w-5 text-orange-500 stroke-[2.5]" />
                </div>
                {/* Popular badge if marked */}
                {item.is_popular && (
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                        Popular
                    </div>
                )}
            </div>

            {/* Text */}
            <div className="px-0.5">
                <p className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 mb-1">
                    {item.name}
                </p>
                {calories && (
                    <p className="text-xs text-gray-500 mb-0.5">{calories} kcal</p>
                )}
                <p className="text-sm font-semibold text-gray-900">£{(item.price || 0).toFixed(2)}</p>
            </div>
        </button>
    );
}