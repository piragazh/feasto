import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Clock, Cloud, CloudRain, Sun, Package, CheckCircle2, Timer } from 'lucide-react';
import { format } from 'date-fns';

export default function CustomContentWidget({ restaurantId, widgetType, config = {} }) {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Fetch restaurant for location
    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
        enabled: !!restaurantId && widgetType === 'weather'
    });

    // Fetch weather data
    const { data: weather } = useQuery({
        queryKey: ['weather', restaurant?.latitude, restaurant?.longitude],
        queryFn: async () => {
            if (!restaurant?.latitude || !restaurant?.longitude) return null;
            const response = await base44.functions.invoke('getWeather', {
                lat: restaurant.latitude,
                lon: restaurant.longitude
            });
            return response.data;
        },
        enabled: !!restaurant?.latitude && !!restaurant?.longitude && widgetType === 'weather',
        refetchInterval: 600000 // 10 minutes
    });

    // Fetch active orders for collection/preparation status
    const { data: activeOrders = [] } = useQuery({
        queryKey: ['active-orders', restaurantId],
        queryFn: async () => {
            const orders = await base44.entities.Order.filter({
                restaurant_id: restaurantId,
                status: ['preparing', 'ready_for_collection']
            });
            return orders.filter(o => o.order_type === 'collection');
        },
        enabled: !!restaurantId && widgetType === 'orders',
        refetchInterval: 5000
    });

    if (widgetType === 'time') {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
                <Clock className="h-16 w-16 mb-4 opacity-80" />
                <div className="text-7xl font-bold tracking-tight mb-2">
                    {format(currentTime, 'HH:mm')}
                </div>
                <div className="text-2xl opacity-70">
                    {format(currentTime, 'EEEE, MMMM d')}
                </div>
            </div>
        );
    }

    if (widgetType === 'weather') {
        if (!weather) {
            return (
                <div className="h-full flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-700 text-white">
                    <div className="text-center">
                        <Cloud className="h-12 w-12 mx-auto mb-2 opacity-70" />
                        <p className="text-lg">Loading weather...</p>
                    </div>
                </div>
            );
        }

        const WeatherIcon = weather.main === 'Rain' ? CloudRain : 
                           weather.main === 'Clear' ? Sun : Cloud;

        return (
            <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 text-white p-8">
                <WeatherIcon className="h-20 w-20 mb-4" />
                <div className="text-6xl font-bold mb-2">
                    {Math.round(weather.temp)}°C
                </div>
                <div className="text-2xl opacity-90 capitalize">
                    {weather.description}
                </div>
                <div className="text-lg opacity-70 mt-2">
                    Feels like {Math.round(weather.feels_like)}°C
                </div>
            </div>
        );
    }

    if (widgetType === 'orders') {
        const preparingOrders = activeOrders.filter(o => o.status === 'preparing');
        const readyOrders = activeOrders.filter(o => o.status === 'ready_for_collection');

        return (
            <div className="h-full bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white p-8 overflow-auto">
                <div className="mb-8 text-center">
                    <Package className="h-16 w-16 mx-auto mb-4 opacity-80" />
                    <h2 className="text-4xl font-bold">Collection Orders</h2>
                </div>

                <div className="space-y-6">
                    {/* Ready for Collection */}
                    {readyOrders.length > 0 && (
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <CheckCircle2 className="h-8 w-8 text-green-400" />
                                <h3 className="text-3xl font-bold">Ready for Collection</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {readyOrders.slice(0, 6).map(order => (
                                    <div key={order.id} className="bg-green-500/20 backdrop-blur border-2 border-green-400 rounded-2xl p-6 text-center">
                                        <div className="text-5xl font-bold mb-2">
                                            {order.order_number || `#${order.id.slice(-4)}`}
                                        </div>
                                        <div className="text-xl opacity-80">
                                            {order.guest_name || 'Customer'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Preparing */}
                    {preparingOrders.length > 0 && (
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <Timer className="h-8 w-8 text-yellow-400 animate-pulse" />
                                <h3 className="text-3xl font-bold">Preparing</h3>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                {preparingOrders.slice(0, 9).map(order => (
                                    <div key={order.id} className="bg-yellow-500/20 backdrop-blur border border-yellow-400 rounded-xl p-4 text-center">
                                        <div className="text-3xl font-bold">
                                            {order.order_number || `#${order.id.slice(-4)}`}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeOrders.length === 0 && (
                        <div className="text-center py-12">
                            <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
                            <p className="text-2xl opacity-70">No active collection orders</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return null;
}