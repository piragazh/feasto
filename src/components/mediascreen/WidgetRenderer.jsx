import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Cloud, Sun, CloudRain, CloudSnow, Zap, CloudDrizzle, Wind } from 'lucide-react';
import StockTickerWidget from './widgets/StockTickerWidget';
import QueueStatusWidget from './widgets/QueueStatusWidget';
import CountdownTimerWidget from './widgets/CountdownTimerWidget';
import MenuWidget from './widgets/MenuWidget';

// ─── Built-in Weather Widget ─────────────────────────────────────────────────

function WeatherWidget({ config = {}, className = '' }) {
    const { location = 'London, UK', units = 'metric', show_forecast = false, theme = 'dark' } = config;
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadWeather = async () => {
            try {
                const res = await base44.functions.invoke('getWeather', { location, units });
                if (res.data) setWeather(res.data);
            } catch {}
            finally { setLoading(false); }
        };
        loadWeather();
        const interval = setInterval(loadWeather, 10 * 60 * 1000);
        return () => clearInterval(interval);
    }, [location, units]);

    const getIcon = (desc = '') => {
        const d = desc.toLowerCase();
        if (d.includes('thunder')) return <Zap className="h-8 w-8" />;
        if (d.includes('snow')) return <CloudSnow className="h-8 w-8" />;
        if (d.includes('rain')) return <CloudRain className="h-8 w-8" />;
        if (d.includes('drizzle')) return <CloudDrizzle className="h-8 w-8" />;
        if (d.includes('wind')) return <Wind className="h-8 w-8" />;
        if (d.includes('cloud')) return <Cloud className="h-8 w-8" />;
        return <Sun className="h-8 w-8" />;
    };

    const themes = {
        dark: { bg: 'bg-gray-900', text: 'text-white', sub: 'text-gray-400' },
        light: { bg: 'bg-white', text: 'text-gray-900', sub: 'text-gray-500' },
        transparent: { bg: 'bg-black/40 backdrop-blur-sm', text: 'text-white', sub: 'text-gray-300' },
    };
    const t = themes[theme] || themes.dark;

    if (loading) return (
        <div className={`${t.bg} h-full flex items-center justify-center ${className}`}>
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (!weather) return (
        <div className={`${t.bg} h-full flex items-center justify-center ${className}`}>
            <p className={`text-sm ${t.sub}`}>Weather unavailable</p>
        </div>
    );

    return (
        <div className={`${t.bg} h-full flex flex-col items-center justify-center gap-2 text-center p-4 ${className}`}>
            <div className="text-blue-400">{getIcon(weather.description)}</div>
            <div className={`text-4xl font-black ${t.text}`}>{Math.round(weather.temperature)}°{units === 'metric' ? 'C' : 'F'}</div>
            <div className={`text-sm font-medium capitalize ${t.sub}`}>{weather.description}</div>
            <div className={`text-xs ${t.sub}`}>{location}</div>
            {weather.humidity && <div className={`text-xs ${t.sub}`}>Humidity: {weather.humidity}%</div>}
        </div>
    );
}

// ─── Built-in Clock Widget ────────────────────────────────────────────────────

function ClockWidget({ config = {}, className = '' }) {
    const { format = '24h', show_seconds = true, show_date = true, timezone = '', theme = 'dark' } = config;
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    const themes = {
        dark: { bg: 'bg-gray-900', text: 'text-white', sub: 'text-gray-400' },
        light: { bg: 'bg-white', text: 'text-gray-900', sub: 'text-gray-500' },
        transparent: { bg: 'bg-black/40 backdrop-blur-sm', text: 'text-white', sub: 'text-gray-300' },
    };
    const t = themes[theme] || themes.dark;

    const opts = { hour: '2-digit', minute: '2-digit', ...(show_seconds ? { second: '2-digit' } : {}), hour12: format === '12h', ...(timezone ? { timeZone: timezone } : {}) };
    const dateOpts = { weekday: 'long', day: 'numeric', month: 'long', ...(timezone ? { timeZone: timezone } : {}) };

    return (
        <div className={`${t.bg} h-full flex flex-col items-center justify-center gap-1 text-center p-4 ${className}`}>
            <div className={`text-5xl font-black font-mono tabular-nums ${t.text}`}>
                {now.toLocaleTimeString('en-GB', opts)}
            </div>
            {show_date && (
                <div className={`text-sm ${t.sub} font-medium`}>
                    {now.toLocaleDateString('en-GB', dateOpts)}
                </div>
            )}
        </div>
    );
}

// ─── Built-in Orders Widget ───────────────────────────────────────────────────

function OrdersWidget({ config = {}, restaurantId, className = '' }) {
    const { display_mode = 'preparing', max_orders = 5, show_customer_name = false, auto_refresh_interval = 30 } = config;
    const [orders, setOrders] = useState([]);

    useEffect(() => {
        const load = async () => {
            if (!restaurantId) return;
            try {
                const all = await base44.entities.Order.filter({ restaurant_id: restaurantId });
                const statusMap = { recent: ['delivered', 'collected'], pending: ['pending'], preparing: ['preparing', 'confirmed'] };
                const filtered = all.filter(o => (statusMap[display_mode] || ['preparing']).includes(o.status)).slice(0, max_orders);
                setOrders(filtered);
            } catch {}
        };
        load();
        const interval = setInterval(load, auto_refresh_interval * 1000);
        return () => clearInterval(interval);
    }, [restaurantId, display_mode, max_orders, auto_refresh_interval]);

    return (
        <div className="bg-gray-900 h-full flex flex-col p-4 overflow-hidden">
            <h3 className="text-white font-bold text-sm mb-3">Live Orders</h3>
            <div className="space-y-2 flex-1 overflow-hidden">
                {orders.map(o => (
                    <div key={o.id} className="bg-gray-800 rounded-lg px-3 py-2 flex items-center justify-between">
                        <span className="text-white text-sm font-mono">#{o.order_number || o.id?.slice(-4)}</span>
                        {show_customer_name && o.guest_name && <span className="text-gray-400 text-xs truncate mx-2">{o.guest_name}</span>}
                        <span className={`text-xs font-semibold ${o.status === 'preparing' ? 'text-amber-400' : 'text-blue-400'}`}>{o.status}</span>
                    </div>
                ))}
                {orders.length === 0 && <p className="text-gray-500 text-sm text-center mt-4">No orders</p>}
            </div>
        </div>
    );
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export default function WidgetRenderer({ widgetType, config = {}, restaurantId, className = '' }) {
    switch (widgetType) {
        case 'weather':
            return <WeatherWidget config={config} className={className} />;
        case 'clock':
            return <ClockWidget config={config} className={className} />;
        case 'orders':
            return <OrdersWidget config={config} restaurantId={restaurantId} className={className} />;
        case 'stock_ticker':
            return <StockTickerWidget config={config} className={className} />;
        case 'queue_status':
            return <QueueStatusWidget config={config} restaurantId={restaurantId} className={className} />;
        case 'countdown_timer':
            return <CountdownTimerWidget config={config} className={className} />;
        case 'menu_widget':
            return <MenuWidget config={config} restaurantId={restaurantId} className={className} />;
        default:
            return (
                <div className="bg-gray-800 h-full flex items-center justify-center">
                    <p className="text-gray-500 text-sm">Unknown widget: {widgetType}</p>
                </div>
            );
    }
}