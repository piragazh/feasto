import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { deviceSecret, callScreenApi } from '@/lib/screenDevice';
import { useScreenManifest } from '../ScreenManifestContext';

/**
 * Order-ready board: "Preparing" and "Ready for collection" columns.
 *
 * Order numbers only — no customer names or details ever reach the screen.
 * Newly-ready numbers pulse for 30 seconds so customers spot them.
 *
 * Paired screens fetch through the screenDevice API (minimal fields);
 * legacy/kiosk screens read recent orders directly.
 *
 * Config: title_preparing, title_ready, show_preparing, max_preparing,
 *         max_ready, order_types [collection|takeaway|dine_in|delivery],
 *         refresh_seconds, theme (dark|light|branded)
 */

const THEMES = {
    dark:    { bg: 'bg-gray-950', panel: 'bg-gray-900', text: 'text-white', sub: 'text-gray-400', border: 'border-gray-800', prep: 'bg-gray-800 text-gray-100', ready: 'bg-green-500 text-white', readyHead: 'text-green-400', prepHead: 'text-amber-400' },
    light:   { bg: 'bg-gray-100', panel: 'bg-white', text: 'text-gray-900', sub: 'text-gray-500', border: 'border-gray-200', prep: 'bg-gray-100 text-gray-800', ready: 'bg-green-600 text-white', readyHead: 'text-green-700', prepHead: 'text-amber-600' },
    branded: { bg: 'bg-orange-950', panel: 'bg-orange-900', text: 'text-white', sub: 'text-orange-300', border: 'border-orange-800', prep: 'bg-orange-800 text-white', ready: 'bg-yellow-400 text-orange-950', readyHead: 'text-yellow-400', prepHead: 'text-orange-300' },
};

const PREPARING = ['confirmed', 'preparing'];
const READY = ['ready_for_collection'];
const NEW_READY_MS = 30 * 1000;

const label = (o) => o.order_number || `#${String(o.id || '').slice(-4).toUpperCase()}`;

export default function OrderBoardWidget({ config = {}, restaurantId, className = '' }) {
    const {
        title_preparing = 'Preparing',
        title_ready = 'Ready for collection',
        show_preparing = true,
        max_preparing = 12,
        max_ready = 12,
        order_types = ['collection', 'takeaway', 'dine_in'],
        refresh_seconds = 10,
        theme = 'dark',
    } = config;

    const manifest = useScreenManifest();
    const [orders, setOrders] = useState(null);
    const readySinceRef = useRef(new Map());
    const [, setTick] = useState(0);
    const typesKey = (Array.isArray(order_types) ? order_types : []).join(',');

    useEffect(() => {
        let cancelled = false;
        const types = typesKey ? typesKey.split(',') : ['collection', 'takeaway', 'dine_in'];

        const load = async () => {
            try {
                let list;
                const secret = manifest ? deviceSecret.get() : null;
                if (secret) {
                    const data = await callScreenApi({ action: 'order_board', secret, order_types: types });
                    list = data?.orders || [];
                } else if (restaurantId) {
                    const rows = await base44.entities.Order.filter(
                        { restaurant_id: restaurantId, status: { $in: [...PREPARING, ...READY] } },
                        '-created_date',
                        80
                    );
                    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
                    list = rows
                        .filter(o => types.includes(o.order_type || 'delivery'))
                        .filter(o => !o.created_date || new Date(o.created_date).getTime() >= cutoff)
                        .map(o => ({ id: o.id, order_number: o.order_number, status: o.status, created_date: o.created_date }));
                } else {
                    list = [];
                }
                if (cancelled) return;

                // Remember when each order first appeared as ready (for the highlight)
                const seen = readySinceRef.current;
                const readyIds = new Set();
                for (const o of list) {
                    if (READY.includes(o.status)) {
                        readyIds.add(o.id);
                        if (!seen.has(o.id)) seen.set(o.id, orders === null ? 0 : Date.now());
                    }
                }
                for (const id of [...seen.keys()]) if (!readyIds.has(id)) seen.delete(id);
                setOrders(list);
            } catch {
                if (!cancelled) setOrders(prev => prev || []);
            }
        };

        load();
        const t = setInterval(load, Math.max(5, Number(refresh_seconds) || 10) * 1000);
        return () => { cancelled = true; clearInterval(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, typesKey, refresh_seconds, manifest]);

    // Re-render while highlights are active
    useEffect(() => {
        const t = setInterval(() => setTick(n => n + 1), 5000);
        return () => clearInterval(t);
    }, []);

    const t = THEMES[theme] || THEMES.dark;
    const list = orders || [];
    const byOldest = (a, b) => String(a.created_date || '').localeCompare(String(b.created_date || ''));
    const preparing = list.filter(o => PREPARING.includes(o.status)).sort(byOldest).slice(0, max_preparing);
    const ready = list.filter(o => READY.includes(o.status)).sort(byOldest).slice(0, max_ready);
    const isNew = (o) => {
        const since = readySinceRef.current.get(o.id);
        return since && Date.now() - since < NEW_READY_MS;
    };

    const Column = ({ title, items, ready: isReady, headClass }) => (
        <div className={`${t.panel} rounded-3xl border ${t.border} p-5 md:p-8 flex flex-col min-h-0`}>
            <h2 className={`text-2xl md:text-4xl font-black uppercase tracking-wide mb-5 ${headClass}`}>{title}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 content-start overflow-hidden">
                {items.map(o => (
                    <div
                        key={o.id}
                        className={`rounded-2xl text-center font-black tabular-nums py-4 md:py-6 text-3xl md:text-5xl ${isReady ? t.ready : t.prep} ${isReady && isNew(o) ? 'animate-pulse ring-4 ring-white/70' : ''}`}
                    >
                        {label(o)}
                    </div>
                ))}
            </div>
            {items.length === 0 && <p className={`${t.sub} text-lg md:text-xl mt-2`}>{isReady ? 'Nothing ready yet' : 'No orders in progress'}</p>}
        </div>
    );

    if (orders === null) return (
        <div className={`${t.bg} h-full flex items-center justify-center ${className}`}>
            <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className={`${t.bg} h-full w-full p-4 md:p-8 grid gap-4 md:gap-8 ${show_preparing ? 'grid-cols-2' : 'grid-cols-1'} ${className}`}>
            {show_preparing && <Column title={title_preparing} items={preparing} headClass={t.prepHead} />}
            <Column title={title_ready} items={ready} ready headClass={t.readyHead} />
        </div>
    );
}
