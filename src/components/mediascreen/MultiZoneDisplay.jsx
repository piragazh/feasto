import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Cloud, CloudRain, CloudSnow, Sun, Wind } from 'lucide-react';

function ZoneRenderer({ zone, restaurant, content, weather }) {
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        if (zone.type === 'clock') {
            const timer = setInterval(() => setCurrentTime(new Date()), 1000);
            return () => clearInterval(timer);
        }
    }, [zone.type]);

    useEffect(() => {
        if (zone.type === 'carousel' && content.length > 1) {
            const timer = setInterval(() => {
                setCarouselIndex((prev) => (prev + 1) % content.length);
            }, 5000);
            return () => clearInterval(timer);
        }
    }, [zone.type, content]);

    const getWeatherIcon = (description) => {
        const desc = description?.toLowerCase() || '';
        if (desc.includes('rain')) return <CloudRain className="h-8 w-8" />;
        if (desc.includes('snow')) return <CloudSnow className="h-8 w-8" />;
        if (desc.includes('cloud')) return <Cloud className="h-8 w-8" />;
        if (desc.includes('wind')) return <Wind className="h-8 w-8" />;
        return <Sun className="h-8 w-8" />;
    };

    const renderContent = () => {
        switch (zone.type) {
            case 'media':
                if (content.length === 0) return null;
                const mediaItem = content[0];
                return mediaItem.media_type === 'video' ? (
                    <video
                        src={mediaItem.media_url}
                        autoPlay
                        muted
                        loop
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <img
                        src={mediaItem.media_url}
                        alt={mediaItem.title}
                        className="w-full h-full object-cover"
                    />
                );

            case 'carousel':
                if (content.length === 0) return null;
                const carouselItem = content[carouselIndex];
                return (
                    <div className="relative w-full h-full">
                        <img
                            src={carouselItem.media_url}
                            alt={carouselItem.title}
                            className="w-full h-full object-cover"
                        />
                        {content.length > 1 && (
                            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
                                {content.map((_, idx) => (
                                    <div
                                        key={idx}
                                        className={`h-2 rounded-full transition-all ${
                                            idx === carouselIndex ? 'w-8 bg-white' : 'w-2 bg-white/50'
                                        }`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );

            case 'text':
                return (
                    <div className="w-full h-full flex items-center justify-center p-6 text-white">
                        <div className="text-center">
                            <h2 className="text-3xl font-bold mb-2">{restaurant?.name}</h2>
                            <p className="text-lg opacity-80">{restaurant?.description}</p>
                        </div>
                    </div>
                );

            case 'clock':
                return (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white p-4">
                        <div className="text-4xl font-bold">
                            {currentTime.toLocaleTimeString('en-GB', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                            })}
                        </div>
                        <div className="text-sm opacity-80 mt-2">
                            {currentTime.toLocaleDateString('en-GB', { 
                                weekday: 'long',
                                day: 'numeric',
                                month: 'short'
                            })}
                        </div>
                    </div>
                );

            case 'weather':
                if (!weather?.data) return null;
                return (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white p-4">
                        {getWeatherIcon(weather.data.description)}
                        <div className="text-3xl font-bold mt-2">{weather.data.temperature}°C</div>
                        <div className="text-sm opacity-80 capitalize mt-1">{weather.data.description}</div>
                    </div>
                );

            case 'menu':
                return (
                    <div className="w-full h-full overflow-y-auto p-6 text-white">
                        <h3 className="text-2xl font-bold mb-4">Today's Specials</h3>
                        <div className="space-y-3">
                            {content.slice(0, 5).map((item, idx) => (
                                <div key={idx} className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                                    <h4 className="font-semibold">{item.title}</h4>
                                    {item.description && (
                                        <p className="text-sm opacity-80 mt-1">{item.description}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div
            className="absolute overflow-hidden"
            style={{
                left: `${zone.position.x}%`,
                top: `${zone.position.y}%`,
                width: `${zone.position.width}%`,
                height: `${zone.position.height}%`,
                backgroundColor: zone.styling?.backgroundColor || '#000',
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
            return content.sort((a, b) => a.display_order - b.display_order);
        },
        enabled: !!restaurantId && !!screenName,
        staleTime: 60000,
        refetchInterval: 60000,
    });

    const { data: weather } = useQuery({
        queryKey: ['weather', restaurant?.latitude, restaurant?.longitude],
        queryFn: async () => {
            if (!restaurant?.latitude || !restaurant?.longitude) return null;
            return await base44.functions.invoke('getWeather', {
                latitude: restaurant.latitude,
                longitude: restaurant.longitude
            });
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
                />
            ))}
        </div>
    );
}