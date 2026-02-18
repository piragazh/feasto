import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import KDSOrderCard from '@/components/kds/KDSOrderCard';
import KDSColumn from '@/components/kds/KDSColumn';


const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready_for_collection', 'out_for_delivery'];

export default function KitchenDisplaySystem({ restaurant }) {
    const [orders, setOrders] = useState([]);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [lastOrderIds, setLastOrderIds] = useState(new Set());
    const [tick, setTick] = useState(0); // forces re-render every 30s for timer updates
    const [view, setView] = useState('board'); // 'board' | 'list'
    const audioCtxRef = useRef(null);

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
                if (ACTIVE_STATUSES.includes(event.data?.status)) {
                    setOrders(prev => [event.data, ...prev]);
                    playNewOrderSound();
                }
            } else if (event.type === 'update') {
                setOrders(prev => {
                    const exists = prev.find(o => o.id === event.id);
                    if (ACTIVE_STATUSES.includes(event.data?.status)) {
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
            const active = all.filter(o => ACTIVE_STATUSES.includes(o.status));
            // Sort oldest first (kitchen should see oldest at top)
            active.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
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
        await base44.entities.Order.update(orderId, { status: newStatus });
        // Real-time subscription handles the UI update
    };

    const pendingOrders = orders.filter(o => ['pending', 'confirmed'].includes(o.status));
    const preparingOrders = orders.filter(o => o.status === 'preparing');
    const readyOrders = orders.filter(o => ['ready_for_collection', 'out_for_delivery'].includes(o.status));

    const totalActive = orders.length;
    const urgentCount = orders.filter(o => {
        const mins = Math.floor((Date.now() - new Date(o.created_date).getTime()) / 60000);
        return mins >= 15 && !['ready_for_collection', 'out_for_delivery'].includes(o.status);
    }).length;

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col select-none" style={{ fontFamily: "'Inter', sans-serif" }}>
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