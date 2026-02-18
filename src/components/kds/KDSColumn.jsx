import React from 'react';
import KDSOrderCard from './KDSOrderCard';

const COLUMN_STYLES = {
    yellow: {
        header: 'border-b-2 border-yellow-500/40 bg-yellow-500/5',
        title: 'text-yellow-400',
        count: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
        empty: 'text-yellow-800',
        bg: 'bg-gray-900/60',
        border: 'border-r border-gray-800',
    },
    blue: {
        header: 'border-b-2 border-blue-500/40 bg-blue-500/5',
        title: 'text-blue-400',
        count: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        empty: 'text-blue-900',
        bg: 'bg-gray-900/40',
        border: 'border-r border-gray-800',
    },
    green: {
        header: 'border-b-2 border-green-500/40 bg-green-500/5',
        title: 'text-green-400',
        count: 'bg-green-500/20 text-green-300 border-green-500/30',
        empty: 'text-green-900',
        bg: 'bg-gray-900/20',
        border: '',
    },
};

export default function KDSColumn({ title, emoji, color, orders, onAction, actionLabel, actionColor, tick, isReady }) {
    const s = COLUMN_STYLES[color];
    return (
        <div className={`flex flex-col overflow-hidden ${s.bg} ${s.border}`}>
            {/* Column Header */}
            <div className={`px-4 py-3 flex items-center justify-between shrink-0 ${s.header}`}>
                <h2 className={`font-bold text-xl ${s.title}`}>
                    {emoji} {title}
                </h2>
                <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full border ${s.count}`}>
                    {orders.length}
                </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-hide">
                {orders.length === 0 ? (
                    <div className="flex items-center justify-center h-40">
                        <p className={`text-2xl font-bold opacity-20 ${s.title}`}>
                            — empty —
                        </p>
                    </div>
                ) : (
                    orders.map(order => (
                        <KDSOrderCard
                            key={order.id}
                            order={order}
                            onAction={onAction}
                            actionLabel={actionLabel}
                            actionColor={actionColor}
                            tick={tick}
                            isReady={isReady}
                        />
                    ))
                )}
            </div>
        </div>
    );
}