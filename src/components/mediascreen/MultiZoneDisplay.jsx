import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Cloud, CloudRain, CloudSnow, Sun, Wind } from 'lucide-react';
import WidgetRenderer from './WidgetRenderer';

function ZoneRenderer({ zone, restaurant, content, weather, widgetConfigs, restaurantId }) {
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [videoLoopCount, setVideoLoopCount] = useState(0);

    const zoneType = zone.type || zone.content_type || 'media';

    // Clock tick
    useEffect(() => {
        if (zoneType === 'clock') {
            const timer = setInterval(() => setCurrentTime(new Date()), 1000);
            return () => clearInterval(timer);
        }
    }, [zoneType]);

    useEffect(() => { setVideoLoopCount(0); }, [carouselIndex]);

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

    const getWeatherIcon = (desc = '') => {
        const d = desc.toLowerCase();
        if (d.includes('rain')) return <CloudRain className="h-8 w-8" />;
        if (d.includes('snow')) return <CloudSnow className="h-8 w-8" />;
        if (d.includes('cloud')) return <Cloud className="h-8 w-8" />;
        if (d.includes('wind')) return <Wind className="h-8 w-8" />;
        return <Sun className="h-8 w-8" />;
    };

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
                            <video key={`${item.id}-${carouselIndex}`} src={item.media_url} autoPlay muted loop={content.length === 1} onEnded={() => handleVideoEnd(item)} className="w-full h-full object-cover" />
                        ) : (
                            <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
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
                return (
                    <div className="w-full h-full overflow-hidden p-6 text-white bg-gray-900">
                        <h3 className="text-2xl font-bold mb-4">Today's Specials</h3>
                        <div className="space-y-3">
                            {content.slice(0, 6).map((item, idx) => (
                                <div key={idx} className="bg-white/10 rounded-lg p-3">
                                    <h4 className="font-semibold">{item.title}</h4>
                                    {item.description && <p className="text-sm opacity-80 mt-1">{item.description}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
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
    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: () => base44.entities.Restaurant.filter({ id: restaurantId }).then(r => r[0]),
        enabled: !!restaurantId,
        staleTime: 60000,
    });

    const { data: allContent = [] } = useQuery({
        queryKey: ['screen-content', restaurantId, screenName],
        queryFn: async () => {
            const content = await base44.entities.PromotionalContent.filter({
                restaurant_id: restaurantId,
                screen_name: screenName,
                is_active: true
            });
            return content.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        },
        enabled: !!restaurantId && !!screenName,
        staleTime: 60000,
        refetchInterval: 60000,
    });

    // Fetch all widget configurations for this restaurant
    const { data: widgetConfigs = [] } = useQuery({
        queryKey: ['widget-configurations', restaurantId],
        queryFn: () => base44.entities.WidgetConfiguration.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
        staleTime: 60000,
        refetchInterval: 120000,
    });

    const { data: weather } = useQuery({
        queryKey: ['weather', restaurant?.latitude, restaurant?.longitude],
        queryFn: async () => {
            if (!restaurant?.latitude || !restaurant?.longitude) return null;
            const res = await base44.functions.invoke('getWeather', { latitude: restaurant.latitude, longitude: restaurant.longitude });
            return res?.data ?? res;
        },
        enabled: !!restaurant?.latitude && !!restaurant?.longitude,
        staleTime: 600000,
        refetchInterval: 600000,
    });

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
                    content={allContent}
                    weather={weather}
                    widgetConfigs={widgetConfigs}
                    restaurantId={restaurantId}
                />
            ))}
        </div>
    );
}