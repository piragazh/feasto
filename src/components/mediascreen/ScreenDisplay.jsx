import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Cloud, CloudRain, CloudSnow, Sun, Wind } from 'lucide-react';
import MultiZoneDisplay from './MultiZoneDisplay';

export default function ScreenDisplay({ restaurantId, screenName }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentTime, setCurrentTime] = useState(new Date());

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: () => base44.entities.Restaurant.filter({ id: restaurantId }).then(r => r[0]),
        enabled: !!restaurantId,
        staleTime: 60000,
    });

    const { data: screen } = useQuery({
        queryKey: ['screen', restaurantId, screenName],
        queryFn: async () => {
            const screens = await base44.entities.Screen.filter({ 
                restaurant_id: restaurantId,
                screen_name: screenName
            });
            return screens[0];
        },
        enabled: !!restaurantId && !!screenName,
        staleTime: 60000,
    });

    const { data: content = [] } = useQuery({
        queryKey: ['screen-content', restaurantId, screenName],
        queryFn: async () => {
            const allContent = await base44.entities.PromotionalContent.filter({ 
                restaurant_id: restaurantId,
                screen_name: screenName,
                is_active: true
            });
            return allContent.sort((a, b) => a.display_order - b.display_order);
        },
        enabled: !!restaurantId && !!screenName,
        staleTime: 60000,
        gcTime: 300000,
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

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (content.length === 0) return;

        const currentContent = content[currentIndex];
        const duration = currentContent?.media_type === 'video' 
            ? (currentContent?.video_loop_count || 1) * 30000 
            : (currentContent?.duration || 10) * 1000;

        const timer = setTimeout(() => {
            setCurrentIndex((prev) => (prev + 1) % content.length);
        }, duration);

        return () => clearTimeout(timer);
    }, [currentIndex, content]);

    const getWeatherIcon = (description) => {
        const desc = description?.toLowerCase() || '';
        if (desc.includes('rain')) return <CloudRain className="h-6 w-6" />;
        if (desc.includes('snow')) return <CloudSnow className="h-6 w-6" />;
        if (desc.includes('cloud')) return <Cloud className="h-6 w-6" />;
        if (desc.includes('wind')) return <Wind className="h-6 w-6" />;
        return <Sun className="h-6 w-6" />;
    };

    if (!restaurantId || !screenName) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
                <p className="text-xl">Missing restaurant ID or screen name</p>
            </div>
        );
    }

    // If screen has a multi-zone layout, use MultiZoneDisplay
    if (screen?.layout_template?.zones && screen.layout_template.zones.length > 0) {
        return (
            <MultiZoneDisplay
                restaurantId={restaurantId}
                screenName={screenName}
                layout={screen.layout_template}
            />
        );
    }

    // Otherwise, use classic single-content display
    if (content.length === 0) {
        return (
            <div className="h-screen flex items-center justify-center bg-gradient-to-br from-orange-500 to-red-600 text-white">
                <div className="text-center">
                    <h1 className="text-4xl font-bold mb-4">{restaurant?.name}</h1>
                    <p className="text-xl">No content configured for this screen</p>
                </div>
            </div>
        );
    }

    const currentContent = content[currentIndex];

    return (
        <div className="h-screen w-screen bg-black relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent z-10 p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {restaurant?.logo_url && (
                            <img 
                                src={restaurant.logo_url} 
                                alt={restaurant.name}
                                className="h-16 w-16 rounded-lg object-cover"
                            />
                        )}
                        <h1 className="text-3xl font-bold text-white">{restaurant?.name}</h1>
                    </div>
                    
                    <div className="flex items-center gap-6 text-white">
                        <div className="text-right">
                            <div className="text-2xl font-bold">
                                {currentTime.toLocaleTimeString('en-GB', { 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                })}
                            </div>
                            <div className="text-sm opacity-80">
                                {currentTime.toLocaleDateString('en-GB', { 
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'short'
                                })}
                            </div>
                        </div>
                        
                        {weather?.data && (
                            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                                {getWeatherIcon(weather.data.description)}
                                <div>
                                    <div className="text-xl font-bold">{weather.data.temperature}°C</div>
                                    <div className="text-xs opacity-80 capitalize">{weather.data.description}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="h-full w-full flex items-center justify-center relative">
                {content.map((item, index) => {
                    const isActive = index === currentIndex;
                    const transition = item.transition || 'fade';
                    
                    let transitionClass = '';
                    if (transition === 'fade') {
                        transitionClass = isActive 
                            ? 'opacity-100 scale-100' 
                            : 'opacity-0 scale-100';
                    } else if (transition === 'slide') {
                        transitionClass = isActive 
                            ? 'opacity-100 translate-x-0' 
                            : 'opacity-0 -translate-x-full';
                    } else if (transition === 'zoom') {
                        transitionClass = isActive 
                            ? 'opacity-100 scale-100' 
                            : 'opacity-0 scale-90';
                    } else {
                        transitionClass = isActive ? 'opacity-100' : 'opacity-0';
                    }

                    if (!isActive && transition === 'fade') {
                        return null;
                    }

                    return (
                        <div
                            key={item.id}
                            className={`absolute inset-0 flex items-center justify-center transition-all duration-1000 ease-in-out ${transitionClass}`}
                            style={{ pointerEvents: isActive ? 'auto' : 'none', zIndex: isActive ? 2 : 1 }}
                        >
                            {item.media_type === 'video' ? (
                                <video
                                    key={`${item.id}-${isActive}`}
                                    src={item.media_url}
                                    autoPlay
                                    muted
                                    loop={content.length === 1}
                                    className="max-h-full max-w-full object-contain"
                                />
                            ) : (
                                <img
                                    src={item.media_url}
                                    alt={item.title}
                                    className="max-h-full max-w-full object-contain"
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {content.length > 1 && (
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-2">
                    {content.map((_, index) => (
                        <div
                            key={index}
                            className={`h-2 rounded-full transition-all ${
                                index === currentIndex 
                                    ? 'w-8 bg-white' 
                                    : 'w-2 bg-white/50'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}