import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { X, BarChart3, ShoppingBag, Clock, DollarSign } from 'lucide-react';

export default function KioskAdminPanel({ restaurant, onClose }) {
    const [pin, setPin] = useState('');
    const [unlocked, setUnlocked] = useState(false);
    const ADMIN_PIN = '1234'; // Could be configurable

    const { data: todayOrders = [] } = useQuery({
        queryKey: ['kiosk-admin-orders', restaurant.id],
        queryFn: async () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const orders = await base44.entities.Order.filter({
                restaurant_id: restaurant.id,
                notes: 'Kiosk order',
            });
            return orders.filter(o => new Date(o.created_date) >= today);
        },
        enabled: unlocked,
    });

    const handlePin = (digit) => {
        const next = pin + digit;
        setPin(next);
        if (next.length === 4) {
            if (next === ADMIN_PIN) setUnlocked(true);
            else setPin('');
        }
    };

    const totalRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
    const avgOrder = todayOrders.length ? totalRevenue / todayOrders.length : 0;

    if (!unlocked) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
                <div className="bg-gray-900 border border-white/[0.06] rounded-3xl p-8 w-80">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-white font-bold text-lg">Admin Access</h2>
                        <button onClick={onClose} className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center">
                            <X className="h-4 w-4 text-gray-400" />
                        </button>
                    </div>
                    <div className="flex gap-2 justify-center mb-6">
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className={`w-4 h-4 rounded-full border-2 ${i < pin.length ? 'bg-orange-500 border-orange-500' : 'border-gray-600'}`} />
                        ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((d, i) => (
                            <button key={i}
                                onClick={() => {
                                    if (d === '⌫') setPin(p => p.slice(0,-1));
                                    else if (d !== '') handlePin(String(d));
                                }}
                                className={`h-14 rounded-2xl font-bold text-lg transition-colors ${d === '' ? '' : 'bg-gray-800 hover:bg-gray-700 text-white active:scale-95'}`}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                    <p className="text-gray-600 text-xs text-center mt-4">Default PIN: 1234</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col">
            <div className="bg-gray-900 border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
                <div>
                    <h1 className="text-white font-bold text-xl">Kiosk Admin Panel</h1>
                    <p className="text-gray-400 text-sm">{restaurant.name}</p>
                </div>
                <button onClick={onClose} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 rounded-xl transition-colors">
                    <X className="h-4 w-4" />
                    Exit Admin
                </button>
            </div>

            <div className="p-6 space-y-6">
                <h2 className="text-white font-bold text-lg">Today's Performance</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: "Total Orders", value: todayOrders.length, icon: ShoppingBag, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                        { label: "Revenue", value: `£${totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
                        { label: "Avg Order", value: `£${avgOrder.toFixed(2)}`, icon: BarChart3, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
                        { label: "Last Order", value: todayOrders.length > 0 ? new Date(todayOrders[todayOrders.length-1].created_date).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'}) : 'N/A', icon: Clock, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                    ].map((stat, i) => {
                        const Icon = stat.icon;
                        return (
                            <div key={i} className={`${stat.bg} border rounded-2xl p-5`}>
                                <Icon className={`h-6 w-6 ${stat.color} mb-3`} />
                                <p className="text-gray-400 text-sm">{stat.label}</p>
                                <p className={`${stat.color} font-black text-2xl mt-1`}>{stat.value}</p>
                            </div>
                        );
                    })}
                </div>

                {/* Recent Orders */}
                <div>
                    <h2 className="text-white font-bold text-lg mb-3">Recent Kiosk Orders</h2>
                    <div className="space-y-2">
                        {todayOrders.slice().reverse().slice(0, 10).map(order => (
                            <div key={order.id} className="bg-gray-900 border border-white/[0.06] rounded-2xl p-4 flex items-center justify-between">
                                <div>
                                    <p className="text-white font-bold">#{order.order_number || order.id.slice(-6)}</p>
                                    <p className="text-gray-400 text-sm">{order.items?.length} item(s) · {new Date(order.created_date).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-orange-400 font-bold">£{order.total?.toFixed(2)}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.status === 'confirmed' ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                                        {order.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {todayOrders.length === 0 && (
                            <p className="text-gray-500 text-center py-8">No kiosk orders today</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}