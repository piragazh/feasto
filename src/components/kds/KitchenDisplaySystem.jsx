import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import KDSOrderCard from '@/components/kds/KDSOrderCard';
import KDSColumn from '@/components/kds/KDSColumn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UtensilsCrossed, Volume2, VolumeX, Maximize, RefreshCw, Clock, LogOut } from 'lucide-react';

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready_for_collection', 'out_for_delivery', 'new'];
const KIOSK_ACTIVE_STATUSES = ['new', 'confirmed', 'preparing', 'ready'];

export default function KitchenDisplaySystem({ restaurant }) {
    const [orders, setOrders] = useState([]);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [lastOrderIds, setLastOrderIds] = useState(new Set());
    const [tick, setTick] = useState(0); // forces re-render every 30s for timer updates
    const [view, setView] = useState('board'); // 'board' | 'list'
    const audioCtxRef = useRef(null);

    // Check if order is eligible for prep (not awaiting payment)
    const canPrepareOrder = (order) => {
        // Kiosk orders: only if payment is NOT pending
        if (order.order_source === 'kiosk') {
            return order.payment_status !== 'pending_payment';
        }
        // Non-kiosk: always eligible
        return true;
    };

    // Get display status for kiosk orders
    const getDisplayStatus = (order) => {
        if (order.order_source === 'kiosk') {
            return order.order_status || order.status;
        }
        return order.status;
    };

    // Live clock tick every 30 seconds to update timers
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 30000);
        return () => clearInterval(interval);
    }, []);

    // Initial load
    useEffect(() => {
        fetchOrders();
    }, [restaurant.id]);

    // Real-time subscription
    useEffect(() => {
        const unsub = base44.entities.Order.subscribe((event) => {
            if (event.data?.restaurant_id !== restaurant.id) return;

            if (event.type === 'create') {
                const isActive = event.data?.order_source === 'kiosk'
                    ? KIOSK_ACTIVE_STATUSES.includes(event.data?.order_status)
                    : ACTIVE_STATUSES.includes(event.data?.status);
                if (isActive) {
                    setOrders(prev => [event.data, ...prev]);
                    // Only play sound if ready for prep (not awaiting payment)
                    if (canPrepareOrder(event.data)) {
                        playNewOrderSound();
                    }
                }
            } else if (event.type === 'update') {
                setOrders(prev => {
                    const exists = prev.find(o => o.id === event.id);
                    const isActive = event.data?.order_source === 'kiosk'
                        ? KIOSK_ACTIVE_STATUSES.includes(event.data?.order_status)
                        : ACTIVE_STATUSES.includes(event.data?.status);
                    if (isActive) {
                        if (exists) return prev.map(o => o.id === event.id ? event.data : o);
                        return [event.data, ...prev];
                    } else {
                        // Completed / cancelled — remove from board
                        return prev.filter(o => o.id !== event.id);
                    }
                });
            } else if (event.type === 'delete') {
                setOrders(prev => prev.filter(o => o.id !== event.id));
            }
        });
        return unsub;
    }, [restaurant.id, soundEnabled]);

    const fetchOrders = async () => {
        try {
            const all = await base44.entities.Order.filter({ restaurant_id: restaurant.id });
            const active = all.filter(o => {
                if (o.order_source === 'kiosk') {
                    return KIOSK_ACTIVE_STATUSES.includes(o.order_status);
                }
                return ACTIVE_STATUSES.includes(o.status);
            });
            // Sort: unpaid kiosk first, then oldest first
            active.sort((a, b) => {
                const aUnpaid = a.order_source === 'kiosk' && a.payment_status === 'pending_payment' ? 0 : 1;
                const bUnpaid = b.order_source === 'kiosk' && b.payment_status === 'pending_payment' ? 0 : 1;
                if (aUnpaid !== bUnpaid) return aUnpaid - bUnpaid;
                return new Date(a.created_date) - new Date(b.created_date);
            });
            setOrders(active);
        } catch (e) {
            console.error('KDS fetch error', e);
        }
    };

    const playNewOrderSound = useCallback(() => {
        if (!soundEnabled) return;
        try {
            if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            const ctx = audioCtxRef.current;
            // Three-tone beep
            [0, 150, 300].forEach((delay, i) => {
                setTimeout(() => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.value = 880 + i * 110;
                    gain.gain.setValueAtTime(0.3, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.3);
                }, delay);
            });
        } catch (e) { /* audio not available */ }
    }, [soundEnabled]);

    const updateOrderStatus = async (orderId, newStatus) => {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;

        // Kiosk orders use order_status field
        if (order.order_source === 'kiosk') {
            // Block prep if awaiting payment
            if (newStatus === 'preparing' && order.payment_status === 'pending_payment') {
                return;
            }
            await base44.entities.Order.update(orderId, { order_status: newStatus });
        } else {
            // Legacy orders use status field
            await base44.entities.Order.update(orderId, { status: newStatus });
        }
        // Real-time subscription handles the UI update
    };

    // Filter by kiosk or legacy status
    const pendingOrders = orders.filter(o => {
        const status = getDisplayStatus(o);
        return ['pending', 'confirmed', 'new'].includes(status);
    });
    const preparingOrders = orders.filter(o => {
        const status = getDisplayStatus(o);
        return status === 'preparing';
    });
    const readyOrders = orders.filter(o => {
        const status = getDisplayStatus(o);
        return ['ready_for_collection', 'out_for_delivery', 'ready'].includes(status);
    });

    const totalActive = orders.length;
    const urgentCount = orders.filter(o => {
        const mins = Math.floor((Date.now() - new Date(o.created_date).getTime()) / 60000);
        return mins >= 15 && !['ready_for_collection', 'out_for_delivery'].includes(o.status);
    }).length;

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col select-none" style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* Top Bar */}
            <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
                        <UtensilsCrossed className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-white font-bold text-lg leading-none">{restaurant.name}</h1>
                        <p className="text-gray-500 text-xs mt-0.5">Kitchen Display System</p>
                    </div>
                </div>

                {/* Counters */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-sm px-3 py-1">
                            🟡 {pendingOrders.length} New
                        </Badge>
                        <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-sm px-3 py-1">
                            🔵 {preparingOrders.length} Preparing
                        </Badge>
                        <Badge className="bg-green-500/20 text-green-400 border border-green-500/30 text-sm px-3 py-1">
                            🟢 {readyOrders.length} Ready
                        </Badge>
                        {urgentCount > 0 && (
                            <Badge className="bg-red-500 text-white animate-pulse text-sm px-3 py-1">
                                🔥 {urgentCount} Urgent
                            </Badge>
                        )}
                    </div>

                    {/* Live Clock */}
                    <LiveClock />

                    {/* Controls */}
                    <div className="flex items-center gap-1 ml-2">
                        <Button variant="ghost" size="icon" onClick={() => setSoundEnabled(s => !s)}
                            className="text-gray-400 hover:text-white" title={soundEnabled ? 'Mute' : 'Unmute'}>
                            {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={fetchOrders}
                            className="text-gray-400 hover:text-white" title="Refresh">
                            <RefreshCw className="h-5 w-5" />
                        </Button>
                        <Button variant="ghost" size="icon"
                            onClick={() => document.documentElement.requestFullscreen?.()}
                            className="text-gray-400 hover:text-white" title="Fullscreen">
                            <Maximize className="h-5 w-5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => base44.auth.logout()}
                            className="text-gray-400 hover:text-red-400" title="Sign out">
                            <LogOut className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Board — 3 columns */}
            <div className="flex-1 grid grid-cols-3 gap-0 overflow-hidden min-h-0">
                <KDSColumn
                    title="New Orders"
                    emoji="🟡"
                    color="yellow"
                    orders={pendingOrders}
                    onAction={(id) => updateOrderStatus(id, 'preparing')}
                    actionLabel="Start Preparing"
                    actionColor="blue"
                    tick={tick}
                />
                <KDSColumn
                    title="Preparing"
                    emoji="🔵"
                    color="blue"
                    orders={preparingOrders}
                    onAction={(id) => updateOrderStatus(id, 'ready_for_collection')}
                    actionLabel="Mark Ready"
                    actionColor="green"
                    tick={tick}
                />
                <KDSColumn
                    title="Ready"
                    emoji="🟢"
                    color="green"
                    orders={readyOrders}
                    onAction={null}
                    actionLabel={null}
                    actionColor={null}
                    tick={tick}
                    isReady
                />
            </div>
        </div>
    );
}

function LiveClock() {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    return (
        <div className="flex items-center gap-2 text-gray-300 bg-gray-800 rounded-lg px-3 py-1.5">
            <Clock className="h-4 w-4 text-gray-500" />
            <span className="font-mono font-semibold text-base tabular-nums">
                {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
        </div>
    );
}