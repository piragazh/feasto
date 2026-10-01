import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import WidgetRenderer from './WidgetRenderer';
import { filterActiveContent } from './scheduleUtils';
import { useScreenManifest } from './ScreenManifestContext';

const EMPTY = [];

function ZoneRenderer({ zone, restaurant, content, widgetConfigs, restaurantId }) {
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [videoLoopCount, setVideoLoopCount] = useState(0);

    const zoneType = zone.type || zone.content_type || 'media';

    useEffect(() => { setVideoLoopCount(0); }, [carouselIndex]);

    // Keep the index valid if the content list shrinks
    useEffect(() => {
        if (content.length > 0 && carouselIndex >= content.length) setCarouselIndex(0);
    }, [content.length, carouselIndex]);

    const skipToNext = () => {
        if (content.length > 1) setCarouselIndex(i => (i + 1) % content.length);
    };

    const handleVideoEnd = (item) => {
        if (content.length <= 1) return;
        const targetLoops = item.video_loop_count || 1;
        setVideoLoopCount(prev => {
            const newCount = prev + 1;
            if (newCount >= targetLoops) {
                setTimeout(() => setCarouselIndex(i => (i + 1) % content.length), 100);
                return 0;
            }
            return newCount;
        });
    };

    // Auto-advance carousel
    useEffect(() => {
        if ((zoneType === 'carousel' || zoneType === 'media') && content.length > 1) {
            const item = content[carouselIndex % content.length];
            if (item?.media_type !== 'video') {
                const timer = setTimeout(() => setCarouselIndex(p => (p + 1) % content.length), (item?.duration || 10) * 1000);
                return () => clearTimeout(timer);
            }
        }
    }, [zoneType, content.length, carouselIndex]);

    // Find matching widget config for this zone type
    const getWidgetConfig = (type) => {
        const match = widgetConfigs.find(w => w.widget_type === type && w.is_active);
        return match ? (match.settings?.[type] || {}) : {};
    };

    const WIDGET_ZONE_TYPES = ['weather', 'clock', 'orders', 'stock_ticker', 'queue_status', 'countdown_timer', 'ticker'];

    const renderContent = () => {
        // If this zone type maps to a widget, use WidgetRenderer
        if (WIDGET_ZONE_TYPES.includes(zoneType)) {
            // Map legacy 'ticker' zone type to stock_ticker
            const widgetType = zoneType === 'ticker' ? 'stock_ticker' : zoneType;
            const config = getWidgetConfig(widgetType);
            return (
                <WidgetRenderer
                    widgetType={widgetType}
                    config={config}
                    restaurantId={restaurantId}
                    className="w-full h-full"
                />
            );
        }

        switch (zoneType) {
            case 'media':
            case 'carousel': {
                if (content.length === 0) return (
                    <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                        <p className="text-gray-600 text-sm">No media</p>
                    </div>
                );
                const item = content[carouselIndex % content.length];
                return (
                    <div className="relative w-full h-full">
                        {item.media_type === 'video' ? (
                            <video key={`${item.id}-${carouselIndex}`} src={item.media_url} autoPlay muted playsInline loop={content.length === 1} onEnded={() => handleVideoEnd(item)} onError={skipToNext} className="w-full h-full object-cover" />
                        ) : (
                            <img src={item.media_url} alt={item.title} onError={skipToNext} className="w-full h-full object-cover" />
                        )}
                        {zoneType === 'carousel' && content.length > 1 && (
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                                {content.map((_, idx) => (
                                    <div key={idx} className={`h-2 rounded-full transition-all ${idx === carouselIndex ? 'w-8 bg-white' : 'w-2 bg-white/50'}`} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            }

            case 'branding':
                return (
                    <div className="w-full h-full flex items-center justify-center bg-orange-600 px-4">
                        {restaurant?.logo_url ? (
                            <img src={restaurant.logo_url} alt={restaurant.name} className="max-h-full max-w-full object-contain" />
                        ) : (
                            <span className="text-white font-bold text-2xl truncate">{restaurant?.name}</span>
                        )}
                    </div>
                );

            case 'text':
                return (
                    <div className="w-full h-full flex items-center justify-center p-6 text-white bg-gray-900">
                        <div className="text-center">
                            <h2 className="text-3xl font-bold mb-2">{restaurant?.name}</h2>
                            <p className="text-lg opacity-80">{restaurant?.description}</p>
                        </div>
                    </div>
                );

            case 'menu':
                // Live POS menu board (same prices/availability as the till)
                return (
                    <WidgetRenderer
                        widgetType="menu_widget"
                        config={{ max_items: 6, columns: 1, ...getWidgetConfig('menu_widget'), ...(zone.config || {}) }}
                        restaurantId={restaurantId}
                        className="w-full h-full"
                    />
                );

            case 'live_orders':
                return (
                    <WidgetRenderer
                        widgetType="queue_status"
                        config={getWidgetConfig('queue_status')}
                        restaurantId={restaurantId}
                        className="w-full h-full"
                    />
                );

            default:
                return (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                        <p className="text-gray-500 text-xs">{zoneType}</p>
                    </div>
                );
        }
    };

    const pos = zone.position || { x: zone.x || 0, y: zone.y || 0, width: zone.width || 100, height: zone.height || 100 };

    return (
        <div
            className="absolute overflow-hidden"
            style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                width: `${pos.width}%`,
                height: `${pos.height}%`,
                borderRadius: `${zone.styling?.borderRadius || 0}px`
            }}
        >
            {renderContent()}
        </div>
    );
}

export default function MultiZoneDisplay({ restaurantId, screenName, layout }) {
    const manifest = useScreenManifest();
    const paired = !!manifest;

    const { data: queriedRestaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: () => base44.entities.Restaurant.filter({ id: restaurantId }).then(r => r[0]),
        enabled: !!restaurantId && !paired,
        staleTime: 60000,
    });
    const restaurant = paired ? manifest.restaurant : queriedRestaurant;

    const { data: queriedContent = EMPTY } = useQuery({
        // Own cache key: ScreenDisplay stores differently-shaped data under
        // ['screen-content', ...] and the two used to overwrite each other.
        queryKey: ['zone-content', restaurantId, screenName],
        queryFn: () => base44.entities.PromotionalContent.filter({
            restaurant_id: restaurantId,
            screen_name: screenName,
            is_active: true
        }),
        enabled: !!restaurantId && !!screenName && !paired,
        staleTime: 60000,
        refetchInterval: 60000,
    });
    const rawContent = paired ? (manifest.content || EMPTY) : queriedContent;

    // Re-check schedules every 30s
    const [scheduleTick, setScheduleTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setScheduleTick(n => n + 1), 30000);
        return () => clearInterval(t);
    }, []);

    const scheduled = useMemo(() => filterActiveContent(rawContent), [rawContent, scheduleTick]);
    const sig = scheduled.map(c => `${c.id}:${c.updated_date || ''}`).join('|');
    const allContent = useMemo(() => scheduled, [sig]);

    // Fetch all widget configurations for this restaurant
    const { data: queriedWidgetConfigs = EMPTY } = useQuery({
        queryKey: ['widget-configurations', restaurantId],
        queryFn: () => base44.entities.WidgetConfiguration.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId && !paired,
        staleTime: 60000,
        refetchInterval: 120000,
    });
    const widgetConfigs = paired ? (manifest.widget_configs || EMPTY) : queriedWidgetConfigs;

    // Per-zone playlists: items assigned to a zone (zone_id) play only there.
    // A media zone with nothing assigned plays the unassigned items, so screens
    // set up before zone playlists existed behave exactly as before.
    const contentByZone = useMemo(() => {
        const map = new Map();
        const unassigned = [];
        const zoneIds = new Set((layout?.zones || []).map(z => z.id));
        for (const item of allContent) {
            if (item.zone_id && zoneIds.has(item.zone_id)) {
                if (!map.has(item.zone_id)) map.set(item.zone_id, []);
                map.get(item.zone_id).push(item);
            } else {
                unassigned.push(item);   // no zone, or a zone this layout doesn't have
            }
        }
        return { map, unassigned };
    }, [allContent, layout]);

    if (!layout?.zones || layout.zones.length === 0) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
                <p className="text-xl">No layout configured</p>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen bg-black relative overflow-hidden">
            {layout.zones.map((zone) => (
                <ZoneRenderer
                    key={zone.id}
                    zone={zone}
                    restaurant={restaurant}
                    content={contentByZone.map.get(zone.id) || contentByZone.unassigned}
                    widgetConfigs={widgetConfigs}
                    restaurantId={restaurantId}
                />
            ))}
        </div>
    );
}