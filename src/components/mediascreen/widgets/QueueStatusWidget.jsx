import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Users, Clock, CheckCircle, ChefHat } from 'lucide-react';

export default function QueueStatusWidget({ config = {}, restaurantId, className = '' }) {
    const {
        queue_label = 'Now Serving',
        max_display = 6,
        show_wait_time = true,
        avg_wait_minutes = 10,
        status_filter = 'preparing',
        theme = 'dark'
    } = config;

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = async () => {
        try {
            if (!restaurantId) return;
            let statuses = ['preparing'];
            if (status_filter === 'ready') statuses = ['ready_for_collection'];
            else if (status_filter === 'all_active') statuses = ['preparing', 'confirmed', 'ready_for_collection'];

            const allOrders = await base44.entities.Order.filter({ restaurant_id: restaurantId });
            const filtered = allOrders
                .filter(o => statuses.includes(o.status))
                .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))
                .slice(0, max_display);

            setOrders(filtered);
        } catch (e) {
            // keep last state
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        const interval = setInterval(fetchOrders, 15000);
        return () => clearInterval(interval);
    }, [restaurantId, status_filter, max_display]);

    const themes = {
        dark: { bg: 'bg-gray-900', card: 'bg-gray-800', text: 'text-white', sub: 'text-gray-400', border: 'border-gray-700', badge: 'bg-gray-700' },
        light: { bg: 'bg-gray-50', card: 'bg-white', text: 'text-gray-900', sub: 'text-gray-500', border: 'border-gray-200', badge: 'bg-gray-100' },
        branded: { bg: 'bg-orange-950', card: 'bg-orange-900', text: 'text-white', sub: 'text-orange-300', border: 'border-orange-800', badge: 'bg-orange-800' },
    };
    const t = themes[theme] || themes.dark;

    const getOrderNumber = (order) => order.order_number || order.id?.slice(-4)?.toUpperCase() || '—';

    const getStatusLabel = (status) => {
        const map = {
            confirmed: 'Confirmed',
            preparing: 'Preparing',
            ready_for_collection: 'Ready ✓',
        };
        return map[status] || status;
    };

    const getStatusColor = (status) => ({
        confirmed: 'text-blue-400',
        preparing: 'text-amber-400',
        ready_for_collection: 'text-emerald-400',
    }[status] || 'text-gray-400');

    const getEstWait = (order, index) => {
        if (!show_wait_time) return null;
        if (order.status === 'ready_for_collection') return 'Ready!';
        const mins = Math.max(1, avg_wait_minutes - index * 2);
        return `~${mins} min`;
    };

    if (loading) {
        return (
            <div className={`${t.bg} h-full flex items-center justify-center ${className}`}>
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <p className={`text-sm ${t.sub}`}>Loading queue...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`${t.bg} h-full flex flex-col overflow-hidden ${className}`}>
            {/* Header */}
            <div className="px-5 py-4 flex items-center gap-3 flex-shrink-0">
                <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center">
                    <ChefHat className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h2 className={`text-lg font-bold ${t.text}`}>{queue_label}</h2>
                    <p className={`text-xs ${t.sub}`}>{orders.length} order{orders.length !== 1 ? 's' : ''} active</p>
                </div>
            </div>

            {/* Queue items */}
            <div className="flex-1 overflow-hidden px-4 pb-4 space-y-2">
                {orders.length === 0 ? (
                    <div className={`h-full flex flex-col items-center justify-center gap-3 ${t.sub}`}>
                        <CheckCircle className="h-12 w-12 opacity-30" />
                        <p className="text-sm font-medium opacity-60">No active orders</p>
                    </div>
                ) : (
                    orders.map((order, index) => (
                        <div key={order.id} className={`${t.card} ${t.border} border rounded-xl px-4 py-3 flex items-center justify-between`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg ${t.badge} flex items-center justify-center font-bold text-sm font-mono ${t.text}`}>
                                    {getOrderNumber(order)}
                                </div>
                                <div>
                                    <p className={`text-sm font-bold ${t.text}`}>
                                        Order #{getOrderNumber(order)}
                                    </p>
                                    <p className={`text-xs ${getStatusColor(order.status)} font-semibold`}>
                                        {getStatusLabel(order.status)}
                                    </p>
                                </div>
                            </div>
                            {show_wait_time && (
                                <div className="flex items-center gap-1.5">
                                    <Clock className={`h-3.5 w-3.5 ${t.sub}`} />
                                    <span className={`text-sm font-semibold ${
                                        order.status === 'ready_for_collection' ? 'text-emerald-400' : t.sub
                                    }`}>{getEstWait(order, index)}</span>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className={`px-5 py-2 border-t ${t.border} flex items-center justify-between flex-shrink-0`}>
                <div className="flex items-center gap-1.5">
                    <Users className={`h-3.5 w-3.5 ${t.sub}`} />
                    <span className={`text-xs ${t.sub}`}>{orders.length} in queue</span>
                </div>
                <span className={`text-[10px] ${t.sub} font-mono`}>
                    {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </div>
    );
}