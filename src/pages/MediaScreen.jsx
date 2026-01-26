import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Cloud, CloudRain, Sun, CloudSnow, Wind } from 'lucide-react';

export default function MediaScreen() {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [restaurantId, setRestaurantId] = useState(null);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const id = urlParams.get('restaurantId');
        setRestaurantId(id);
    }, []);

    // Fetch restaurant
    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants?.[0];
        },
        enabled: !!restaurantId,
        refetchInterval: 60000, // Refresh every minute
    });

    // Fetch promotional content
    const { data: content = [] } = useQuery({
        queryKey: ['promotional-content', restaurantId],
        queryFn: async () => {
            const items = await base44.entities.PromotionalContent.filter({ 
                restaurant_id: restaurantId, 
                is_active: true 
            });
            return items.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        },
        enabled: !!restaurantId,
        refetchInterval: 30000, // Refresh every 30 seconds
    });

    // Fetch weather
    const { data: weather } = useQuery({
        queryKey: ['weather', restaurant?.latitude, restaurant?.longitude],
        queryFn: async () => {
            if (!restaurant?.latitude || !restaurant?.longitude) return null;
            const response = await base44.functions.invoke('getWeather', {
                lat: restaurant.latitude,
                lng: restaurant.longitude
            });
            return response.data;
        },
        enabled: !!(restaurant?.latitude && restaurant?.longitude),
        refetchInterval: 600000, // Refresh every 10 minutes
    });

    // Update time every second
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Auto-advance content
    useEffect(() => {
        if (content.length === 0) return;

        const currentItem = content[currentIndex];
        const duration = currentItem?.media_type === 'video' ? 30000 : (currentItem?.duration || 10) * 1000;

        const timer = setTimeout(() => {
            setCurrentIndex((prev) => (prev + 1) % content.length);
        }, duration);

        return () => clearTimeout(timer);
    }, [currentIndex, content]);

    const getWeatherIcon = (description) => {
        const desc = description?.toLowerCase() || '';
        if (desc.includes('rain')) return <CloudRain className="h-8 w-8" />;
        if (desc.includes('cloud')) return <Cloud className="h-8 w-8" />;
        if (desc.includes('snow')) return <CloudSnow className="h-8 w-8" />;
        if (desc.includes('wind')) return <Wind className="h-8 w-8" />;
        return <Sun className="h-8 w-8" />;
    };

    if (!restaurantId) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
                <div className="text-center">
                    <h1 className="text-3xl font-bold mb-4">Media Screen</h1>
                    <p className="text-gray-400">Please provide a restaurantId in the URL</p>
                    <p className="text-sm text-gray-500 mt-2">Example: ?restaurantId=YOUR_ID</p>
                </div>
            </div>
        );
    }

    if (!restaurant) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
                <div className="animate-pulse text-xl">Loading...</div>
            </div>
        );
    }

    const currentItem = content[currentIndex];

    return (
        <div className="h-screen w-screen overflow-hidden bg-black relative">
            {/* Header with Time and Weather */}
            <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/70 to-transparent">
                <div className="flex items-center justify-between px-8 py-6 text-white">
                    {/* Restaurant Logo and Name */}
                    <div className="flex items-center gap-4">
                        {restaurant.logo_url && (
                            <img 
                                src={restaurant.logo_url} 
                                alt={restaurant.name}
                                className="h-16 w-16 object-cover rounded-xl"
                            />
                        )}
                        <h1 className="text-3xl font-bold">{restaurant.name}</h1>
                    </div>

                    {/* Time and Weather */}
                    <div className="flex items-center gap-8">
                        {weather && (
                            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md rounded-2xl px-6 py-3">
                                {getWeatherIcon(weather.description)}
                                <div>
                                    <div className="text-3xl font-bold">{weather.temperature}°C</div>
                                    <div className="text-sm text-gray-200 capitalize">{weather.description}</div>
                                </div>
                            </div>
                        )}
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-3">
                            <div className="text-4xl font-bold tabular-nums">
                                {currentTime.toLocaleTimeString('en-GB', { 
                                    hour: '2-digit', 
                                    minute: '2-digit',
                                    hour12: false 
                                })}
                            </div>
                            <div className="text-sm text-gray-200">
                                {currentTime.toLocaleDateString('en-GB', { 
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'long'
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="h-full w-full flex items-center justify-center">
                {content.length === 0 ? (
                    <div className="text-center text-white">
                        <h2 className="text-4xl font-bold mb-4">No Content Available</h2>
                        <p className="text-xl text-gray-400">Please add promotional content in your dashboard</p>
                    </div>
                ) : currentItem?.media_type === 'video' ? (
                    <video
                        key={currentItem.id}
                        src={currentItem.media_url}
                        className="w-full h-full object-cover"
                        autoPlay
                        muted
                        loop
                    />
                ) : (
                    <img
                        key={currentItem.id}
                        src={currentItem.media_url}
                        alt={currentItem.title || 'Promotional content'}
                        className="w-full h-full object-cover"
                    />
                )}
            </div>

            {/* Progress Indicators */}
            {content.length > 1 && (
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20 flex gap-2">
                    {content.map((_, idx) => (
                        <div
                            key={idx}
                            className={`h-2 rounded-full transition-all ${
                                idx === currentIndex 
                                    ? 'w-12 bg-white' 
                                    : 'w-2 bg-white/40'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}